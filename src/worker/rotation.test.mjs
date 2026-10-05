import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { UserRelay } from "./relay.js";
import { relayClient } from "../../public/shared/sync_client.mjs";
import {
  exportDhPublic, exportPublicKey, getDeviceIdentity, getUserKey, memoryKeyStore, newUserKey,
  openEpochBundle, openOp, retiredRootsName, sealOp, userRootName,
} from "../../public/shared/sync_crypto.mjs";
import { recoveryProof } from "../../public/shared/recovery.mjs";
import { replaceRecoveryCard, resumeRecoveryCard, rotationJournalName, completeRemovalRotation }
  from "../../public/shared/rotation.mjs";

async function fixture() {
  const raw = new DatabaseSync(":memory:");
  const objects = new Map();
  const ctx = {
    blockConcurrencyWhile: (fn) => fn(), getWebSockets: () => [],
    storage: {
      sql: { exec(sql, ...args) {
        if (sql.includes("CREATE TABLE")) { raw.exec(sql); return { toArray: () => [] }; }
        const rows = raw.prepare(sql).all(...args);
        return { toArray: () => rows };
      } },
      transactionSync(fn) {
        raw.exec("BEGIN");
        try { const value = fn(); raw.exec("COMMIT"); return value; }
        catch (err) { raw.exec("ROLLBACK"); throw err; }
      },
      getAlarm: async () => 1, setAlarm: async () => {},
    },
  };
  const env = { BLOBS: {
    put: async (k, v) => objects.set(k, v), delete: async (k) => objects.delete(k),
  } };
  const relay = new UserRelay(ctx, env);
  const store = memoryKeyStore();
  const identity = await getDeviceIdentity(store);
  const userId = crypto.randomUUID();
  await relay.fetch(new Request(`https://relay/users/${userId}/bootstrap`, {
    method: "POST", body: JSON.stringify({ device_id: identity.deviceId,
      pubkey: await exportPublicKey(identity.verify),
      dh_pub: await exportDhPublic(identity.dh.publicKey), recovery_proof: "old-proof" }),
  }));
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => relay.fetch(new Request(url, init));
  const client = relayClient({ userId, identity, userKey: await newUserKey(), baseUrl: "https://relay" });
  return { raw, relay, env, client, identity, store, userId,
    cleanup() { globalThis.fetch = previousFetch; raw.close(); } };
}

test("removal persists the rotation obligation before a client can disappear", async () => {
  const f = await fixture();
  try {
    f.raw.prepare("INSERT INTO device(device_id,pubkey,epoch,added_at) VALUES ('removed','x',1,1)").run();
    await f.client.removeDevice("removed");
    assert.equal((await f.client.selfKey()).rotate_min_epoch, 2);
  } finally { f.cleanup(); }
});

test("guarded card replacement publishes proof, bundle and epoch together; retry is idempotent", async () => {
  const f = await fixture();
  try {
    const rotation = { expected_proof: "old-proof", epoch: 2,
      wrapped: { [f.identity.deviceId]: { wrapped: "new-key" } } };
    await f.client.replaceRecovery("new-proof", "sealed-bundle", rotation);
    assert.equal(f.relay.epoch(), 2);
    assert.equal(f.relay.metaGet("recovery_proof"), "new-proof");
    assert.equal(f.relay.metaGet("recovery_bundle"), "sealed-bundle");
    await f.client.replaceRecovery("new-proof", "sealed-bundle", rotation);
    assert.equal(f.relay.epoch(), 2, "response-loss retry must not rotate again");
    await assert.rejects(f.client.replaceRecovery("competitor", "bundle", rotation), /recovery_conflict/);
    assert.equal(f.relay.metaGet("recovery_proof"), "new-proof");
  } finally { f.cleanup(); }
});

test("supporter revocation records rotation, and a failed grant write rolls back card publication", async () => {
  const f = await fixture();
  try {
    f.raw.prepare("INSERT INTO supporter(acct_id,email,added_at,owner) VALUES ('team','',1,0)").run();
    f.raw.prepare("INSERT INTO device(device_id,pubkey,epoch,added_at,via_acct) VALUES ('team-device','x',1,1,'team')").run();
    await f.client.removeSupporter("team");
    assert.equal((await f.client.selfKey()).rotate_min_epoch, 2);
    assert.equal(f.raw.prepare("SELECT COUNT(*) AS n FROM device WHERE device_id='team-device'").get().n, 0);
    const sql = f.relay.ctx.storage.sql;
    const exec = sql.exec;
    sql.exec = (query, ...values) => {
      if (query.includes("INSERT OR REPLACE INTO device_key")) throw new Error("grant write failed");
      return exec(query, ...values);
    };
    await assert.rejects(f.client.replaceRecovery("new-proof", "bundle", {
      expected_proof: "old-proof", epoch: 2, wrapped: { [f.identity.deviceId]: { wrapped: "key" } },
    }), /grant write failed/);
    sql.exec = exec;
    assert.equal(f.relay.epoch(), 1);
    assert.equal(f.relay.metaGet("recovery_proof"), "old-proof");
    assert.equal(f.relay.metaGet("recovery_bundle"), null);
    assert.equal(f.relay.metaGet("rotate_min_epoch"), "2");
  } finally { f.cleanup(); }
});

test("an explicitly stale sealing epoch is refused before it enters the op log", async () => {
  const f = await fixture();
  try {
    await f.client.rotateKeys(2, {});
    await assert.rejects(f.client.submit([{ op_id: "stale", kind: "x" }], 1), /bad_epoch/);
    assert.equal(f.raw.prepare("SELECT COUNT(*) AS n FROM op").get().n, 0);
  } finally { f.cleanup(); }
});

test("card publication survives an interrupted proof-index write and refuses incomplete grants", async () => {
  const f = await fixture();
  try {
    const rotation = { expected_proof: "old-proof", epoch: 2, wrapped: {} };
    await assert.rejects(f.client.replaceRecovery("new-proof", "bundle", rotation), /devices_changed/);
    assert.equal(f.relay.metaGet("recovery_proof"), "old-proof");
    rotation.wrapped[f.identity.deviceId] = { wrapped: "key" };
    const put = f.env.BLOBS.put;
    f.env.BLOBS.put = async () => { throw new Error("R2 unavailable"); };
    await assert.rejects(f.client.replaceRecovery("new-proof", "bundle", rotation), /R2 unavailable/);
    assert.equal(f.relay.epoch(), 2, "proof and epoch must remain a matching committed pair");
    assert.equal(f.relay.metaGet("recovery_proof"), "new-proof");
    f.env.BLOBS.put = put;
    await f.client.replaceRecovery("new-proof", "bundle", rotation);
    assert.equal(f.relay.epoch(), 2, "index repair must not reapply rotation");
  } finally { f.cleanup(); }
});

test("card replacement resumes after each durable step and a lost relay response", async () => {
  for (const stop of ["journal", "response", "retire", "root", "key", "registry", "rekey", "delete"]) {
    const f = await fixture();
    try {
      const root = crypto.getRandomValues(new Uint8Array(16));
      await f.store.put(userRootName(f.userId), root);
      f.relay.metaSet("recovery_proof", await recoveryProof(root));
      const oldOp = { op_id: "before", kind: "x" };
      const oldEnvelope = await sealOp(await getUserKey(f.store, f.userId, 1), oldOp);
      const user = { id: f.userId, sync: { userId: f.userId, epoch: 1, cursor: 17 } };
      let interrupted = false, activeEpoch = 1;
      const kill = (point) => {
        if (!interrupted && point === stop) { interrupted = true; throw new Error(`killed after ${point}`); }
      };
      const store = { get: f.store.get,
        async put(name, value) {
          await f.store.put(name, value);
          kill(name === rotationJournalName(user.id) ? "journal"
            : name === retiredRootsName(user.id) ? "retire"
            : name === userRootName(user.id) ? "root"
            : name.endsWith("key_e2") ? "key" : "other");
        },
        async del(name) { await f.store.del(name); kill("delete"); },
      };
      const client = { ...f.client, async replaceRecovery(...args) {
        const result = await f.client.replaceRecovery(...args);
        kill("response"); return result;
      } };
      const args = { store, user, client,
        async saveUser(patch) { Object.assign(user, patch); kill("registry"); },
        async rekey(epoch) { activeEpoch = epoch; kill("rekey"); },
      };
      await assert.rejects(replaceRecoveryCard(args), /killed after/);
      assert.ok(interrupted, `fault seam ${stop} was never reached`);
      // Fresh handle, same persistent bytes: it must resume the staged card,
      // including when the server committed but its acknowledgment was lost.
      await resumeRecoveryCard({ ...args, store: f.store, client: f.client });
      const currentRoot = await f.store.get(userRootName(user.id));
      assert.equal(f.relay.metaGet("recovery_proof"), await recoveryProof(currentRoot), stop);
      assert.equal(f.relay.epoch(), 2, `${stop}: retry rotated more than once`);
      assert.equal(user.sync.epoch, 2, stop);
      assert.equal(user.sync.cursor, 17, "rotation must preserve fetched coverage");
      assert.equal(activeEpoch, 2, `${stop}: outgoing client never rekeyed`);
      assert.equal(await f.store.get(rotationJournalName(user.id)), undefined, stop);
      assert.equal(JSON.parse(await f.store.get(retiredRootsName(user.id))).length, 1, stop);
      // Independent fresh-card store: the relay's published bundle really
      // decrypts the pre-replacement bytes, and its new root opens current bytes.
      const fresh = memoryKeyStore();
      await fresh.put(userRootName(user.id), currentRoot);
      const oldKeys = await openEpochBundle(currentRoot, f.relay.metaGet("recovery_bundle"));
      assert.deepEqual(await openOp(oldKeys[1], oldEnvelope), oldOp, stop);
      const newEnvelope = await sealOp(await getUserKey(f.store, user.id, 2), { after: true });
      assert.deepEqual(await openOp(await getUserKey(fresh, user.id, 2), newEnvelope), { after: true }, stop);
    } finally { f.cleanup(); }
  }
});

test("removal resumes after a lost key-rotation response; a retired root cannot rotate again", async () => {
  const f = await fixture();
  try {
    const root = crypto.getRandomValues(new Uint8Array(16));
    await f.store.put(userRootName(f.userId), root);
    f.relay.metaSet("recovery_proof", await recoveryProof(root));
    const user = { id: f.userId, sync: { epoch: 1 } };
    await f.client.removeDevice("removed");
    const args = { store: f.store, user, client: { ...f.client,
      async rotateKeys(...values) { await f.client.rotateKeys(...values); throw new Error("lost response"); } },
      async saveUser(patch) { Object.assign(user, patch); }, async rekey() {},
    };
    await assert.rejects(completeRemovalRotation(args), /lost response/);
    assert.equal(f.relay.epoch(), 2);
    assert.ok((await f.client.selfKey()).wrapped_keys[2], "the returning device has a durable key grant");
    await completeRemovalRotation({ ...args, client: f.client });
    assert.equal(f.relay.epoch(), 2, "a completed removal must not mint another epoch");
    f.relay.metaSet("recovery_proof", "someone-else-replaced-it");
    await f.client.requestRotation();
    await assert.rejects(completeRemovalRotation({ ...args, client: f.client }), /changed on another device/);
    assert.equal(f.relay.epoch(), 2);
  } finally { f.cleanup(); }
});
