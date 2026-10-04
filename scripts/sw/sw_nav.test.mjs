/** 041 — the dead home-screen launch. A navigation that hits the bare
 *  network with no controlling SW (or an evicted shell) shows Safari's
 *  error page — and a standalone web app has no browser chrome to
 *  retry it. These are the ratchets:
 *    1. every navigation is routed through serveNav,
 *    2. serveNav never leaves respondWith rejecting — its last resort
 *       is a served response, not a throw,
 *    3. /offline.html is precached so the fallback exists offline,
 *    4. install retries failed files once — a blip must not strand
 *       the worker that makes all of the above possible. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoRoot } from "../catalog/paths.mjs";

const sw = readFileSync(`${repoRoot}/public/sw.js`, "utf8");
const manifest = JSON.parse(readFileSync(`${repoRoot}/public/sw-manifest.json`, "utf8"));

test("navigations route through serveNav, which always responds", () => {
  const navBranch = /req\.mode === "navigate"[\s\S]*?e\.respondWith\(serveNav\(req\)\)/;
  assert.ok(navBranch.test(sw), "navigations bypass serveNav — an uncached "
    + "navigation can reject straight to the browser's dead error page");
  assert.ok(sw.includes('cache.match("/offline.html")'),
    "serveNav lost its offline-page fallback");
  assert.ok(/new Response\(/.test(sw.slice(sw.indexOf("serveNav"))),
    "serveNav has no inline last-resort Response — a total cache loss "
    + "would reject the navigation");
});

test("offline.html is in the precache manifest", () => {
  assert.ok(manifest.files.some((f) => f.path === "/offline.html"),
    "offline.html missing from sw-manifest — the nav fallback can't "
    + "answer while offline; run scripts/sw/sw_manifest.mjs");
});

test("install retries failed precache files once", () => {
  assert.ok(sw.includes("fetchAll(failed)"),
    "install lost its retry pass — one failed file strands the worker");
});

test("install-time fetches never trust the HTTP cache", () => {
  /* 2026-10-04: a deploy shipped fixed add-flow.css but the precache
   * baked the pre-deploy body in — a plain fetch answered from the HTTP
   * cache, which held a stale entry whose etag still revalidated 304.
   * Every fetch inside install/precache must be no-store. */
  const install = sw.slice(sw.indexOf('addEventListener("install"'),
    sw.indexOf('addEventListener("activate"'));
  for (const m of install.matchAll(/fetch\([^)]*\)/g)) {
    assert.ok(m[0].includes('"no-store"'),
      `install fetch without no-store can precache stale bytes: ${m[0]}`);
  }
  assert.ok(sw.includes('fetch(path, { cache: "no-store" })'),
    "precachePut lost its no-store fetch");
  assert.ok(sw.includes('fetch("/sw-audio.json", { cache: "no-store" })'),
    "sw-audio.json fetch can revalidate a stale clip map");
});
