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
  importAccountPriv,
  memoryKeyStore,
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
  send() {}
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
  persist = async () => true,
  epoch = 1,
  userKey = null,
} = {}) {
  const db = openReplica();
  const store = memoryKeyStore();
  const identity = await getDeviceIdentity(store);
  const key = userKey ?? await getUserKey(store, "u1");
  await putUserKey(store, "u1", key, epoch);

  const submits = [];
  const uploads = [];
  const fetches = [];
  const user = { id: "u1", sync: { userId: "u-relay", epoch, cursor: 0 } };
  shared.store = store;
  shared.loadBlobBytes = async () => null;
  shared.relayClient = () => ({
    selfKey: async () => ({ current_epoch: epoch, wrapped_key: null, wrapped_keys: {} }),
    fetchOps: async (after, limit) => {
      fetches.push({ after, limit });
      return fetchOps ? fetchOps(after, limit) : fetchResult;
    },
    getSnapshot: async () => null,
    putSnapshot: async () => {},
    listDevices: async () => ({ devices: [] }),
    rotateKeys: async () => {},
    requestRotation: async () => {},
    submit: async (ops) => {
      submits.push(ops);
      if (submit) return submit(ops, submits.length);
      return { ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: i + 1 })) };
    },
    getBlob: getBlob ?? (async () => { throw Object.assign(new Error("no blob"), { status: 404 }); }),
    putBlob: putBlob ?? (async (sealed) => { uploads.push(sealed); }),
    wsUrl: async () => "wss://test.invalid/ws",
  });

  const { initSync, syncHealth } = await loadSync();
  const handle = await initSync(
    db, user,
    async (patch) => Object.assign(user.sync, patch.sync ?? {}),
    "https://test.invalid",
    () => {},
    null,
    persist,
  );
  await settle();
  return { db, store, key, user, submits, uploads, fetches, handle, syncHealth };
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
