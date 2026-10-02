/**
 * 024 slice 2 Works Test — the client's sentence-voice pipeline.
 *
 * Rule 1 (revised 2026-09-30): a speak waits for the whole-sentence
 * recording — a mint that lands inside the deadline plays as one
 * utterance. Null is only the last resort (offline, unlicensed,
 * non-200, or past the cap) so the caller can speak word clips; a
 * late fetch still warms the cache for the next tap. Cache Storage
 * and fetch are faked; the module's own deadline races real timers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const ARGS = { userId: "u-1", license: "pip-life-x", voice: "voi_default_en", text: "i want a cookie." };

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
    // The fetch lands anyway — wait for the warm to be observable, not a
    // fixed sleep: blob() + cache put can outlast 20 ms under wall load.
    for (let i = 0; i < 100 && !(await vs.cached(ARGS.voice, ARGS.text)); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
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
    // A stalled request past the caller's cap — the last-resort clips.
    const missed = await vs.request({ ...ARGS, feeling: "happy", deadlineMs: 25 });
    assert.equal(missed, null);
    release();
    await new Promise((r) => setTimeout(r, 20));
    const b = await vs.request({ ...ARGS, feeling: "happy" });
    assert.equal(await b.text(), "LATE");
  });
});

/* --- 2026-09-30: speaks wait out a mint; clips are the failure path --- */

test("a fresh mint inside the wait budget plays — no clip fallback", async () => {
  await withEnv(async () => {
    globalThis.fetch = async () => {
      await new Promise((r) => setTimeout(r, 60)); // ElevenLabs-scale mint
      return new Response(new Blob(["MINTED"]));
    };
    const vs = voiceSentence({ deadlineMs: 5000 });
    const b = await vs.request(ARGS);
    assert.equal(await b?.text(), "MINTED");
  });
});

test("the board waits out a mint — no sub-second race to word clips", () => {
  // Founder, 2026-09-30: the 300 ms race spoke every first-time and
  // transformed sentence word by word. speakSentence and the voice
  // sample must request with a mint-covering wait cap.
  const board = readFileSync(
    join(import.meta.dirname, "../../public/board.js"), "utf8");
  const speech = readFileSync(
    join(import.meta.dirname, "../../public/board/speech.js"), "utf8");
  const m = speech.match(/SPEAK_VOICE_WAIT_MS = (\d[\d_]*)/);
  assert.ok(m, "speech.js must name the speak wait cap");
  assert.ok(Number(m[1].replaceAll("_", "")) >= 5000,
    `speak wait ${m[1]} ms is too short for a fresh mint`);
  const speak = speech.slice(speech.indexOf("async function speakSentence"));
  assert.match(speak.slice(0, speak.indexOf("closeSentence")),
    /deadlineMs: SPEAK_VOICE_WAIT_MS/, "speakSentence must wait out the mint");
  const sample = board.slice(board.indexOf("async function sampleVoice"));
  assert.match(sample, /deadlineMs: SPEAK_VOICE_WAIT_MS/,
    "the voice sample waits too — a new voice's first play is a mint");
});
