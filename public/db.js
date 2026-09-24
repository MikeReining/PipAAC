/**
 * On-device database: SQLite WASM. 015 slice 2 — one in-memory
 * database per user, exported to IndexedDB `pip-users` after each
 * write (300 ms debounce; pagehide/visibilitychange flush) and
 * reloaded with sqlite3_deserialize on open. Falls back to unsaved
 * in-memory when storage is unavailable; the board still works, it
 * just won't persist. Photos persist separately as OPFS files
 * (savePhoto).
 */
import sqlite3InitModule from "/vendor/sqlite-wasm/sqlite3.mjs";
import { importCatalog } from "./shared/import.mjs";
import { migrateLegacyGroups, migrateBuiltinGroupNames } from "./shared/groups.mjs";
import { ensureBaseline } from "./shared/ops.mjs";
import { repairCorruptWeights } from "./shared/learn.mjs";
import { getDbBytes, putDbBytes } from "./shared/users.mjs";
import { migrateSchema } from "./shared/migrate.mjs";

let handle = null;

function adapt(db, onWrite) {
  return {
    exec: (sql) => { const r = db.exec(sql); onWrite(); return r; },
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
        onWrite();
      },
      all: (...params) =>
        db.exec({ sql, bind: params, rowMode: "object", returnValue: "resultRows" }),
    }),
    all: (sql, params = []) =>
      db.exec({ sql, bind: params, rowMode: "object", returnValue: "resultRows" }),
  };
}

/**
 * Boot one user's database. `userStore` is the pip-users registry
 * store; `userId` picks whose bytes load. Persistence writes through
 * the store — when IndexedDB is unavailable the store is a Map and the
 * DB silently runs in-memory (the board still works, it won't persist).
 */
export async function bootDb(userStore, userId) {
  if (handle) return handle;

  const [sqlite3, catalog, book, saved] = await Promise.all([
    sqlite3InitModule(),
    fetch("/catalog.json").then((r) => r.json()),
    fetch("/opening_book.en.json").then((r) => r.json()).catch(() => null),
    getDbBytes(userStore, userId).catch(() => null),
  ]);

  let db;
  if (saved?.length) {
    db = new sqlite3.oo1.DB(":memory:");
    const bytes = saved instanceof Uint8Array ? saved : new Uint8Array(saved);
    const p = sqlite3.wasm.allocFromTypedArray(bytes);
    // FREEONCLOSE | RESIZEABLE — sqlite owns the wasm buffer now.
    sqlite3.capi.sqlite3_deserialize(
      db.pointer, "main", p, bytes.byteLength, bytes.byteLength, 1 | 2);
  } else {
    db = new sqlite3.oo1.DB(":memory:");
  }

  let saveTimer = null;
  const flush = () => {
    clearTimeout(saveTimer); saveTimer = null;
    const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer);
    return putDbBytes(userStore, userId, bytes).catch(
      (err) => console.warn("db: save failed", err));
  };
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 300);
  };
  // Flush on the way out — debounce alone can lose the last writes.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => flush());
  }

  const d = adapt(db, scheduleSave);

  // Schema application and import are both idempotent: the import doubles
  // as the reconcile, so a DB persisted under an older catalog converges
  // (missing senses/labels/clips get inserted, existing rows untouched).
  d.exec("PRAGMA foreign_keys = ON");
  migrateSchema(d, catalog.schemaSql);
  d.exec(catalog.schemaSql);
  importCatalog(d, catalog);
  // 017 step 4: rows a pre-fix keyboard impression corrupted (NaN →
  // null → zeroed weights) are reset to the shipped defaults once.
  repairCorruptWeights(d, catalog.prediction);
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

  handle = { db: d, catalog, book, flush };
  return handle;
}

/**
 * One-shot export of the pre-015 kvvfs `local` database (015 slice 2
 * migration). Returns its bytes, or null when it can't be opened —
 * callers treat null as "nothing to carry".
 */
export async function exportLegacyKvvfsDb() {
  try {
    const sqlite3 = await sqlite3InitModule();
    const db = new sqlite3.oo1.JsStorageDb("local");
    const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer);
    db.close();
    return bytes;
  } catch {
    return null;
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
