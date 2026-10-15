/**
 * Pictures (044 E6), shared plumbing for app_pictures.mjs and
 * app_pictures_bulk.mjs: the per-person state (the web's picture client, the
 * picture-fill closure, what has been fetched to disk), the license, the
 * blob store, and the one "pic" host event.
 */
import { mountPictureFill } from "../../public/board/picture-fill.js";
import { pictureClient } from "../../public/shared/pictures.mjs";
import { openKeyStore } from "./host/sync_crypto_host.mjs";
import { saveBlobBytes } from "./host/db_blob_host.mjs";
import { onOnline } from "./host/platform_host.mjs";
import { appSession } from "./app.mjs";

export const PIP = () => globalThis.PIPCORE;
export const keys = openKeyStore();
export const emit = (payload) => globalThis.__pipHost.emit("pic", JSON.stringify(payload));
export const one = (d, sql, p = []) => d.prepare(sql).all(...p)[0];
export const allOf = (db, sql, params = []) => db.prepare(sql).all(...params);
export const BLOB_KEY = /^blob:[0-9a-f]{64}$/;
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/* ---------------- per-person state ---------------- */

export const sessions = new Map();

export function X(s) {
  let x = sessions.get(s.appId);
  if (x) return x;
  x = {
    appId: s.appId, userId: null, client: pictureClient(),
    cards: new Map(),          // "kind:id" -> word-card-pictures.js sess()
    thumbs: new Map(),         // asset path -> blob key (a candidate's picture on disk)
    thumbBusy: new Set(), goneAssets: new Set(),
    finds: new Map(),          // add-flow.js finds: normalized text -> find result | "pending"
    bulkLeft: null, armed: false, findTimer: null, bulk: null,
  };
  x.fill = mountPictureFill({
    db: s.d, all: allOf, locale: s.locale, client: x.client, creds: () => creds(x),
    savePhoto: (blob) => savePhoto(blob),
    syncUploadBlob: async () => {}, // savePhoto queues the upload by key (SY-6)
    onChanged: (id) => { forget(s, "entity", id); x.dirty = true; },
  });
  sessions.set(s.appId, x);
  return x;
}

/** The open person's id is the Worker's `user_id` (the web's `me.id`).
 *  Also drains the words whose picture was parked while offline (board.js
 *  1126-1127). */
export function identify(appId, userId) {
  const s = appSession(appId);
  const x = X(s);
  x.userId = userId;
  void x.fill.drainPending().then(() => flushDirty(x)).catch(() => {});
  return { ok: true };
}

onOnline(() => {
  for (const x of sessions.values()) {
    if (x.userId) void x.fill.drainPending().then(() => flushDirty(x)).catch(() => {});
  }
});

/** speech.js voiceLicense, minus the localhost dev mint: the stored
 *  license, or null (the client then answers "unavailable"). */
export async function creds(x) {
  let license = null;
  try { license = (await keys.get(`user/${x.userId}/license`)) || null; } catch { /* none */ }
  return { userId: x.userId, license };
}

/** UI-test seam: a stored license, as a purchase would leave it. */
export async function testSeedLicense(appId, license) {
  const x = X(appSession(appId));
  await keys.put(`user/${x.userId}/license`, license);
  return { ok: true };
}

/** db.js savePhoto: bytes -> `blob:<sha256>` in the blob store. */
export async function storeBlob(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha = hex(await crypto.subtle.digest("SHA-256", bytes));
  await saveBlobBytes(sha, bytes);
  return `blob:${sha}`;
}
export async function savePhoto(blob) {
  const key = await storeBlob(blob);
  PIP().mediasync.queueUpload(key);
  return { key, bytes: null };
}

/** The caches the board paints from (board.js onChanged). */
export function forget(s, kind, id) {
  if (kind === "entity") { s.entPhoto.delete(id); s.entRole.delete(id); } else s.meta.delete(id);
  s.kbIndex = null;
}

/** Everything the board shows may have changed: the repainted board (and
 *  the open card, if Swift has one open). */
export const boardPaint = (x, kind = "entity", id = null) =>
  (id ? PIP().edit.cardOpen(x.appId, { kind, id }) : PIP().edit.editState(x.appId));

export function flushDirty(x) {
  if (!x.dirty) return;
  x.dirty = false;
  emit({ appId: x.appId, paint: boardPaint(x) });
}

/** Fetch the bytes of candidates not yet on disk, one request each, and
 *  repaint as they land (thumbInto 74-89). */
export function wantThumbs(x, cands, after) {
  for (const c of cands) {
    if (c.photoKey || c.ours || !c.asset || x.thumbs.has(c.asset) || x.thumbBusy.has(c.asset)
      || x.goneAssets.has(c.asset)) continue;
    x.thumbBusy.add(c.asset);
    void (async () => {
      let key = null;
      try {
        const { userId, license } = await creds(x);
        const blob = await x.client.imageBlob({ userId, license, asset: c.asset });
        if (blob) key = await storeBlob(blob);
      } catch { /* the choice drops */ }
      x.thumbBusy.delete(c.asset);
      if (key) x.thumbs.set(c.asset, key); else x.goneAssets.add(c.asset);
      after();
    })();
  }
}
