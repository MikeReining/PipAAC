/**
 * 024 slice 2 Works Test — the client's sentence-voice pipeline.
 *
 * Rule 1 is the thing being proven: a sentence that isn't ready in
 * ~deadlineMs answers null so the caller speaks word clips — while the
 * fetch finishes and warms the cache, so the next tap is instant.
 * Cache Storage and fetch are faked; the module's own deadline races
 * the real timers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSpeakText, sentenceSpeakText, voiceSentence,
} from "../../public/shared/voice_sentence.mjs";

const fakeCaches = () => {
  const stores = new Map();
  return {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        match: async (u) => (m.has(u) ? new Response(m.get(u)) : undefined),
        put: async (u, res) => { m.set(u, await res.blob()); },
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

const ARGS = { userId: "u-1", license: "pip-life-x", voice: "ara", text: "i want a cookie." };

test("sentenceSpeakText joins display forms and terminates", () => {
  assert.equal(sentenceSpeakText([{ text: "i" }, { text: "want" }, { text: "cookies" }]),
    "i want cookies.");
  assert.equal(sentenceSpeakText([{ text: "who is it?" }]), "who is it?");
  assert.equal(normalizeSpeakText("  I   WANT a  Cookie. "), "i want a cookie.");
});

test("miss fetches once, hit plays from cache, case folds", async () => {
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(new Blob(["AUDIO"])); };
    const vs = voiceSentence({ deadlineMs: 500 });
    const b1 = await vs.request(ARGS);
    assert.equal(await b1.text(), "AUDIO");
    assert.equal(calls, 1);
    const b2 = await vs.request({ ...ARGS, text: "I Want  A COOKIE." });
    assert.equal(await b2.text(), "AUDIO");
    assert.equal(calls, 1); // normalized to the same key
  });
});

test("deadline answers null but the fetch still warms the cache", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      await gate;
      return new Response(new Blob(["LATE"]));
    };
    const vs = voiceSentence({ deadlineMs: 25 });
    const missed = await vs.request(ARGS);
    assert.equal(missed, null);           // she hears the word clips now
    release();
    await new Promise((r) => setTimeout(r, 20)); // the fetch lands anyway
    const b = await vs.request(ARGS);
    assert.equal(await b.text(), "LATE"); // next tap is instant
    assert.equal(calls, 1);
  }, {});
});

test("no license or a non-200 answer means clips, and nothing is cached", async () => {
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("{}", { status: 429 }); };
    const vs = voiceSentence({ deadlineMs: 500 });
    assert.equal(await vs.request({ ...ARGS, license: null }), null);
    assert.equal(calls, 0); // never asked
    assert.equal(await vs.request(ARGS), null); // fair_use — clips
    assert.equal(await vs.request(ARGS), null); // and not cached
    assert.equal(calls, 2);
  });
});

test("offline fetch failure answers null", async () => {
  await withEnv(async () => {
    globalThis.fetch = async () => { throw new Error("offline"); };
    const vs = voiceSentence({ deadlineMs: 500 });
    assert.equal(await vs.request(ARGS), null);
  });
});

/* --- 025: feeling rides to the Worker and keys the local cache --- */

test("feeling goes in the request and splits the local cache", async () => {
  await withEnv(async () => {
    const bodies = [];
    globalThis.fetch = async (u, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response(new Blob(["AUDIO"]));
    };
    const vs = voiceSentence({ deadlineMs: 500 });
    await vs.request({ ...ARGS, feeling: "happy" });
    assert.equal(bodies[0].feeling, "happy");
    // Same sentence, different feeling: a fresh fetch, not the neutral hit.
    await vs.request({ ...ARGS, feeling: "sad" });
    assert.equal(bodies.length, 2);
    // Repeat of the happy one plays from Tier 1 — pay once, replay fast.
    await vs.request({ ...ARGS, feeling: "happy" });
    assert.equal(bodies.length, 2);
  });
});

test("distinct sentences never share a cache entry", async () => {
  // The Promise-as-key bug: hex(crypto.subtle.digest(...)) hashed the
  // Promise, so every sentence stored under one URL — the first cached
  // blob replayed for every later sentence.
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async (u, init) => {
      calls++;
      return new Response(new Blob([`AUDIO:${JSON.parse(init.body).text}`]));
    };
    const vs = voiceSentence({ deadlineMs: 500 });
    const b1 = await vs.request(ARGS);
    assert.equal(await b1.text(), "AUDIO:i want a cookie.");
    const b2 = await vs.request({ ...ARGS, text: "you are noisy." });
    assert.equal(await b2.text(), "AUDIO:you are noisy.");
    assert.equal(calls, 2);
    const b3 = await vs.request(ARGS);
    assert.equal(await b3.text(), "AUDIO:i want a cookie."); // own key, still cached
    assert.equal(calls, 2);
  });
});

test("concurrent requests for one sentence share one fetch", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      await gate;
      return new Response(new Blob(["AUDIO"]));
    };
    const vs = voiceSentence({ deadlineMs: 500 });
    const p1 = vs.request(ARGS);
    const p2 = vs.request(ARGS); // same key while the first is in flight
    release();
    const [b1, b2] = await Promise.all([p1, p2]);
    assert.equal(await b1.text(), "AUDIO");
    assert.equal(await b2.text(), "AUDIO");
    assert.equal(calls, 1); // one Grok generation per recording, ever
  });
});

test("a per-request deadline overrides the module default", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await withEnv(async () => {
    globalThis.fetch = async () => { await gate; return new Response(new Blob(["LATE"])); };
    const vs = voiceSentence({ deadlineMs: 500 });
    // 1 s never-silent window (025 § 2) — short here, still > the gate.
    const missed = await vs.request({ ...ARGS, feeling: "happy", deadlineMs: 25 });
    assert.equal(missed, null);
    release();
    await new Promise((r) => setTimeout(r, 20));
    const b = await vs.request({ ...ARGS, feeling: "happy" });
    assert.equal(await b.text(), "LATE");
  });
});
