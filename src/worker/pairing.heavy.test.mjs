/**
 * 011 slice 5 Works Test — pairing, linked devices, revoke (heavy:
 * spawns `wrangler dev`).
 *
 * The real flow: the device that has the user opens an 8-char code; the
 * new device claims it with its public keys and polls; the offering
 * device registers it and writes the wrapped-key grant; the new device
 * unwraps the user key and syncs. Before Allow it reads nothing. After Remove its
 * next write is rejected and post-rotation ops are sealed under a key it
 * never received.
 *
 * Run: scripts/test.sh src/worker/pairing.heavy.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase, importCatalog } from "../board/catalog.mjs";
import { createEntity } from "../../public/shared/groups.mjs";
import { listOps } from "../../public/shared/ops.mjs";
import {
  exportDhPublic,
  exportPublicKey,
  getUserKey,
  getDeviceIdentity,
  memoryKeyStore,
  newUserKey,
  openOp,
  putUserKey,
  unwrapUserKey,
  wrapUserKey,
} from "../../public/shared/sync_crypto.mjs";
import { licenseFor } from "./license.mjs";
import { pairClient, relayClient } from "../../public/shared/sync_client.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const PORT = 8878;
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
  const stateDir = mkdtempSync(join(tmpdir(), "pip-pair-"));
  wrangler = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1",
    "--persist-to", stateDir], { cwd: repoRoot, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)) return;
  }
  throw new Error("wrangler dev did not come up");
});

after(() => { wrangler?.kill("SIGTERM"); });

test("pair through the real flow; revoke locks out and rotates", async () => {
  // A — the linked device, user creator.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userId = crypto.randomUUID(); // client-chosen (015 slice 2)
  const userKey = await getUserKey(aStore, userId);
  // B — the new device. It does NOT have the user key.
  const bStore = memoryKeyStore();
  const b = await getDeviceIdentity(bStore);

  const dbA = createDatabase(":memory:");
  importCatalog(dbA, catalog);

  // A creates the user (with its dh pub so later rotations can wrap to it).
  const user = await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      device_id: a.deviceId,
      pubkey: await exportPublicKey(a.verify),
      dh_pub: await exportDhPublic(a.dh.publicKey),
    }),
  }).then((r) => r.json());
  const clientA = relayClient({ userId: user.user_id, baseUrl: BASE, identity: a, userKey });
  await makeLifetime(clientA, user.user_id);
  const lobby = pairClient(BASE);

  // A (has the user) opens a code; it is open, nobody has claimed it.
  const { pair } = await lobby.offer();
  assert.match(pair, /^[A-Z0-9]{8}$/);
  assert.equal((await lobby.status(pair)).status, "open");
  // A wrong code is not open.
  await assert.rejects(lobby.claim("ZZZZZZZZ", { device_id: "x", sig_pub: "x", dh_pub: "x" }),
    (e) => e.status === 404);

  // B types the code: claims the lobby with its public keys and name.
  await lobby.claim(pair, { device_id: b.deviceId,
    sig_pub: await exportPublicKey(b.verify), dh_pub: await exportDhPublic(b.dh.publicKey),
    label: "Mac · Chrome" });
  // A second claim on the same code is refused — first one wins.
  await assert.rejects(lobby.claim(pair, { device_id: "c", sig_pub: "c", dh_pub: "c" }),
    (e) => e.status === 409);

  // Before the grant: B reads nothing on the user.
  const blindB = relayClient({ userId: user.user_id, baseUrl: BASE, identity: b, userKey });
  await assert.rejects(blindB.fetchOps(0), (e) => e.status === 403);

  // A sees the claim → registers B on the user (with its name) and
  // writes the wrapped-key grant.
  const req = await lobby.status(pair);
  assert.equal(req.status, "claimed");
  assert.equal(req.device_id, b.deviceId);
  assert.equal(req.label, "Mac · Chrome");
  const wrapped = await wrapUserKey(userKey, req.dh_pub);
  await clientA.addDevice(b.deviceId, req.sig_pub, { dh_pub: req.dh_pub, label: req.label });
  await lobby.grant(pair, { user_id: user.user_id, by_device: a.deviceId, ...wrapped });
  const named = (await clientA.listDevices()).devices.find((d) => d.device_id === b.deviceId);
  assert.equal(named.label, "Mac · Chrome");

  // B polls → granted → unwraps → now it can read and write.
  const st = await lobby.status(pair);
  assert.equal(st.status, "granted");
  const bKey = await unwrapUserKey(b.dh.privateKey, st.grant);
  await putUserKey(bStore, userId, bKey, 1);
  const clientB = relayClient({ userId: user.user_id, baseUrl: BASE, identity: b, userKey: bKey });
  assert.equal((await clientB.fetchOps(0)).latest, 0);

  // Syncs both ways.
  createEntity(dbA, { name: "Cooper" });
  await clientA.submit(listOps(dbA));
  const seen = await clientB.fetchOps(0);
  assert.equal((await openOp(bKey, seen.ops[0].env)).op_id, listOps(dbA)[0].op_id);
  const dbB = createDatabase(":memory:");
  importCatalog(dbB, catalog);
  createEntity(dbB, { name: "Bee toy" });
  await clientB.submit(listOps(dbB));
  const seenA = await clientA.fetchOps(0);
  // Each device's first push carries its seed install (first one wins,
  // 027 § 4) plus its edit.
  assert.equal(seenA.ops.length, listOps(dbA).length + listOps(dbB).length);

  // Remove B → its next write and read are rejected.
  await clientA.removeDevice(b.deviceId);
  await assert.rejects(clientB.fetchOps(0), (e) => e.status === 403);
  createEntity(dbB, { name: "sneaky" });
  await assert.rejects(clientB.submit(listOps(dbB).slice(1)), (e) => e.status === 403);

  // Rotation: a new user key, wrapped to each remaining device (A only).
  const key2 = await newUserKey();
  await clientA.rotateKeys(2, {
    [a.deviceId]: await wrapUserKey(key2, await exportDhPublic(a.dh.publicKey)),
  });
  const self = await clientA.selfKey();
  assert.equal(self.current_epoch, 2);
  const aKey2 = await unwrapUserKey(a.dh.privateKey, JSON.parse(self.wrapped_key));
  await putUserKey(aStore, userId, aKey2, 2);

  // A's post-removal op is sealed under the epoch-2 key — B never got it.
  const sent = listOps(dbA).length;
  createEntity(dbA, { name: "After" });
  const { ops: seqs } = await relayClient(
    { userId: user.user_id, baseUrl: BASE, identity: a, userKey: aKey2 },
  ).submit(listOps(dbA).slice(sent));
  assert.equal(seqs[0].epoch, 2);
  const fetched = (await clientA.fetchOps(seqs[0].relay_seq - 1)).ops[0];
  await assert.rejects(openOp(userKey, fetched.env)); // B's key opens nothing
  assert.equal((await openOp(aKey2, fetched.env)).kind, "create_entity");
});

test("F05/F06/F07: grants carry epochs, missed rotations unwrap per-epoch, removal kills the live socket", async () => {
  // A creates a user at epoch 1; two rotations happen before B pairs.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userId = crypto.randomUUID();
  const k1 = await newUserKey();
  const k2 = await newUserKey();
  const k3 = await newUserKey();
  await putUserKey(aStore, userId, k1, 1);

  await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId,
      device_id: a.deviceId, pubkey: await exportPublicKey(a.verify),
      dh_pub: await exportDhPublic(a.dh.publicKey) }),
  });
  const clientA = relayClient({ userId, baseUrl: BASE, identity: a, userKey: k1 });
  await makeLifetime(clientA, userId);

  // Rotations to e2 and e3 — A's own grants ride device_key history.
  const aDh = await exportDhPublic(a.dh.publicKey);
  await clientA.rotateKeys(2, { [a.deviceId]: await wrapUserKey(k2, aDh) });
  await clientA.rotateKeys(3, { [a.deviceId]: await wrapUserKey(k3, aDh) });
  const selfA = await clientA.selfKey();
  assert.equal(selfA.current_epoch, 3);
  assert.ok(selfA.wrapped_keys["2"], "epoch-2 grant missing from history");
  assert.ok(selfA.wrapped_keys["3"], "epoch-3 grant missing from history");

  // A device that missed both rotations unwraps each epoch in turn.
  const missed = memoryKeyStore();
  const m = await getDeviceIdentity(missed);
  await clientA.addDevice(m.deviceId, await exportPublicKey(m.verify),
    { dh_pub: await exportDhPublic(m.dh.publicKey) });
  await clientA.rotateKeys(4, {
    [a.deviceId]: await wrapUserKey(k3, aDh), // same key era for the test
    [m.deviceId]: await wrapUserKey(k3, await exportDhPublic(m.dh.publicKey)),
  });
  const clientM = relayClient({ userId, baseUrl: BASE, identity: m, userKey: k1 });
  const selfM = await clientM.selfKey();
  assert.ok(selfM.wrapped_keys["4"], "missed-rotation grant not retained per-epoch");

  // F06: the lobby grant must carry the epoch and the historical keys —
  // the offering device wraps each epoch it holds.
  const bStore = memoryKeyStore();
  const b = await getDeviceIdentity(bStore);
  const lobby = pairClient(BASE);
  const { pair } = await lobby.offer();
  await lobby.claim(pair, { device_id: b.deviceId,
    sig_pub: await exportPublicKey(b.verify),
    dh_pub: await exportDhPublic(b.dh.publicKey), label: "B" });
  const req = await lobby.status(pair);
  await clientA.addDevice(b.deviceId, req.sig_pub, { dh_pub: req.dh_pub, label: "B" });
  const bDh = req.dh_pub;
  const keys = [
    { epoch: 1, ...(await wrapUserKey(k1, bDh)) },
    { epoch: 2, ...(await wrapUserKey(k2, bDh)) },
    { epoch: 3, ...(await wrapUserKey(k3, bDh)) },
  ];
  const current = await wrapUserKey(k3, bDh);
  await lobby.grant(pair, {
    user_id: userId, by_device: a.deviceId, epoch: 3, ...current, keys });
  const st = await lobby.status(pair);
  assert.equal(st.grant.epoch, 3, "lobby dropped the grant epoch");
  assert.equal(st.grant.keys.length, 3, "lobby dropped historical keys");
  // B unwraps every epoch and stores each under its own name.
  for (const g of st.grant.keys) {
    const k = await unwrapUserKey(b.dh.privateKey, g);
    await putUserKey(bStore, userId, k, g.epoch);
  }
  for (const e of [1, 2, 3]) {
    assert.ok(await bStore.get(`user/${userId}/key_e${e}`), `epoch ${e} not stored`);
  }

  // F05.3 relay contract: a rootless paired device flags a rotation;
  // the next real rotation clears the flag.
  await clientM.requestRotation();
  const flagged = await clientA.selfKey();
  assert.equal(flagged.rotate_min_epoch, 5);
  await clientA.rotateKeys(5, {
    [a.deviceId]: await wrapUserKey(k3, aDh),
    [m.deviceId]: await wrapUserKey(k3, await exportDhPublic(m.dh.publicKey)),
    [b.deviceId]: await wrapUserKey(k3, await exportDhPublic(b.dh.publicKey)),
  });
  assert.equal((await clientA.selfKey()).rotate_min_epoch, 0);

  // F07: a removed device's live socket stops receiving — and its model
  // messages are refused — the moment the row is deleted.
  const clientB = relayClient({ userId, baseUrl: BASE, identity: b, userKey: k3 });
  const received = [];
  const wsB = new WebSocket(await clientB.wsUrl());
  wsB.onmessage = (ev) => received.push(JSON.parse(ev.data));
  await new Promise((res, rej) => { wsB.onopen = res; wsB.onerror = rej; });
  // A listens too — a revoked sender's model message must not fan out.
  const aHeard = [];
  const wsA = new WebSocket(await clientA.wsUrl());
  wsA.onmessage = (ev) => aHeard.push(JSON.parse(ev.data));
  await new Promise((res, rej) => { wsA.onopen = res; wsA.onerror = rej; });

  // Warm the socket: an op lands while B is authorized.
  const dbA = createDatabase(":memory:");
  importCatalog(dbA, catalog);
  createEntity(dbA, { id: "ent_warm", name: "Warm" });
  await clientA.submit(listOps(dbA));
  const warmDeadline = Date.now() + 4000;
  while (Date.now() < warmDeadline && !received.length) await sleep(50);
  assert.ok(received.length, "authorized socket got nothing");

  await clientA.removeDevice(b.deviceId);
  // The revoked socket must not receive the next broadcast. (The relay
  // also calls close() — a miniflare socket doesn't propagate the close
  // frame to a node client, so delivery denial is what's asserted.)
  const countAtRemoval = received.length;
  createEntity(dbA, { id: "ent_after_revoke", name: "After" });
  await clientA.submit(listOps(dbA).filter((o) =>
    JSON.stringify(o.args).includes("ent_after_revoke")));
  await sleep(800);
  assert.equal(received.length, countAtRemoval,
    "revoked socket kept receiving ops");

  // A live model message from the revoked socket must not fan out —
  // sender authority is rechecked per message, not per upgrade.
  const aModelCount = aHeard.filter((m) => m.t === "model").length;
  wsB.send(JSON.stringify({ t: "model", e: 1, env: { sneak: true } }));
  await sleep(800);
  assert.equal(aHeard.filter((m) => m.t === "model").length, aModelCount,
    "revoked device's model message was rebroadcast");
  wsA.close();
});
