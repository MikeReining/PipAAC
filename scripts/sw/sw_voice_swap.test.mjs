/** 043 E — the voice-pack swap is atomic. sw.js is executed in a vm
 *  against a fake Cache API and a fetch we control, so the proof is
 *  the module's own behavior, not a reading of its source:
 *    1. An interrupted fill leaves the LAST pack serving — the stale
 *       cache is not deleted and its clips still answer offline.
 *    2. The next fill resumes (only missing files are fetched), writes
 *       the completion sentinel, and prunes the old pack.
 *    3. pip-voice-status reports honest readiness in both states. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { repoRoot } from "../catalog/paths.mjs";

const src = readFileSync(`${repoRoot}/public/sw.js`, "utf8");

const norm = (u) => new URL(typeof u === "string" ? u : u.url, "http://x").href;
class FakeCache {
  constructor() { this.m = new Map(); }
  async match(u) { return this.m.get(norm(u)); }
  async put(u, res) { this.m.set(norm(u), res); }
}

function boot({ failPaths = new Set(), audioMap } = {}) {
  const caches = {
    store: new Map(),
    async open(n) { if (!this.store.has(n)) this.store.set(n, new FakeCache()); return this.store.get(n); },
    async keys() { return [...this.store.keys()]; },
    async delete(n) { return this.store.delete(n); },
  };
  const listeners = {};
  const posted = [];
  const fetches = [];
  const selfObj = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    skipWaiting: async () => {},
  };
  const ctx = {
    self: selfObj,
    importScripts: () => { selfObj.SW_BUILD = "test"; },
    caches,
    location: { origin: "http://x" },
    clients: {
      matchAll: async () => [{ postMessage: (m) => posted.push(m) }],
      claim: async () => {},
    },
    fetch: async (u) => {
      const path = typeof u === "string" ? u : new URL(u.url).pathname;
      fetches.push(path);
      if (path === "/sw-audio.json") return new Response(JSON.stringify(audioMap));
      if (failPaths.has(path)) throw new TypeError("offline");
      return new Response(`bytes:${path}`);
    },
    URL, Response, Headers, Request, console, setTimeout,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const msg = (data) => {
    let done;
    listeners.message({ data, ports: [{ postMessage: (m) => { msg.reply = m; } }],
      waitUntil: (p) => { done = p; } });
    return done ?? Promise.resolve();
  };
  const serve = async (url) => {
    let res;
    await listeners.fetch({ request: { method: "GET", url, headers: new Headers(), mode: "" },
      respondWith: (p) => { res = p; } });
    return res;
  };
  return { caches, listeners, msg, serve, posted, fetches };
}

const MAP = { voices: { v1: { hash: "newhash12345", files: ["/audio/a", "/audio/b", "/audio/c"] } } };

test("interrupted fill keeps the last pack; next fill resumes and swaps", async () => {
  const h = boot({ failPaths: new Set(["/audio/c"]), audioMap: MAP });
  // The family had the previous pack — including the clip whose new
  // copy is about to fail to download.
  const old = await h.caches.open("pip-audio-v1-oldhash9999");
  await old.put("/audio/a", new Response("old-a"));
  await old.put("/audio/c", new Response("old-c"));

  // Fill with /audio/c unreachable: new pack stays partial, old stays.
  await h.msg({ type: "pip-active-voice", voice: "v1" });
  assert.ok(h.caches.store.has("pip-audio-v1-oldhash9999"),
    "a partial fill must not delete the previous pack");
  assert.ok(h.caches.store.has("pip-audio-v1-newhash12345"));
  const partial = await h.caches.open("pip-audio-v1-newhash12345");
  assert.equal(await partial.match("http://x/audio/.pip-voice-meta"), undefined,
    "a partial pack must not carry the completion sentinel");

  // A clip the new pack never got still answers from the old pack —
  // this is the offline audio the buggy code deleted first.
  const res = await h.serve("http://x/audio/c");
  assert.equal(await res.text(), "old-c");

  // Network heals: second fill fetches ONLY the missing clip, writes
  // the sentinel, and prunes the stale pack.
  const h2 = boot({ audioMap: MAP });
  h2.caches.store = h.caches.store; // same device, next session
  h2.caches.open = h.caches.open; h2.caches.keys = h.caches.keys;
  h2.caches.delete = h.caches.delete;
  await h2.msg({ type: "pip-active-voice", voice: "v1" });
  assert.deepEqual(h2.fetches.filter((p) => p.startsWith("/audio/")), ["/audio/c"],
    "the resumed fill should fetch only what is still missing");
  assert.ok(!h.caches.store.has("pip-audio-v1-oldhash9999"),
    "the stale pack prunes only after the new one is complete");
  const done = await h.caches.open("pip-audio-v1-newhash12345");
  assert.ok(await done.match("http://x/audio/.pip-voice-meta"),
    "a complete pack carries the sentinel");
});

test("pip-voice-status reports readiness from the sentinel", async () => {
  const h = boot({ audioMap: MAP });
  // Unknown voice — honest empty answer.
  await h.msg({ type: "pip-voice-status", voice: "ghost" });
  assert.equal(h.msg.reply.ready, false);
  assert.equal(h.msg.reply.total, 0);

  await h.msg({ type: "pip-active-voice", voice: "v1" });
  await h.msg({ type: "pip-voice-status", voice: "v1" });
  assert.equal(h.msg.reply.ready, true);
  assert.equal(h.msg.reply.total, 3);
});
