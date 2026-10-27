/**
 * The Nest grant Works Test (founder 2026-10-27): every student an SLP adds
 * to SLP Nest gets Pip Lifetime free while the Nest knows the student code.
 * The Nest is the Nest's own handler (cross-repo on purpose, like
 * src/board/nest.test.mjs) and the relay is the real UserRelay on node:sqlite,
 * so the instrument is the Nest's student table and the relay's own gates —
 * not a mock of either answer.
 *
 * Run: scripts/test.sh src/worker/nest_grant.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { handleRequest as nestHandle } from "../../../SLPNest/src/worker/handleRequest.js";
import { fakeDbEnv } from "../../../SLPNest/src/worker/fake_db.mjs";
import { UserRelay } from "./relay.js";
import { licenseFor } from "./license.mjs";
import { handleNestRedeem, nestRecheck } from "./nest.mjs";
import { entitled } from "./trial.mjs";
import { recoveryProof } from "../../public/shared/recovery.mjs";
import {
  ensureRecoveryRoot, exportDhPublic, exportPublicKey,
  getDeviceIdentity, memoryKeyStore, signPayload,
} from "../../public/shared/sync_crypto.mjs";

const te = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const DAY = 24 * 60 * 60 * 1000;
const SECRET = "test-license-secret";
const CODE = "HZJRUG";

/** node:sqlite behind the Durable-Object sql.exec surface (as entitlement.test.mjs). */
function fakeCtx() {
  const db = new DatabaseSync(":memory:");
  let alarm = null;
  return {
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
      transactionSync: (fn) => fn(),
      getAlarm: async () => alarm,
      setAlarm: async (t) => { alarm = t; },
      deleteAlarm: async () => { alarm = null; },
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [],
    acceptWebSocket: () => {},
  };
}

/** The worker env: a real Nest behind NEST_FETCH and one relay per user id. */
function world() {
  const nest = fakeDbEnv();
  nest.students.set(CODE, { code: CODE, seat: "s", targets: "[]", created: "" });
  const relays = new Map();
  const sent = [];
  const env = {
    PIP_LICENSE_SECRET: SECRET,
    NEST_FETCH: async (url) => {
      sent.push(url);
      if (nest.down) throw new TypeError("fetch failed");
      return nestHandle(new Request(url), nest);
    },
    RELAY: {
      idFromName: (name) => name,
      get: (id) => {
        if (!relays.has(id)) relays.set(id, new UserRelay(fakeCtx(), env));
        return relays.get(id);
      },
    },
  };
  return { env, nest, sent };
}

/** A user whose device bootstrapped its relay (devices-ui ensureUser). */
async function deviceFor(env, userId) {
  const store = memoryKeyStore();
  const identity = await getDeviceIdentity(store);
  const proof = await recoveryProof(await ensureRecoveryRoot(store, userId));
  const res = await env.RELAY.get(userId).fetch(new Request(`https://relay/users/${userId}/bootstrap`, {
    method: "POST",
    body: JSON.stringify({ device_id: identity.deviceId, pubkey: await exportPublicKey(identity.verify),
      dh_pub: await exportDhPublic(identity.dh.publicKey), recovery_proof: proof }),
  }));
  assert.equal(res.status, 200);
  /** A request signed the way relayClient signs it. */
  return async (method, route, body) => {
    const bytes = body === undefined ? undefined : te.encode(JSON.stringify(body));
    const url = new URL(`https://relay/users/${userId}/${route}`);
    const ts = Date.now();
    const bodyHash = hex(await crypto.subtle.digest("SHA-256", bytes ?? new Uint8Array()));
    const sig = await signPayload(identity.sign, `${method}\n${url.pathname}\n${ts}\n${bodyHash}`);
    return env.RELAY.get(userId).fetch(new Request(url, {
      method, headers: { "x-pip-device": identity.deviceId, "x-pip-ts": String(ts), "x-pip-sig": sig }, body: bytes,
    }));
  };
}

const redeem = (env, userId, code) => handleNestRedeem(new Request("https://app.pipaac.test/api/v1/nest/redeem", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_id: userId, code }),
}), env);

const plan = async (signed) => (await (await signed("GET", "entitlement")).json());

test("an unknown code unlocks nothing", async () => {
  const { env, sent } = world();
  const uid = crypto.randomUUID();
  const signed = await deviceFor(env, uid);
  const res = await redeem(env, uid, "ABCDEF");
  assert.equal(res.status, 404);
  assert.equal((await plan(signed)).entitlement, "free");
  assert.equal(await entitled(env, uid, null), false);
  assert.deepEqual(sent, ["https://app.slpnest.com/api/students/ABCDEF/practice"], "only the code is sent");
  assert.equal((await redeem(env, uid, "not a code")).status, 404);
  assert.equal(sent.length, 1, "a malformed code never reaches the Nest");
});

test("a known code unlocks Pip Lifetime: the relay, the license copy and the paid gates agree", async () => {
  const { env } = world();
  const uid = crypto.randomUUID();
  const signed = await deviceFor(env, uid);
  assert.equal((await redeem(env, uid, CODE)).status, 200);
  const body = await plan(signed);
  assert.equal(body.entitlement, "lifetime");
  assert.equal(body.license, await licenseFor(SECRET, uid));
  assert.equal(await entitled(env, uid, body.license), true, "voice, transform and tile gates say yes");
  // The relay's own Lifetime gate: a second device may link.
  const other = await getDeviceIdentity(memoryKeyStore());
  const res = await signed("POST", "devices", { device_id: other.deviceId, pubkey: await exportPublicKey(other.verify) });
  assert.equal(res.status, 200);
});

test("after a successful check, a Nest outage keeps it; a forgotten code ends it", async () => {
  const { env, nest } = world();
  const uid = crypto.randomUUID();
  const signed = await deviceFor(env, uid);
  await redeem(env, uid, CODE);
  const { license } = await plan(signed);
  const relay = env.RELAY.get(uid);

  nest.down = true;
  await nestRecheck(relay, Date.now() + DAY + 1);
  assert.equal((await plan(signed)).entitlement, "lifetime");
  assert.equal(await entitled(env, uid, license), true);

  nest.down = false;
  nest.students.delete(CODE); // the SLP removed the student
  await nestRecheck(relay, Date.now() + 3 * DAY);
  const after = await plan(signed);
  assert.equal(after.entitlement, "free");
  assert.equal(after.payment_issue, "nest_ended");
  assert.equal(await entitled(env, uid, license), false, "the stored copy no longer unlocks");
  const again = await signed("POST", "entitlement", { license });
  assert.equal(again.status, 403, "re-presenting the copy does not re-grant");
  assert.equal((await again.json()).error, "payment_revoked");
});

test("a paid Lifetime outlasts a Nest grant on the same person", async () => {
  const { env, nest } = world();
  const uid = crypto.randomUUID();
  const signed = await deviceFor(env, uid);
  await env.RELAY.get(uid).fetch(new Request(`https://relay/users/${uid}/internal/entitlement`, {
    method: "POST", headers: { "x-pip-internal": SECRET }, body: JSON.stringify({ source: "stripe", ref: "cs_1" }),
  }));
  assert.equal((await redeem(env, uid, CODE)).status, 200);
  nest.students.delete(CODE);
  await nestRecheck(env.RELAY.get(uid), Date.now() + 3 * DAY);
  assert.equal((await plan(signed)).entitlement, "lifetime");
});
