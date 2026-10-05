/**
 * Deadline + cancellation seams (BOUNDED-FOLLOWUP-AUDIT P2): timedFetch
 * must bound the whole request — connection AND body — even where the
 * runtime has no AbortSignal.timeout, and a caller's own signal must
 * still cancel instead of being replaced.
 * Run: scripts/test.sh src/board/bounded.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { timedFetch } from "../../public/shared/bounded.mjs";

const realFetch = globalThis.fetch;
const restore = () => { globalThis.fetch = realFetch; };

/** A fetch that honors the abort signal but never resolves on its own. */
const stalledFetch = (url, init) => new Promise((_, rej) => {
  const signal = init?.signal;
  if (signal?.aborted) return rej(signal.reason);
  signal?.addEventListener("abort", () => rej(signal.reason), { once: true });
});

test("timedFetch resolves and the response is fully readable", async (t) => {
  t.after(restore);
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: 1 }), {
    status: 200, headers: { "content-type": "application/json" } });
  const res = await timedFetch("https://relay.invalid/ops", {}, 1000);
  assert.equal(res.ok, true);
  assert.deepEqual(await res.json(), { ok: 1 });
});

test("a stalled connection aborts at the deadline — no AbortSignal.timeout needed", async (t) => {
  t.after(restore);
  // Prove the fallback itself carries the bound: remove the native
  // helper for the duration of this test.
  const native = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  t.after(() => { AbortSignal.timeout = native; });
  globalThis.fetch = stalledFetch;
  await assert.rejects(timedFetch("https://relay.invalid/ops", {}, 40), /stalled|abort/i);
});

test("a caller signal that fires mid-request aborts the fetch", async (t) => {
  t.after(restore);
  globalThis.fetch = stalledFetch;
  const ctl = new AbortController();
  const p = timedFetch("https://relay.invalid/ops", { signal: ctl.signal }, 30_000);
  ctl.abort(new Error("caller cancelled"));
  await assert.rejects(p, /caller cancelled/);
});

test("an already-aborted caller signal still aborts", async (t) => {
  t.after(restore);
  globalThis.fetch = stalledFetch;
  const ctl = new AbortController();
  ctl.abort(new Error("dead on arrival"));
  await assert.rejects(
    timedFetch("https://relay.invalid/ops", { signal: ctl.signal }, 30_000),
    /dead on arrival/);
});

test("headers are not completion — a stalled body still hits the deadline", async (t) => {
  t.after(restore);
  let cancelled = false;
  globalThis.fetch = async () => ({
    status: 200, statusText: "OK", headers: new Headers(),
    // The body never arrives — this must not pin the caller forever.
    arrayBuffer: () => new Promise(() => {}),
    body: { cancel: () => { cancelled = true; return Promise.resolve(); } },
  });
  await assert.rejects(timedFetch("https://relay.invalid/ops", {}, 40), /stalled/);
  assert.equal(cancelled, true, "the stalled body was not cancelled");
});

test("a successful fetch still cleans up the deadline and caller wiring", async (t) => {
  t.after(restore);
  const ctl = new AbortController();
  let removed = false;
  const realRemove = ctl.signal.removeEventListener.bind(ctl.signal);
  ctl.signal.removeEventListener = (...a) => { removed = true; return realRemove(...a); };
  globalThis.fetch = async () => new Response("done", { status: 200 });
  const res = await timedFetch("https://relay.invalid/ops", { signal: ctl.signal }, 1000);
  assert.equal(await res.text(), "done");
  assert.equal(removed, true, "the caller's abort listener was left attached");
});
