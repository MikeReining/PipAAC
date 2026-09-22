/**
 * On-device database: SQLite WASM + OPFS persistence (the local-first
 * runtime). Boots the shipped catalog bundle — schema DDL plus catalog
 * rows — into one database file. Falls back to in-memory when OPFS is
 * unavailable; the board still works, it just won't persist.
 */
import sqlite3InitModule from "/vendor/sqlite-wasm/sqlite3.mjs";
import { importCatalog } from "./shared/import.mjs";

let handle = null;

function adapt(db) {
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => ({
      run: (...params) => {
        const st = db.prepare(sql);
        try {
          st.bind(params);
          while (st.step()) {
            // drain
          }
        } finally {
          st.finalize();
        }
      },
      all: (...params) =>
        db.exec({ sql, bind: params, rowMode: "object", returnValue: "resultRows" }),
    }),
    all: (sql, params = []) =>
      db.exec({ sql, bind: params, rowMode: "object", returnValue: "resultRows" }),
  };
}

export async function bootDb() {
  if (handle) return handle;

  const [sqlite3, catalog] = await Promise.all([
    sqlite3InitModule(),
    fetch("/catalog.json").then((r) => r.json()),
  ]);

  let db;
  let persistent = false;
  if (sqlite3.oo1.OpfsDb && self.crossOriginIsolated) {
    db = new sqlite3.oo1.OpfsDb("/pipaac.db", "c");
    persistent = true;
  } else {
    db = new sqlite3.oo1.DB(":memory:");
    console.warn("db: OPFS unavailable — running in-memory (entities won't persist)");
  }
  const d = adapt(db);

  // Schema application and import are both idempotent: the import doubles
  // as the reconcile, so a DB persisted under an older catalog converges
  // (missing senses/labels/clips get inserted, existing rows untouched).
  d.exec("PRAGMA foreign_keys = ON");
  migrateSchema(d, catalog.schemaSql);
  d.exec(catalog.schemaSql);
  importCatalog(d, catalog);

  handle = { db: d, catalog, persistent };
  return handle;
}

/**
 * CHECK constraints are baked into CREATE TABLE — a persisted DB keeps the
 * old list forever, and `INSERT OR IGNORE` then silently drops rows that
 * violate it (observed: function-word senses rejected under the pre-2026-09-22
 * part-of-speech list). Rebuild any catalog table whose stored DDL differs
 * from the shipped schema. Table rebuild is the documented SQLite migration:
 * rename, recreate, copy, drop. `legacy_alter_table` keeps child foreign keys
 * pointing at the original name instead of following the rename; the table's
 * triggers ride along to the old table, drop with it, and are recreated by
 * the normal schema exec.
 */
function migrateSchema(d, schemaSql) {
  const tables = ["sense", "utterance", "label", "image", "voice", "clip", "core_cell"];
  const stale = tables.filter((t) => {
    const row = d.all(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      [t],
    )[0];
    if (!row) return false;
    const ddl = schemaSql.match(
      new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`),
    );
    const canon = (s) =>
      s.replace(/\s+/g, " ").replace(/;$/, "").replace("IF NOT EXISTS ", "").trim();
    return ddl && canon(row.sql) !== canon(ddl[0]);
  });
  if (stale.length === 0) return;

  d.exec("PRAGMA foreign_keys = OFF");
  d.exec("PRAGMA legacy_alter_table = ON");
  d.exec("BEGIN");
  try {
    for (const t of stale) {
      const ddl = schemaSql.match(
        new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`),
      )[0];
      d.exec(`ALTER TABLE ${t} RENAME TO ${t}_old`);
      d.exec(ddl);
      const cols = d.all(`PRAGMA table_info(${t})`).map((c) => c.name);
      const oldCols = new Set(d.all(`PRAGMA table_info(${t}_old)`).map((c) => c.name));
      const shared = cols.filter((c) => oldCols.has(c)).join(", ");
      d.exec(`INSERT INTO ${t} (${shared}) SELECT ${shared} FROM ${t}_old`);
      d.exec(`DROP TABLE ${t}_old`);
    }
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  } finally {
    d.exec("PRAGMA legacy_alter_table = OFF");
    d.exec("PRAGMA foreign_keys = ON");
  }
}

/** Photos live as OPFS files keyed by entity id; the row stores the key. */
export async function savePhoto(entityId, file) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("photos", { create: true });
  const fh = await dir.getFileHandle(entityId, { create: true });
  const w = await fh.createWritable();
  await w.write(await file.arrayBuffer());
  await w.close();
  return `opfs:photos/${entityId}`;
}

export async function loadPhotoURL(photoKey) {
  if (!photoKey?.startsWith("opfs:photos/")) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("photos");
    const fh = await dir.getFileHandle(photoKey.slice("opfs:photos/".length));
    return URL.createObjectURL(await fh.getFile());
  } catch {
    return null;
  }
}
