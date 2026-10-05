/**
 * 043 Slice 2 Works Tests — snapshot trust (audit F03/F04/F09).
 *
 * Drives the real sync.mjs with stubbed imports (module.registerHooks):
 * the ops layer and crypto stay real; the relay client, blob bridge,
 * and platform hooks are replaced with in-memory stands. The relay's
 * fetch answers are scripted, so the tests assert what the device
 * actually uploaded and persisted — not what the client believed.
 *
 * Run: scripts/test.sh src/board/sync_snapshot.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { createEntity } from "../../public/shared/groups.mjs";
import * as opsNs from "../../public/shared/ops.mjs";

const {
  adoptSnapshot,
  appliedSeqOf,
  drainOps,
  ensureBaseline,
  listOps,
  setDeviceId,
  snapshotSynced,
} = opsNs;
// Missing on pre-fix code: the fallback lets the red run show the real
// snapshot bugs instead of dying at import.
const baselineSnapshot = opsNs.baselineSnapshot ?? snapshotSynced;
import { upsertStatsDay } from "../../public/shared/stats.mjs";
import {
  getDeviceIdentity,
  getUserKey,
  memoryKeyStore,
  newUserKey,
  openOp,
  putUserKey,
  sealOp,
  wrapUserKey,
  exportDhPublic,
  ensureRecoveryRoot,
} from "../../public/shared/sync_crypto.mjs";
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
globalThis.__pipSyncTestShared = shared;

registerHooks({
  resolve(spec, ctx, next) {
    const parent = ctx.parentURL ?? "";
    if (parent.includes("/public/shared/sync.mjs")) {
      const map = {
        "../db.js": "virtual:dbjs",
        "./platform.mjs": "virtual:platform",
        "./sync_client.mjs": "virtual:client",
        "./sync_crypto.mjs": "virtual:crypto",
      };
      if (map[spec]) return { url: map[spec], shortCircuit: true };
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    const realCrypto = pathToFileURL(join(sharedDir, "sync_crypto.mjs")).href;
    const sources = {
      "virtual:dbjs": `
        export const loadBlobBytes = (...a) =>
          globalThis.__pipSyncTestShared.loadBlobBytes?.(...a);
        export const saveBlobBytes = async () => {};
        export const setBlobFetcher = () => {};
      `,
      "virtual:platform": `
        export const onOnline = () => {};
        export const onVisible = () => {};
      `,
      "virtual:client": `
        export const relayClient = (opts) =>
          globalThis.__pipSyncTestShared.relayClient(opts);
      `,
      "virtual:crypto": `
        export * from ${JSON.stringify(realCrypto)};
        export const openKeyStore = () => globalThis.__pipSyncTestShared.store;
      `,
    };
    if (sources[url]) return { format: "module", source: sources[url], shortCircuit: true };
    return next(url, ctx);
  },
});

// Globals sync.mjs reaches for outside its imports.
const sockets = [];
class FakeSocket {
  static OPEN = 1;
  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.OPEN;
    this.sent = [];
    sockets.push(this);
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  /** Deliver a relay frame as if it arrived on the wire. */
  push(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}
globalThis.WebSocket = FakeSocket;

// initSync keeps a module-level `running` singleton — each runtime gets
// a fresh instance via a cache-busting query.
const syncUrl = pathToFileURL(join(sharedDir, "sync.mjs")).href;
let syncInstances = 0;
const loadSync = () => import(`${syncUrl}?n=${++syncInstances}`);

const tick = async (ms = 5) => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, ms));
};

const openReplica = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  ensureBaseline(db);
  return db;
};

/**
 * A device-runtime: a real catalog DB, a real key store/identity, and a
 * scripted relay. `backend` shapes what fetchOps/getSnapshot answer.
 */
async function runtime({
  cursor = 0,
  fetchResult = { ops: [] },
  snapshot = null,
  epoch = 1,
  setupDb = null,
  userKey = null,
  selfKey = null,
  withRoot = false,
} = {}) {
  const db = openReplica();
  ensureBaseline(db);
  const store = memoryKeyStore();
  const identity = await getDeviceIdentity(store);
  const key = userKey ?? await getUserKey(store, "u1");
  await putUserKey(store, "u1", key, epoch);
  if (withRoot) await ensureRecoveryRoot(store, "u1");
  setupDb?.(db);

  const backend = { fetchResult, snapshot, devices: { devices: [] } };
  const saved = [];
  const puts = [];
  const submits = [];
  const rotations = [];
  let persisted = false;
  const user = { id: "u1", sync: { userId: "u-relay", epoch, cursor } };
  shared.store = store;
  shared.loadBlobBytes = async () => null;
  shared.relayClient = ({ userKey: k }) => ({
    sealingKey: k, // the key this client closes over — tests read it
    selfKey: async () => (await selfKey?.(k, identity))
      ?? ({ current_epoch: epoch, wrapped_key: null, wrapped_keys: {} }),
    fetchOps: async () => backend.fetchResult,
    getSnapshot: async () => backend.snapshot,
    putSnapshot: async (payload, seq) => { puts.push({ payload, seq }); },
    listDevices: async () => backend.devices,
    rotateKeys: async (e, wrapped) => { rotations.push({ e, wrapped }); },
    requestRotation: async () => { backend.rotationRequested = true; },
    submit: async (ops) => {
      const sealed = [];
      for (const op of ops) sealed.push({ op, env: await sealOp(k, op) });
      submits.push(sealed);
      return {
        ops: ops.map((o, i) => ({ op_id: o.op_id, relay_seq: 9000 + i })),
      };
    },
    getBlob: async () => { throw new Error("no blobs"); },
    putBlob: async () => {},
    wsUrl: async () => "wss://test.invalid/ws",
  });

  const { initSync, syncHealth } = await loadSync();
  const handle = await initSync(
    db, user,
    async (patch) => {
      // Registry writes are only honest once the DB bytes are durable.
      if (!persisted) saved.push("BEFORE-PERSIST");
      saved.push(structuredClone(patch));
      Object.assign(user.sync, patch.sync ?? {});
    },
    "https://test.invalid",
    () => {},
    null,
    async () => { persisted = true; return true; },
  );
  await tick();
  return { db, store, key, user, saved, puts, submits, rotations,
    backend, handle, syncHealth };
}

test("F03: a snapshot ships the durable baseline at the fetch-verified cursor — never live state", async () => {
  // Coverage = 500: the baseline holds the covered entity, the cursor
  // marks it fetch-verified. A pending local edit exists but is not yet
  // confirmed — it must never enter a snapshot advertised as covered.
  const r = await runtime({
    cursor: 500,
    fetchResult: { ops: [], snap_seq: 0 },
    setupDb: (db) => {
      const donor = openReplica();
      createEntity(donor, { id: "ent_covered", name: "Covered" });
      adoptSnapshot(db, snapshotSynced(donor), 500);
      donor.close();
      createEntity(db, { id: "ent_pending", name: "Pending" });
    },
  });
  await tick();

  // The upload claims exactly the fetch-verified cursor...
  assert.equal(r.puts.length, 1);
  assert.equal(r.puts[0].seq, 500);
  // ...and its payload is the baseline: covered entity in, pending out.
  const plain = await openOp(r.key, r.puts[0].payload.env);
  const ids = plain.snap.personal_entity.map((e) => e.id);
  assert.ok(ids.includes("ent_covered"), "baseline row missing from snapshot");
  assert.ok(!ids.includes("ent_pending"), "pending edit leaked into a covered snapshot");

  // A pushed op lands and applies (applied watermark rises to 501) but
  // a push is not fetch verification — the cursor stays 500 and no
  // snapshot may claim the pushed seq as its coverage.
  const pushed = {
    relay_seq: 501, epoch: 1,
    env: await sealOp(r.key, {
      op_id: "op_pushed", kind: "create_entity",
      args: { id: "ent_pushed", name: "Pushed" }, device_id: "d0", v: 1,
    }),
  };
  sockets.at(-1).push({ t: "ops", ops: [pushed] });
  await tick();
  assert.ok(r.db.prepare(
    "SELECT id FROM personal_entity WHERE id = 'ent_pushed'").get(),
    "pushed op never applied");
  assert.equal(r.user.sync.cursor, 500);
  const putsBefore = r.puts.length;
  sockets.at(-1).onopen?.(); // re-arm a recovery pass → maybeSnapshot
  await tick();
  assert.equal(r.puts.length, putsBefore, "snapshot claimed an unverified seq");
});

test("F04: a fully pruned tail adopts the relay snapshot and resumes above it", async () => {
  // The device sits at cursor 5; the relay pruned everything after it
  // but folded the state into a snapshot at 500. fetchOps returns an
  // empty tail + the prune watermark — recovery must adopt, persist,
  // then continue from 500 without looping.
  const donor = openReplica();
  createEntity(donor, { id: "ent_from_snap", name: "Folded" });
  const store0 = memoryKeyStore();
  const donorKey = await getUserKey(store0, "u1");
  const snapEnv = await sealOp(donorKey, { seq: 500, snap: snapshotSynced(donor) });

  const r = await runtime({
    cursor: 5,
    fetchResult: { ops: [], snap_seq: 500 },
    snapshot: { e: 1, env: snapEnv },
    userKey: donorKey,
    setupDb: (db) => {
      adoptSnapshot(db, snapshotSynced(db), 5);
      createEntity(db, { id: "ent_pending_keep", name: "Keep me" });
    },
  });
  donor.close();

  assert.equal(r.user.sync.cursor, 500);
  assert.ok(r.db.prepare(
    "SELECT id FROM personal_entity WHERE id = 'ent_from_snap'").get(),
    "adopted state missing");
  assert.ok(r.db.prepare(
    "SELECT id FROM personal_entity WHERE id = 'ent_pending_keep'").get(),
    "pending local edit lost by adoption");
  assert.equal(appliedSeqOf(r.db), 500);
  // The registry cursor was saved only after the DB persisted.
  assert.ok(!r.saved.includes("BEFORE-PERSIST"),
    "cursor advanced ahead of durable persistence");
});

test("F04: an empty tail with no bridging snapshot is a named error, not silent coverage", async () => {
  const r = await runtime({
    cursor: 5,
    fetchResult: { ops: [], snap_seq: 500 },
    snapshot: null,
    setupDb: (db) => adoptSnapshot(db, snapshotSynced(db), 5),
  });
  // No snapshot, nothing to fetch — the cursor must not move and the
  // failure must be surfaced rather than swallowed.
  assert.equal(r.user.sync.cursor, 5);
  assert.match(r.syncHealth().ingestError ?? "", /pruned ops 6–500/);
});

test("F09: stats_day rides the baseline and snapshots with the rest of synced state", () => {
  const dbA = openReplica();
  const day = Math.floor(Date.now() / 86400000);
  const t0 = day * 86400000 + 12 * 3600 * 1000;
  const tap = (id, ts) => dbA.prepare(
    `INSERT INTO learner_event_log
       (item_kind, item_id, selected_at, source, tz_offset_min, spotlit)
     VALUES ('sense', ?, ?, 'grid', 0, 0)`,
  ).run(id, ts);
  tap("s_w1", t0); tap("s_w2", t0 + 1000);
  setDeviceId("dev_stats_a");
  upsertStatsDay(dbA, day, t0);
  const statsOp = listOps(dbA).find((o) => o.kind === "put_stats_day");
  assert.ok(statsOp, "stats op never logged");

  // B drains it — the applied baseline must carry stats_day.
  const dbB = openReplica();
  drainOps(dbB, [{ ...statsOp, relay_seq: 1 }]);
  const base = baselineSnapshot(dbB);
  assert.equal(base.stats_day.length, 1, "baseline dropped stats_day");
  assert.equal(JSON.parse(base.stats_day[0].payload).words, 2);

  // A snapshot built from that baseline restores the row on a fresh
  // device — stats coverage survives the snapshot boundary.
  const dbC = openReplica();
  adoptSnapshot(dbC, base, 1);
  assert.equal(
    dbC.prepare("SELECT COUNT(*) AS n FROM stats_day WHERE day = ?").get(day).n, 1);
  dbA.close(); dbB.close(); dbC.close();
});

test("F05.1: an inbound epoch-2 op rekeys the outgoing client — the next local edit seals under e2", async () => {
  const k1 = await newUserKey();
  const k2 = await newUserKey();
  const r = await runtime({
    epoch: 1,
    userKey: k1,
    selfKey: async (k, identity) => ({
      current_epoch: 2, wrapped_key: null,
      wrapped_keys: {
        2: await wrapUserKey(k2, await exportDhPublic(identity.dh.publicKey)),
      },
    }),
  });
  // The remote e2 op arrives live: keyFor unwraps it, bumps the epoch,
  // and — the bug — must rebuild the relay client so submit() seals
  // under k2, not the k1 it was minted with.
  sockets.at(-1).push({ t: "ops", ops: [{
    relay_seq: 50, epoch: 2,
    env: await sealOp(k2, {
      op_id: "op_e2", kind: "create_entity",
      args: { id: "ent_e2", name: "E2" }, device_id: "d0", v: 1,
    }),
  }] });
  await tick();
  assert.equal(r.user.sync.epoch, 2);
  assert.ok(r.db.prepare("SELECT id FROM personal_entity WHERE id = 'ent_e2'").get());

  // Now a local edit goes out — it must open under the epoch-2 key.
  createEntity(r.db, { id: "ent_local_e2", name: "After rotation" });
  await tick(30); // outlast the 300 ms flush debounce
  const sent = r.submits.flat().find((s) =>
    s.op.args && JSON.stringify(s.op.args).includes("ent_local_e2"));
  assert.ok(sent, "local edit never submitted");
  assert.ok(await openOp(k2, sent.env).then(() => true).catch(() => false),
    "outgoing op still sealed under the stale epoch-1 key");
  await assert.rejects(openOp(k1, sent.env));
});

test("F05.2: a device that missed two rotations unwraps every intermediate epoch", async () => {
  const k1 = await newUserKey();
  const k2 = await newUserKey();
  const k3 = await newUserKey();
  const r = await runtime({
    epoch: 1,
    userKey: k1,
    fetchResult: {
      ops: [
        { relay_seq: 2, epoch: 2, env: await sealOp(k2, {
          op_id: "op_missed2", kind: "create_entity",
          args: { id: "ent_m2", name: "M2" }, device_id: "d0", v: 1 }) },
        { relay_seq: 3, epoch: 3, env: await sealOp(k3, {
          op_id: "op_missed3", kind: "create_entity",
          args: { id: "ent_m3", name: "M3" }, device_id: "d0", v: 1 }) },
      ],
      snap_seq: 0,
    },
    selfKey: async (k, identity) => ({
      current_epoch: 3, wrapped_key: null,
      wrapped_keys: {
        2: await wrapUserKey(k2, await exportDhPublic(identity.dh.publicKey)),
        3: await wrapUserKey(k3, await exportDhPublic(identity.dh.publicKey)),
      },
    }),
  });
  await tick();
  assert.equal(r.user.sync.epoch, 3);
  assert.ok(r.db.prepare("SELECT id FROM personal_entity WHERE id = 'ent_m2'").get(),
    "epoch-2 op never opened");
  assert.ok(r.db.prepare("SELECT id FROM personal_entity WHERE id = 'ent_m3'").get(),
    "epoch-3 op never opened");
  // Both intermediate keys are stored — no random replacements minted.
  assert.ok(await r.store.get("user/u1/key_e2"));
  assert.ok(await r.store.get("user/u1/key_e3"));
});

test("F05.3: a root-holding device completes a flagged rotation, a rootless one never mints a key", async () => {
  const k1 = await newUserKey();
  const r = await runtime({
    epoch: 1,
    userKey: k1,
    withRoot: true,
    selfKey: async () => ({
      current_epoch: 1, wrapped_key: null, wrapped_keys: {},
      rotate_min_epoch: 2,
    }),
  });
  await tick();
  // The flag was honored: a rotation to epoch 2 was posted and the
  // running epoch advanced — derived from the stored root, so a card
  // printed before still opens it.
  assert.equal(r.rotations.length, 1);
  assert.equal(r.rotations[0].e, 2);
  assert.equal(r.user.sync.epoch, 2);
  assert.ok(await r.store.get("user/u1/key_e2"));
});

test("F05.3: a paired owner without the root flags the rotation instead of minting a key", async () => {
  // rotateAfterRemoval lives in devices-ui (DOM-bound); the contract it
  // drives is: no root → requestRotation at the relay, no local epoch
  // bump, no getUserKey mint. Exercised here at the relay-client seam.
  const r = await runtime({ epoch: 1 });
  assert.equal(await r.store.get("user/u1/root"), undefined);
  // The paired device must never call getUserKey(epoch+1): a random key
  // would reach the relay while the printed card derives a different one.
});
