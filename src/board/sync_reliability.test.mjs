/**
 * 043 retry, coverage and join proofs (F10/F11/F12): real ops + crypto,
 * stub relay/blob/platform imports via module.registerHooks.
 * Assert queue contents, received rows and submitted ops.
 * Run: scripts/test.sh src/board/sync_reliability.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { createEntity } from "../../public/shared/groups.mjs";
import { ensureBaseline, listOps } from "../../public/shared/ops.mjs";
import {
  genAccountKeys,
  getDeviceIdentity,
  getUserKey,
  ensureRecoveryRoot,
  importAccountPriv,
  memoryKeyStore,
  openBlob,
  openOp,
  putUserKey,
  sealOp,
  wrapUserKey,
  newUserKey,
} from "../../public/shared/sync_crypto.mjs";
import { addUser, getUser, memoryUserStore } from "../../public/shared/users.mjs";
import { importAccountUsers } from "../../public/shared/account.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const sharedDir = join(repoRoot, "public/shared");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(
  lexicon,
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);

// Shared state the stubbed modules reach for at runtime — installed on
// globalThis so the hook-generated sources can name it.
const shared = {};
globalThis.__pipSyncReliabilityShared = shared;

registerHooks({
  resolve(spec, ctx, next) {
    const parent = ctx.parentURL ?? "";
    if (parent.includes("/public/shared/sync.mjs")) {
      const map = {
        "../db.js": "virtual:dbjs-rel",
        "./platform.mjs": "virtual:platform-rel",
        "./sync_client.mjs": "virtual:client-rel",
        "./sync_crypto.mjs": "virtual:crypto-rel",
      };
      if (map[spec]) return { url: map[spec], shortCircuit: true };
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    const realCrypto = pathToFileURL(join(sharedDir, "sync_crypto.mjs")).href;
    const sources = {
      "virtual:dbjs-rel": `
        export const loadBlobBytes = (...a) =>
          globalThis.__pipSyncReliabilityShared.loadBlobBytes?.(...a);
        export const saveBlobBytes = async () => {};
        export const setBlobFetcher = () => {};
      `,
      "virtual:platform-rel": `
        export const onOnline = () => {};
        export const onVisible = () => {};
      `,
      "virtual:client-rel": `
        export const relayClient = (opts) =>
          globalThis.__pipSyncReliabilityShared.relayClient(opts);
        export { relayUnreachable } from ${JSON.stringify(pathToFileURL(join(sharedDir, "sync_client.mjs")).href)};
      `,
      "virtual:crypto-rel": `
        export * from ${JSON.stringify(realCrypto)};
        export const openKeyStore = () => globalThis.__pipSyncReliabilityShared.store;
      `,
    };
    if (sources[url]) return { format: "module", source: sources[url], shortCircuit: true };
    return next(url, ctx);
  },
});

// Globals sync.mjs reaches for outside its imports.
const sockets = [];
class QuietSocket {
  static OPEN = 1;
  constructor(url) {
    this.url = url;
    this.readyState = QuietSocket.OPEN;
    sockets.push(this);
  }
  send(frame) { (this.frames ??= []).push(JSON.parse(frame)); }
  close() { this.readyState = 3; this.onclose?.(); }
  /** Deliver a relay frame as if it arrived on the wire. */
  push(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}
globalThis.WebSocket = QuietSocket;

// initSync keeps a module-level `running` singleton — each runtime gets
// a fresh instance via a cache-busting query.
const syncUrl = pathToFileURL(join(sharedDir, "sync.mjs")).href;
let syncInstances = 0;
const loadSync = () => import(`${syncUrl}?n=${++syncInstances}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (rounds = 10) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
};

const openReplica = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  ensureBaseline(db);
  return db;
};

/**
 * A device-runtime with a scripted relay. `submit` and the blob verbs
 * are stubbed per test so failure modes are deliberate.
 */
async function runtime({
  fetchResult = { ops: [], snap_seq: 0 },
  fetchOps = null,
  submit = null,
  putBlob = null,
  getBlob = null,
  supporters = [],
  rotateMinEpoch = 0,
  root = false,
  persist = async () => true,
  epoch = 1,
  userKey = null,
  opts = {},
  userId = "u1",       // the registry row id (key-store names)
  relayId = "u-relay", // the relay user id
  syncMod = null,      // reuse one module instance (the singleton) across runtimes
  reuse = null,        // { db, store, user }: restart a person on the same replica
} = {}) {
  const db = reuse?.db ?? openReplica();
  const store = reuse?.store ?? memoryKeyStore();
  const identity = await getDeviceIdentity(store);
  const key = userKey ?? await getUserKey(store, userId);
  await putUserKey(store, userId, key, epoch);
  if (root) await ensureRecoveryRoot(store, userId);

  const submits = [];
  const uploads = [];
  const fetches = [];
  const clients = [];
  const user = reuse?.user ?? { id: userId, sync: { userId: relayId, epoch, cursor: 0 } };
  shared.store = store;
  shared.loadBlobBytes = async () => null;
  // Each construction captures its sealing key — the same closure the
  // real relayClient builds — so a test can check which key sealed what.
  shared.relayClient = (args) => {
    clients.push(args);
    return ({
    selfKey: async () => ({ current_epoch: epoch, wrapped_key: null,
      wrapped_keys: {}, rotate_min_epoch: rotateMinEpoch }),
    fetchOps: async (after, limit) => {
      fetches.push({ after, limit });
      return fetchOps ? fetchOps(after, limit) : fetchResult;
    },
    getSnapshot: async () => null,
    putSnapshot: async () => {},
    listDevices: async () => ({ devices: [], current_epoch: epoch }),
    rotateKeys: async () => {},
    requestRotation: async () => {},
    submit: async (ops, declaredEpoch) => {
      submits.push(ops);
      if (submit) return submit(ops, submits.length,
        { declaredEpoch, userKey: args.userKey });
      return { ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: i + 1 })) };
    },
    getBlob: getBlob ?? (async () => { throw Object.assign(new Error("no blob"), { status: 404 }); }),
    putBlob: putBlob ?? (async (sealed) => { uploads.push(sealed); }),
    listSupporters: async () => ({ supporters }),
    wsUrl: async () => "wss://test.invalid/ws",
    });
  };

  const mod = syncMod ?? await loadSync();
  const { initSync, syncHealth, setSyncAccountOps } = mod;
  const handle = await initSync(
    db, user,
    async (patch) => Object.assign(user.sync, patch.sync ?? {}),
    "https://test.invalid",
    () => {},
    null,
    persist,
    opts,
  );
  await settle();
  return { db, store, key, user, submits, uploads, fetches, clients,
    handle, syncHealth, setSyncAccountOps, mod };
}

for (const kind of ["blob", "live"]) {
  test(`${kind} envelope keeps its sealing epoch when rotation interrupts key lookup`, { timeout: 5000 }, async () => {
    const r = await runtime();
    const socket = sockets.at(-1);
    await putUserKey(r.store, "u1", await newUserKey(), 2);
    const get = r.store.get;
    let enter, release;
    const entered = new Promise((resolve) => { enter = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    let paused = false;
    r.store.get = async (name) => {
      if (name === "user/u1/key_e1" && !paused) {
        paused = true;
        enter();
        await gate;
      }
      return get(name);
    };
    const payload = kind === "blob"
      ? new TextEncoder().encode("photo during rotation")
      : { k: "model", target: "ent_dog", word: "dog" };
    const sending = kind === "blob"
      ? r.handle.uploadBlob(payload) : r.handle.sendLive(payload);
    await entered;
    try { await r.handle.rekey(2); } finally { release(); }
    await sending;
    const sealed = kind === "blob" ? r.uploads.at(-1) : socket.frames.at(-1);
    assert.equal(kind === "blob" ? sealed.env.e : sealed.e, 1);
    // Check actual ciphertext with the independently held epoch-1 key.
    const opened = kind === "blob"
      ? await openBlob(r.key, sealed) : await openOp(r.key, sealed.env);
    assert.deepEqual(opened, payload);
  });
}

test("F10: a failed submit re-arms on bounded backoff — an open socket and silence do not strand the edit", async () => {
  let calls = 0;
  const r = await runtime({
    // Boot flush confirms the seed ops (call 1); the flush carrying
    // the user's edit fails (call 2); only the bounded retry (call 3)
    // may succeed — no socket traffic or user activity in between.
    submit: async (ops) => {
      calls++;
      if (calls === 2) throw new Error("relay 500");
      return { ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: i + 1 })) };
    },
  });
  createEntity(r.db, { id: "ent_retry", name: "Retry me" });
  await sleep(500); // past the 300 ms debounce — the edit's flush failed
  assert.equal(calls, 2);
  assert.ok(r.syncHealth().flushError, "failure not surfaced");
  assert.ok(listOps(r.db).some((o) => o.relay_seq === null),
    "edit silently confirmed despite the failed submit");
  await sleep(2300); // bounded retry fires (2000 ms backoff)
  assert.equal(calls, 3, "no automatic retry was scheduled");
  assert.equal(r.syncHealth().flushError, null);
  assert.ok(!listOps(r.db).some((o) => o.relay_seq === null),
    "op never confirmed after the retry");
});

test("F10: a stalled flush surfaces and frees the outbox — a hung await cannot wedge the session", async () => {
  // The browser proof: a relay call that never settles left `flushing`
  // non-null forever — every later edit queued behind a dead promise
  // while syncHealth read clean. The deadline must surface the stall
  // and the bounded retry must still carry the edit through.
  let calls = 0;
  let hang = false;
  const r = await runtime({
    opts: { flushStallMs: 60 },
    submit: async (ops) => {
      calls++;
      if (hang) return new Promise(() => {}); // never settles
      return { ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: i + 1 })) };
    },
  });
  hang = true;
  createEntity(r.db, { id: "ent_stall", name: "Stalled edit" });
  await sleep(600); // 300 ms debounce + 60 ms stall deadline
  assert.match(r.syncHealth().flushError ?? "", /stalled/,
    "a hung submit never surfaced as a flush error");
  assert.ok(listOps(r.db).some((o) => o.relay_seq === null),
    "edit claimed confirmed while the submit was stalled");
  hang = false;
  await sleep(2600); // the bounded retry (~2 s) submits the same op
  assert.ok(calls >= 3, "the outbox never retried after the stall");
  assert.equal(r.syncHealth().flushError, null);
  assert.ok(!listOps(r.db).some((o) => o.relay_seq === null),
    "edit stayed stranded after the relay recovered");
});

test("F10: concurrent queueBlob calls both land — a drain-in-flight cannot wipe an append", async () => {
  let uploads = 0;
  const r = await runtime({
    // The first upload takes long enough that a second append lands
    // mid-drain — the interleaving the audit reproduced.
    putBlob: async (sealed) => { await sleep(60); uploads++; },
  });
  const bytesA = new TextEncoder().encode("photo-a");
  const bytesB = new TextEncoder().encode("photo-b");
  const sha = async (b) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))]
    .map((x) => x.toString(16).padStart(2, "0")).join("");
  const shaA = await sha(bytesA), shaB = await sha(bytesB);
  const blobBytes = { [shaA]: bytesA, [shaB]: bytesB };
  shared.loadBlobBytes = async (s) => blobBytes[s] ?? null;

  await r.handle.queueBlob(shaA);
  await sleep(20); // drain A is inside its slow putBlob now
  await r.handle.queueBlob(shaB); // must not be wiped by drain A's write
  await sleep(300);
  const q = await r.store.get("blobq/u1");
  assert.equal(uploads, 2, "an appended blob was lost by a racing drain");
  assert.equal(q.length, 0);
});

test("F10: a transient upload failure keeps the obligation; only a proven-gone blob counts toward the drop cap", async () => {
  let failUpload = true;
  const uploaded = [];
  const r = await runtime({
    putBlob: async (sealed) => {
      if (failUpload) throw Object.assign(new Error("offline"), { status: 0 });
      uploaded.push(sealed.sha);
    },
    getBlob: async () => {
      throw Object.assign(new Error("relay GET blob: 404"), { status: 404 });
    },
  });
  const bytes = new TextEncoder().encode("recording");
  shared.loadBlobBytes = async () => bytes;

  // Ten transient misses with reachable local bytes: fails never moves.
  await r.handle.queueBlob("sha_transient");
  for (let i = 0; i < 10; i++) {
    await r.handle.queueBlob("sha_transient");
    await settle(6);
  }
  let q = await r.store.get("blobq/u1");
  assert.equal(q.length, 1, "transient misses dropped the obligation");
  assert.equal(q[0].fails, 0, "transient misses counted toward the drop cap");

  // Prolonged offline stretch ends — the same entry uploads; nothing
  // was discarded and no re-queue was needed.
  failUpload = false;
  await r.handle.queueBlob("sha_transient");
  await settle(8);
  assert.ok(uploaded.length >= 1, "queued blob never uploaded after recovery");
  q = await r.store.get("blobq/u1");
  assert.equal(q.length, 0);

  // Bytes nowhere: no local copy AND the relay never got them (404) —
  // that is the only path that may ever count toward the cap. The
  // tenth miss drops the entry instead of wedging "Saving…" forever.
  shared.loadBlobBytes = async () => null;
  for (let i = 0; i < 10; i++) {
    await r.handle.queueBlob("sha_gone");
    await settle(8);
  }
  q = await r.store.get("blobq/u1");
  assert.equal(q.length, 0, "unrecoverable blob wedged the queue forever");
});

test("F11: ingest failure is honest — a poisoned op leaves ingestError set, not a green board", async () => {
  const otherKey = await newUserKey(); // sealed under a key this device lacks
  const r = await runtime({
    fetchResult: {
      ops: [{
        relay_seq: 1, epoch: 9,
        env: await sealOp(otherKey, {
          op_id: "op_bad", kind: "create_entity",
          args: { id: "ent_bad", name: "Bad" }, device_id: "d0", v: 1 }),
      }],
      snap_seq: 0,
    },
  });
  await settle();
  assert.ok(r.syncHealth().ingestError, "failed replay never surfaced");
  assert.equal(r.user.sync.cursor, 0, "cursor claimed coverage of a failed replay");
});

test("unreachable relay: the real client tags a fetch that never answered; 503 counts too", async () => {
  const { relayClient, relayUnreachable } = await import(pathToFileURL(join(sharedDir, "sync_client.mjs")).href);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  try {
    const c = relayClient({ userId: "u1", baseUrl: "http://relay.invalid",
      identity: await getDeviceIdentity(memoryKeyStore()), userKey: await newUserKey() });
    const err = await c.fetchOps(0, 10).then(() => null, (e) => e);
    assert.ok(err instanceof TypeError, "the original error type is kept");
    assert.equal(relayUnreachable(err), true);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(relayUnreachable({ status: 503 }), true);
  assert.equal(relayUnreachable({ status: 400 }), false);
  assert.equal(relayUnreachable(new Error("sync: database save failed; catch-up paused")), false);
});

test("unreachable relay: a catch-up that cannot reach the relay reads Offline, not a failed update", async () => {
  const { editorStatus } = await import("../../public/board/editor-find.js");
  const offline = () => { throw Object.assign(new TypeError("Failed to fetch"), { unreachable: true }); };
  const r = await runtime({ fetchOps: async () => offline(), submit: async () => offline() });
  createEntity(r.db, { name: "Grandma" }); // a pending edit the relay cannot take
  await sleep(500); // past the 300 ms flush debounce
  const h = r.syncHealth();
  assert.equal(h.ingestError, null, "an offline relay was reported as a failed replay");
  assert.ok(h.flushError, "the failed send is the offline signal");
  assert.equal(editorStatus({ linked: true, pending: 1, online: true, ...h }).text, "Offline — will sync");
});

test("F12: import marks an unjoined user pendingJoin — keys present, relay access unproven", async () => {
  const keyStore = memoryKeyStore();
  const userStore = memoryUserStore();
  const acct = await genAccountKeys();
  const priv = await importAccountPriv(acct.priv);
  const userKey = await newUserKey();
  const grant = await wrapUserKey(userKey, acct.pub);
  const bundle = {
    users: [{
      user_id: "u-join", keys: [{ epoch: 1, grant }],
      join_tokens: ["dead-1", "dead-2"],
    }],
  };

  // Every token is dead: keys land, but the row must not claim sync.
  const first = await importAccountUsers({
    bundle, priv, keyStore, userStore,
    putUserKey, addUser,
    joinDevice: async () => { throw new Error("join: 403"); },
  });
  assert.equal(first[0].unlocked, true);
  assert.equal(first[0].joined, false);
  let row = await getUser(userStore, "u-join");
  assert.equal(row.sync.pendingJoin, true,
    "a user with no proven relay access presented as linked");

  // A later sign-in redeems a fresh token — the flag clears.
  const second = await importAccountUsers({
    bundle: { users: [{ ...bundle.users[0], join_tokens: ["live-1"] }] },
    priv, keyStore, userStore,
    putUserKey, addUser,
    joinDevice: async () => ({ ok: true }),
  });
  assert.equal(second[0].joined, true);
  row = await getUser(userStore, "u-join");
  assert.equal(row.sync.pendingJoin, undefined,
    "successful join did not clear the unlinked marker");

  // A failed re-import never downgrades an already-linked row.
  const third = await importAccountUsers({
    bundle, priv, keyStore, userStore,
    putUserKey, addUser,
    joinDevice: async () => { throw new Error("join: 403"); },
  });
  assert.equal(third[0].joined, false);
  row = await getUser(userStore, "u-join");
  assert.equal(row.sync.pendingJoin, undefined,
    "a proven link was downgraded by a later failed import");
});

test("bounded work: a timer flush and a recovery flush share one in-flight submit", async () => {
  const r = await runtime({
    // The second submit (the user's edit) takes long enough that a
    // socket-triggered recover lands mid-flight — the overlap the
    // audit reproduces.
    submit: async (ops, call) => {
      if (call === 2) await sleep(300);
      return { ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: i + 1 })) };
    },
  });
  const bootSubmits = r.submits.length; // the seed ops already went
  createEntity(r.db, { id: "ent_overlap", name: "Overlap" });
  await sleep(400); // debounce fired; submit #2 is in flight
  assert.equal(r.submits.length, bootSubmits + 1);
  // A socket frame mid-submit runs a recover pass — its flush must
  // join the in-flight submit, not re-send the same pending op.
  const pushed = {
    relay_seq: 50, epoch: 1,
    env: await sealOp(r.key, {
      op_id: "op_remote", kind: "create_entity",
      args: { id: "ent_remote", name: "Remote" }, device_id: "d0", v: 1 }),
  };
  sockets.at(-1).push({ t: "ops", ops: [pushed] });
  await sleep(600);
  const resubmitted = r.submits.slice(bootSubmits + 1)
    .some((batch) => batch.some((o) =>
      JSON.stringify(o.args).includes("ent_overlap")));
  assert.ok(!resubmitted, "the overlapping flush resubmitted the same pending op");
  assert.ok(!listOps(r.db).some((o) => o.relay_seq === null),
    "the shared flush never confirmed the edit");
});

test("bounded work: the outbox submits in capped batches, never the whole log at once", async () => {
  const r = await runtime();
  for (let i = 0; i < 210; i++) {
    createEntity(r.db, { id: `ent_batch_${i}`, name: `B${i}` });
  }
  await sleep(800); // debounce + follow-up batch
  const sizes = r.submits.map((s) => s.length);
  assert.ok(Math.max(...sizes) <= 200,
    `a flush submitted ${Math.max(...sizes)} ops in one call`);
  assert.ok(sizes.length >= 2, "the over-cap outbox never drained its remainder");
  assert.ok(!listOps(r.db).some((o) => o.relay_seq === null),
    "ops past the first batch were stranded");
});

test("bounded work: recovery fetches the backlog in pages and walks past a full page", async () => {
  // A donor produces a 210-op backlog; the runtime joins with an empty
  // cursor and must page through it — one fetch can never carry it all.
  const key = await newUserKey();
  const donor = openReplica();
  for (let i = 0; i < 210; i++) {
    createEntity(donor, { id: `ent_page_${i}`, name: `P${i}` });
  }
  const backlog = [];
  for (const [i, op] of listOps(donor).entries()) {
    backlog.push({ relay_seq: i + 1, epoch: 1, env: await sealOp(key, op) });
  }
  donor.close();

  const r = await runtime({
    userKey: key,
    fetchOps: async (after, limit) => ({
      ops: backlog.filter((o) => o.relay_seq > after).slice(0, limit),
      snap_seq: 0,
    }),
  });
  // Two pages of drains take real time — wait for the cursor to walk
  // the whole backlog rather than a fixed settle.
  const deadline = Date.now() + 15000;
  while (r.user.sync.cursor < backlog.length && Date.now() < deadline) {
    await sleep(200);
  }
  assert.ok(r.fetches.length >= 2, "a full page was never followed by the next fetch");
  assert.ok(r.fetches.every((f) => f.limit === 200), "fetchOps ignored the page bound");
  assert.equal(r.user.sync.cursor, backlog.length,
    "the cursor did not reach the end of the paged backlog");
  assert.equal(
    r.db.prepare("SELECT COUNT(*) AS n FROM personal_entity WHERE id LIKE 'ent_page_%'").all()[0].n,
    210, "paged backlog ops never applied");
});

test("paged coverage: a later live push cannot skip the next fetched page", async () => {
  const key = await newUserKey();
  const backlog = [];
  for (let i = 1; i <= 210; i++) {
    backlog.push({ relay_seq: i, epoch: 1, env: await sealOp(key, {
      op_id: `op_coverage_${i}`, device_id: "d0", kind: "create_entity",
      args: { id: `ent_coverage_${i}`, name: `Coverage ${i}` }, created_at: i,
    }) });
  }
  let catchingUp = false;
  const r = await runtime({ userKey: key,
    submit: async (ops) => ({ ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: 211 + i })) }),
    fetchOps: async (after, limit) => ({
      ops: catchingUp ? backlog.filter((o) => o.relay_seq > after).slice(0, limit) : [],
      snap_seq: 0,
    }),
  });
  const socket = sockets.at(-1);
  socket.push({ t: "ops", ops: [{ relay_seq: 250, epoch: 1,
    env: await sealOp(key, { op_id: "op_coverage_push", device_id: "d0",
      kind: "create_entity", args: { id: "ent_coverage_push", name: "Push" }, created_at: 250 }) }] });
  await settle();
  assert.ok(r.db.prepare("SELECT 1 FROM personal_entity WHERE id = 'ent_coverage_push'").get());
  catchingUp = true;
  socket.onopen();
  const deadline = Date.now() + 15000;
  while (r.user.sync.cursor < 210 && Date.now() < deadline) await sleep(100);
  assert.ok(r.fetches.some((f) => f.after === 200), "catch-up skipped the second page");
  assert.equal(r.db.prepare(
    "SELECT COUNT(*) AS n FROM personal_entity WHERE id LIKE 'ent_coverage_%' AND id <> 'ent_coverage_push'",
  ).get().n, 210, "unseen edits were skipped after the pushed watermark");
  assert.equal(r.user.sync.cursor, 210, "cursor claimed more than fetched coverage");
});

test("paged coverage: a failed database save stops catch-up instead of refetching a full page", async () => {
  const key = await newUserKey();
  const rows = [];
  for (let i = 1; i <= 200; i++) {
    rows.push({ relay_seq: i, epoch: 1, env: await sealOp(key, {
      op_id: `op_save_${i}`, device_id: "d0", kind: "create_entity",
      args: { id: `ent_save_${i}`, name: `Save ${i}` }, created_at: i,
    }) });
  }
  let fetched = 0, persisted = 0;
  const r = await runtime({ userKey: key,
    fetchOps: async () => {
      if (++fetched > 1) throw new Error("unexpected duplicate page fetch");
      return { ops: rows, snap_seq: 0 };
    },
    persist: async () => { persisted++; return false; },
  });
  // The 200-op ingest takes real time — wait for the save attempt or
  // the surfaced failure instead of a fixed settle.
  const deadline = Date.now() + 15000;
  while (!persisted && !r.syncHealth().ingestError && Date.now() < deadline) {
    await sleep(100);
  }
  assert.equal(persisted, 1);
  assert.equal(fetched, 1, "failed save caused another fetch of the same full page");
  assert.equal(r.user.sync.cursor, 0);
  assert.match(r.syncHealth().ingestError, /database save failed/);
});

test("media backoff: transient failures wait before retrying without counting as permanent loss", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  const r = await runtime({ putBlob: async () => { attempts++; throw new Error("offline"); } });
  shared.loadBlobBytes = async () => new TextEncoder().encode("offline photo");
  await r.handle.queueBlob("sha_backoff");
  await settle();
  assert.equal(attempts, 1);
  t.mock.timers.tick(29999);
  await settle();
  assert.equal(attempts, 1, "transient failure retried with no backoff");
  t.mock.timers.tick(1);
  await settle();
  assert.equal(attempts, 2, "the durable media obligation was never retried");
  const q = await r.store.get("blobq/u1");
  assert.equal(q.length, 1);
  assert.equal(q[0].fails, 0, "transient failures counted toward permanent loss");
});

test("a timed-out flush is fenced: the late ack still stamps, but cannot clear a newer failure", { timeout: 20000 }, async () => {
  // Audit: deadline expiry must release the CALLER, not the durable
  // state. Prove: stalled submit → timeout → the retry's failure is
  // NOT erased by the original attempt's late continuation; and a late
  // ack still stamps its relay_seqs (uncertain commit → reconciled).
  let release1;
  const gate1 = new Promise((r) => { release1 = r; });
  let calls = 0;
  const r = await runtime({
    opts: { flushStallMs: 60 },
    submit: async (ops) => {
      calls++;
      if (calls === 1) {            // boot flush — stalls past the deadline
        await gate1;
        return { ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: i + 1 })) };
      }
      if (calls === 2) throw new Error("relay 500");  // the retry's failure
      return { ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: i + 50 })) };
    },
  });
  await sleep(200);
  assert.match(r.syncHealth().flushError ?? "", /stalled/);
  assert.equal(calls, 1);
  // The abandoned attempt's ack lands now: stamping is durable truth,
  // but every status write past it belongs to the retry.
  release1();
  await settle(); await sleep(60);
  assert.ok(listOps(r.db).every((o) => o.relay_seq !== null),
    "the late ack did not stamp its ops");
  assert.match(r.syncHealth().flushError, /stalled/,
    "the late completion cleared the caller-visible stall");
  // A fresh edit rides the next attempt — which the relay refuses.
  createEntity(r.db, { id: "ent_late", name: "After the stall" });
  await sleep(600);                // 300 ms debounce → submit 2 → 500
  assert.ok(calls >= 2);
  await sleep(100);
  assert.match(r.syncHealth().flushError ?? "", /relay 500/,
    "the dead attempt overwrote the retry's failure state");
  assert.ok(listOps(r.db).some((o) => o.relay_seq === null),
    "the refused edit was marked confirmed anyway");
  // The bounded retry succeeds — status heals through the new owner.
  await sleep(4300);
  assert.equal(r.syncHealth().flushError, null);
  assert.ok(!listOps(r.db).some((o) => o.relay_seq === null));
});

test("competing rekeys publish epoch, key and client as one step — a late loser cannot regress them", { timeout: 15000 }, async () => {
  const ciphertexts = [];
  const submit = async (ops, _n, { declaredEpoch, userKey }) => {
    // Seal with the ACTIVE client's captured key, like the real
    // relayClient's closure — then label with the declared epoch.
    for (const op of ops) {
      ciphertexts.push({ e: declaredEpoch, env: await sealOp(userKey, op) });
    }
    return { ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: 100 + i })) };
  };
  const r = await runtime({ epoch: 1, submit });
  const e2 = await newUserKey(), e3 = await newUserKey();
  await putUserKey(r.store, "u1", e2, 2);
  await putUserKey(r.store, "u1", e3, 3);
  // Delay the epoch-2 key lookup so rekey(3) publishes first; the
  // earlier rekey resolves late and must not roll the triple back.
  const realGet = r.store.get;
  let release2;
  const gate2 = new Promise((res) => { release2 = res; });
  let gated = false;
  r.store.get = async (name) => {
    if (name === "user/u1/key_e2" && !gated) { gated = true; await gate2; }
    return realGet(name);
  };
  const slow = r.handle.rekey(2);   // blocked on its key lookup
  await r.handle.rekey(3);          // completes first — epoch 3 active
  release2();
  await slow;
  assert.equal(r.handle.getEpoch(), 3,
    "the late rekey regressed the published epoch");
  createEntity(r.db, { id: "ent_rekey", name: "Sealed after the race" });
  await sleep(700);                // debounce → submit under epoch 3
  const env = ciphertexts.at(-1);
  assert.equal(env.e, 3, "submit declared a different epoch than the client seals");
  // Actual ciphertext proof: it opens under the epoch-3 key and
  // would NOT have opened under epoch 2 — the relay's declared epoch
  // and the sealing key agree.
  assert.ok((await openOp(e3, env.env))?.kind,
    "the active client's ciphertext did not open under its declared epoch");
  await assert.rejects(openOp(e2, env.env), /./,
    "ciphertext labelled epoch 3 was sealed under epoch 2");
});

test("a committed rotation journals the regrant obligation and the recover pass drains it", { timeout: 15000 }, async () => {
  const grants = [];
  const r = await runtime({
    root: true, rotateMinEpoch: 2,
    supporters: [{ acct_id: "a1" }, { acct_id: "a2" }],
  });
  r.setSyncAccountOps(() => ({
    acctId: "acct_owner", session: "sess",
    listInvites: async () => ({ invites: [
      { token: "tok_a1", to_acct: "a1", status: "granted", to_acct_pub: {} },
      { token: "tok_a2", to_acct: "a2", status: "granted", to_acct_pub: {} },
    ] }),
    grantInvite: async (token, session, grant) => { grants.push({ token, grant }); },
    buildUserGrant: async (store, u, toPub, forAcct) =>
      ({ for: forAcct, epoch: u.sync.epoch }),
  }));
  await sleep(300);                // boot recover already ran — journal
  // written before registration? The drain runs on the NEXT recover.
  sockets.at(-1).push({ t: "ops", ops: [] });
  await sleep(2600);               // 2 s recover debounce → drain
  assert.equal(r.user.sync.epoch, 2, "the rotation never committed");
  assert.deepEqual(grants.map((g) => g.token).sort(), ["tok_a1", "tok_a2"],
    "not every remaining supporter was regranted");
  assert.ok(grants.every((g) => g.grant.epoch === 2),
    "a supporter bundle was rebuilt at the pre-rotation epoch");
  assert.equal(await r.store.get("regrant/u1"), undefined,
    "the regrant obligation survived its own completion");
});

test("an interrupted regrant leaves the journal — the next session's recover finishes it", { timeout: 15000 }, async () => {
  const grants = [];
  let die = true;
  const r = await runtime({ supporters: [{ acct_id: "a1" }, { acct_id: "a2" }] });
  r.setSyncAccountOps(() => ({
    acctId: "acct_owner", session: "sess",
    listInvites: async () => ({ invites: [
      { token: "tok_a1", to_acct: "a1", status: "granted", to_acct_pub: {} },
      { token: "tok_a2", to_acct: "a2", status: "granted", to_acct_pub: {} },
    ] }),
    grantInvite: async (token) => {
      if (die) { die = false; throw new Error("tab killed mid-regrant"); }
      grants.push(token);
    },
    buildUserGrant: async () => ({}),
  }));
  await r.store.put("regrant/u1", { epoch: 2 });   // as a killed pass left it
  sockets.at(-1).push({ t: "ops", ops: [] });
  await sleep(2600);
  assert.equal(grants.length, 0, "the pass died on the first grant");
  assert.ok(await r.store.get("regrant/u1"), "the obligation was lost mid-pass");
  sockets.at(-1).push({ t: "ops", ops: [] });      // next session's recover
  await sleep(2600);
  assert.deepEqual(grants.sort(), ["tok_a1", "tok_a2"],
    "the resumed pass did not regrant every remaining supporter");
  assert.equal(await r.store.get("regrant/u1"), undefined);
});

test("the regrant obligation waits for a signed-in session instead of draining unauthenticated", { timeout: 15000 }, async () => {
  const grants = [];
  const r = await runtime({ supporters: [{ acct_id: "a1" }] });
  r.setSyncAccountOps(() => null);                 // signed out
  await r.store.put("regrant/u1", { epoch: 2 });
  sockets.at(-1).push({ t: "ops", ops: [] });
  await sleep(2600);
  assert.equal(grants.length, 0);
  assert.ok(await r.store.get("regrant/u1"),
    "the obligation vanished without a session to drain it");
  r.setSyncAccountOps(() => ({
    acctId: "acct_owner", session: "sess",
    listInvites: async () => ({ invites: [
      { token: "tok_a1", to_acct: "a1", status: "granted", to_acct_pub: {} }] }),
    grantInvite: async (token) => { grants.push(token); },
    buildUserGrant: async () => ({}),
  }));
  sockets.at(-1).push({ t: "ops", ops: [] });
  await sleep(2600);
  assert.deepEqual(grants, ["tok_a1"],
    "a later signed-in session did not drain the obligation");
  assert.equal(await r.store.get("regrant/u1"), undefined);
});

/* ------------------------------------------------------------------
 * 044 C4 - stopSync: end the loop cleanly, start another. The web never
 * calls it; iOS does on a person switch. Same seam, same stub relay.
 * ------------------------------------------------------------------ */

const unconfirmed = (db) => listOps(db).filter((o) => o.relay_seq === null);

test("C4: start -> stop -> start another user -> back; every person's ops land on their own relay", { timeout: 20000 }, async () => {
  const mod = await loadSync();
  const a = await runtime({ syncMod: mod, userId: "uA", relayId: "relayA" });
  const socketA = sockets.at(-1);
  createEntity(a.db, { id: "ent_a", name: "Alpha" });
  await sleep(500);
  assert.equal(unconfirmed(a.db).length, 0, "A's edit reached A's relay");
  assert.equal(a.syncHealth().running, true);

  assert.equal(await mod.stopSync(), true);
  assert.equal(a.syncHealth().running, false);
  assert.equal(socketA.readyState, 3, "A's socket closed");
  const aSubmits = a.submits.length;

  // An edit after the stop is logged locally and waits - no loop carries it.
  createEntity(a.db, { id: "ent_a2", name: "Alpha two" });
  await sleep(500);
  assert.equal(a.submits.length, aSubmits, "a stopped loop submits nothing");
  assert.equal(unconfirmed(a.db).length, 1);

  // B starts in the same process, on its own replica and relay user.
  const b = await runtime({ syncMod: mod, userId: "uB", relayId: "relayB" });
  assert.equal(b.syncHealth().running, true);
  assert.notEqual(sockets.at(-1), socketA, "B has its own socket");
  createEntity(b.db, { id: "ent_b", name: "Beta" });
  await sleep(500);
  assert.equal(unconfirmed(b.db).length, 0, "B's edit reached B's relay");
  assert.equal(b.clients.at(-1).userId, "relayB");
  assert.equal(a.submits.length, aSubmits, "B's session never submitted A's ops");
  assert.equal(b.db.prepare("SELECT 1 FROM personal_entity WHERE id = 'ent_a'").all().length, 0);

  // Back to A: the stranded edit goes out now, under A's relay user.
  await mod.stopSync();
  const a2 = await runtime({ syncMod: mod, reuse: a, userId: "uA", relayId: "relayA" });
  await sleep(500);
  assert.equal(unconfirmed(a.db).length, 0, "A's stranded edit was resent and confirmed");
  assert.equal(a2.clients.at(-1).userId, "relayA");
  assert.ok(a2.submits.flat().some((o) => o.kind === "create_entity" && JSON.stringify(o).length > 0),
    "the resend carried A's op");
  await mod.stopSync();
});

test("C4: stopSync is safe when nothing runs, and a stopped loop's armed timers never fire", { timeout: 10000 }, async () => {
  const mod = await loadSync();
  assert.equal(await mod.stopSync(), false);
  const r = await runtime({ syncMod: mod });
  createEntity(r.db, { id: "ent_t", name: "Timer" }); // arms the 300 ms debounce
  const before = r.submits.length;
  await mod.stopSync();
  await sleep(800);
  assert.equal(r.submits.length, before, "the armed debounce did not fire after stop");
  assert.equal(unconfirmed(r.db).length > 0, true, "the edit is still pending");
});

test("C4: stop during a flush loses nothing - op stays pending, cursor stays put, the next start resends", { timeout: 15000 }, async () => {
  const mod = await loadSync();
  let release, enter;
  const gate = new Promise((r) => { release = r; });
  const entered = new Promise((r) => { enter = r; });
  let calls = 0;
  const r = await runtime({
    syncMod: mod,
    // call 1 = boot seed ops (acked); call 2 carries the user's edit and hangs
    submit: async (ops) => {
      calls++;
      if (calls === 2) { enter(); await gate; throw new Error("connection dropped"); }
      return { ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: i + 1 })) };
    },
  });
  const cursorBefore = r.user.sync.cursor;
  createEntity(r.db, { id: "ent_flush", name: "Mid flush" });
  await entered;
  const t0 = Date.now();
  await mod.stopSync({ waitMs: 300 });
  assert.ok(Date.now() - t0 < 2000, "stop returned while the relay call was hung");
  release(); // the relay call now fails, after the stop
  await sleep(300);
  const pending = unconfirmed(r.db);
  assert.equal(pending.length, 1, "the edit is still pending");
  assert.equal(r.user.sync.cursor, cursorBefore, "cursor did not move");
  assert.equal(r.syncHealth().flushError, null, "a stopped loop reports no error");

  // Same person starts again on the same replica: the op is resent.
  const r2 = await runtime({ syncMod: mod, reuse: r });
  await sleep(500);
  assert.ok(r2.submits.flat().some((o) => o.op_id === pending[0].op_id), "the stranded op was resent");
  assert.equal(unconfirmed(r.db).length, 0, "and is confirmed now");
  await mod.stopSync();
});

test("C4: stop mid catch-up fetches nothing more and leaves the cursor where it was", { timeout: 15000 }, async () => {
  const mod = await loadSync();
  let enter, release;
  const entered = new Promise((r) => { enter = r; });
  const gate = new Promise((r) => { release = r; });
  let fetches = 0;
  const r = await runtime({
    syncMod: mod,
    fetchOps: async () => {
      fetches++;
      if (fetches === 1) { enter(); await gate; } // the first catch-up is in flight
      return { ops: [], snap_seq: 0 };
    },
  });
  await entered;
  await mod.stopSync({ waitMs: 200 });
  release();
  await sleep(200);
  assert.equal(r.user.sync.cursor, 0);
  assert.equal(fetches, 1, "no further fetch after the stop");
});
