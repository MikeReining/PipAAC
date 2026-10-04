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
import { reseedBuiltinGroups } from "./shared/groups.mjs";
import { getDbBytes, putDbBytes } from "./shared/users.mjs";
import { ADDITIVE_COLUMNS, beforeCleanBreak, migrateSchema, ensureAdditiveColumns } from "./shared/migrate.mjs";

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

  /* 041 B3 — the language tables are off the first-paint path. Boot
   * carries only what draws the board; loadLanguage runs after the
   * first frame, and the strip/grammar quietly upgrade when it lands.
   * B4: the shipped tables are the small ANSWER tables — the raw
   * corpora stay in data/ as build inputs and never reach the device. */
  const [sqlite3, catalog, saved] = await Promise.all([
    sqlite3InitModule(),
    fetch("/catalog.json").then((r) => r.json()),
    getDbBytes(userStore, userId).catch(() => null),
  ]);

  let db;
  db = new sqlite3.oo1.DB(":memory:");
  // 041 B1 — a person's first database is the shipped ready-made one:
  // the rows importCatalog would write, minus the ~20k-statement run.
  // A saved database always wins; a pre-clean-break save (or a missing
  // fresh_db on an older deploy) falls through to schema + import.
  const bytes = saved?.length && !beforeCleanBreak(saved)
    ? (saved instanceof Uint8Array ? saved : new Uint8Array(saved))
    : await fetch("/fresh_db.sqlite").then((r) => r.ok ? r.arrayBuffer() : null)
      .then((b) => b ? new Uint8Array(b) : null).catch(() => null);
  if (bytes) {
    const p = sqlite3.wasm.allocFromTypedArray(bytes);
    // FREEONCLOSE | RESIZEABLE — sqlite owns the wasm buffer now.
    sqlite3.capi.sqlite3_deserialize(
      db.pointer, "main", p, bytes.byteLength, bytes.byteLength, 1 | 2);
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
  migrateSchema(d, catalog.schemaSql, ADDITIVE_COLUMNS);
  d.exec(catalog.schemaSql);
  // 025: spoken_feeling + expressive_voice ride catalog.schemaSql with
  // the Ara rebuild; devices add them additively now.
  ensureAdditiveColumns(d);
  // Smart bar v2: the old history_count/prediction_weights tables are
  // superseded by phrase_count; nothing references them. Rebuilds keep
  // listed tables fresh — these are simply gone.
  d.exec("DROP TABLE IF EXISTS history_count");
  d.exec("DROP TABLE IF EXISTS prediction_weights");
  // ?reseed — local seed iteration: drop installed built-in group seeds
  // so importCatalog reinstalls them from this catalog. First install
  // still wins everywhere else; the flag exists so a reviewer reloading
  // the dev copy always sees the shipped seed.
  if (typeof location !== "undefined"
      && new URLSearchParams(location.search).has("reseed")) {
    reseedBuiltinGroups(d);
  }
  // Catalog tables, then the rebase baseline (§ 5), then the group seed —
  // installed once, as an op, so replicas converge on one install
  // (importCatalog owns that order).
  importCatalog(d, catalog);

  /* The two tables arrive together — a tap before they land speaks the
   * base word and the strip falls back to her own history/first words.
   * Grammar help's table is required when it ships: a missing or
   * malformed answer table fails loudly, never degrades silently. */
  let langPromise = null;
  const loadLanguage = () => {
    langPromise ??= Promise.all([
      fetch("/suggest_answers.en.json").then((r) => r.json()).catch(() => null),
      fetch("/form_answers.en.json").then((r) => r.json()),
    ]).then(([phrases, formTable]) => {
      handle.phrases = phrases;
      handle.formTable = formTable;
      return { phrases, formTable };
    });
    return langPromise;
  };

  handle = { db: d, catalog, phrases: null, formTable: null, flush, loadLanguage };
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
