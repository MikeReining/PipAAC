/**
 * 011 slice 3 Works Test — keys and encryption (§§ 3–4).
 *
 * Capture every outgoing payload in a scripted session that adds Cooper
 * with a photo and a recording: no payload may contain "Cooper", a group
 * name, or bytes hashing to the original photo or recording. Decrypting
 * with the board key must return the ops — and nothing else may.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { createEntity, placeItem, setEntityPhoto } from "../../public/shared/groups.mjs";
import { listOps, setDeviceId } from "../../public/shared/ops.mjs";
import {
  getBoardKey,
  getDeviceIdentity,
  memoryKeyStore,
  openBlob,
  openOp,
  sealBlob,
  sealOp,
  sha256Hex,
  signPayload,
  verifyPayload,
} from "../../public/shared/sync_crypto.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

test("device identity: one pair, non-extractable private keys", async () => {
  const store = memoryKeyStore();
  const a = await getDeviceIdentity(store);
  const b = await getDeviceIdentity(store);
  assert.equal(a.deviceId, b.deviceId);
  assert.match(a.deviceId, /^dev_[0-9a-f]{16}$/);
  assert.equal(a.sign.extractable, false);
  assert.equal(a.dh.privateKey.extractable, false);
  // A second store is a second device.
  const other = await getDeviceIdentity(memoryKeyStore());
  assert.notEqual(other.deviceId, a.deviceId);
});

test("scripted session: no outgoing payload leaks plaintext", async () => {
  const store = memoryKeyStore();
  const boardKey = await getBoardKey(store);
  const db = openDb();

  // The scripted session: add Cooper, place him in People, set a photo,
  // take a recording. Photos/recordings are blobs — the op carries a hash.
  const { id } = createEntity(db, { name: "Cooper" });
  placeItem(db, "grp_people", "entity", id);
  const photo = globalThis.crypto.getRandomValues(new Uint8Array(2048));
  const recording = globalThis.crypto.getRandomValues(new Uint8Array(4096));
  const photoSeal = await sealBlob(boardKey, photo);
  const recSeal = await sealBlob(boardKey, recording);
  setEntityPhoto(db, id, `opfs:photos/${id}`);

  // Every outgoing payload: sealed ops + sealed blob envelopes.
  const payloads = [];
  for (const op of listOps(db)) payloads.push(await sealOp(boardKey, op));
  payloads.push(photoSeal.env, recSeal.env);

  const photoSha = await sha256Hex(photo);
  const recSha = await sha256Hex(recording);
  for (const p of payloads) {
    const wire = JSON.stringify(p);
    for (const leak of ["Cooper", "grp_people", "People", photoSha, recSha]) {
      assert.ok(!wire.includes(leak), `payload leaks ${leak}`);
    }
    // And the ciphertext itself must not contain the raw bytes.
    const ct = Buffer.from(p.ct.replaceAll("-", "+").replaceAll("_", "/"), "base64");
    assert.equal(ct.indexOf(Buffer.from("Cooper")), -1);
    assert.equal(ct.indexOf(Buffer.from(photo)), -1);
    assert.equal(ct.indexOf(Buffer.from(recording)), -1);
  }

  // The blob envelopes' sha IS the photo hash — that's by design; the
  // hash is the reference, the bytes are the secret. What must not leak
  // is the bytes themselves (checked above).
  assert.equal(photoSeal.sha, photoSha);
  assert.equal(recSeal.sha, recSha);

  // Decrypting with the board key returns the ops, verbatim.
  const ops = listOps(db);
  const back = [];
  for (const env of payloads.slice(0, ops.length)) back.push(await openOp(boardKey, env));
  assert.deepEqual(back, ops.map((o) => JSON.parse(JSON.stringify(o))));
  assert.deepEqual(await openBlob(boardKey, photoSeal), photo);
  assert.deepEqual(await openBlob(boardKey, recSeal), recording);
});

test("a different board key opens nothing; tampering is detected", async () => {
  const store = memoryKeyStore();
  const boardKey = await getBoardKey(store);
  const wrongKey = await getBoardKey(memoryKeyStore());
  const env = await sealOp(boardKey, { kind: "rename_entity", args: { id: "ent_x", name: "Cooper" } });

  await assert.rejects(openOp(wrongKey, env));
  await assert.rejects(openOp(boardKey, { ...env, ct: env.ct.slice(0, -4) + "AAAA" }));
  await assert.rejects(openOp(boardKey, { ...env, iv: "AAAAAAAAAAAAAAAA" }));

  const blob = await sealBlob(boardKey, new Uint8Array([1, 2, 3]));
  await assert.rejects(openBlob(boardKey, { sha: "00".repeat(32), env: blob.env }));
});

test("recorded ops carry the device fingerprint", async () => {
  const { deviceId } = await getDeviceIdentity(memoryKeyStore());
  setDeviceId(deviceId);
  const db = openDb();
  createEntity(db, { name: "K" });
  const op = listOps(db).at(-1);
  assert.equal(op.device_id, deviceId);
  setDeviceId("dev_local");
});

test("device signatures verify under the device key only", async () => {
  const { sign, verify } = await getDeviceIdentity(memoryKeyStore());
  const other = await getDeviceIdentity(memoryKeyStore());
  const sig = await signPayload(sign, "op_abc relay_seq 7");
  assert.equal(await verifyPayload(verify, "op_abc relay_seq 7", sig), true);
  assert.equal(await verifyPayload(verify, "op_abc relay_seq 8", sig), false);
  assert.equal(await verifyPayload(other.verify, "op_abc relay_seq 7", sig), false);
});
