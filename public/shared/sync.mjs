/**
 * The device-side sync loop (Sync_And_Web_Editing §§ 4–6).
 *
 * initSync(db, user) is a no-op until the user is linked — the registry
 * row carries sync state ({userId, epoch, cursor}) written by pairing
 * (015 slice 2: the registry replaced localStorage pip_sync). Once
 * linked it: catches up on missed confirmed ops, flushes pending local
 * ops, and keeps a WebSocket open — incoming ops are decrypted with the
 * user key for their epoch and drained through the same rebase the
 * merge test exercises.
 *
 * recordOp calls the registered sink after every adult edit; sync.mjs
 * debounces a submit so edits reach the relay without the UI knowing.
 */
import { confirmOps, drainOps, listOps, setDeviceId, setOpSink } from "./ops.mjs";
import { setBlobFetcher } from "../db.js";
import {
  getDeviceIdentity, getUserKey, openBlob, openKeyStore, openOp, putUserKey,
  sealBlob, unwrapUserKey,
} from "./sync_crypto.mjs";
import { relayClient } from "./sync_client.mjs";

let running = null;
/**
 * `user` is the registry row (id, sync). `saveUser(patch)` persists
 * sync-state changes back to the row (epoch bumps on rotation).
 */
export async function initSync(db, user, saveUser, baseUrl = location.origin, onApplied = () => {}) {
  if (running) return running;
  const cfg = user?.sync;
  if (!cfg?.userId) return null;
  running = startSync(db, baseUrl, user, cfg, saveUser, onApplied)
    .catch((err) => { running = null; throw err; });
  return running;
}

async function startSync(db, baseUrl, user, cfg, saveUser, onApplied) {
  const store = openKeyStore();
  const identity = await getDeviceIdentity(store);
  setDeviceId(identity.deviceId);
  let epoch = cfg.epoch ?? 1;
  let userKey = await getUserKey(store, user.id, epoch);
  const client = relayClient({ userId: cfg.userId, baseUrl, identity, userKey });

  /** Key for an op's epoch — a higher epoch means a rotation happened:
   *  pick up the wrapped key the granter left for us. */
  const keyFor = async (e) => {
    if (e <= epoch) return getUserKey(store, user.id, e);
    const self = await client.selfKey();
    if (!self.wrapped_key || self.current_epoch < e) {
      throw new Error(`sync: no wrapped key for epoch ${e}`);
    }
    const k = await unwrapUserKey(identity.dh.privateKey, JSON.parse(self.wrapped_key));
    await putUserKey(store, user.id, k, self.current_epoch);
    epoch = self.current_epoch;
    userKey = k;
    cfg.epoch = epoch;
    await saveUser({ sync: cfg });
    return k;
  };

  /** Lazy blob pull for loadPhotoURL: fetch the sealed envelope, open it
   *  under the key for its epoch (hash verified on open), return bytes.
   *  A miss may just be the upload losing the race with its op — retry
   *  once via a repaint, then the tile keeps name + color. */
  const retried = new Set();
  setBlobFetcher(async (sha) => {
    try {
      const env = await client.getBlob(sha);
      return await openBlob(await keyFor(env.e ?? 1), { sha, env });
    } catch {
      if (!retried.has(sha)) {
        retried.add(sha);
        setTimeout(onApplied, 1500);
      }
      return null; // corrupt or unreachable — the tile shows name + color
    }
  });

  /** Seal + upload a photo/recording blob; no-op when unlinked. */
  const uploadBlob = async (bytes) => {
    const sealed = await sealBlob(await keyFor(epoch), bytes, epoch);
    await client.putBlob(sealed);
    return sealed.sha;
  };

  const pendingOps = () => listOps(db).filter((o) => o.relay_seq === null);
  const flush = async () => {
    const ops = pendingOps();
    if (!ops.length) return;
    const { ops: assigned } = await client.submit(ops);
    confirmOps(db, assigned);
  };
  let flushTimer = null;
  const scheduleFlush = () => {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flush().catch(() => {}), 300);
  };
  setOpSink(scheduleFlush);

  const ingest = async (rows) => {
    const plain = [];
    let cursor = cfg.cursor ?? 0;
    for (const r of rows) {
      plain.push({ ...(await openOp(await keyFor(r.epoch ?? 1), r.env)), relay_seq: r.relay_seq });
      if (r.relay_seq > cursor) cursor = r.relay_seq;
    }
    if (cursor !== (cfg.cursor ?? 0)) {
      cfg.cursor = cursor;
      await saveUser({ sync: cfg });
    }
    if (plain.length) { drainOps(db, plain); onApplied(); }
  };

  await ingest((await client.fetchOps(cfg.cursor ?? 0)).ops);
  await flush();

  const connect = () => {
    client.wsUrl().then((url) => {
      const ws = new WebSocket(url);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.t === "ops") ingest(msg.ops).then(scheduleFlush).catch(() => {});
      };
      ws.onclose = () => setTimeout(connect, 2000);
      ws.onerror = () => ws.close();
    }).catch(() => setTimeout(connect, 5000));
  };
  connect();
  return { client, identity, getEpoch: () => epoch, uploadBlob };
}

/** Upload a photo/recording blob if the user is linked. Callers don't
 *  await — the blob rides behind the op that references its sha. */
export async function syncUploadBlob(bytes) {
  const handle = running ? await running.catch(() => null) : null;
  return handle?.uploadBlob(bytes) ?? null;
}
