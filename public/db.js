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

  // Schema application is idempotent (IF NOT EXISTS); the import runs once.
  d.exec("PRAGMA foreign_keys = ON");
  d.exec(catalog.schemaSql);
  const hasCatalog = d.all("SELECT COUNT(*) AS n FROM core_cell")[0].n > 0;
  if (!hasCatalog) importCatalog(d, catalog);

  // Reconcile clips: a DB imported before clips shipped has none. Clip ids
  // are deterministic (clp_<slot>), so OR IGNORE converges without dupes.
  const insClip = d.prepare(
    "INSERT OR IGNORE INTO clip (id, voice_id, utterance_id, recorded_text, key, status, sha256, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const c of catalog.clips) {
    insClip.run(c.id, c.voice_id, c.utterance_id, c.recorded_text, c.key, c.status, c.sha256, c.source);
  }

  handle = { db: d, catalog, persistent };
  return handle;
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
