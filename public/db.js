/**
 * On-device database: SQLite WASM + OPFS persistence (the local-first
 * runtime). Boots the shipped catalog bundle — schema DDL plus catalog
 * rows — into one database file. Falls back to in-memory when OPFS is
 * unavailable; the board still works, it just won't persist.
 */
import sqlite3InitModule from "/vendor/sqlite-wasm/sqlite3.mjs";
import { importCatalog } from "./shared/import.mjs";
import { migrateLegacyGroups } from "./shared/groups.mjs";

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
  // A DB persisted under the pre-groups schema still has zone_slot:
  // migrate it — keeping custom groups, entities, and the caregiver's
  // arrangement — then drop the legacy tables. No-op on a fresh DB.
  migrateLegacyGroups(d, catalog);

  handle = { db: d, catalog, persistent };
  return handle;
}

/**
 * CHECK constraints are baked into CREATE TABLE — a persisted DB keeps the
 * old list forever, and `INSERT OR IGNORE` then silently drops rows that
 * violate it (observed: function-word senses rejected under the pre-2026-09-22
 * part-of-speech list). Rebuild any table whose stored DDL differs from the
 * shipped schema. The documented-safe rebuild order is create-new → copy →
 * drop old → rename new: renaming a table rewrites foreign keys and triggers
 * that reference the old name, so we never rename the live table — the new
 * table takes the original name only after the old one is gone. Triggers and
 * indexes on the dropped table are recreated by the normal schema exec.
 */
function migrateSchema(d, schemaSql) {
  const tables = [
    "sense", "utterance", "label", "image", "voice", "clip", "core_cell",
    "learner_profile", "personal_entity", "entity_enrichment",
    "learner_event_log", "clip_override", "board_group", "group_cell",
  ];
  const canon = (s) =>
    s.replace(/\s+/g, " ").replace(/;$/, "").replace("IF NOT EXISTS ", "").trim();
  const ddlFor = (t) =>
    schemaSql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`))?.[0];
  const stale = tables.filter((t) => {
    const row = d.all(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      [t],
    )[0];
    const ddl = ddlFor(t);
    return row && ddl && canon(row.sql) !== canon(ddl);
  });
  if (stale.length === 0) return;

  d.exec("PRAGMA foreign_keys = OFF");
  d.exec("BEGIN");
  try {
    for (const t of stale) {
      d.exec(ddlFor(t).replace(`TABLE IF NOT EXISTS ${t}`, `TABLE ${t}_new`));
      const cols = d.all(`PRAGMA table_info(${t}_new)`).map((c) => c.name);
      const oldCols = new Set(d.all(`PRAGMA table_info(${t})`).map((c) => c.name));
      const shared = cols.filter((c) => oldCols.has(c)).join(", ");
      d.exec(`INSERT INTO ${t}_new (${shared}) SELECT ${shared} FROM ${t}`);
      d.exec(`DROP TABLE ${t}`);
      d.exec(`ALTER TABLE ${t}_new RENAME TO ${t}`);
    }
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  } finally {
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
