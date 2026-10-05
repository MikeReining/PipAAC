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
import { adoptSnapshot, appliedSeqOf, confirmOps, drainOps, listOps, setDeviceId, setOpSink, snapshotSynced } from "./ops.mjs";
import { loadBlobBytes, saveBlobBytes, setBlobFetcher } from "../db.js";
import {
  getDeviceIdentity, getUserKey, openBlob, openKeyStore, openOp, putUserKey, sealOp,
  sealBlob, unwrapUserKey,
} from "./sync_crypto.mjs";
import { relayClient } from "./sync_client.mjs";
import { onOnline, onVisible } from "./platform.mjs";

let running = null;
/** 031 § 8 — honest save status: did the last attempt to hand ops to
 *  the relay fail? Pending ops themselves are read from sync_op
 *  (relay_seq IS NULL until the relay accepted them). */
let flushError = null;
/** 043 B — a drain that threw leaves ops logged but unapplied and the
 *  cursor behind; surface it instead of wedging silently. */
let ingestError = null;
/** 043 C — shas this device still owes the relay (photos/recordings). */
let mediaPending = 0;
let mediaError = null;
export const syncHealth = () =>
  ({ running: !!running, flushError, ingestError, mediaPending, mediaError });
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

  /* 043 C — the durable media queue. savePhoto writes OPFS blobs/<sha>
   * before its caller hands the blob up, so an entry is just the sha;
   * bytes come back from OPFS on drain. The queue lives in the device
   * keystore — device-local, survives a kill, outlives this handle.
   * An entry leaves only after the relay holds the bytes (or held them
   * already), so an offline or killed upload retries on every recover. */
  const BLOBQ = `blobq/${user.id}`;
  // Entries are {sha, fails}: a sha whose local copy is gone and that
  // the relay never got can never be recovered — after BLOB_MAX_FAILS
  // drains it drops out instead of wedging "Saving…" forever.
  const BLOB_MAX_FAILS = 10;
  const queueGet = async () => (await store.get(BLOBQ)) ?? [];
  const queueBlob = async (sha) => {
    const q = await queueGet();
    if (!q.some((e) => e.sha === sha)) { q.push({ sha, fails: 0 }); await store.put(BLOBQ, q); }
    mediaPending = q.length;
    enqueue(drainBlobs);
  };
  const drainBlobs = async () => {
    const q = await queueGet();
    const kept = [];
    for (const e of q) {
      try {
        const bytes = await loadBlobBytes(e.sha);
        if (bytes) await uploadBlob(bytes);
        else {
          // Local copy gone — if the relay already has it, heal the
          // cache instead of re-uploading; if not, count the miss.
          const env = await client.getBlob(e.sha);
          await saveBlobBytes(e.sha, await openBlob(await keyFor(env.e ?? 1), { sha: e.sha, env }));
        }
        mediaError = null;
      } catch (err) {
        mediaError = String(err?.message ?? err);
        if (++e.fails < BLOB_MAX_FAILS) kept.push(e);
      }
    }
    await store.put(BLOBQ, kept);
    mediaPending = kept.length;
    // A failed drain re-arms: the entry may be a blob whose uploader
    // hasn't landed yet or a transient network miss — without this an
    // idle device would wait for the next socket event to retry.
    if (kept.length) scheduleDrain(Math.min(30000 * kept[0].fails, 300000));
  };
  let drainTimer = null;
  const scheduleDrain = (ms) => {
    clearTimeout(drainTimer);
    drainTimer = setTimeout(() => enqueue(drainBlobs), ms);
  };
  /* Media saved before linking (or queued on another path): every blob:
   * ref in the synced tables belongs in the queue — a sha the relay
   * already holds costs one open+heal, not an upload. */
  const reconcileBlobs = async () => {
    const refs = db.prepare(
      `SELECT photo_key AS k FROM personal_entity WHERE photo_key LIKE 'blob:%'
       UNION SELECT photo_key FROM image_override WHERE photo_key LIKE 'blob:%'
       UNION SELECT key FROM clip_override WHERE key LIKE 'blob:%'
       UNION SELECT person_photo FROM learner_profile WHERE person_photo LIKE 'blob:%'`,
    ).all();
    const q = await queueGet();
    let dirty = false;
    for (const r of refs) {
      const sha = r.k.slice(5);
      if (!q.some((e) => e.sha === sha)) { q.push({ sha, fails: 0 }); dirty = true; }
    }
    if (dirty) await store.put(BLOBQ, q);
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

  /** Apply a batch. The cursor claims complete coverage — every op the
   *  relay ever sequenced up to it is durably in the DB — so it may
   *  only move on a FETCHED batch (the relay serves the whole tail;
   *  gaps in it mean pruning, which the recover loop bridges via the
   *  snapshot). A live push is applied and saved but moves nothing:
   *  ops before it might never have been delivered. Apply, persist,
   *  then advance — a blocked save leaves the cursor behind so the
   *  next recover refetches (the flags dedupe) instead of skipping
   *  edits that never reached the family's stored copy. */
  const ingest = async (rows, { fetched = false } = {}) => {
    const plain = [];
    for (const r of rows) {
      plain.push({ ...(await openOp(await keyFor(r.epoch ?? 1), r.env)), relay_seq: r.relay_seq });
    }
    if (plain.length) {
      drainOps(db, plain);
      ingestError = null;
      onApplied();
      const saved = await persist?.();
      if (!fetched || saved === false) return;
      const applied = appliedSeqOf(db);
      if (applied > (cfg.cursor ?? 0)) {
        cfg.cursor = applied;
        await saveUser({ sync: cfg });
      }
    }
  };

  /** § 5 — every 500 confirmed ops a device uploads the sealed synced
   *  tables so the relay can prune the log they cover. The seq pairs
   *  with confirmed state only: a live snapshot taken while local ops
   *  are still pending would bake unconfirmed edits into the baseline,
   *  so we wait for a quiet log. Best-effort — a failure retries on the
   *  next drain. */
  const maybeSnapshot = async () => {
    // The cursor, not the applied watermark: the snapshot claim is used
    // to prune the relay log, so it may only cover ops we provably
    // received and folded — the fetch-verified coverage, not the sparse
    // max of whatever happened to be logged.
    const seq = cfg.cursor ?? 0;
    if (!seq || seq - (cfg.snap_seq ?? 0) < 500 || pendingOps().length) return;
    const snap = snapshotSynced(db);
    try {
      const env = await sealOp(await keyFor(epoch), { seq, snap });
      await client.putSnapshot({ e: epoch, env }, seq);
      cfg.snap_seq = seq;
      await saveUser({ sync: cfg });
    } catch { /* the next drain retries */ }
  };

  /** Adopt the relay snapshot, durably: the cursor only moves to its
   *  watermark once the database bytes themselves were saved — the
   *  same rule ingest follows. Returns the cursor it reached. */
  const adoptRemoteSnapshot = async () => {
    const stored = await client.getSnapshot().catch(() => null);
    const plain = stored?.env
      ? await openOp(await keyFor(stored.e ?? 1), stored.env).catch(() => null)
      : null;
    if (!plain?.snap || (plain.seq ?? 0) <= (cfg.cursor ?? 0)) return cfg.cursor ?? 0;
    adoptSnapshot(db, plain.snap, plain.seq);
    const saved = await persist?.();
    if (saved === false) return cfg.cursor ?? 0;
    cfg.cursor = appliedSeqOf(db);
    await saveUser({ sync: cfg });
    return cfg.cursor;
  };

  // The durable checkpoint lives in the database itself: a registry
  // cursor that ran ahead of a failed save drops back to what the
  // stored baseline provably contains — the skipped ops are refetched
  // and applied. It may only be pulled DOWN: pushed ops can raise the
  // applied watermark past the fetch-verified cursor, and claiming
  // that higher number at boot would skip ops never delivered.
  {
    const durable = appliedSeqOf(db);
    if (durable < (cfg.cursor ?? 0)) {
      cfg.cursor = durable;
      try { await saveUser({ sync: cfg }); }
      catch (err) { console.warn("sync: cursor checkpoint save failed", err); }
    }
  }

  // § 5 fast path: a device that never synced boots from the sealed
  // snapshot — adopt the synced tables at their seq, then replay only
  // the tail. Pending local edits survive: adoption rebases them.
  if (!cfg.cursor) {
    try { await adoptRemoteSnapshot(); }
    catch { /* a snapshot is an optimization — full replay still works */ }
  }

  /* 043 B — the one recovery flow, entered from boot, every socket
   * (re)open, and online events: fetch everything after the cursor,
   * apply it durably, advance the cursor, resend our pending ops.
   * A hole between the cursor and the first row means the relay pruned
   * ops we never saw — rebase on the sealed snapshot and tail from its
   * watermark. A gap the snapshot cannot bridge stops the sync loop
   * loudly: replaying over pruned history would claim coverage it
   * doesn't have. */
  const recover = async () => {
    for (;;) {
      const { ops: rows, snap_seq: snapSeq = 0 } = await client.fetchOps(cfg.cursor ?? 0);
      // A gap between the cursor and the first row only means lost
      // history if the relay's prune point reaches into it: relay seqs
      // are sparse — a deduped resubmit burns a number — so a gap
      // above the snapshot watermark is just seqs that never existed.
      if (rows?.length
          && rows[0].relay_seq > (cfg.cursor ?? 0) + 1
          && (cfg.cursor ?? 0) < snapSeq) {
        const before = cfg.cursor ?? 0;
        if ((await adoptRemoteSnapshot()) > before) continue;
        ingestError =
          `sync: relay pruned ops ${(cfg.cursor ?? 0) + 1}–${rows[0].relay_seq - 1} with no bridging snapshot`;
        console.warn(ingestError);
        return;
      }
      await ingest(rows ?? [], { fetched: true });
      break;
    }
    await maybeSnapshot().catch(() => {});
    await flush();
    // Ops applied above may carry new blob: refs, and the queue may
    // still owe the relay media from before this session — both are
    // reconciled + drained here, on every recovery pass.
    await reconcileBlobs();
    await drainBlobs();
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
  // Media goes first — pre-link photos/recordings land in the queue
  // before the first recover drains it.
  enqueue(reconcileBlobs);
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
  const wakeup = () => { connect(); scheduleRecover(); };
  if (typeof addEventListener === "function") onOnline(wakeup);
  if (typeof document !== "undefined") onVisible(wakeup);

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
    getEpoch: () => epoch, uploadBlob, queueBlob, sendLive, rekey };
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

/** Queue a photo/recording blob for upload (043 C). The bytes are
 *  already in OPFS under their sha; the queue entry is what makes the
 *  upload survive a kill or an offline stretch. Unlinked callers get
 *  null — reconcileBlobs picks their media up when linking happens. */
export async function syncUploadBlob(bytes) {
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const handle = running ? await running.catch(() => null) : null;
  if (!handle) return null;
  await handle.queueBlob(sha);
  return sha;
}
