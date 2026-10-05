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
import { getDbBytes, getDbPrev, putDbBytes, putDbPrev } from "./shared/users.mjs";
import { ADDITIVE_COLUMNS, beforeCleanBreak, migrateSchema, ensureAdditiveColumns } from "./shared/migrate.mjs";
import { onHidden, onPageHide, opfsRoot } from "./shared/platform.mjs";
import { pictureURL, typedBlob } from "./shared/mediatype.mjs";

let handle = null;

function adapt(db, onWrite) {
  return {
    exec: (sql) => { const r = db.exec(sql); onWrite(); return r; },
    prepare: (sql) => ({
      run: (...params) => {
        const st = db.prepare(sql);
        try {
          // bind([]) throws on a parameterless statement; node:sqlite's
          // run() doesn't — the seam must match or callers die on boot.
          if (params.length) st.bind(params);
          while (st.step()) {
            // drain
          }
        } finally {
          st.finalize();
        }
        onWrite();
        // node:sqlite's shape — callers (drainOps) read `changes`.
        return { changes: db.changes() };
      },
      all: (...params) =>
        db.exec({ sql, bind: params.length ? params : undefined,
          rowMode: "object", returnValue: "resultRows" }),
    }),
    all: (sql, params = []) =>
      db.exec({ sql, bind: params.length ? params : undefined,
        rowMode: "object", returnValue: "resultRows" }),
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
  /* 043 A — a failed read is NOT a fresh install: the old code treated
   * getDbBytes throwing like "no saved data", then the first flush
   * overwrote the (probably intact) bytes. Read failure now boots a
   * temporary board whose saves are blocked, so the stored copy is
   * never touched. A corrupt current save falls back to the previous
   * copy that last opened cleanly. */
  let readFailed = false, restoredFromPrev = false, readError = null;
  let saved = null, prev = null;
  try {
    [saved, prev] = await Promise.all([
      getDbBytes(userStore, userId),
      getDbPrev(userStore, userId),
    ]);
  } catch (err) {
    readFailed = true;
    readError = String(err?.message ?? err);
  }
  const [sqlite3, catalog] = await Promise.all([
    sqlite3InitModule(),
    fetch("/catalog.json").then((r) => r.json()),
  ]);

  // 041 B1 — a person's first database is the shipped ready-made one:
  // the rows importCatalog would write, minus the ~20k-statement run.
  // A saved database always wins; a pre-clean-break save (or a missing
  // fresh_db on an older deploy) falls through to schema + import.
  const usable = (bytes) => {
    try {
      return !!bytes?.length && !beforeCleanBreak(bytes);
    } catch { return false; }
  };
  /* Deserialize installs pages sight-unseen — touch the schema to learn
   * whether these bytes are really a database. Each attempt gets its own
   * handle: a failure must not leave half-installed pages behind. */
  const tryOpen = (bytes) => {
    if (!usable(bytes)) return null;
    try {
      const trial = new sqlite3.oo1.DB(":memory:");
      const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const p = sqlite3.wasm.allocFromTypedArray(b);
      // FREEONCLOSE | RESIZEABLE — sqlite owns the wasm buffer now.
      sqlite3.capi.sqlite3_deserialize(
        trial.pointer, "main", p, b.byteLength, b.byteLength, 1 | 2);
      trial.exec("SELECT name FROM sqlite_master LIMIT 1");
      return { db: trial, bytes: b };
    } catch { return null; }
  };
  let opened = null;
  if (!readFailed) {
    // Saved bytes that fail to open are corrupt, not absent: the
    // previous copy — the one that last opened cleanly — is the way back.
    opened = tryOpen(saved);
    if (!opened && usable(saved)) {
      opened = tryOpen(prev);
      if (opened) restoredFromPrev = true;
    }
    // A pre-clean-break save is superseded, not corrupt: fresh_db + the
    // idempotent import reconciles it like before.
    if (!opened && !usable(saved)) {
      const fresh = await fetch("/fresh_db.sqlite").then((r) => r.ok ? r.arrayBuffer() : null)
        .then((b) => b ? new Uint8Array(b) : null).catch(() => null);
      opened = fresh && tryOpen(fresh);
    }
  }
  const corrupt = !readFailed && !opened && usable(saved);
  const db = opened?.db ?? new sqlite3.oo1.DB(":memory:");

  /* Saves stay blocked when we could not read the stored copy (transient
   * IndexedDB failure) or it was corrupt — the temporary board must not
   * overwrite what is still the family's real data. */
  const saveBlocked = readFailed || corrupt;
  let saveError = null, savedAt = null;
  let saveTimer = null;
  // The copy that opened is already proven-good; keep it beside the
  // live save once per boot. When we restored FROM prev it is that copy.
  let prevKept = !opened || opened.bytes === prev;
  const flush = () => {
    clearTimeout(saveTimer); saveTimer = null;
    if (saveBlocked) return Promise.resolve(false);
    const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer);
    return putDbBytes(userStore, userId, bytes).then(async () => {
      savedAt = Date.now();
      saveError = null;
      if (!prevKept) {
        prevKept = true;
        await putDbPrev(userStore, userId, opened.bytes).catch(() => {});
      }
      return true;
    }).catch((err) => {
      saveError = String(err?.message ?? err);
      console.warn("db: save failed", err);
      handle.onSaveIssue?.(saveError);
      return false;
    });
  };
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 300);
  };
  // Flush on the way out — debounce alone can lose the last writes.
  if (typeof document !== "undefined") onHidden(flush);
  if (typeof window !== "undefined") onPageHide(flush);

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
    langPromise ??= (async () => {
      /* 043 G — the profile's speaking language names its tables; a
       * locale with no shipped table gets none — a miss never borrows
       * English rows onto another language's board (the "Saft" class
       * of bug). Malformed JSON still throws loud. */
      const loc = d.all(
        "SELECT locale AS l FROM learner_profile ORDER BY rowid LIMIT 1",
      )[0]?.l ?? "en";
      // A shipped locale's tables are required — a missing one fails
      // loudly. An unshipped locale simply has no tables (grammar
      // falls to the lemma), never an English borrow.
      const shipped = catalog.voices?.some(
        (v) => v.locale === loc && v.status === "active");
      const [phrases, formTable] = await Promise.all([
        fetch(`/suggest_answers.${loc}.json`)
          .then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/form_answers.${loc}.json`).then((r) => {
          if (!r.ok && shipped) {
            throw new Error(`form_answers.${loc}.json ${r.status}`);
          }
          return r.ok ? r.json() : null;
        }),
      ]);
      handle.phrases = phrases;
      handle.formTable = formTable;
      return { phrases, formTable };
    })();
    return langPromise;
  };

  handle = { db: d, catalog, phrases: null, formTable: null, flush, loadLanguage,
    // 043 A — the honest save surface: the board reads this for the
    // status line and the recovery path; onSaveIssue fires on a failed
    // flush so the UI can say it.
    dbHealth: () => ({ readFailed, readError, restoredFromPrev, corrupt,
      saveBlocked, saveError, savedAt, dirty: !!saveTimer }),
    onSaveIssue: null };
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
  await saveBlobBytes(sha, bytes);
  return { key: `blob:${sha}`, bytes };
}

/** Raw access to the OPFS blob store — the media queue drains bytes by
 *  sha and heals a missing local copy the same way (043 C). */
export async function saveBlobBytes(sha, bytes) {
  const root = await opfsRoot();
  const dir = await root.getDirectoryHandle("blobs", { create: true });
  const fh = await dir.getFileHandle(sha, { create: true });
  const w = await fh.createWritable();
  await w.write(bytes);
  await w.close();
}

export async function loadBlobBytes(sha) {
  try {
    const root = await opfsRoot();
    const dir = await root.getDirectoryHandle("blobs");
    const file = await (await dir.getFileHandle(sha)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export async function loadPhotoURL(photoKey) {
  try {
    const root = await opfsRoot();
    if (photoKey?.startsWith("blob:")) {
      const sha = photoKey.slice(5);
      const dir = await root.getDirectoryHandle("blobs", { create: true });
      try {
        const fh = await dir.getFileHandle(sha);
        return pictureURL(await typedBlob(await fh.getFile()));
      } catch {
        // Not cached — pull the sealed blob, verify on open, cache it.
        if (!blobFetcher) return null;
        const bytes = await blobFetcher(sha);
        if (!bytes) return null;
        await saveBlobBytes(sha, bytes);
        return pictureURL(await typedBlob(bytes));
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
