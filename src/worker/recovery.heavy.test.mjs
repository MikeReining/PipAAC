/**
 * 011 slice 8 Works Test — the recovery sheet (heavy: spawns
 * `wrangler dev`).
 *
 * A builds a user, syncs it, and rotates the key once (post-revoke
 * state). Every client is then "destroyed" — C is a fresh keystore and
 * database holding only what the printed sheet carries: the user id
 * and the 24 words. The relay never saw a key, only the proof. C
 * restores, drains the log, and every synced table is byte-identical.
 * What the child said never left the device — C's history tables are
 * empty. A wrong sheet gets 403.
 *
 * Run: scripts/test.sh src/worker/recovery.heavy.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase, importCatalog } from "../board/catalog.mjs";
import { createEntity, renameEntity } from "../../public/shared/groups.mjs";
import { drainOps, ensureBaseline, listOps } from "../../public/shared/ops.mjs";
import {
  cardPayload, recoverFromText, recoveryProof,
} from "../../public/shared/recovery.mjs";
import { RECOVERY_WORDS } from "../../public/shared/recovery_words.mjs";
import {
  deriveEpochKey, ensureRecoveryRoot, exportDhPublic, exportPublicKey,
  getUserKey, getDeviceIdentity, memoryKeyStore, openEpochBundle, openOp,
  putUserKey, retireRoot, sealEpochBundle, userRootName, wrapUserKey,
} from "../../public/shared/sync_crypto.mjs";
import { licenseFor } from "./license.mjs";
import { relayClient, restoreDevice } from "../../public/shared/sync_client.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const PORT = 8880;
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

const SYNCED_TABLES = [
  "learner_profile", "personal_entity", "board_group", "group_label",
  "clip_override", "entity_enrichment", "group_cell",
];
const HISTORY_TABLES = [
  "learner_event_log", "sentence", "strip_impression", "prediction_weights",
];
const syncedDump = (db) =>
  SYNCED_TABLES.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wrangler;

before(async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "pip-rec-"));
  wrangler = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1",
    "--persist-to", stateDir], { cwd: repoRoot, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)) return;
  }
  throw new Error("wrangler dev did not come up");
});

after(() => { wrangler?.kill("SIGTERM"); });

test("restore from the sheet on a fresh device; history stays behind", async () => {
  // A — the device that sets up sync. Root minted, epoch-1 key derived.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userId = crypto.randomUUID(); // client-chosen (015 slice 2)
  const root = await ensureRecoveryRoot(aStore, userId);
  const key1 = await getUserKey(aStore, userId, 1);

  const dbA = createDatabase(":memory:");
  importCatalog(dbA, catalog);
  ensureBaseline(dbA);

  // The sheet is just the user id + 24 words. A creates the user and
  // leaves only the proof — the relay never sees the key.
  const user = await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      device_id: a.deviceId,
      pubkey: await exportPublicKey(a.verify),
      dh_pub: await exportDhPublic(a.dh.publicKey),
      recovery_proof: await recoveryProof(root),
    }),
  }).then((r) => r.json());
  const clientA = relayClient({ userId: user.user_id, baseUrl: BASE, identity: a, userKey: key1 });
  await makeLifetime(clientA, user.user_id);

  // Edits at epoch 1, plus history that must never leave the device.
  const cooper = createEntity(dbA, { name: "Cooper" }).id;
  renameEntity(dbA, cooper, "Cooper dog");
  dbA.prepare("INSERT INTO sentence (started_at, ended_at, end_kind, tz_offset_min) VALUES (?, ?, 'spoken', -420)")
    .run(Date.now() - 5000, Date.now());
  dbA.prepare("INSERT INTO learner_event_log (item_kind, item_id, selected_at, sentence_id, position, source, tz_offset_min) VALUES ('entity', ?, ?, 1, 0, 'grid', -420)")
    .run(cooper, Date.now());
  await clientA.submit(listOps(dbA));

  // A revocation rotated the key — ops now seal under epoch 2, which
  // the sheet still opens because every epoch derives from the root.
  const key2 = await deriveEpochKey(root, 2);
  await clientA.rotateKeys(2, {
    [a.deviceId]: await wrapUserKey(key2, await exportDhPublic(a.dh.publicKey)),
  });
  createEntity(dbA, { name: "After removal" });
  await relayClient({ userId: user.user_id, baseUrl: BASE, identity: a, userKey: key2 })
    .submit(listOps(dbA).filter((o) => o.relay_seq === null));

  // A wrong sheet gets nothing.
  const badStore = memoryKeyStore();
  const bad = await getDeviceIdentity(badStore);
  await assert.rejects(restoreDevice(BASE, user.user_id, {
    proof: await recoveryProof(crypto.getRandomValues(new Uint8Array(32))),
    device_id: bad.deviceId,
    pubkey: await exportPublicKey(bad.verify),
  }), /403/);

  // C — fresh device, fresh database, holding only what the QR card's
  // scanned text decodes to (015 slice 3: the root itself, not words).
  const card = await recoverFromText(cardPayload(user.user_id, root), RECOVERY_WORDS);
  assert.equal(card.userId, user.user_id);
  const restoredRoot = card.root;

  const cStore = memoryKeyStore();
  const c = await getDeviceIdentity(cStore);
  const reg = await restoreDevice(BASE, user.user_id, {
    proof: await recoveryProof(restoredRoot),
    device_id: c.deviceId,
    pubkey: await exportPublicKey(c.verify),
    dh_pub: await exportDhPublic(c.dh.publicKey),
  });
  assert.equal(reg.epoch, 2);
  await cStore.put(userRootName(user.user_id), restoredRoot);

  const dbC = createDatabase(":memory:");
  importCatalog(dbC, catalog);
  ensureBaseline(dbC);

  const clientC = relayClient({
    userId: user.user_id, baseUrl: BASE, identity: c,
    userKey: await getUserKey(cStore, user.user_id, reg.epoch),
  });
  const fetched = await clientC.fetchOps(0);
  assert.equal(fetched.ops.length, 3); // create_entity, rename_entity, create_entity
  const plain = [];
  for (const r of fetched.ops) {
    plain.push({ ...(await openOp(await getUserKey(cStore, user.user_id, r.epoch ?? 1), r.env)),
      relay_seq: r.relay_seq });
  }
  drainOps(dbC, plain);

  // Synced tables are byte-identical; history never crossed.
  assert.deepEqual(syncedDump(dbC), syncedDump(dbA));
  for (const t of HISTORY_TABLES) {
    assert.equal(dbC.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0, t);
  }
  assert.ok(dbA.prepare("SELECT COUNT(*) AS n FROM learner_event_log").get().n > 0);
});

test("replace card: the old proof dies at the relay, the new card restores", async () => {
  // A — linked device holding the recovery root.
  const aStore = memoryKeyStore();
  const a = await getDeviceIdentity(aStore);
  const userId = crypto.randomUUID();
  const root = await ensureRecoveryRoot(aStore, userId);
  const key1 = await getUserKey(aStore, userId, 1);
  const user = await fetch(`${BASE}/users`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      device_id: a.deviceId,
      pubkey: await exportPublicKey(a.verify),
      dh_pub: await exportDhPublic(a.dh.publicKey),
      recovery_proof: await recoveryProof(root),
    }),
  }).then((r) => r.json());
  const clientA = relayClient({ userId: user.user_id, baseUrl: BASE, identity: a, userKey: key1 });
  await makeLifetime(clientA, user.user_id);

  const dbA = createDatabase(":memory:");
  importCatalog(dbA, catalog);
  ensureBaseline(dbA);
  createEntity(dbA, { name: "Before the swap" });
  await clientA.submit(listOps(dbA));

  // Replace card — what board.js's replaceCard does: seal the old
  // era's keys to the new root, post the new proof + bundle, retire
  // the old root, and rotate to a new-root epoch.
  const newRoot = crypto.getRandomValues(new Uint8Array(32));
  const bundle = await sealEpochBundle(aStore, user.user_id, newRoot, 1);
  await clientA.replaceRecovery(await recoveryProof(newRoot), bundle);
  await retireRoot(aStore, user.user_id, root, 1);
  await aStore.put(userRootName(user.user_id), newRoot);
  const key2 = await deriveEpochKey(newRoot, 2);
  await putUserKey(aStore, user.user_id, key2, 2);
  const { devices } = await clientA.listDevices();
  const wrapped = {};
  for (const d of devices) {
    if (d.dh_pub) wrapped[d.device_id] = await wrapUserKey(key2, d.dh_pub);
  }
  await clientA.rotateKeys(2, wrapped);
  createEntity(dbA, { name: "After the swap" });
  await relayClient({ userId: user.user_id, baseUrl: BASE, identity: a, userKey: key2 })
    .submit(listOps(dbA).filter((o) => o.relay_seq === null));

  // The old card is dead.
  const eStore = memoryKeyStore();
  const e = await getDeviceIdentity(eStore);
  await assert.rejects(restoreDevice(BASE, user.user_id, {
    proof: await recoveryProof(root),
    device_id: e.deviceId,
    pubkey: await exportPublicKey(e.verify),
    dh_pub: await exportDhPublic(e.dh.publicKey),
  }), /403/);

  // The new card restores: scanned text → root → proof → epoch 2 plus
  // the bundle — the old era's keys land in the keystore and the whole
  // backlog opens, byte-identical.
  const dStore = memoryKeyStore();
  const d = await getDeviceIdentity(dStore);
  const card = await recoverFromText(cardPayload(user.user_id, newRoot), RECOVERY_WORDS);
  const reg = await restoreDevice(BASE, user.user_id, {
    proof: await recoveryProof(card.root),
    device_id: d.deviceId,
    pubkey: await exportPublicKey(d.verify),
    dh_pub: await exportDhPublic(d.dh.publicKey),
  });
  assert.equal(reg.epoch, 2);
  assert.ok(reg.recovery_bundle);
  await dStore.put(userRootName(user.user_id), card.root);
  for (const [e, k] of Object.entries(await openEpochBundle(card.root, reg.recovery_bundle))) {
    await putUserKey(dStore, user.user_id, k, Number(e));
  }

  const dbD = createDatabase(":memory:");
  importCatalog(dbD, catalog);
  ensureBaseline(dbD);
  const clientD = relayClient({
    userId: user.user_id, baseUrl: BASE, identity: d,
    userKey: await getUserKey(dStore, user.user_id, reg.epoch),
  });
  const plain = [];
  for (const r of (await clientD.fetchOps(0)).ops) {
    plain.push({ ...(await openOp(await getUserKey(dStore, user.user_id, r.epoch ?? 1), r.env)),
      relay_seq: r.relay_seq });
  }
  drainOps(dbD, plain);
  assert.deepEqual(syncedDump(dbD), syncedDump(dbA));
});
