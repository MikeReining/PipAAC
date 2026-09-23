/**
 * The device-side sync loop (Sync_And_Web_Editing §§ 4–6).
 *
 * initSync(db) is a no-op until the board is linked (pairing writes
 * localStorage pip_sync {boardId, epoch}). Once linked it: catches up on
 * missed confirmed ops, flushes pending local ops, and keeps a WebSocket
 * open — incoming ops are decrypted with the board key for their epoch
 * and drained through the same rebase the merge test exercises.
 *
 * recordOp calls the registered sink after every adult edit; sync.mjs
 * debounces a submit so edits reach the relay without the UI knowing.
 */
import { confirmOps, drainOps, listOps, setDeviceId, setOpSink } from "./ops.mjs";
import {
  getBoardKey, getDeviceIdentity, openKeyStore, openOp, putBoardKey,
  unwrapBoardKey,
} from "./sync_crypto.mjs";
import { relayClient } from "./sync_client.mjs";

const loadCfg = () => {
  try { return JSON.parse(localStorage.getItem("pip_sync") ?? "null"); }
  catch { return null; }
};
const saveCfg = (cfg) => localStorage.setItem("pip_sync", JSON.stringify(cfg));
export const syncConfig = loadCfg;
export const setSyncConfig = saveCfg;

let running = null;
export async function initSync(db, baseUrl = location.origin) {
  if (running) return running;
  const cfg = loadCfg();
  if (!cfg?.boardId) return null;
  running = startSync(db, baseUrl, cfg).catch((err) => { running = null; throw err; });
  return running;
}

async function startSync(db, baseUrl, cfg) {
  const store = openKeyStore();
  const identity = await getDeviceIdentity(store);
  setDeviceId(identity.deviceId);
  let epoch = cfg.epoch ?? 1;
  let boardKey = await getBoardKey(store, epoch);
  const client = relayClient({ boardId: cfg.boardId, baseUrl, identity, boardKey });

  /** Key for an op's epoch — a higher epoch means a rotation happened:
   *  pick up the wrapped key the granter left for us. */
  const keyFor = async (e) => {
    if (e <= epoch) return getBoardKey(store, e);
    const self = await client.selfKey();
    if (!self.wrapped_key || self.current_epoch < e) {
      throw new Error(`sync: no wrapped key for epoch ${e}`);
    }
    const k = await unwrapBoardKey(identity.dh.privateKey, JSON.parse(self.wrapped_key));
    await putBoardKey(store, k, self.current_epoch);
    epoch = self.current_epoch;
    boardKey = k;
    cfg.epoch = epoch;
    saveCfg(cfg);
    return k;
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
    if (plain.length) drainOps(db, plain);
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
  return { client, identity, getEpoch: () => epoch };
}
