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
 *   "sync.model"    <plain live msg>   a supporter's modeled word
 * The registry row's `sync` state persists through
 * hostCall("saveUser", { userId, patch }) -> Swift `PipHost.onSaveUser`.
 */
import { initSync, syncHealth as health } from "../../public/shared/sync.mjs";
import { refreshStatsDays } from "../../public/shared/stats.mjs";
import { hostCall } from "./jsc_shims.mjs";
import { appDb } from "./app.mjs";

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
  const saveUser = async (patch) => {
    if (patch?.sync) user.sync = patch.sync;
    await hostCall("saveUser", { userId: user.id, patch });
  };
  initSync(
    db, user, saveUser, baseUrl || globalThis.location.origin,
    () => emit("sync.applied"),
    (plain) => emit("sync.model", plain),
    async () => true, // the native SQLite file is durable per statement
    opts ? parse(opts) : {},
  ).then(
    (handle) => {
      // board.js refreshes today's/yesterday's totals at boot, after the device
      // id is known; here the id is known once the loop is up (SY-15).
      if (handle) { try { refreshStatsDays(db); } catch (e) { console.error(`stats: ${e}`); } }
      emit("sync.started", handle
      ? { ok: true, linked: true, deviceId: handle.identity.deviceId, epoch: handle.getEpoch() }
        : { ok: true, linked: false });
    },
    (err) => emit("sync.started", { ok: false, linked: true, error: String(err?.message ?? err) }),
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
