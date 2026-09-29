/**
 * 028 slice 2 Works Tests — the client's tile-voice pipeline
 * (voice_tile.mjs). Cache Storage and fetch are faked like the
 * voice_sentence harness; the queue rides the same fake so offline and
 * budget retries are measured, not asserted from code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  armUtcRollRetry, msUntilUtcDayRoll,
  tileCacheUrl, tileStateBadge, tileStateMessage, tileTextHash, voiceTile,
} from "../../public/shared/voice_tile.mjs";

const fakeCaches = () => {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      const k = (u) => (typeof u === "string" ? u : u.url);
      return {
        match: async (u) => (m.has(k(u)) ? new Response(m.get(k(u))) : undefined),
        put: async (u, res) => { m.set(k(u), await res.blob()); },
        delete: async (u) => m.delete(k(u)),
        keys: async () => [...m.keys()].map((u) => new Request(u)),
      };
    },
  };
};

const withEnv = async (fn, { fetchImpl } = {}) => {
  const oldCaches = globalThis.caches;
  const oldFetch = globalThis.fetch;
  globalThis.caches = fakeCaches();
  globalThis.fetch = fetchImpl ?? (async () => new Response(new Blob(["AUDIO"])));
  try { await fn(); } finally {
    if (oldCaches === undefined) delete globalThis.caches;
    else globalThis.caches = oldCaches;
    globalThis.fetch = oldFetch;
  }
};

const ARGS = {
  userId: "u-1", license: "pip-life-x",
  voice: "voi_default_en", locale: "en", text: "scientist",
};
const okAudio = (body = "AUDIO") =>
  new Response(new Blob([body]), {
    status: 200, headers: { "x-tile-cache": "mint", "x-tile-version": "1" },
  });

test("cache key is the ledger key: normalized text under tile/<voice>", async () => {
  assert.equal(
    await tileCacheUrl("voi_default_en", "  Scientist "),
    await tileCacheUrl("voi_default_en", "scientist"));
  assert.notEqual(
    await tileCacheUrl("voi_leo_en", "scientist"),
    await tileCacheUrl("voi_default_en", "scientist"));
  assert.match(await tileCacheUrl("voi_default_en", "scientist"),
    /^https:\/\/voice\.local\/tile\/voi_default_en\/[0-9a-f]{64}$/);
  assert.equal((await tileTextHash("Scientist")), (await tileTextHash("scientist")));
});

test("miss posts once, stores, and a normalization variant hits", async () => {
  await withEnv(async () => {
    const bodies = [];
    globalThis.fetch = async (u, init) => {
      bodies.push(JSON.parse(init.body));
      return okAudio();
    };
    const vt = voiceTile();
    const r1 = await vt.request(ARGS);
    assert.equal(r1.ok, true);
    assert.equal(await r1.blob.text(), "AUDIO");
    assert.equal(bodies.length, 1);
    assert.deepEqual(
      { voice: bodies[0].voice, locale: bodies[0].locale,
        text: bodies[0].text, source: bodies[0].source },
      { voice: "voi_default_en", locale: "en", text: "scientist", source: "user_typed" });
    const r2 = await vt.request({ ...ARGS, text: "  Scientist " });
    assert.equal(r2.ok, true);
    assert.equal(r2.cache, "hit");
    assert.equal(bodies.length, 1);
  });
});

test("deadline means silence-now, but the fill lands for the next tap", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await withEnv(async () => {
    globalThis.fetch = async () => { await gate; return okAudio("LATE"); };
    const vt = voiceTile({ deadlineMs: 20 });
    const r = await vt.request(ARGS);
    assert.deepEqual(r, { ok: false, reason: "deadline" });
    release();
    await new Promise((res) => setTimeout(res, 30));
    const r2 = await vt.request(ARGS);
    assert.equal(r2.ok, true);
    assert.equal(await r2.blob.text(), "LATE");
  });
});

test("status mapping: held, withheld, budget, failed", async () => {
  await withEnv(async () => {
    const cases = [
      [422, { held: "locale" }, "held"],
      [409, { error: "withheld" }, "withheld"],
      [429, { error: "fair_use", over: "day" }, "budget"],
      [503, { error: "budget" }, "budget"],
      [503, { error: "voice_unavailable" }, "unavailable"],
      [502, { error: "mint_failed" }, "failed"],
      [403, { error: "bad_license" }, "denied"],
    ];
    for (const [status, body, reason] of cases) {
      globalThis.fetch = async () =>
        new Response(JSON.stringify(body), { status });
      const vt = voiceTile({ cacheName: `t-${status}` });
      const r = await vt.request(ARGS);
      assert.equal(r.ok, false, `status ${status}`);
      assert.equal(r.reason, reason, `status ${status}`);
    }
  });
});

test("concurrent requests share one fetch — the child's own single flight", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; await gate; return okAudio(); };
    const vt = voiceTile({ deadlineMs: null });
    const ps = Array.from({ length: 5 }, () => vt.request(ARGS));
    release();
    const rs = await Promise.all(ps);
    for (const r of rs) assert.equal(r.ok, true);
    assert.equal(calls, 1);
  });
});

test("ensure tracks state, reports to listeners, and never queues held", async () => {
  await withEnv(async () => {
    const vt = voiceTile();
    const seen = [];
    vt.onStatus((key, state) => seen.push([key, state]));
    globalThis.fetch = async () => okAudio();
    const r = await vt.ensure(ARGS);
    assert.equal(r.ok, true);
    assert.equal(vt.status("voi_default_en", "scientist"), "ready");
    assert.deepEqual(seen.flatMap(([, s]) => s), ["minting", "ready"]);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ held: "locale" }), { status: 422 });
    const r2 = await vt.ensure({ ...ARGS, text: "gato", locale: "es" });
    assert.equal(r2.reason, "held");
    assert.equal(vt.status("voi_default_en", "gato"), "held");
    // held is final — nothing was queued for retry
    const q = await (await globalThis.caches.open("pip-tile-queue")).keys();
    assert.equal(q.length, 0);
  });
});

test("offline ensure queues; drain retries it once online", async () => {
  await withEnv(async () => {
    const vt = voiceTile();
    globalThis.fetch = async () => { throw new TypeError("offline"); };
    const r = await vt.ensure(ARGS);
    assert.equal(r.reason, "offline");
    assert.equal(vt.status("voi_default_en", "scientist"), "offline");
    const q1 = await (await globalThis.caches.open("pip-tile-queue")).keys();
    assert.equal(q1.length, 1);

    // Still offline: the entry stays queued.
    const d1 = await vt.drainQueue({ userId: "u-1", license: "x" });
    assert.equal(d1.pending, 1);

    // Back online: one fetch, entry gone, state ready.
    let calls = 0;
    globalThis.fetch = async () => { calls++; return okAudio(); };
    const d2 = await vt.drainQueue({ userId: "u-1", license: "x" });
    assert.equal(d2.done, 1);
    assert.equal(calls, 1);
    const q2 = await (await globalThis.caches.open("pip-tile-queue")).keys();
    assert.equal(q2.length, 0);
    assert.equal(vt.status("voi_default_en", "scientist"), "ready");
    // The clip is now cached — a tap plays without a fetch.
    const r2 = await vt.request(ARGS);
    assert.equal(r2.ok, true);
    assert.equal(calls, 1);
  });
});

test("prefetch skips cached, mints missing, and stops at the budget wall", async () => {
  await withEnv(async () => {
    const seen = [];
    globalThis.fetch = async (u, init) => {
      const b = JSON.parse(init.body);
      seen.push(b.text);
      if (b.text === "delta") {
        return new Response(JSON.stringify({ error: "budget" }), { status: 503 });
      }
      return okAudio(`A:${b.text}`);
    };
    const vt = voiceTile();
    await vt.remember("voi_default_en", "alpha", new Blob(["CACHED"]));
    const prog = [];
    const res = await vt.prefetch({
      userId: "u-1", license: "x", voice: "voi_default_en", locale: "en",
      texts: ["alpha", "bravo", "delta", "echo"],
      onProgress: (p) => prog.push(p.text),
    });
    assert.equal(res.skipped, 1);
    assert.equal(res.done, 1);
    assert.equal(res.failed, 1);
    assert.deepEqual(seen, ["bravo", "delta"]); // echo never asked — § 5.3 pause
    assert.deepEqual(prog, ["bravo", "delta"]);
    // delta is queued for tomorrow's roll
    const q = await (await globalThis.caches.open("pip-tile-queue")).keys();
    assert.equal(q.length, 1);
  });
});

test("evict drops a cached clip; flag posts and replaced lists hashes", async () => {
  await withEnv(async () => {
    const vt = voiceTile();
    await vt.remember("voi_default_en", "zebra", new Blob(["OLD"]));
    await vt.evict("voi_default_en", await tileTextHash("zebra"));
    assert.equal(await vt.cached("voi_default_en", "zebra"), null);

    const calls = [];
    globalThis.fetch = async (u, init) => {
      calls.push({ url: u, init });
      if (u.includes("/flag")) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ ids: ["h1", "h2"], next: 99 }));
    };
    assert.equal(await vt.flag(ARGS), true);
    const flagBody = JSON.parse(calls[0].init.body);
    assert.equal(flagBody.text, "scientist");

    const rep = await vt.replacedSince({ userId: "u-1", license: "x",
      voice: "voi_default_en", since: 0 });
    assert.deepEqual(rep.ids, ["h1", "h2"]);
    assert.match(calls[1].url, /tile\/replaced\?since=0&voice=voi_default_en/);
    assert.equal(calls[1].init.headers["x-pip-license"], "x");
  });
});

test("the UTC day roll retries a budget-queued mint (fake clock)", async () => {
  assert.equal(msUntilUtcDayRoll(Date.UTC(2026, 8, 29, 23, 59, 0)), 60_000);
  assert.equal(msUntilUtcDayRoll(Date.UTC(2026, 8, 30, 0, 0, 0)), 86_400_000);
  await withEnv(async () => {
    const vt = voiceTile();
    // Budget wall at mint time: the word queues for tomorrow.
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "budget" }), { status: 503 });
    const r = await vt.ensure({ ...ARGS, source: "user_keyboard" });
    assert.equal(r.reason, "budget");
    assert.equal((await (await globalThis.caches.open("pip-tile-queue")).keys()).length, 1);

    // Arm the roll at 23:59 UTC; the captured timer fires on the day roll.
    let cb, delay;
    const cancel = armUtcRollRetry(
      async () => vt.drainQueue({ userId: "u-1", license: "x" }),
      { now: () => Date.UTC(2026, 8, 29, 23, 59, 0),
        setTimeoutFn: (fn, ms) => { cb = fn; delay = ms; return 7; },
        clearTimeoutFn: () => {} },
    );
    assert.equal(delay, 60_000); // armed for exactly the UTC roll
    globalThis.fetch = async () => okAudio();
    await cb(); // midnight UTC — the drain runs
    assert.equal(vt.status("voi_default_en", "scientist"), "ready");
    assert.equal((await (await globalThis.caches.open("pip-tile-queue")).keys()).length, 0);
    cancel();
  });
});

test("supporter copy: badge is short, card message is full", () => {
  assert.equal(tileStateBadge("minting"), "making voice…");
  assert.equal(tileStateBadge("held"), "no voice yet");
  assert.equal(tileStateMessage("budget", "Eve"),
    "Eve's voice for this word will be ready tomorrow.");
  assert.match(tileStateMessage("minting", "Eve"), /Making Eve's voice/);
});
