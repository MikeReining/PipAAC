/**
 * The pairing wait (web devices-ui + iOS app_pair share pollPair): offline
 * blips retry, a permanent failure stops at once and says so in plain words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pollPair } from "../../public/shared/sync_client.mjs";

const net = () => new TypeError("fetch failed");
const http = (status) => Object.assign(new Error(`pair status: ${status}`), { status });
const GENERIC = "That code didn't work. Ask for a new code on the other device.";

/** A fake pairClient.status that plays a script, one entry per call. */
function fake(script) {
  const calls = [];
  return { calls, status: async (code) => {
    calls.push(code);
    const next = script[Math.min(calls.length - 1, script.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  } };
}
const run = async (c, extra = {}) => {
  const sleeps = [];
  const r = await pollPair(async () => {
    const st = await c.status("ABCD2345");
    return st.status === "granted" ? st : undefined;
  }, { intervalMs: 2000, sleep: async (ms) => { sleeps.push(ms); }, ...extra });
  return { ...r, sleeps };
};

test("network errors and 5xx keep retrying at the same cadence, then link", async () => {
  const c = fake([net(), http(503), { status: "pending" }, net(), { status: "granted", grant: { user_id: "u1" } }]);
  const r = await run(c);
  assert.equal(r.value.grant.user_id, "u1");
  assert.equal(c.calls.length, 5);
  assert.deepEqual(r.sleeps, [2000, 2000, 2000, 2000, 2000]);
});

test("a permanent error stops within one poll and says what to do", async () => {
  for (const [err, msg] of [
    [new Error("bad key grant"), GENERIC],
    [http(400), GENERIC],
    [http(404), "That code isn't open — check the letters, or make a new one."],
    [http(409), "That code was already used. Make a new one on the other device."],
  ]) {
    const c = fake([err]);
    const r = await run(c);
    assert.equal(r.error, msg);
    assert.equal(c.calls.length, 1);
  }
});

test("a step that throws after reading the grant (unwrap fails) also stops", async () => {
  let n = 0;
  const r = await pollPair(async () => { n++; throw new Error("OperationError"); },
    { sleep: async () => {} });
  assert.equal(n, 1);
  assert.equal(r.error, GENERIC);
});

test("the relay's expiry (410) is unchanged: it stops with the ran-out message", async () => {
  const c = fake([{ status: "pending" }, http(410)]);
  const r = await run(c);
  assert.equal(r.error, "That code ran out. Make a new one on the other device.");
  assert.equal(r.cause.status, 410);
  assert.equal(c.calls.length, 2);
});

test("cancelling ends the wait without a message", async () => {
  const c = fake([{ status: "pending" }]);
  let left = 3;
  const r = await run(c, { cancelled: () => --left < 0 });
  assert.equal(r.cancelled, true);
  assert.equal(r.error, undefined);
  assert.equal(c.calls.length, 3);
});
