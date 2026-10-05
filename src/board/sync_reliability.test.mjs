/**
 * 043 Slice 4 Works Tests — retry honesty + join recovery (audit
 * F10/F11/F12).
 *
 * Drives the real sync.mjs with stubbed imports (module.registerHooks):
 * the ops layer and crypto stay real; the relay client, blob bridge,
 * and platform hooks are replaced with in-memory stands. The tests
 * assert the durable queue contents and the submitted ops — what the
 * relay would actually hold — not what the runtime reported.
 *
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
class QuietSocket {
  static OPEN = 1;
  constructor(url) { this.url = url; this.readyState = QuietSocket.OPEN; }
  send() {}
  close() { this.readyState = 3; this.onclose?.(); }
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
  submit = null,
  putBlob = null,
  getBlob = null,
  epoch = 1,
} = {}) {
  const db = openReplica();
  const store = memoryKeyStore();
  const identity = await getDeviceIdentity(store);
  const key = await getUserKey(store, "u1");
  await putUserKey(store, "u1", key, epoch);

  const submits = [];
  const uploads = [];
  const user = { id: "u1", sync: { userId: "u-relay", epoch, cursor: 0 } };
  shared.store = store;
  shared.loadBlobBytes = async () => null;
  shared.relayClient = () => ({
    selfKey: async () => ({ current_epoch: epoch, wrapped_key: null, wrapped_keys: {} }),
    fetchOps: async () => fetchResult,
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
    async () => true,
  );
  await settle();
  return { db, store, key, user, submits, uploads, handle, syncHealth };
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

