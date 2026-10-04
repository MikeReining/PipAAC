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
import { adoptSnapshot, confirmOps, drainOps, listOps, setDeviceId, setOpSink, snapshotSynced } from "./ops.mjs";
import { setBlobFetcher } from "../db.js";
import {
  getDeviceIdentity, getUserKey, openBlob, openKeyStore, openOp, putUserKey, sealOp,
  sealBlob, unwrapUserKey,
} from "./sync_crypto.mjs";
import { relayClient } from "./sync_client.mjs";

let running = null;
/** 031 § 8 — honest save status: did the last attempt to hand ops to
 *  the relay fail? Pending ops themselves are read from sync_op
 *  (relay_seq IS NULL until the relay accepted them). */
let flushError = null;
/** 043 B — a drain that threw leaves ops logged but unapplied and the
 *  cursor behind; surface it instead of wedging silently. */
let ingestError = null;
export const syncHealth = () => ({ running: !!running, flushError, ingestError });
/**
 * `user` is the registry row (id, sync). `saveUser(patch)` persists
 * sync-state changes back to the row (epoch bumps on rotation).
 * `persist` (043 B) is the DB's own flush — the cursor is only durable
 * if the ops it counts are, so ingest awaits it before advancing.
 */
export async function initSync(db, user, saveUser, baseUrl = location.origin, onApplied = () => {}, onModel = null, persist = null) {
  if (running) return running;
  const cfg = user?.sync;
  if (!cfg?.userId) return null;
  running = startSync(db, baseUrl, user, cfg, saveUser, onApplied, onModel, persist)
    .catch((err) => { running = null; throw err; });
  return running;
}

async function startSync(db, baseUrl, user, cfg, saveUser, onApplied, onModel, persist) {
  const store = openKeyStore();
  const identity = await getDeviceIdentity(store);
  setDeviceId(identity.deviceId);
  let epoch = cfg.epoch ?? 1;
  // A synced user whose key never arrived (a locked import — 015 s5)
  // must not mint a fresh key here: its ops would seal under a key no
  // other device holds. Owners always have the stored key or the
  // recovery root; neither present means locked — no sync.
  const keyOrRoot = await store.get(`user/${user.id}/key_e${epoch}`)
    ?? await store.get(`user/${user.id}/root`);
  if (!keyOrRoot) return null;
  let userKey = await getUserKey(store, user.id, epoch);
  let client = relayClient({ userId: cfg.userId, baseUrl, identity, userKey });

  /** Re-seal under a newer epoch after this device rotated the user
   *  key (015 s5): without it the running client keeps sealing under
   *  the old epoch and removed supporters keep reading new ops. */
  const rekey = async (toEpoch) => {
    if (!(toEpoch > epoch)) return epoch;
    epoch = toEpoch;
    cfg.epoch = epoch;
    userKey = await getUserKey(store, user.id, epoch);
    client = relayClient({ userId: cfg.userId, baseUrl, identity, userKey });
    return epoch;
  };

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
    if (!ops.length) { flushError = null; return; }
    try {
      const { ops: assigned } = await client.submit(ops);
      confirmOps(db, assigned);
      await maybeSnapshot();
      flushError = null;
    } catch (err) {
      flushError = String(err?.message ?? err);
      throw err;
    }
  };
  let flushTimer = null;
  const scheduleFlush = () => {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flush().catch(() => {}), 300);
  };
  setOpSink(scheduleFlush);

  /* 043 B — one serialized chain for every op application: drainOps is a
   * full restore + replay and must never interleave with itself (a ws
   * push racing a catch-up could). A failed job must be loud — a silent
   * throw wedges the device with ops logged but never applied. */
  let chain = Promise.resolve();
  const enqueue = (job) => (chain = chain.then(job).catch((err) => {
    ingestError = String(err?.stack || err);
    console.warn("sync: ingest failed", err);
  }));

  /** Apply a batch. `markSeen` is only for catch-up fetches — the cursor
   *  says "everything up to here was fetched and applied", so a live
   *  push (which proves nothing about the ops before it) must not move
   *  it. Apply first, persist, then advance the cursor: the old order
   *  saved the cursor before the drain, so a kill in between lost the
   *  ops it had just claimed. A failed drain leaves the cursor behind —
   *  the next recover refetches and retries. */
  const ingest = async (rows, markSeen = false) => {
    const plain = [];
    let cursor = cfg.cursor ?? 0;
    for (const r of rows) {
      plain.push({ ...(await openOp(await keyFor(r.epoch ?? 1), r.env)), relay_seq: r.relay_seq });
      if (r.relay_seq > cursor) cursor = r.relay_seq;
    }
    if (plain.length) {
      drainOps(db, plain);
      ingestError = null;
      onApplied();
      await persist?.();
    }
    if (markSeen && cursor !== (cfg.cursor ?? 0)) {
      cfg.cursor = cursor;
      await saveUser({ sync: cfg });
    }
  };

  /** § 5 — every 500 confirmed ops a device uploads the sealed synced
   *  tables so the relay can prune the log they cover. The seq pairs
   *  with confirmed state only: a live snapshot taken while local ops
   *  are still pending would bake unconfirmed edits into the baseline,
   *  so we wait for a quiet log. Best-effort — a failure retries on the
   *  next drain. */
  const maybeSnapshot = async () => {
    const seq = db.prepare(
      "SELECT MAX(relay_seq) AS m FROM sync_op WHERE relay_seq IS NOT NULL",
    ).all()[0]?.m ?? 0;
    if (!seq || seq - (cfg.snap_seq ?? 0) < 500 || pendingOps().length) return;
    const snap = snapshotSynced(db);
    try {
      const env = await sealOp(await keyFor(epoch), { seq, snap });
      await client.putSnapshot({ e: epoch, env }, seq);
      cfg.snap_seq = seq;
      await saveUser({ sync: cfg });
    } catch { /* the next drain retries */ }
  };

  // § 5 fast path: a device that never synced boots from the sealed
  // snapshot — adopt the synced tables at their seq, then replay only
  // the tail. Pending local edits survive: the drain rebases them.
  if (!cfg.cursor) {
    try {
      const stored = await client.getSnapshot();
      if (stored?.env) {
        const plain = await openOp(await keyFor(stored.e ?? 1), stored.env);
        adoptSnapshot(db, plain.snap);
        cfg.cursor = plain.seq ?? 0;
        await saveUser({ sync: cfg });
      }
    } catch { /* a snapshot is an optimization — full replay still works */ }
  }

  /* 043 B — the one recovery flow, entered from boot, every socket
   * (re)open, and online events: fetch everything after the cursor,
   * apply it durably, advance the cursor, resend our pending ops.
   * A hole between the cursor and the first row means the relay pruned
   * ops we never saw — rebase on the sealed snapshot and tail from its
   * watermark (the adopt only counts when it moves the cursor forward,
   * so a seq hole that is not pruning can't loop). */
  const recover = async () => {
    for (;;) {
      const { ops: rows } = await client.fetchOps(cfg.cursor ?? 0);
      if (rows?.length && rows[0].relay_seq > (cfg.cursor ?? 0) + 1) {
        const stored = await client.getSnapshot().catch(() => null);
        const plain = stored?.env
          ? await openOp(await keyFor(stored.e ?? 1), stored.env).catch(() => null)
          : null;
        if (plain?.snap && (plain.seq ?? 0) > (cfg.cursor ?? 0)) {
          adoptSnapshot(db, plain.snap);
          cfg.cursor = plain.seq;
          await saveUser({ sync: cfg });
          continue;
        }
      }
      await ingest(rows ?? [], true);
      break;
    }
    await maybeSnapshot().catch(() => {});
    await flush();
  };
  let recoverTimer = null;
  /** Debounced catch-up: live pushes apply without moving the cursor,
   *  so a burst ends with one fetchOps that marks it honestly. */
  const scheduleRecover = () => {
    clearTimeout(recoverTimer);
    recoverTimer = setTimeout(() => enqueue(recover), 2000);
  };

  // Boot no longer dies on an offline start: recovery rides the same
  // queue as everything else, and the socket loop below owns retries.
  enqueue(recover);

  let live = null;
  let dialing = false;
  const connect = () => {
    if (dialing || (live && live.readyState <= WebSocket.OPEN)) return;
    dialing = true;
    client.wsUrl().then((url) => {
      const ws = new WebSocket(url);
      live = ws;
      // Every (re)open may follow a gap — catch up before treating the
      // socket as live. The push handler below is not a backlog.
      ws.onopen = () => { dialing = false; enqueue(recover); };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.t === "ops") {
          enqueue(() => ingest(msg.ops)).then(scheduleFlush);
          scheduleRecover();
        }
        // Live modeling (013 slice 4): transient, sealed, never logged —
        // the sender's own socket is relay-excluded and we ignore echoes.
        if (msg.t === "model" && msg.from !== identity.deviceId) {
          keyFor(msg.e ?? 1).then((k) => openOp(k, msg.env))
            .then((plain) => onModel?.(plain)).catch(() => {});
        }
      };
      ws.onclose = () => {
        if (live === ws) live = null;
        dialing = false;
        setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    }).catch(() => { dialing = false; setTimeout(connect, 5000); });
  };
  connect();
  if (typeof addEventListener === "function") {
    addEventListener("online", () => { connect(); scheduleRecover(); });
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { connect(); scheduleRecover(); }
    });
  }

  /** A live message (013 § 4): sealed under the current epoch key and
   *  sent up the ws — the relay broadcasts it, nothing is stored. The
   *  relay frame is always `model`; the sealed `k` says what it is: a
   *  supporter's modeled word (`model`) or the child's tap during a
   *  spotlight (`tap`, spotlight-layer.js). */
  const sendLive = async (plain) => {
    if (!live || live.readyState !== WebSocket.OPEN) return false;
    const env = await sealOp(await keyFor(epoch), plain);
    live.send(JSON.stringify({ t: "model", e: epoch, env }));
    return true;
  };
  return { get client() { return client; }, identity,
    getEpoch: () => epoch, uploadBlob, sendLive, rekey };
}

/** Tell the running sync to re-seal under a rotated epoch (015 s5). */
export async function syncRekey(epoch) {
  const handle = running ? await running.catch(() => null) : null;
  return handle?.rekey(epoch) ?? null;
}

/** A live message for the running sync — false when unlinked/offline. */
export async function syncSendLive(plain) {
  const handle = running ? await running.catch(() => null) : null;
  return handle?.sendLive(plain) ?? false;
}

/** A supporter's modeled word: it lights on the child's board. */
export const syncSendModel = (target, word) =>
  syncSendLive({ k: "model", t: target, w: word });

/** Upload a photo/recording blob if the user is linked. Callers don't
 *  await — the blob rides behind the op that references its sha. */
export async function syncUploadBlob(bytes) {
  const handle = running ? await running.catch(() => null) : null;
  return handle?.uploadBlob(bytes) ?? null;
}
