/**
 * The supporter-invite wait shares pollPair with pairing: offline blips
 * retry, a permanent failure stops at once with invite-worded copy.
 * Also pins that devices-ui imports every helper it calls (a missing
 * import is a ReferenceError that no mocked poll can see).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pollPair, invitePollFailure } from "../../public/shared/sync_client.mjs";

const net = () => new TypeError("fetch failed");
const http = (status) => Object.assign(new Error(`http ${status}`), { status });
const GENERIC = "That invite didn't work. Ask them to send a new one.";

function fake(script) {
  const calls = [];
  return { calls, inviteStatus: async () => {
    calls.push(1);
    const next = script[Math.min(calls.length - 1, script.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  } };
}
const run = async (c, extra = {}) => {
  const sleeps = [];
  const r = await pollPair(async () => {
    const st = await c.inviteStatus();
    return st.status === "granted" ? st : undefined;
  }, { intervalMs: 2500, classify: invitePollFailure,
    sleep: async (ms) => { sleeps.push(ms); }, ...extra });
  return { ...r, sleeps };
};

test("offline and 5xx retry on the same cadence, then the grant arrives", async () => {
  const c = fake([net(), http(502), { status: "pending_allow" }, { status: "granted", grant: { id: "u" } }]);
  const r = await run(c);
  assert.equal(r.value.grant.id, "u");
  assert.equal(c.calls.length, 4);
  assert.deepEqual(r.sleeps, [2500, 2500, 2500, 2500]);
});

test("a permanent error stops within one poll with invite copy", async () => {
  for (const [err, msg] of [
    [http(400), GENERIC],
    [http(401), GENERIC],
    [http(404), "That invite isn't open any more. Ask them to send a new one."],
    [http(410), "That invite ran out. Ask them to send a new one."],
    [new Error("boom"), GENERIC],
  ]) {
    const c = fake([err]);
    const r = await run(c);
    assert.equal(r.error, msg);
    assert.equal(c.calls.length, 1);
  }
});

test("cancelling ends the wait quietly", async () => {
  const c = fake([{ status: "pending_allow" }]);
  let left = 2;
  const r = await run(c, { cancelled: () => --left < 0 });
  assert.equal(r.cancelled, true);
  assert.equal(c.calls.length, 2);
});

test("devices-ui imports pollPair and invitePollFailure from sync_client", () => {
  const src = readFileSync(new URL("../../public/board/devices-ui.js", import.meta.url), "utf8");
  const imp = src.match(/import \{([^}]*)\} from "\.\.\/shared\/sync_client\.mjs"/)?.[1] ?? "";
  for (const name of ["pollPair", "invitePollFailure", "pairClient"]) {
    assert.match(imp, new RegExp(`\\b${name}\\b`), `${name} not imported`);
  }
});
