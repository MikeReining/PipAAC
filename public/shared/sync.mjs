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
import { adoptSnapshot, appliedSeqOf, baselineSnapshot, confirmOps, drainOps, pendingOps, setDeviceId, setOpSink, SNAPSHOT_V } from "./ops.mjs";
import { loadBlobBytes, saveBlobBytes, setBlobFetcher } from "../db.js";
import {
  getDeviceIdentity, getUserKey, openBlob, openKeyStore, openOp,
  putUserKey, sealOp, sealBlob, unwrapUserKey, userKeyName,
} from "./sync_crypto.mjs";
import { relayClient } from "./sync_client.mjs";
import { withDeadline } from "./bounded.mjs";
import { onOnline, onVisible } from "./platform.mjs";
import { completeRemovalRotation, resumeRecoveryCard } from "./rotation.mjs";

let running = null;
/** 031 § 8 — honest save status: did the last attempt to hand ops to
 *  the relay fail? Pending ops themselves are read from sync_op
 *  (relay_seq IS NULL until the relay accepted them). */
let flushError = null;
/** 043 B — a drain that threw leaves ops logged but unapplied and the
 *  cursor behind; surface it instead of wedging silently. */
let ingestError = null;
let rotationError = null;
/** 043 C — shas this device still owes the relay (photos/recordings). */
let mediaPending = 0;
let mediaError = null;
export const syncHealth = () =>
  ({ running: !!running, flushError, ingestError, rotationError, mediaPending, mediaError });
/**
 * `user` is the registry row (id, sync). `saveUser(patch)` persists
 * sync-state changes back to the row (epoch bumps on rotation).
 * `persist` (043 B) is the DB's own flush — the cursor is only durable
 * if the ops it counts are, so ingest awaits it before advancing.
 */
export async function initSync(db, user, saveUser, baseUrl = location.origin, onApplied = () => {}, onModel = null, persist = null, opts = {}) {
  if (running) return running;
  const cfg = user?.sync;
  // pendingJoin (audit F12): the account import stored keys but relay
  // registration never succeeded — this device is local-only until a
  // later join clears the flag.
  if (!cfg?.userId || cfg.pendingJoin) return null;
  running = startSync(db, baseUrl, user, cfg, saveUser, onApplied, onModel, persist, opts)
    .catch((err) => { running = null; throw err; });
  return running;
}

async function startSync(db, baseUrl, user, cfg, saveUser, onApplied, onModel, persist, opts = {}) {
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

  /** Rebuild the relay client whenever the sealing key changes —
   *  submit() closes over its key, so a client minted under epoch N
   *  keeps signing epoch-N envelopes after a rotation (audit F05.1). */
  const rebuildClient = () => {
    client = relayClient({ userId: cfg.userId, baseUrl, identity, userKey });
  };

  /** Key for an op's epoch — a higher epoch means a rotation happened:
   *  unwrap every grant between our epoch and the op's from the relay's
   *  per-epoch history, so a device that missed several rotations still
   *  opens each envelope under its own key (audit F05.2). A stored key
   *  is fetched explicitly — a missing historical key must never mint a
   *  random replacement. */
  const keyFor = async (e) => {
    if (e <= epoch) {
      const stored = await store.get(userKeyName(user.id, e));
      if (stored) return stored;
      // Only the device's own top epoch may be minted — anything older
      // is a genuinely absent grant, and a random key would just fail
      // to open the envelope anyway.
      if (e === epoch) return getUserKey(store, user.id, e);
      throw new Error(`sync: no stored key for epoch ${e}`);
    }
    const self = await client.selfKey();
    const grants = self.wrapped_keys ?? {};
    let highest = epoch;
    // Unwrap every grant past our epoch, not just the op's: the local
    // epoch must track the relay's so outgoing edits seal under the
    // current key, and the whole chain stays openable in between.
    for (const [ge, wk] of Object.entries(grants)) {
      const g = Number(ge);
      if (g <= epoch || !wk) continue;
      const k = await unwrapUserKey(identity.dh.privateKey,
        typeof wk === "string" ? JSON.parse(wk) : wk);
      await putUserKey(store, user.id, k, g);
      if (g > highest) highest = g;
    }
    // Legacy relay: only the current epoch's single grant.
    if (highest === epoch && self.wrapped_key && self.current_epoch > epoch) {
      const k = await unwrapUserKey(
        identity.dh.privateKey, JSON.parse(self.wrapped_key));
      await putUserKey(store, user.id, k, self.current_epoch);
      highest = self.current_epoch;
    }
    if (highest < e) {
      throw new Error(`sync: no wrapped key for epoch ${e}`);
    }
    epoch = highest;
    userKey = await getUserKey(store, user.id, epoch);
    cfg.epoch = epoch;
    await saveUser({ sync: cfg });
    rebuildClient();
    const key = await store.get(userKeyName(user.id, e));
    if (!key) throw new Error(`sync: no stored key for epoch ${e}`);
    return key;
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
    const sealingEpoch = epoch;
    const sealed = await sealBlob(await keyFor(sealingEpoch), bytes, sealingEpoch);
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
  // Entries hold {sha, fails, retries}; only proven missing bytes count
  // toward BLOB_MAX_FAILS. Retry pacing never drops available bytes.
  const BLOB_MAX_FAILS = 10;
  const queueGet = async () => (await store.get(BLOBQ)) ?? [];
  /* Every read-modify-write of the durable queue runs under this lock
   * (audit F10): an interleaved queueBlob/put pair can otherwise drop a
   * just-added entry, and two drains can replay the same upload. */
  let queueLock = Promise.resolve();
  const queueMutate = (fn) => {
    const p = queueLock.then(fn);
    queueLock = p.catch(() => {});
    return p;
  };
  const queueBlob = async (sha) => {
    await queueMutate(async () => {
      const q = await queueGet();
      if (!q.some((e) => e.sha === sha)) { q.push({ sha, fails: 0 }); await store.put(BLOBQ, q); }
      mediaPending = q.length;
    });
    enqueue(drainBlobs);
  };
  const drainBlobs = () => queueMutate(async () => {
    const q = await queueGet();
    const kept = [];
    let error = null;
    for (const e of q) {
      let hadBytes = false;
      try {
        const bytes = await loadBlobBytes(e.sha);
        hadBytes = !!bytes;
        if (bytes) await uploadBlob(bytes);
        else {
          // Local copy gone — if the relay already has it, heal the
          // cache instead of re-uploading; if not, count the miss.
          const env = await client.getBlob(e.sha);
          await saveBlobBytes(e.sha, await openBlob(await keyFor(env.e ?? 1), { sha: e.sha, env }));
        }
      } catch (err) {
        error = String(err?.message ?? err);
        // Pace transient retries separately from proven-loss counting.
        e.retries = Math.min((e.retries ?? 0) + 1, 10);
        // Only bytes nobody still has may count toward the drop cap:
        // the local copy is gone AND the relay says it never got them
        // (audit F10). A reachable local copy or a transient network
        // miss keeps the obligation and retries with backoff.
        const unrecoverable = !hadBytes && err?.status === 404;
        if (!unrecoverable || ++e.fails < BLOB_MAX_FAILS) kept.push(e);
      }
    }
    await store.put(BLOBQ, kept);
    mediaPending = kept.length;
    mediaError = error;
    // Retry idle media obligations without waiting for socket traffic.
    if (kept.length) scheduleDrain(30000 * kept[0].retries);
  });
  let drainTimer = null;
  const scheduleDrain = (ms) => {
    clearTimeout(drainTimer);
    drainTimer = setTimeout(() => enqueue(drainBlobs), ms);
    drainTimer.unref?.(); // same — re-arm only, never a keep-alive
  };
  /* Media saved before linking (or queued on another path): every blob:
   * ref in the synced tables belongs in the queue — a sha the relay
   * already holds costs one open+heal, not an upload. */
  const reconcileBlobs = () => queueMutate(async () => {
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
  });

  /* The outbox flushes in bounded batches (audit: unbounded work), and
   * the flush itself is serialized — a timer flush, a socket-triggered
   * flush, and a recover flush share one in-flight promise instead of
   * racing the same pending set through the relay twice. */
  const FLUSH_BATCH = 200;
  const OPS_PAGE = 200;
  const flushStallMs = opts.flushStallMs ?? 45_000;
  let flushing = null;
  const runFlush = async () => {
    const ops = pendingOps(db, FLUSH_BATCH + 1);
    if (!ops.length) { flushError = null; return; }
    const more = ops.length > FLUSH_BATCH;
    await resumeRecoveryCard({ store, user, client, saveUser, rekey });
    const self = await client.selfKey();
    if (self.current_epoch > epoch) await keyFor(self.current_epoch);
    const { ops: assigned } = await client.submit(ops.slice(0, FLUSH_BATCH), epoch);
    confirmOps(db, assigned);
    await maybeSnapshot();
    flushError = null;
    flushFails = 0;
    // The batch drained but the outbox didn't — keep going promptly.
    if (more || pendingOps(db, 1).length) scheduleFlush(0);
  };
  /* Serialization must stay live: a serialized flush whose await never
   * settles would wedge every later edit behind a promise that never
   * resolves — ops logging locally, nothing reaching the relay, and
   * syncHealth reading clean. Every await above is bounded at its own
   * seam; this deadline is the catch-all that still frees the queue,
   * surfaces the error, and lets the bounded retry try again. */
  const flush = () => {
    if (flushing) return flushing;
    flushing = withDeadline(runFlush(), flushStallMs, "sync: flush")
      .catch((err) => {
        flushError = String(err?.message ?? err);
        // A stranded edit is silent loss (audit F10): bounded retries
        // with linear backoff whichever caller raised the failure —
        // recover, the debounce, a stall, or a socket event all land here.
        if (++flushFails <= 8) {
          scheduleFlush(Math.min(2000 * flushFails, 30000));
        }
        throw err;
      })
      .finally(() => { flushing = null; });
    return flushing;
  };
  let flushTimer = null;
  let flushFails = 0;
  const scheduleFlush = (delay = 300) => {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flush().catch(() => {}), delay);
    flushTimer.unref?.(); // a retry timer must not hold a process open
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
      drainOps(db, plain, { fetched });
      ingestError = null;
      onApplied();
      const saved = await persist?.();
      if (saved === false) throw new Error("sync: database save failed; catch-up paused");
      if (!fetched) return;
      // Cap fetched coverage at this page, even after a later push/ack.
      const covered = Math.min(appliedSeqOf(db), Math.max(...plain.map((op) => op.relay_seq)));
      if (covered > (cfg.cursor ?? 0)) {
        cfg.cursor = covered;
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
    // A snapshot may claim only the contiguous applied prefix the
    // fetch-verified cursor covers, and it may only CONTAIN that state:
    // the payload is the stored baseline itself, so pending edits and
    // ops applied past the cursor can never bake into a backup that
    // disowns them.
    const seq = cfg.cursor ?? 0;
    if (!seq || seq !== appliedSeqOf(db)
        || seq - (cfg.snap_seq ?? 0) < 500) return;
    const snap = baselineSnapshot(db);
    try {
      const sealingEpoch = epoch;
      const env = await sealOp(await keyFor(sealingEpoch), { v: SNAPSHOT_V, seq, snap });
      await client.putSnapshot({ e: sealingEpoch, env }, seq);
      cfg.snap_seq = seq;
      await saveUser({ sync: cfg });
    } catch { /* the next drain retries */ }
  };

  /** A paired owner (no recovery root) can't mint an epoch key the
   *  printed card could derive — it flags rotate_min_epoch at the relay
   *  instead, and the next root holder that checks in finishes the
   *  rotation: derive the epoch key, wrap it for every remaining
   *  device, post it, rekey the running client (audit F05.3). */
  const maybeCompleteRotation = async () => {
    try {
      await completeRemovalRotation({ store, user, client, saveUser, rekey });
      rotationError = null;
    } catch (err) {
      rotationError = String(err?.message ?? err);
      console.warn("sync: deferred rotation failed", err);
    }
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
    // Versioned restore contract (audit): a payload newer than this
    // build understands must fail loudly — replaying a format we half-
    // parse claims coverage of state we never restored. Pre-versioning
    // payloads are format 1.
    const v = plain.v ?? 1;
    if (v > SNAPSHOT_V) {
      throw new Error(
        `sync: snapshot version ${v} newer than supported ${SNAPSHOT_V}`);
    }
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

  /* SYNC_REPLAY_ANCHOR — a confirmed op persisted unapplied at or below
   * the durable coverage claim is a wound the old unflag-and-replay
   * repair could leave behind: the baseline cannot prove what it
   * contains. Drop the claim back to the replay anchor's floor so the
   * catch-up refetches a complete tail window — the drain then rebuilds
   * over the anchor instead of folding the wounded suffix in place. */
  {
    const floor = db.prepare(
      "SELECT applied_seq FROM sync_baseline WHERE id = 2",
    ).all()[0]?.applied_seq ?? 0;
    const wounded = db.prepare(
      `SELECT 1 AS x FROM sync_op
       WHERE relay_seq IS NOT NULL AND applied = 0 AND relay_seq <= ?`,
    ).all(appliedSeqOf(db))[0];
    if (wounded && (cfg.cursor ?? 0) > floor) {
      cfg.cursor = floor;
      try { await saveUser({ sync: cfg }); }
      catch (err) { console.warn("sync: anchor rewind save failed", err); }
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
    await resumeRecoveryCard({ store, user, client, saveUser, rekey });
    const self = await client.selfKey();
    if (self.current_epoch > epoch) await keyFor(self.current_epoch);
    for (;;) {
      // Pages of OPS_PAGE — a long-offline device walks the backlog a
      // bounded slice at a time instead of one unbounded response.
      const { ops: rows, snap_seq: snapSeq = 0 } =
        await client.fetchOps(cfg.cursor ?? 0, OPS_PAGE);
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
      // An empty tail is not "nothing to do" when the relay's prune
      // point is ahead: everything we missed was folded into the
      // snapshot — adopt it, then fetch whatever came after. If no
      // stored snapshot can bridge us, stop loudly rather than claim
      // coverage of pruned history we never saw.
      if (!rows?.length && (cfg.cursor ?? 0) < snapSeq) {
        const before = cfg.cursor ?? 0;
        if ((await adoptRemoteSnapshot()) > before) continue;
        ingestError =
          `sync: relay pruned ops ${(cfg.cursor ?? 0) + 1}–${snapSeq} with no bridging snapshot`;
        console.warn(ingestError);
        return;
      }
      const before = cfg.cursor ?? 0;
      await ingest(rows ?? [], { fetched: true });
      if (rows?.length && (cfg.cursor ?? 0) <= before) {
        throw new Error("sync: catch-up made no durable progress");
      }
      if ((rows?.length ?? 0) === OPS_PAGE) continue; // next page
      break;
    }
    await maybeCompleteRotation();
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
    const sealingEpoch = epoch;
    const env = await sealOp(await keyFor(sealingEpoch), plain);
    live.send(JSON.stringify({ t: "model", e: sealingEpoch, env }));
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
