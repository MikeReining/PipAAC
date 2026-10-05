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
  ensureRecoveryRoot,
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
  openKeyStore,
} from "../../public/shared/sync_crypto.mjs";
import { _setStallMs } from "../../public/shared/bounded.mjs";
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

test("concurrent one-shot creation returns one identity, one key, one root — never three", async () => {
  // The audit reproduced three concurrent getDeviceIdentity calls
  // minting three keypairs while only one stored — the caller that
  // lost kept signing under an identity the relay never saw.
  const store = memoryKeyStore();
  const [a, b, c] = await Promise.all([
    getDeviceIdentity(store), getDeviceIdentity(store), getDeviceIdentity(store),
  ]);
  assert.equal(a.deviceId, b.deviceId);
  assert.equal(b.deviceId, c.deviceId);
  // All three callers must hold the STORED key, not just the same id.
  const stored = await store.get("device");
  assert.equal(a.verify, stored.sig.publicKey);
  assert.equal(c.sign, stored.sig.privateKey);

  const store2 = memoryKeyStore();
  const [k1, k2, k3] = await Promise.all([
    getUserKey(store2, "u1"), getUserKey(store2, "u1"), getUserKey(store2, "u1"),
  ]);
  assert.equal(k1, k2);
  assert.equal(k2, k3);
  assert.equal(k1, await store2.get("user/u1/key_e1"));

  const store3 = memoryKeyStore();
  const [r1, r2, r3] = await Promise.all([
    ensureRecoveryRoot(store3, "u1"),
    ensureRecoveryRoot(store3, "u1"),
    ensureRecoveryRoot(store3, "u1"),
  ]);
  assert.deepEqual(r1, r2);
  assert.deepEqual(r2, r3);
  assert.deepEqual(r1, await store3.get("user/u1/root"));
});

test("a handled creation failure leaves no unhandled cleanup rejection and the next call can retry", async () => {
  const store = memoryKeyStore();
  const get = store.get;
  let fail = true;
  store.get = async (name) => {
    if (fail) { fail = false; throw new Error("keystore unavailable"); }
    return get(name);
  };
  await assert.rejects(getUserKey(store, "u_cleanup"), /keystore unavailable/);
  // Let Node deliver any unhandled rejection from the cleanup branch;
  // the test runner treats one as a failure even though the caller caught it.
  await new Promise((resolve) => setImmediate(resolve));
  const key = await getUserKey(store, "u_cleanup");
  assert.equal(await store.get("user/u_cleanup/key_e1"), key);
});

test("a stalled creator keeps its slot — the retry waits for the work, then adopts the stored winner", { timeout: 10000 }, async (t) => {
  _setStallMs(60);
  t.after(() => _setStallMs(30_000));
  const store = memoryKeyStore();
  const realGet = store.get;
  let gated = true, release;
  const gate = new Promise((r) => { release = r; });
  store.get = async (k) => {
    if (k === "device" && gated) { gated = false; await gate; }
    return realGet(k);
  };
  // Attempt A is inside the lock, stalled past its deadline in the
  // creator's read — the caller hears "stalled" but the WORK still
  // owns the slot.
  await assert.rejects(getDeviceIdentity(store), /device stalled/);
  // B queues behind A's still-running work; release A's gate so its
  // put lands before B's deadline — B must adopt, never regenerate.
  const bPromise = getDeviceIdentity(store);
  release();
  const b = await bPromise;
  const stored = await store.get("device");
  assert.ok(stored, "A's continuation never stored its winner");
  assert.equal(b.verify, stored.sig.publicKey,
    "the retry kept an identity nothing stored — the stalled creator's value must win");
});

/** A minimal Web Locks stand-in: serialized grants, `signal` aborts a
 *  queued request, and a held lock blocks until its callback settles. */
function fakeLockManager() {
  let held = false;
  const queue = [];
  const pump = () => {
    if (held) return;
    const e = queue.shift();
    if (!e) return;
    if (e.aborted) return pump();
    held = true;
    Promise.resolve().then(() => e.cb())
      .then(e.resolve, e.reject)
      .finally(() => { held = false; pump(); });
  };
  return {
    request(name, opts, cb) {
      if (typeof opts === "function") { cb = opts; opts = {}; }
      const e = { cb };
      const p = new Promise((res, rej) => {
        e.resolve = res; e.reject = rej;
        opts?.signal?.addEventListener("abort", () => {
          if (e.started) return;
          e.aborted = true;
          rej(new DOMException("The operation was aborted.", "AbortError"));
        }, { once: true });
      });
      queue.push(e); pump();
      return p;
    },
  };
}

test("an expired queued Web Lock request is cancelled — releasing the holder must not run it", { timeout: 10000 }, async (t) => {
  _setStallMs(50);
  t.after(() => _setStallMs(30_000));
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const locks = fakeLockManager();
  Object.defineProperty(globalThis, "navigator",
    { value: { locks }, configurable: true });
  t.after(() => Object.defineProperty(globalThis, "navigator", navDesc));
  // An unrelated holder occupies the lock — a queued request can only wait.
  let releaseHolder;
  const holderOut = new Promise((r) => { releaseHolder = r; });
  const holderDone = locks.request("pip-create:device", () => holderOut);
  const store = memoryKeyStore();
  await assert.rejects(getDeviceIdentity(store), /device stalled/);
  releaseHolder();                       // holder leaves — the expired
  await holderDone;                      // request must have been dropped
  await new Promise((r) => setImmediate(r));
  assert.equal(await store.get("device"), undefined,
    "the expired queued request ran its callback anyway");
  // The lock still works for a live caller.
  const id = await getDeviceIdentity(store);
  assert.ok(id.deviceId.startsWith("dev_"));
});

/** A minimal IndexedDB stand-in: explicit open grant, transactions the
 *  test completes or aborts by hand. */
function fakeIndexedDb() {
  const rows = new Map();
  const openReqs = [];
  const txs = [];
  const idb = {
    createObjectStore: () => ({}),
    transaction(name, mode) {
      const tx = { name, mode, aborted: false, completed: false, ops: [] };
      // Reads see committed state; writes stage and apply at commit —
      // like a real transaction, an aborted tx's writes never land.
      tx.objectStore = () => ({
        get: (k) => ({ result: rows.get(k) }),
        put: (v, k) => { tx.ops.push(() => rows.set(k, v)); return { result: undefined }; },
        delete: (k) => { tx.ops.push(() => rows.delete(k)); return { result: undefined }; },
        getAllKeys: () => ({ result: [...rows.keys()] }),
      });
      tx.commit = () => {
        if (!tx.aborted && !tx.completed) {
          tx.ops.forEach((fn) => fn());
          tx.completed = true; tx.oncomplete?.();
        }
      };
      tx.abort = () => {
        if (!tx.aborted && !tx.completed) { tx.aborted = true; tx.onabort?.(); }
      };
      txs.push(tx);
      return tx;
    },
  };
  const open = () => { const req = { result: idb }; openReqs.push(req); return req; };
  const grantOpen = () => openReqs.forEach((r) => { r.onupgradeneeded?.(); r.onsuccess?.(); });
  return { open, grantOpen, txs, rows };
}

test("a store write whose db never opens starts no transaction after its deadline", { timeout: 10000 }, async (t) => {
  _setStallMs(50);
  t.after(() => _setStallMs(30_000));
  const fake = fakeIndexedDb();
  globalThis.indexedDB = { open: fake.open };
  t.after(() => { delete globalThis.indexedDB; });
  const store = openKeyStore();
  await assert.rejects(store.put("k", "v"), /key store stalled/);
  fake.grantOpen();                      // the db resolves AFTER expiry
  await new Promise((r) => setImmediate(r));
  assert.equal(fake.txs.length, 0,
    "a transaction started after the caller's deadline");
  const live = store.put("k", "later");  // a live caller works fine
  await new Promise((r) => setImmediate(r));
  fake.txs.at(-1).commit();
  await live;
  assert.equal(fake.rows.get("k"), "later");
});

test("an open transaction is aborted at the deadline — a newer write wins", { timeout: 10000 }, async (t) => {
  _setStallMs(50);
  t.after(() => _setStallMs(30_000));
  const fake = fakeIndexedDb();
  globalThis.indexedDB = { open: fake.open };
  t.after(() => { delete globalThis.indexedDB; });
  const store = openKeyStore();
  const stalled = store.put("k", "stale");
  fake.grantOpen();
  await new Promise((r) => setImmediate(r));   // tx created, never completes
  assert.equal(fake.txs.length, 1);
  await assert.rejects(stalled, /key store stalled/);
  await new Promise((r) => setImmediate(r));
  const staleTx = fake.txs.at(-1);
  assert.equal(staleTx.aborted, true, "the timed-out transaction was not aborted");
  // The retry's write commits — the aborted one cannot resurrect it.
  const retry = store.put("k", "fresh");
  await new Promise((r) => setImmediate(r));
  fake.txs.at(-1).commit();
  await retry;
  staleTx.commit();                      // too late — already aborted
  assert.equal(fake.rows.get("k"), "fresh");
});
