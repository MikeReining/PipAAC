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
