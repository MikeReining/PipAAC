/**
 * Photos and recordings travel between devices (phase 044 C4; SY-6, PP-9,
 * PP-10). Exported as PIPCORE.mediasync.
 *
 * Up: sync.mjs's media queue (syncUploadBlob / reconcileBlobs / drainBlobs,
 * 043 C) runs unchanged; `queueUpload(key)` is the one door the iOS media
 * writers (app_media.mjs) call after they record a `blob:<sha>` key, so a
 * photo or recording leaves promptly instead of waiting for the next
 * recovery pass.
 *
 * Down: the web pulls a blob lazily when a tile draws it (db.js
 * loadPhotoURL -> setBlobFetcher). iOS has no tile-time hook in the core,
 * and a recording must be on disk BEFORE the child taps it (offline), so
 * after every applied batch `scanMedia` walks the same blob: references
 * sync.mjs reconciles and pulls each sha not yet on disk, one at a time,
 * through the running loop's `pullBlob` (open + hash check against the
 * requested sha). Swift's `blob.save` re-checks the hash before the file
 * takes its name, so a file on disk IS available offline.
 *
 * Honest state (PP-10), per sha: "pending" (waiting for the network or for
 * the other device's upload to finish) or "missing" (the relay answered
 * 404 - it does not hold the bytes). Both retry on a backoff; a tile shows
 * its name and colour until the bytes land (the web's own fallback), and
 * "media.state" carries the counts for the status line.
 *
 * Events (host emit): "media.ready" {sha}, "media.state" {pending, missing,
 * uploading, uploadError}.
 */
import { hostCall } from "./jsc_shims.mjs";
import { loadBlobBytes, saveBlobBytes } from "./host/db_blob_host.mjs";
import { syncHealth, syncUploadBlob } from "../../public/shared/sync.mjs";

const emit = (name, payload = {}) =>
  globalThis.__pipHost.emit(name, JSON.stringify(payload));

let puller = null;
/** app_sync.mjs hands over / withdraws the running loop's pull. */
export const setPuller = (fn) => { puller = fn; };

/** sha -> { st: "pending" | "missing", tries, timer } for shas NOT on disk. */
const wanted = new Map();
const queue = [];
let pumping = false;

/** The refs sync.mjs reconcileBlobs queues for upload — the same set is
 *  what this device may need to download. */
const REFS_SQL = `SELECT photo_key AS k FROM personal_entity WHERE photo_key LIKE 'blob:%'
  UNION SELECT photo_key FROM image_override WHERE photo_key LIKE 'blob:%'
  UNION SELECT photo_key FROM board_group WHERE photo_key LIKE 'blob:%'
  UNION SELECT substr(glyph, 9) FROM board_group WHERE glyph LIKE 'picture:blob:%'
  UNION SELECT key FROM clip_override WHERE key LIKE 'blob:%'
  UNION SELECT person_photo FROM learner_profile WHERE person_photo LIKE 'blob:%'`;
const SHA = /^[0-9a-f]{64}$/;

export function mediaStatus() {
  let pending = 0, missing = 0;
  for (const w of wanted.values()) { if (w.st === "missing") missing++; else pending++; }
  const h = syncHealth();
  return { pending, missing, uploading: h.mediaPending, uploadError: h.mediaError ? String(h.mediaError.message ?? h.mediaError) : null };
}
const report = () => emit("media.state", mediaStatus());

/** Pull every referenced blob that is not on disk yet. Idempotent: a sha
 *  already waiting (queued or on a retry timer) is left alone. */
export function scanMedia(db) {
  let refs;
  try { refs = db.prepare(REFS_SQL).all(); } catch { return; }
  for (const r of refs) {
    const sha = String(r.k ?? "").replace(/^blob:/, "");
    if (!SHA.test(sha)) continue;
    const w = wanted.get(sha);
    if (w && (w.timer || w.queued)) continue;
    want(sha);
  }
  pump();
}

function want(sha) {
  const w = wanted.get(sha) ?? { st: "pending", tries: 0, timer: null, queued: false };
  w.queued = true;
  wanted.set(sha, w);
  queue.push(sha);
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) await pullOne(queue.shift());
  } finally { pumping = false; }
}

async function pullOne(sha) {
  const w = wanted.get(sha);
  if (!w) return;
  w.queued = false;
  let have = false;
  try { have = !!(await hostCall("blob.has", { sha })); } catch { /* treat as absent */ }
  if (have) { wanted.delete(sha); emit("media.ready", { sha }); report(); return; }
  if (!puller) { wanted.delete(sha); report(); return; } // no loop: the next scan after sync starts
  try {
    const bytes = await puller(sha);   // opened + hash-checked against `sha`
    await saveBlobBytes(sha, bytes);   // Swift re-checks the hash, writes atomically
    wanted.delete(sha);
    emit("media.ready", { sha });
  } catch (err) {
    w.tries++;
    w.st = err?.status === 404 ? "missing" : "pending";
    clearTimeout(w.timer);
    w.timer = setTimeout(() => { w.timer = null; if (puller) { want(sha); pump(); } },
      Math.min(2000 * 2 ** (w.tries - 1), 30000));
  }
  report();
}

/** Drop everything on a person switch / loop stop (timers included). */
export function resetMedia() {
  for (const w of wanted.values()) clearTimeout(w.timer);
  wanted.clear();
  queue.length = 0;
}

/** After a media writer recorded `key` (`blob:<sha>`): hand the bytes to the
 *  upload queue. Unlinked -> null (reconcileBlobs picks them up at link).
 *  Fire-and-forget: the durable queue owns retries. */
export function queueUpload(key) {
  const sha = String(key ?? "").replace(/^blob:/, "");
  if (!SHA.test(sha)) return;
  loadBlobBytes(sha)
    .then((bytes) => (bytes ? syncUploadBlob(bytes) : null))
    .then(report)
    .catch((err) => console.warn(`mediasync: upload not queued: ${err}`));
}
