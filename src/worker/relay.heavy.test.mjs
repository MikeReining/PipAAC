/**
 * 011 slice 4 Works Test — the relay (heavy: spawns `wrangler dev`).
 *
 * Two device clients against a real local relay. A creates the user and
 * allows B. A edits → B's socket receives the op within 2 s. A request
 * signed by an unknown key gets 403. B goes offline, A edits 20 times,
 * B reconnects and catches up. A sealed blob round-trips through R2.
 *
 * Run: scripts/test.sh src/worker/relay.heavy.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase, importCatalog } from "../board/catalog.mjs";
import { createEntity, placeItem } from "../../public/shared/groups.mjs";
import { adoptSnapshot, drainOps, ensureBaseline, listOps, setDeviceId, snapshotSynced } from "../../public/shared/ops.mjs";
import { upsertStatsDay } from "../../public/shared/stats.mjs";
import {
  exportDhPublic,
  exportPublicKey,
  getUserKey,
  getDeviceIdentity,
  memoryKeyStore,
  openOp,
  putUserKey,
  sealBlob,
  openBlob,
  sealOp,
  wrapUserKey,
} from "../../public/shared/sync_crypto.mjs";
import { licenseFor } from "./license.mjs";
import { relayClient, joinDeviceWithToken } from "../../public/shared/sync_client.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const PORT = 8877;
const BASE = `http://127.0.0.1:${PORT}`;

const repoRoot = join(import.meta.dirname, "../..");

// 015 s6–7: a free user carries one device — these tests pair a
// second, so they activate Lifetime with a dev-minted license.
const licenseSecret = Object.fromEntries(
  readFileSync(join(repoRoot, ".dev.vars"), "utf8").split("\n")
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/))
    .filter(Boolean).map((m) => [m[1], m[2]])).PIP_LICENSE_SECRET;
const makeLifetime = async (client, userId) =>
  client.setEntitlement(await licenseFor(licenseSecret, userId));

const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wrangler;

before(async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "pip-relay-"));
  wrangler = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1",
    "--persist-to", stateDir], { cwd: repoRoot, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const ok = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
    if (ok) return;
  }
  throw new Error("wrangler dev did not come up");
});

after(() => { wrangler?.kill("SIGTERM"); });

test("relay: sequence, fan-out, auth, catch-up, blobs", async () => {
  // Two devices. One user key — in the real flow pairing delivers it
  // (slice 5); here we hand B the same CryptoKey directly.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userId = crypto.randomUUID(); // client-chosen (015 slice 2)
  const userKey = await getUserKey(aStore, userId);
  const bStore = memoryKeyStore();
  const b = await getDeviceIdentity(bStore);
  await putUserKey(bStore, userId, userKey, 1);

  const openDb = () => {
    const db = createDatabase(":memory:");
    importCatalog(db, catalog);
    return db;
  };

  // A creates the user (bootstrap registers its device).
  const user = await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId,
      device_id: a.deviceId, pubkey: await exportPublicKey(a.verify) }),
  }).then((r) => r.json());
  assert.equal(user.user_id, userId, "relay did not keep the client-chosen id");

  const clientA = relayClient({ userId: user.user_id, baseUrl: BASE, identity: a, userKey });
  await makeLifetime(clientA, user.user_id);
  const clientB = relayClient({ userId: user.user_id, baseUrl: BASE, identity: b, userKey });

  // B is unknown until A allows it.
  await assert.rejects(clientB.fetchOps(0), (e) => e.status === 403);
  await clientA.addDevice(b.deviceId, await exportPublicKey(b.verify));
  assert.equal((await clientB.fetchOps(0)).latest, 0);

  // B listens; A edits; the op arrives inside 2 s.
  const received = [];
  const ws = new WebSocket(await clientB.wsUrl());
  ws.onmessage = (ev) => received.push(JSON.parse(ev.data));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  const dbA = openDb();
  createEntity(dbA, { name: "Cooper" });
  const opsA = listOps(dbA);
  const { ops: seqs } = await clientA.submit(opsA);
  assert.equal(seqs[0].relay_seq, 1);

  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && !received.length) await sleep(50);
  assert.ok(received.length, "B did not receive the op within 2 s");
  // A fresh board's first op is the catalog seed install (~160 KB,
  // deflated inside the seal); the edit follows it.
  const opened = await Promise.all(received[0].ops.map((o) => openOp(userKey, o.env)));
  assert.deepEqual(opened.map((o) => o.op_id), opsA.map((o) => o.op_id));
  const cooper = opened.find((o) => o.kind === "create_entity");
  assert.match(cooper.args, /Cooper/); // readable only after user-key decrypt

  // An unsigned and an unknown-device request both get 403.
  assert.equal((await fetch(`${BASE}/users/${user.user_id}/ops?after=0`)).status, 403);
  const stranger = relayClient({
    userId: user.user_id, baseUrl: BASE,
    identity: await getDeviceIdentity(memoryKeyStore()), userKey,
  });
  await assert.rejects(stranger.fetchOps(0), (e) => e.status === 403);

  // B goes offline; A edits 20 times; B catches up and matches.
  ws.close();
  await sleep(300);
  for (let i = 0; i < 20; i++) {
    const { id } = createEntity(dbA, { name: `E${i}` });
    placeItem(dbA, "grp_people", "entity", id);
  }
  await clientA.submit(listOps(dbA).slice(opsA.length));
  const catchup = await clientB.fetchOps(0);
  // The first submit (seed install + Cooper) + 20×(create+place).
  assert.equal(catchup.latest, opsA.length + 40);
  assert.equal(catchup.ops.length, opsA.length + 40);
  const ids = new Set();
  for (const r of catchup.ops) ids.add((await clientB.openOp(r.env)).op_id);
  assert.equal(ids.size, listOps(dbA).length); // every local op confirmed

  // Blob round-trip: sealed bytes up, envelope back, opens identical.
  const blob = await sealBlob(userKey, globalThis.crypto.getRandomValues(new Uint8Array(8192)));
  await clientA.putBlob(blob);
  const envBack = await clientB.getBlob(blob.sha);
  assert.deepEqual(await openBlob(userKey, { sha: blob.sha, env: envBack }),
    await openBlob(userKey, blob));
});

test("join tokens: a linked device mints, a fresh device redeems once", async () => {
  // 015 slice 4 — the supporter-account path: B has the user's key via
  // the account but isn't a relay device. A linked device mints
  // single-use join tokens into the account bundle; one redeems.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userId = crypto.randomUUID();
  const userKey = await getUserKey(aStore, userId);
  const cStore = memoryKeyStore();
  const c = await getDeviceIdentity(cStore);
  await putUserKey(cStore, userId, userKey, 1);

  await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId,
      device_id: a.deviceId, pubkey: await exportPublicKey(a.verify) }),
  });
  const clientA = relayClient({ userId, baseUrl: BASE, identity: a, userKey });
  await makeLifetime(clientA, userId);
  const clientC = relayClient({ userId, baseUrl: BASE, identity: c, userKey });

  // Unknown device: pulls 403; a bogus token gets 403 too.
  await assert.rejects(clientC.fetchOps(0), (e) => e.status === 403);
  await assert.rejects(joinDeviceWithToken(BASE, userId, {
    token: "bogus", device_id: c.deviceId,
    pubkey: await exportPublicKey(c.verify) }));

  const { tokens } = await clientA.mintJoinTokens(2);
  assert.equal(tokens.length, 2);
  await joinDeviceWithToken(BASE, userId, {
    token: tokens[0], device_id: c.deviceId,
    pubkey: await exportPublicKey(c.verify) });
  assert.equal((await clientC.fetchOps(0)).latest, 0);

  // Single-use — the same token does not open the door twice.
  const d = await getDeviceIdentity(memoryKeyStore());
  await assert.rejects(joinDeviceWithToken(BASE, userId, {
    token: tokens[0], device_id: d.deviceId,
    pubkey: await exportPublicKey(d.verify) }));

  // A free user still carries one device — the token path respects it.
  const freeId = crypto.randomUUID();
  const freeKey = await getUserKey(aStore, freeId);
  await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: freeId,
      device_id: a.deviceId, pubkey: await exportPublicKey(a.verify) }),
  });
  const clientFree = relayClient({ userId: freeId, baseUrl: BASE, identity: a, userKey: freeKey });
  const { tokens: freeTokens } = await clientFree.mintJoinTokens(1);
  await assert.rejects(joinDeviceWithToken(BASE, freeId, {
    token: freeTokens[0], device_id: d.deviceId,
    pubkey: await exportPublicKey(d.verify) }),
    (e) => e.message.includes("403"));
});

test("supporters: tagged join, cascade removal, rotation locks them out", async () => {
  // 015 slice 5 — A owns the user; acct_slp is a supporter account whose
  // device joins on a for_acct join token. Removing the supporter
  // cascades to its devices and unused tokens; the epoch-2 rotation
  // seals new ops under a key S never received.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userId = crypto.randomUUID();
  const userKey1 = await getUserKey(aStore, userId, 1);
  await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId,
      device_id: a.deviceId, pubkey: await exportPublicKey(a.verify) }),
  });
  const clientA = relayClient({ userId, baseUrl: BASE, identity: a, userKey: userKey1 });
  await makeLifetime(clientA, userId);

  // The family's second device — untagged, must survive the cascade.
  const p2Store = memoryKeyStore();
  const p2 = await getDeviceIdentity(p2Store);
  await putUserKey(p2Store, userId, userKey1, 1);
  await clientA.addDevice(p2.deviceId, await exportPublicKey(p2.verify),
    { dh_pub: await exportDhPublic(p2.dh.publicKey) });

  // S's device joins on a tagged join token → via_acct = acct_slp.
  await clientA.addSupporter("acct_slp", "s@example.com");
  const { tokens } = await clientA.mintJoinTokens(2, "acct_slp");
  const sStore = memoryKeyStore();
  const s = await getDeviceIdentity(sStore);
  await putUserKey(sStore, userId, userKey1, 1);
  await joinDeviceWithToken(BASE, userId, {
    token: tokens[0], device_id: s.deviceId,
    pubkey: await exportPublicKey(s.verify) });
  const clientS = relayClient({ userId, baseUrl: BASE, identity: s, userKey: userKey1 });

  // The supporters list and the tagged device row both show.
  const { supporters } = await clientA.listSupporters();
  assert.equal(supporters[0].acct_id, "acct_slp");
  const { devices } = await clientA.listDevices();
  assert.equal(devices.find((d) => d.device_id === s.deviceId).via_acct, "acct_slp");
  assert.equal(devices.find((d) => d.device_id === p2.deviceId).via_acct, null);

  // S edits; A receives the op — the two-way share works.
  const sDb = createDatabase(":memory:");
  importCatalog(sDb, catalog);
  createEntity(sDb, { name: "FromSLP" });
  await clientS.submit(listOps(sDb));
  const aOps = await clientA.fetchOps(0);
  assert.match((await clientA.openOp(aOps.ops.at(-1).env)).args, /FromSLP/);

  // P removes S: the next read AND write from S's device get 403, and
  // the leftover tagged token can never register a second S device.
  await clientA.removeSupporter("acct_slp");
  await assert.rejects(clientS.fetchOps(0), (e) => e.status === 403);
  await assert.rejects(clientS.submit(listOps(sDb)), (e) => e.status === 403);
  const s2 = await getDeviceIdentity(memoryKeyStore());
  await assert.rejects(joinDeviceWithToken(BASE, userId, {
    token: tokens[1], device_id: s2.deviceId,
    pubkey: await exportPublicKey(s2.verify) }));
  assert.equal((await clientA.listSupporters()).supporters.length, 0);

  // Rotation: epoch 2 wraps to remaining devices only. Ops sealed under
  // e2 do not open under the e1 key S still holds; P's devices are fine.
  const userKey2 = await getUserKey(aStore, userId, 2);
  await clientA.rotateKeys(2, {
    [a.deviceId]: await wrapUserKey(userKey2, await exportDhPublic(a.dh.publicKey)),
    [p2.deviceId]: await wrapUserKey(userKey2, await exportDhPublic(p2.dh.publicKey)),
  });
  const clientA2 = relayClient({ userId, baseUrl: BASE, identity: a, userKey: userKey2 });
  const e2op = { op_id: `op_${crypto.randomUUID()}`, kind: "set_setting",
    args: JSON.stringify({ key: "post_removal", value: 1 }) };
  await clientA2.submit([e2op]);
  const after = await clientA2.fetchOps(0);
  const lastEnv = after.ops.at(-1).env;
  await assert.rejects(openOp(userKey1, lastEnv),
    undefined, "old-epoch key opened a post-removal op");
  const clientP2 = relayClient({ userId, baseUrl: BASE, identity: p2, userKey: userKey2 });
  assert.deepEqual(await clientP2.openOp(lastEnv), e2op);
  await assert.rejects(clientS.fetchOps(0), (e) => e.status === 403);
});

test("016 slice 3: stats_day rows sync sealed and add up per device", async () => {
  // A computes a real day row from its tap log → a put_stats_day op →
  // B drains it into an identical row under A's device id. B's own row
  // for the same day flows back: both rows coexist and totals add up.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userId = crypto.randomUUID();
  const userKey = await getUserKey(aStore, userId);
  const bStore = memoryKeyStore();
  const b = await getDeviceIdentity(bStore);
  await putUserKey(bStore, userId, userKey, 1);

  await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId,
      device_id: a.deviceId, pubkey: await exportPublicKey(a.verify) }),
  });
  const clientA = relayClient({ userId, baseUrl: BASE, identity: a, userKey });
  await makeLifetime(clientA, userId);
  const clientB = relayClient({ userId, baseUrl: BASE, identity: b, userKey });
  await clientA.addDevice(b.deviceId, await exportPublicKey(b.verify));

  const openDb = () => {
    const db = createDatabase(":memory:");
    importCatalog(db, catalog);
    ensureBaseline(db);
    return db;
  };
  const dbA = openDb();
  const dbB = openDb();

  // A scripted day: three taps on opaque ids → one real stats_day row.
  const day = Math.floor(Date.now() / 86400000);
  const t0 = day * 86400000 + 12 * 3600 * 1000;
  const tap = (db, id, ts) => db.prepare(
    `INSERT INTO learner_event_log
       (item_kind, item_id, selected_at, source, tz_offset_min, spotlit)
     VALUES ('sense', ?, ?, 'grid', 0, 0)`,
  ).run(id, ts);
  tap(dbA, "s_w1", t0); tap(dbA, "s_w2", t0 + 1000); tap(dbA, "s_w2", t0 + 2000);
  setDeviceId(a.deviceId);
  const computed = upsertStatsDay(dbA, day, t0);
  assert.equal(computed.words, 3);
  const statsOps = listOps(dbA).filter((o) => o.kind === "put_stats_day");
  assert.equal(statsOps.length, 1);
  await clientA.submit(statsOps);

  // B drains → the row lands under A's device id, identical payload.
  const got = await clientB.fetchOps(0);
  const plain = [];
  for (const r of got.ops)
    plain.push({ ...(await clientB.openOp(r.env)), relay_seq: r.relay_seq });
  drainOps(dbB, plain);
  const rowB = dbB.prepare(
    "SELECT device_id, payload FROM stats_day WHERE day = ?").all(day);
  assert.equal(rowB.length, 1);
  assert.equal(rowB[0].device_id, a.deviceId);
  const pB = JSON.parse(rowB[0].payload);
  assert.equal(pB.words, 3);
  assert.equal(pB.different, 2);

  // Payload scan: the sealed stream contains no item ids; decrypted args
  // carry counts only — no tap times, no sentence or event-log fields.
  assert.ok(!JSON.stringify(got.ops).includes("s_w"), "relay saw item ids in the clear");
  for (const op of plain) {
    if (op.kind !== "put_stats_day") continue;
    const args = typeof op.args === "string" ? op.args : JSON.stringify(op.args);
    for (const bad of ["selected_at", "sentence_id", "ended_at", "tz_offset", "spoken_name"])
      assert.ok(!args.includes(bad), `stats op leaked ${bad}`);
  }

  // B's own row for the same day flows back; both rows coexist and the
  // totals add up per word across devices (§ 6.2).
  setDeviceId(b.deviceId);
  tap(dbB, "s_w1", t0 + 3000);
  upsertStatsDay(dbB, day, t0 + 1);
  await clientB.submit(listOps(dbB).filter((o) => o.kind === "put_stats_day"));
  const gotA = await clientA.fetchOps(0);
  const plainA = [];
  for (const r of gotA.ops)
    plainA.push({ ...(await clientA.openOp(r.env)), relay_seq: r.relay_seq });
  drainOps(dbA, plainA);
  const rows = dbA.prepare(
    "SELECT device_id, payload FROM stats_day WHERE day = ? ORDER BY device_id").all(day);
  assert.deepEqual(rows.map((r) => r.device_id), [a.deviceId, b.deviceId].sort());
  assert.equal(
    rows.reduce((n, r) => n + JSON.parse(r.payload).words, 0), 4);
});

test("snapshots: sealed state round-trips; the watermark only advances", async () => {
  // § 5 — A edits, seals the synced tables at the log's head, uploads.
  // C fast-boots from the snapshot + the op tail and lands byte-equal.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userId = crypto.randomUUID();
  const userKey = await getUserKey(aStore, userId);
  const cStore = memoryKeyStore();
  const c = await getDeviceIdentity(cStore);
  await putUserKey(cStore, userId, userKey, 1);

  const openDb = () => {
    const db = createDatabase(":memory:");
    importCatalog(db, catalog);
    ensureBaseline(db);
    return db;
  };
  const dbA = openDb();
  const { id: dog } = createEntity(dbA, { name: "SnapDog" });
  placeItem(dbA, "grp_people", "entity", dog);

  await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId,
      device_id: a.deviceId, pubkey: await exportPublicKey(a.verify) }),
  });
  const clientA = relayClient({ userId, baseUrl: BASE, identity: a, userKey });
  await makeLifetime(clientA, userId);
  await clientA.addDevice(c.deviceId, await exportPublicKey(c.verify));
  const clientC = relayClient({ userId, baseUrl: BASE, identity: c, userKey });

  const { ops: seqs } = await clientA.submit(listOps(dbA));
  const head = Math.max(...seqs.map((s) => s.relay_seq));

  // Nothing stored yet → null, not an error.
  assert.equal(await clientC.getSnapshot(), null);

  const env = await sealOp(userKey, { seq: head, snap: snapshotSynced(dbA) });
  await clientA.putSnapshot({ e: 1, env }, head);

  // C boots from the snapshot, then A's post-snapshot edits ride the tail.
  const stored = await clientC.getSnapshot();
  const plain = await openOp(userKey, stored.env);
  assert.equal(plain.seq, head);
  const dbC = openDb();
  adoptSnapshot(dbC, plain.snap);

  const beforeTail = listOps(dbA).length;
  const { id: cat } = createEntity(dbA, { name: "AfterSnap" });
  placeItem(dbA, "grp_people", "entity", cat);
  await clientA.submit(listOps(dbA).slice(beforeTail));

  const tail = await clientC.fetchOps(head);
  const plainTail = [];
  for (const r of tail.ops) {
    plainTail.push({ ...(await clientC.openOp(r.env)), relay_seq: r.relay_seq });
  }
  assert.equal(plainTail.length, 2); // create + place, nothing earlier
  drainOps(dbC, plainTail);
  assert.deepEqual(snapshotSynced(dbC), snapshotSynced(dbA));

  // The watermark only advances: a stale PUT behind it is dropped, the
  // stored snapshot still opens at the newer seq.
  await clientA.putSnapshot({ e: 1, env: await sealOp(userKey, { seq: 1, snap: {} }) }, 1);
  const still = await clientC.getSnapshot();
  assert.equal((await openOp(userKey, still.env)).seq, head);
});
