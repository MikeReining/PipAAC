/**
 * On-device database: SQLite WASM persisted via kvvfs → localStorage
 * (the local-first runtime). Boots the shipped catalog bundle — schema
 * DDL plus catalog rows — into one database. Falls back to in-memory
 * when storage is unavailable; the board still works, it just won't
 * persist. Photos persist separately as OPFS files (savePhoto).
 */
import sqlite3InitModule from "/vendor/sqlite-wasm/sqlite3.mjs";
import { importCatalog } from "./shared/import.mjs";
import { migrateLegacyGroups, migrateBuiltinGroupNames } from "./shared/groups.mjs";
import { ensureBaseline } from "./shared/ops.mjs";

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
  // kvvfs over localStorage — the only sqlite-wasm VFS that persists on
  // the main thread. The "opfs" VFS refuses to install outside a worker
  // (it needs Atomics.wait) and opfs-sahpool needs createSyncAccessHandle,
  // which Chrome exposes only in workers — so OpfsDb never installed and
  // the app silently ran in-memory. At ~650KB the catalog DB fits the
  // 2–3MB kvvfs envelope comfortably.
  // Caveats: no inter-tab locking (two tabs of one origin can interleave
  // page writes), and localStorage blocked → kvvfs fabricates in-memory
  // storage, so gate on the API before claiming persistence.
  try {
    if (!(localStorage instanceof Storage)) throw new Error("localStorage unavailable");
    db = new sqlite3.oo1.JsStorageDb("local");
    persistent = true;
  } catch (err) {
    db = new sqlite3.oo1.DB(":memory:");
    console.warn("db: persistent storage unavailable — running in-memory", err);
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
  // Devices seeded while built-in names were stored as English text get
  // those seed values NULLed (caregiver renames survive) — idempotent.
  migrateBuiltinGroupNames(d, catalog);
  // The rebase point for § 5 merging: snapshot the synced tables before
  // the first local edit. Idempotent — a stored baseline is kept.
  ensureBaseline(d);

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
    "learner_event_log", "clip_override", "image_override", "sense_mask",
    "board_group", "group_cell",
    "group_label", "sync_op", "sync_baseline", "sentence",
    "strip_impression", "spotlight_list", "spotlight_item",
    "spotlight_session", "core_override",
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
    // Pre-sentence events get the device's current offset once — best
    // effort, stated as such in schema §6.2c. Their sentence_id stays
    // NULL: they never count as pairs or phrases.
    if (stale.includes("learner_event_log")) {
      d.prepare(
        "UPDATE learner_event_log SET tz_offset_min = ? WHERE tz_offset_min IS NULL",
      ).run(-new Date().getTimezoneOffset());
    }
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  } finally {
    d.exec("PRAGMA foreign_keys = ON");
  }
}

/**
 * Photos are content-addressed: `blob:<sha256>` in OPFS `blobs/`. The
 * key is the same on every device, so a `set_entity_photo` op means the
 * same bytes everywhere — the replica fetches the sealed blob lazily
 * (sync § 4) via the registered fetcher, verifies the hash on open, and
 * caches it under the same name. `opfs:photos/<id>` keys written before
 * slice 6 keep working.
 */
let blobFetcher = null;
export function setBlobFetcher(fn) { blobFetcher = fn; }

export async function savePhoto(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("blobs", { create: true });
  const fh = await dir.getFileHandle(sha, { create: true });
  const w = await fh.createWritable();
  await w.write(bytes);
  await w.close();
  return { key: `blob:${sha}`, bytes };
}

export async function loadPhotoURL(photoKey) {
  try {
    const root = await navigator.storage.getDirectory();
    if (photoKey?.startsWith("blob:")) {
      const sha = photoKey.slice(5);
      const dir = await root.getDirectoryHandle("blobs", { create: true });
      try {
        const fh = await dir.getFileHandle(sha);
        return URL.createObjectURL(await fh.getFile());
      } catch {
        // Not cached — pull the sealed blob, verify on open, cache it.
        if (!blobFetcher) return null;
        const bytes = await blobFetcher(sha);
        if (!bytes) return null;
        const fh = await dir.getFileHandle(sha, { create: true });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
        return URL.createObjectURL(new Blob([bytes]));
      }
    }
    if (photoKey?.startsWith("opfs:photos/")) {
      const dir = await root.getDirectoryHandle("photos");
      const fh = await dir.getFileHandle(photoKey.slice("opfs:photos/".length));
      return URL.createObjectURL(await fh.getFile());
    }
    return null;
  } catch {
    return null;
  }
}
