/**
 * The sync facade (phase 044 C2): public/shared/sync.mjs, unchanged,
 * started against the app's database. Exported as PIPCORE.sync.
 *
 * The loop is the web's — cursor, fence, obligations — over host I/O
 * (scripts/ios/host/*, jsc_shims.mjs). This file only wires the three
 * things the web wires in board.js: the db, the registry save, and the
 * repaint. Results leave JS as host events (`__pipHost.emit`), because a
 * JSC caller cannot await a Promise:
 *   "sync.started"  { ok, linked, deviceId?, epoch?, error? }
 *   "sync.applied"  {}                 ops landed -> Swift repaints
 *   "spot.changed"  {}                 a live message or session change (044 D5):
 *                                      Swift re-reads PIPCORE.spot.state
 * The registry row's `sync` state persists through
 * hostCall("saveUser", { userId, patch }) -> Swift `PipHost.onSaveUser`.
 */
import { initSync, stopSync, syncHealth as health } from "../../public/shared/sync.mjs";
import { resetMedia, scanMedia, setPuller } from "./app_mediasync.mjs";
import { refreshStatsDays } from "../../public/shared/stats.mjs";
import { hostCall } from "./jsc_shims.mjs";
import { appDb } from "./app.mjs";
import { noteBase } from "./app_team.mjs";
import { applied as spotApplied, attach as spotAttach, onLive as spotOnLive } from "./app_spotlight.mjs";

/** Bumped by every start and stop: a start that resolves after a stop is stale. */
let gen = 0;
const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);
const emit = (name, payload = {}) =>
  globalThis.__pipHost.emit(name, JSON.stringify(payload));

/**
 * Start the loop for a registry row `{ id, sync: { userId, epoch, cursor } }`.
 * No-op (linked:false) when the row is not linked. Returns at once;
 * "sync.started" reports how it went. `baseUrl` defaults to location.origin.
 */
export function syncStart(appId, userRow, baseUrl, opts) {
  return syncStartDb(appDb(appId), userRow, baseUrl, opts);
}

/** Same, against an explicit db handle (makeDb) — the node suite's door. */
export function syncStartDb(db, userRow, baseUrl, opts) {
  const user = parse(userRow);
  const myGen = ++gen;
  noteBase(baseUrl || globalThis.location?.origin); // the regrant drain (F2) runs inside this loop
  spotAttach(db, user.role); // live messages (D5) need the db + role before any screen binds
  const saveUser = async (patch) => {
    if (patch?.sync) user.sync = patch.sync;
    await hostCall("saveUser", { userId: user.id, patch });
  };
  initSync(
    db, user, saveUser, baseUrl || globalThis.location.origin,
    // ops may carry new blob: refs (C4); a session started/ended elsewhere lands (D5)
    () => { emit("sync.applied"); scanMedia(db); spotApplied(db); },
    (plain) => spotOnLive(plain), // live modeling + the child's taps (013 s4); never logged
    async () => true, // the native SQLite file is durable per statement
    opts ? parse(opts) : {},
  ).then(
    (handle) => {
      if (myGen !== gen) return; // stopped (or restarted) while this start was in flight
      // board.js refreshes today's/yesterday's totals at boot, after the device
      // id is known; here the id is known once the loop is up (SY-15).
      if (handle) {
        // Photos/recordings: pull what the synced rows reference (PP-9).
        setPuller((sha) => handle.pullBlob(sha));
        scanMedia(db);
      }
      if (handle) { try { refreshStatsDays(db); } catch (e) { console.error(`stats: ${e}`); } }
      emit("sync.started", handle
      ? { ok: true, linked: true, deviceId: handle.identity.deviceId, epoch: handle.getEpoch() }
        : { ok: true, linked: false });
    },
    (err) => myGen === gen && emit("sync.started", { ok: false, linked: true, error: String(err?.message ?? err) }),
  );
  return { accepted: true };
}

/** The web's syncHealth(), JSON-safe (Errors flattened to their message). */
export function syncHealth() {
  const h = health();
  const msg = (e) => (e == null ? null : String(e.message ?? e));
  return { running: h.running, flushError: msg(h.flushError), ingestError: msg(h.ingestError),
    rotationError: msg(h.rotationError), mediaPending: h.mediaPending, mediaError: msg(h.mediaError) };
}

/**
 * End the running loop (a person switch: the web reloads the page, the app
 * stays alive). Returns at once; "sync.stopped" {ok} reports when the loop
 * has ended and the person's db handle may close. Safe when nothing runs.
 */
export function syncStop(opts) {
  gen++;
  setPuller(null);
  resetMedia();
  stopSync(opts ? parse(opts) : {}).then(
    () => emit("sync.stopped", { ok: true }),
    (err) => emit("sync.stopped", { ok: false, error: String(err?.message ?? err) }),
  );
  return { accepted: true };
}
