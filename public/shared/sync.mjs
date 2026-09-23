/**
 * The device-side sync loop (Sync_And_Web_Editing §§ 4–6).
 *
 * initSync(db) is a no-op until the user is linked (pairing writes
 * localStorage pip_sync {userId, epoch}). Once linked it: catches up on
 * missed confirmed ops, flushes pending local ops, and keeps a WebSocket
 * open — incoming ops are decrypted with the user key for their epoch
 * and drained through the same rebase the merge test exercises.
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

const loadCfg = () => {
  try {
    const cfg = JSON.parse(localStorage.getItem("pip_sync") ?? "null");
    // 015 slice 1: configs written before the rename carry boardId.
    if (cfg?.boardId && !cfg.userId) return { ...cfg, userId: cfg.boardId };
    return cfg;
  } catch { return null; }
};
const saveCfg = (cfg) => localStorage.setItem("pip_sync", JSON.stringify(cfg));
export const syncConfig = loadCfg;
export const setSyncConfig = saveCfg;

let running = null;
export async function initSync(db, baseUrl = location.origin, onApplied = () => {}) {
  if (running) return running;
  const cfg = loadCfg();
  if (!cfg?.userId) return null;
  running = startSync(db, baseUrl, cfg, onApplied).catch((err) => { running = null; throw err; });
  return running;
}

async function startSync(db, baseUrl, cfg, onApplied) {
  const store = openKeyStore();
  const identity = await getDeviceIdentity(store);
  setDeviceId(identity.deviceId);
  let epoch = cfg.epoch ?? 1;
  let userKey = await getUserKey(store, epoch);
  const client = relayClient({ userId: cfg.userId, baseUrl, identity, userKey });

  /** Key for an op's epoch — a higher epoch means a rotation happened:
   *  pick up the wrapped key the granter left for us. */
  const keyFor = async (e) => {
    if (e <= epoch) return getUserKey(store, e);
    const self = await client.selfKey();
    if (!self.wrapped_key || self.current_epoch < e) {
      throw new Error(`sync: no wrapped key for epoch ${e}`);
    }
    const k = await unwrapUserKey(identity.dh.privateKey, JSON.parse(self.wrapped_key));
    await putUserKey(store, k, self.current_epoch);
    epoch = self.current_epoch;
    userKey = k;
    cfg.epoch = epoch;
    saveCfg(cfg);
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
    for (const r of rows) {
      plain.push({ ...(await openOp(await keyFor(r.epoch ?? 1), r.env)), relay_seq: r.relay_seq });
    }
    if (plain.length) { drainOps(db, plain); onApplied(); }
  };

  await ingest((await client.fetchOps(0)).ops);
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
