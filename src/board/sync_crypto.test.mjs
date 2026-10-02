/**
 * 011 slice 3 Works Test — keys and encryption (§§ 3–4).
 *
 * Capture every outgoing payload in a scripted session that adds Cooper
 * with a photo and a recording: no payload may contain "Cooper", a group
 * name, or bytes hashing to the original photo or recording. Decrypting
 * with the user key must return the ops — and nothing else may.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { createEntity, placeItem, setEntityPhoto } from "../../public/shared/groups.mjs";
import { listOps, setDeviceId } from "../../public/shared/ops.mjs";
import {
  genAccountKeys,
  getUserKey,
  getDeviceIdentity,
  memoryKeyStore,
  openAccountPriv,
  openBlob,
  openOp,
  sealAccountPriv,
  sealBlob,
  sealOp,
  sha256Hex,
  signPayload,
  unwrapUserKey,
  verifyPayload,
  wrapUserKey,
  openData,
} from "../../public/shared/sync_crypto.mjs";
import { listUsers, memoryUserStore, migrateLegacy } from "../../public/shared/users.mjs";
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
  const userKey = await getUserKey(store, "u1");
  const db = openDb();

  // The scripted session: add Cooper, place him in People, set a photo,
  // take a recording. Photos/recordings are blobs — the op carries a hash.
  const { id } = createEntity(db, { name: "Cooper" });
  placeItem(db, "grp_people", "entity", id);
  const photo = globalThis.crypto.getRandomValues(new Uint8Array(2048));
  const recording = globalThis.crypto.getRandomValues(new Uint8Array(4096));
  const photoSeal = await sealBlob(userKey, photo);
  const recSeal = await sealBlob(userKey, recording);
  setEntityPhoto(db, id, `opfs:photos/${id}`);

  // Every outgoing payload: sealed ops + sealed blob envelopes.
  const payloads = [];
  for (const op of listOps(db)) payloads.push(await sealOp(userKey, op));
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
  for (const env of payloads.slice(0, ops.length)) back.push(await openOp(userKey, env));
  assert.deepEqual(back, ops.map((o) => JSON.parse(JSON.stringify(o))));
  assert.deepEqual(await openBlob(userKey, photoSeal), photo);
  assert.deepEqual(await openBlob(userKey, recSeal), recording);
});

test("a different user key opens nothing; tampering is detected", async () => {
  const store = memoryKeyStore();
  const userKey = await getUserKey(store, "u1");
  const wrongKey = await getUserKey(memoryKeyStore(), "u1");
  const env = await sealOp(userKey, { kind: "rename_entity", args: { id: "ent_x", name: "Cooper" } });

  await assert.rejects(openOp(wrongKey, env));
  await assert.rejects(openOp(userKey, { ...env, ct: env.ct.slice(0, -4) + "AAAA" }));
  await assert.rejects(openOp(userKey, { ...env, iv: "AAAAAAAAAAAAAAAA" }));

  const blob = await sealBlob(userKey, new Uint8Array([1, 2, 3]));
  await assert.rejects(openBlob(userKey, { sha: "00".repeat(32), env: blob.env }));
});

test("the catalog's seed install op seals under the relay's 64 KB cap and opens intact", async () => {
  // The real op a fresh board records first — ~160 KB of JSON. Unsealed
  // it broke every first sync (op_too_large); deflated inside the
  // ciphertext it fits, and opens byte-identical.
  const db = openDb();
  const seed = listOps(db).find((o) => o.kind === "seed_install");
  assert.ok(seed.args.length > 64 * 1024, "the fixture is the oversized op");
  const key = await getUserKey(memoryKeyStore(), "u1");
  const env = await sealOp(key, seed);
  assert.ok(JSON.stringify(env).length < 64 * 1024, `sealed ${JSON.stringify(env).length} bytes`);
  assert.deepEqual(await openOp(key, env), { ...seed });
  // Small ops stay as they were: plain JSON under the seal.
  const small = { kind: "rename_entity", args: { id: "ent_x", name: "Cooper" } };
  const plain = await openData(key, await sealOp(key, small));
  assert.equal(plain[0], "{".charCodeAt(0));
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

test("015 slice 2: legacy flat keys scope under the migrated user", async () => {
  // A pre-multi-user device holds board_key / board_key_e2 (or
  // user_key* after the slice-1 rename) plus a flat recovery_root.
  // migrateLegacy moves them under user/<id>/… — eagerly, so a second
  // user can never fall through to user A's key.
  const keyStore = memoryKeyStore();
  const epoch1 = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const epoch2 = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const root = globalThis.crypto.getRandomValues(new Uint8Array(32));
  await keyStore.put("board_key", epoch1);
  await keyStore.put("board_key_e2", epoch2);
  await keyStore.put("recovery_root", root);
  const storage = new Map();
  storage.set("pip_sync", JSON.stringify({ boardId: "u-old", epoch: 2 }));
  const legacy = {
    getItem: (k) => storage.get(k) ?? null,
    removeItem: (k) => storage.delete(k),
    key: (i) => [...storage.keys()][i],
    get length() { return storage.size; },
  };
  const userStore = memoryUserStore();

  const id = await migrateLegacy({ storage: legacy, exportLegacyDb: async () => null, keyStore, userStore });
  assert.equal(id, "u-old");

  const op = { kind: "set_setting", args: { key: "board_layout", value: "grid60" } };
  const env1 = await sealOp(epoch1, op);
  const env2 = await sealOp(epoch2, op);
  assert.deepEqual(await openOp(await getUserKey(keyStore, "u-old", 1), env1), op);
  assert.deepEqual(await openOp(await getUserKey(keyStore, "u-old", 2), env2), op);
  assert.equal(await keyStore.get("board_key"), undefined, "legacy name left behind");
  assert.equal(await keyStore.get("board_key_e2"), undefined);
  assert.equal(await keyStore.get("recovery_root"), undefined);
  assert.ok(await keyStore.get("user/u-old/key_e1"), "scoped key missing");
  assert.ok(await keyStore.get("user/u-old/key_e2"), "scoped key missing");
  assert.ok(await keyStore.get("user/u-old/root"), "scoped root missing");

  // The sync config moved into the registry row; pip_sync is gone.
  const row = (await listUsers(userStore))[0];
  assert.equal(row.id, "u-old");
  assert.equal(row.home, true);
  assert.deepEqual(row.sync, { userId: "u-old", epoch: 2, cursor: 0 });
  assert.equal(storage.has("pip_sync"), false);

  // A second user's key read can never land on u-old's key: scoped
  // names only — no flat fallback exists anymore.
  const u2key = await getUserKey(keyStore, "u2", 1);
  assert.ok(await keyStore.get("user/u2/key_e1"));
  await assert.rejects(openOp(u2key, env1));
});

test("account keys: PRF seals the private key; wrapped user keys round-trip", async () => {
  const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const acct = await genAccountKeys();

  // The relay only ever holds the sealed private key.
  const sealed = await sealAccountPriv(acct.priv, prf);
  assert.ok(sealed.iv && sealed.sealed);
  const priv = await openAccountPriv(sealed, prf);

  // A user key wraps to the account public key exactly as it wraps to a
  // device (Sync § 3); the unsealed account private key unwraps it.
  const keyStore = memoryKeyStore();
  const userKey = await getUserKey(keyStore, "u1", 2);
  const grant = await wrapUserKey(userKey, acct.pub);
  const unwrapped = await unwrapUserKey(priv, grant);
  const op = { kind: "set_setting", args: { key: "board_layout", value: "grid60" } };
  const env = await sealOp(userKey, op);
  assert.deepEqual(await openOp(unwrapped, env), op);

  // A wrong PRF output opens nothing — the sealed key is opaque.
  const wrong = globalThis.crypto.getRandomValues(new Uint8Array(32));
  await assert.rejects(openAccountPriv(sealed, wrong));
});
