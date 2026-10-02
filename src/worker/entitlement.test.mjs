/**
 * 011 slice 9 Works Test — free vs Lifetime, restore-move, retention.
 * UserRelay is a plain class: this file drives it directly against a
 * real SQLite (node:sqlite) and a fake R2, so the cap, the move, the
 * license check, and the sweep are the relay's own code — no mocks of
 * the logic under test.
 *
 * Run: scripts/test.sh src/worker/entitlement.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { UserRelay } from "./relay.js";
import { licenseFor } from "./license.mjs";
import { recoveryProof } from "../../public/shared/recovery.mjs";
import {
  ensureRecoveryRoot, exportDhPublic, exportPublicKey,
  getDeviceIdentity, memoryKeyStore, signPayload,
} from "../../public/shared/sync_crypto.mjs";

const te = new TextEncoder();
const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const DAY = 24 * 60 * 60 * 1000;
const SECRET = "test-license-secret";

/** node:sqlite behind the Durable-Object sql.exec surface. */
function fakeCtx() {
  const db = new DatabaseSync(":memory:");
  let alarm = null;
  const ctx = {
    storage: {
      sql: {
        exec: (q, ...params) => {
          const reads = /^\s*(SELECT|WITH)/i.test(q) || /RETURNING/i.test(q);
          if (reads || params.length) {
            const st = db.prepare(q);
            const rows = reads ? st.all(...params) : (st.run(...params), []);
            return { toArray: () => rows };
          }
          db.exec(q);
          return { toArray: () => [] };
        },
      },
      deleteAll: async () => {
        db.exec("DELETE FROM device; DELETE FROM op; DELETE FROM meta;");
      },
      getAlarm: async () => alarm,
      setAlarm: async (t) => { alarm = t; },
      deleteAlarm: async () => { alarm = null; },
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [],
    acceptWebSocket: () => {},
    _db: db,
    _alarm: () => alarm,
  };
  return ctx;
}

function fakeEnv() {
  const blobs = new Map();
  const sentMail = [];
  return {
    PIP_LICENSE_SECRET: SECRET,
    EMAIL: { send: async (msg) => void sentMail.push(msg) },
    _sentMail: sentMail,
    BLOBS: {
      put: async (k, v) => void blobs.set(k, v),
      get: async (k) => (blobs.has(k) ? { body: blobs.get(k) } : null),
      delete: async (k) => void blobs.delete(k),
      list: async ({ prefix }) => ({
        objects: [...blobs.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ key: k })),
      }),
    },
    _blobs: blobs,
  };
}

const newDevice = async () => {
  const store = memoryKeyStore();
  const identity = await getDeviceIdentity(store);
  return { store, identity, device_id: identity.deviceId,
    pubkey: await exportPublicKey(identity.verify),
    dh_pub: await exportDhPublic(identity.dh.publicKey) };
};

/** A signed request the way relayClient builds it — the signature
 *  covers pathname only, never the query. */
const signed = async (identity, method, path, body) => {
  const bytes = body === undefined ? undefined : te.encode(JSON.stringify(body));
  const url = new URL(`https://relay${path}`);
  const ts = Date.now();
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", bytes ?? new Uint8Array()));
  const sig = await signPayload(identity.sign, `${method}\n${url.pathname}\n${ts}\n${bodyHash}`);
  return new Request(url, {
    method,
    headers: { "x-pip-device": identity.deviceId, "x-pip-ts": String(ts), "x-pip-sig": sig },
    body: bytes,
  });
};

async function userAt(userId) {
  const ctx = fakeCtx();
  const env = fakeEnv();
  const relay = new UserRelay(ctx, env);
  const dev = await newDevice();
  const root = await ensureRecoveryRoot(dev.store, userId);
  const proof = await recoveryProof(root);
  const res = await relay.fetch(new Request(`https://relay/users/${userId}/bootstrap`, {
    method: "POST",
    body: JSON.stringify({ device_id: dev.device_id, pubkey: dev.pubkey,
      dh_pub: dev.dh_pub, recovery_proof: proof }),
  }));
  assert.equal(res.status, 200);
  return { relay, ctx, env, dev, proof, userId };
}

test("bootstrap refuses an already-initialized user (015 slice 2)", async () => {
  // POST /users accepts a client-chosen id (the registry id), so the
  // relay must not let a caller re-bootstrap an existing user — that
  // would graft a stranger's device onto it.
  const userId = "user-hijack";
  const { relay } = await userAt(userId);
  const stranger = await newDevice();
  const res = await relay.fetch(new Request(`https://relay/users/${userId}/bootstrap`, {
    method: "POST",
    body: JSON.stringify({ device_id: stranger.device_id, pubkey: stranger.pubkey,
      dh_pub: stranger.dh_pub, recovery_proof: "forged" }),
  }));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "conflict");
});

test("free user: the relay refuses a second device; lifetime allows it", async () => {
  const userId = "user-cap";
  const { relay, dev, proof } = await userAt(userId);
  const p = `/users/${userId}`;
  const other = await newDevice();

  // Second device on a free user — refused by the relay, not the UI.
  let res = await relay.fetch(await signed(dev.identity, "POST", `${p}/devices`, {
    device_id: other.device_id, pubkey: other.pubkey, dh_pub: other.dh_pub }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "upgrade_required");

  // Re-registering the SAME device is not a second device.
  res = await relay.fetch(await signed(dev.identity, "POST", `${p}/devices`, {
    device_id: dev.device_id, pubkey: dev.pubkey }));
  assert.equal(res.status, 200);

  // A bad license does not change anything.
  res = await relay.fetch(await signed(dev.identity, "POST", `${p}/entitlement`, {
    license: "pip-life-forged" }));
  assert.equal(res.status, 403);

  // The real license does — and now the second device registers.
  const license = await licenseFor(SECRET, userId);
  res = await relay.fetch(await signed(dev.identity, "POST", `${p}/entitlement`, { license }));
  assert.equal((await res.json()).entitlement, "lifetime");
  res = await relay.fetch(await signed(dev.identity, "POST", `${p}/devices`, {
    device_id: other.device_id, pubkey: other.pubkey, dh_pub: other.dh_pub }));
  assert.equal(res.status, 200);
});

test("restore on a free user moves the user; lifetime keeps every device", async () => {
  // Free: the restoring device replaces the whole set.
  let userId = "user-free-move";
  let { relay, dev, proof } = await userAt(userId);
  let newcomer = await newDevice();
  let res = await relay.fetch(new Request(`https://relay/users/${userId}/restore`, {
    method: "POST",
    body: JSON.stringify({ device_id: newcomer.device_id, pubkey: newcomer.pubkey,
      dh_pub: newcomer.dh_pub, proof }),
  }));
  assert.equal(res.status, 200);
  let self = await relay.fetch(await signed(
    newcomer.identity, "GET", `/users/${userId}/devices`, undefined));
  assert.deepEqual((await self.json()).devices.map((d) => d.device_id),
    [newcomer.device_id], "free restore must unlink the old device");

  // Lifetime: restore adds, it does not evict.
  userId = "user-life-move";
  ({ relay, dev, proof } = await userAt(userId));
  const license = await licenseFor(SECRET, userId);
  await relay.fetch(await signed(dev.identity, "POST", `/users/${userId}/entitlement`, { license }));
  newcomer = await newDevice();
  await relay.fetch(new Request(`https://relay/users/${userId}/restore`, {
    method: "POST",
    body: JSON.stringify({ device_id: newcomer.device_id, pubkey: newcomer.pubkey,
      dh_pub: newcomer.dh_pub, proof }),
  }));
  res = await relay.fetch(await signed(
    dev.identity, "GET", `/users/${userId}/devices`, undefined));
  assert.equal((await res.json()).devices.length, 2);
});

test("retention: nothing deletes a user but the two § 11 causes", async () => {
  const userId = "user-retention";
  const { relay, ctx, env, dev } = await userAt(userId);
  const setSeen = (msAgo) => ctx._db.prepare(
    "UPDATE meta SET v = ? WHERE k = 'last_seen'").run(String(Date.now() - msAgo));
  const boardRows = () =>
    ctx._db.prepare("SELECT COUNT(*) AS n FROM device").get().n +
    ctx._db.prepare("SELECT COUNT(*) AS n FROM meta").get().n;

  // A user whose entitlement never existed keeps its blobs — the sweep
  // only looks at timestamps, never at payment.
  await env.BLOBS.put(`b/${userId}/abc`, te.encode("x"));
  await env.BLOBS.put(`s/${userId}`, te.encode("snap"));

  // 2 years 11 months: survives — inside the warning window.
  setSeen(2 * 365 * DAY + 11 * 30 * DAY);
  let out = await relay.retentionSweep(Date.now());
  assert.equal(out.destroyed, false, "2y11m user deleted");
  assert.equal(out.warned, true, "returning device not warned");
  assert.ok(boardRows() > 0);

  // A returning device sees the deadline on its own row.
  let res = await relay.fetch(await signed(
    dev.identity, "GET", `/users/${userId}/devices/self`, undefined));
  let self = await res.json();
  assert.ok(self.idle_delete_at > Date.now(), "no idle warning on self");

  // The refresh itself pushed the deadline out — sweep again, quiet.
  out = await relay.retentionSweep(Date.now());
  assert.equal(out.warned, false);

  // Slice 7: inside the window the supporters get one email per idle
  // streak — two supporters here, none earlier in this test.
  ctx._db.prepare(
    "INSERT INTO supporter (acct_id, email, added_at) VALUES ('a1', 's@example.com', 1)",
  ).run();
  ctx._db.prepare(
    "INSERT INTO supporter (acct_id, email, added_at) VALUES ('a2', 't@example.com', 1)",
  ).run();
  setSeen(2 * 365 * DAY + 11 * 30 * DAY);
  out = await relay.retentionSweep(Date.now());
  assert.equal(out.emailed, 2, "supporters not emailed");
  assert.equal(env._sentMail.length, 2);
  assert.ok(String(env._sentMail[0]).includes("s@example.com"));
  assert.ok(String(env._sentMail[0]).includes("days"));

  // The daily alarm does not re-mail the same streak.
  out = await relay.retentionSweep(Date.now() + DAY);
  assert.equal(out.emailed, 0, "same streak mailed twice");
  assert.equal(env._sentMail.length, 2);

  // A returning device ends the streak; the next one warns again.
  await relay.fetch(await signed(
    dev.identity, "GET", `/users/${userId}/devices/self`, undefined));
  setSeen(2 * 365 * DAY + 11 * 30 * DAY);
  out = await relay.retentionSweep(Date.now());
  assert.equal(out.emailed, 2, "a new idle streak did not re-warn");
  assert.equal(env._sentMail.length, 4);

  // 3 years + a day: gone — storage and blobs together.
  setSeen(3 * 365 * DAY + DAY);
  out = await relay.retentionSweep(Date.now());
  assert.equal(out.destroyed, true, "3y user survived");
  assert.equal(boardRows(), 0);
  assert.equal(env._blobs.has(`b/${userId}/abc`), false);
  assert.equal(env._blobs.has(`s/${userId}`), false);
});

test("requested deletion: 30-day undo window, then gone", async () => {
  const userId = "user-delete";
  const { relay, ctx, dev } = await userAt(userId);
  const p = `/users/${userId}`;

  // Request → scheduled; user still works.
  let res = await relay.fetch(await signed(dev.identity, "DELETE", p, undefined));
  const { delete_at } = await res.json();
  assert.ok(delete_at > Date.now());
  let out = await relay.retentionSweep(Date.now());
  assert.equal(out.destroyed, false, "deleted inside the undo window");
  res = await relay.fetch(await signed(dev.identity, "GET", `${p}/devices/self`, undefined));
  assert.equal((await res.json()).delete_at, delete_at);

  // Undo clears it outright.
  res = await relay.fetch(await signed(dev.identity, "POST", `${p}/undelete`, {}));
  assert.equal(res.status, 200);
  res = await relay.fetch(await signed(dev.identity, "GET", `${p}/devices/self`, undefined));
  assert.equal((await res.json()).delete_at, undefined);

  // Re-request, then time travel past the date → destroyed.
  await relay.fetch(await signed(dev.identity, "DELETE", p, undefined));
  const past = Date.now() + 31 * DAY;
  out = await relay.retentionSweep(past);
  assert.equal(out.destroyed, true);
});

test("op pruning follows the snapshot, never entitlement", async () => {
  const userId = "user-prune";
  const { relay, ctx, dev } = await userAt(userId);
  const p = `/users/${userId}`;
  const old = Date.now() - 31 * DAY;
  // Three ops; backdate them all.
  for (const id of ["a", "b", "c"]) {
    await relay.fetch(await signed(dev.identity, "POST", `${p}/ops`,
      { ops: [{ op_id: id, env: { e: 1 } }] }));
  }
  ctx._db.prepare("UPDATE op SET created_at = ?").run(old);
  // Snapshot covers the first two ops.
  await relay.fetch(await signed(
    dev.identity, "PUT", `${p}/snapshot?seq=2`, undefined));
  const out = await relay.retentionSweep(Date.now());
  assert.equal(out.pruned, 2, "snapshot-covered ops not pruned");
  const left = ctx._db.prepare("SELECT op_id FROM op ORDER BY relay_seq").all();
  assert.deepEqual(left.map((r) => r.op_id), ["c"], "op beyond snapshot pruned");
});

test("owner and team: team edits, reads and may buy; only owners manage people, devices, deletion", async () => {
  // Founder 2026-09-28: an Owner, and a Team that can edit everything
  // except deleting the board and managing people. Founder 2026-10-02:
  // anyone may buy — the license belongs to the user. The relay — not
  // the UI — refuses the owner-only calls.
  const userId = "user-owner";
  const { relay, dev: a } = await userAt(userId);
  const p = `/users/${userId}`;
  const call = async (who, method, path, body) =>
    relay.fetch(await signed(who.identity, method, `${p}${path}`, body));
  const self = async (who) => (await (await call(who, "GET", "/devices/self")).json()).owner;
  const join = async (token) => {
    const d = await newDevice();
    const res = await relay.fetch(new Request(`https://relay${p}/devices`, {
      method: "POST",
      body: JSON.stringify({ join_token: token, device_id: d.device_id, pubkey: d.pubkey, dh_pub: d.dh_pub }),
    }));
    assert.equal(res.status, 200);
    return d;
  };

  // The creator is an owner; the license needs one.
  assert.equal(await self(a), true);
  let res = await call(a, "POST", "/entitlement", { license: await licenseFor(SECRET, userId) });
  assert.equal(res.status, 200);

  // Invite = team: the SLP account joins through a tagged token.
  assert.equal((await call(a, "POST", "/supporters", { acct_id: "acct_slp", email: "s@x.org" })).status, 200);
  const { tokens } = await (await call(a, "POST", "/join_tokens", { n: 2, for_acct: "acct_slp" })).json();
  const s = await join(tokens[0]);
  assert.equal(await self(s), false);
  assert.equal((await (await call(a, "GET", "/supporters")).json()).supporters[0].owner, false);

  // Team reads and lists like anyone on the board…
  assert.equal((await call(s, "GET", "/devices")).status, 200);
  assert.equal((await call(s, "GET", "/supporters")).status, 200);
  // …and every owner-only call is refused by the relay.
  for (const [m, path, body] of [
    ["DELETE", ""],
    ["POST", "/undelete", {}],
    ["DELETE", `/devices/${a.device_id}`],
    ["DELETE", "/supporters/acct_slp"],
    ["POST", "/supporters", { acct_id: "acct_x" }],
    ["POST", "/supporters/acct_slp/owner", { owner: true }],
    ["POST", "/devices", { device_id: "d", pubkey: "k" }],
    ["POST", "/keys", { epoch: 9, wrapped: {} }],
    ["POST", "/recovery", { recovery_proof: "x" }],
  ]) {
    res = await call(s, m, path, body);
    assert.equal(res.status, 403, `${m} ${path} should be owner-only`);
    assert.equal((await res.json()).error, "owner_only");
  }
  // Team may activate Pip Lifetime: a bad key is refused on its merits
  // (bad_license, not owner_only), a real one is accepted.
  res = await call(s, "POST", "/entitlement", { license: "x" });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "bad_license");
  res = await call(s, "POST", "/entitlement", { license: await licenseFor(SECRET, userId) });
  assert.equal(res.status, 200);

  // A team device's join tokens carry its account: the next device it
  // brings is team too, never an untagged owner.
  const own = await (await call(s, "POST", "/join_tokens", { n: 1 })).json();
  const s2 = await join(own.tokens[0]);
  assert.equal(await self(s2), false);

  // An owner makes the account an owner; its devices follow.
  assert.equal((await call(a, "POST", "/supporters/acct_slp/owner", { owner: true })).status, 200);
  assert.equal(await self(s), true);
  assert.equal(await self(s2), true);

  // The last owner stays: once A's device is gone, acct_slp can't be
  // demoted or removed.
  assert.equal((await call(s, "DELETE", `/devices/${a.device_id}`)).status, 200);
  res = await call(s, "POST", "/supporters/acct_slp/owner", { owner: false });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "last_owner");
  assert.equal((await call(s, "DELETE", "/supporters/acct_slp")).status, 409);
});
