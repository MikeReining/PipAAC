/** 036 Works Test gate: cold offline boot under a real service worker.
 *  Loads the app online, waits for the SW precache to complete, then
 *  emulates offline on BOTH the page target and the SW target — a
 *  precache miss hits a dead network instead of false-passing — reloads,
 *  and asserts the board paints with working fetches. */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9280, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:21090";
rmSync("/tmp/pip-offline-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-offline-probe", "--no-first-run", "about:blank"]);

const connect = (wsUrl) => new Promise((resolve) => {
  const ws = new WebSocket(wsUrl);
  let mid = 0; const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++mid; pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) {
      throw new Error(JSON.stringify(r.result.exceptionDetails));
    }
    return r.result?.result?.value;
  };
  ws.onopen = () => resolve({ send, evalJs, ws });
});

const targets = async () =>
  (await (await fetch(`http://localhost:${PORT}/json`)).json());
const poll = async (fn, tries = 240) => {
  for (let i = 0; i < tries; i++) {
    if (await fn().catch(() => false)) return true;
    await sleep(500);
  }
  return false;
};

const fail = (msg) => { console.log(`FAIL: ${msg}`); chrome.kill(); process.exit(1); };
await sleep(2500);

const page = (await targets()).find((t) => t.type === "page");
if (!page) fail("no page target");
const { send, evalJs } = await connect(page.webSocketDebuggerUrl);

await send("Page.enable");
await send("Page.navigate", { url: `${ORIGIN}/?reseed` });
if (!(await poll(() => evalJs("typeof window.pip === 'object' && !!window.pip"))))
  fail("app did not boot online");

// Welcome: pick a child profile so the reload lands on the board.
await evalJs(`(() => { document.querySelector('.welcome-choice[data-v="child"]')?.click(); })()`);
await sleep(300);
await evalJs(`(() => { document.querySelector('.welcome-go')?.click(); })()`);
if (!(await poll(() => evalJs(
  `typeof window.pip === 'object' && !!window.pip && !document.querySelector('.welcome')`))))
  fail("board never showed after welcome");

// Wait for install: ready resolves only after activate, which follows a
// completed precache.
if (!(await poll(() => evalJs(
  "navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false"))))
  fail("service worker never became ready (precache did not finish)");
if (!(await poll(() => evalJs("!!navigator.serviceWorker.controller"))))
  fail("page never came under SW control");

const warm = await evalJs(`(async () => {
  const m = await (await fetch('/sw-manifest.json')).json();
  const c = await caches.open('pip-shell-' + m.buildId);
  const keys = await c.keys();
  const am = await (await fetch('/sw-audio.json')).json();
  const voice = 'voi_default_en'; // a fresh install speaks the default voice
  const entry = am.voices[voice];
  return { buildId: m.buildId, expected: m.files.length, cached: keys.length,
    voice, audioCache: 'pip-audio-' + voice + '-' + entry.hash,
    audioExpected: entry.files.length, audio: entry.files[0] };
})()`);
console.log("precache:", JSON.stringify(warm));
if (warm.cached !== warm.expected)
  fail(`precache incomplete — ${warm.cached}/${warm.expected} cached`);

// 041 A2 — the active voice's clips fill AFTER the board, in their own
// cache. The offline promise is that voice, so the fill must land first.
const audioFull = () => evalJs(`(async () => {
  const c = await caches.open(${JSON.stringify(warm.audioCache)});
  return (await c.keys()).length >= ${warm.audioExpected};
})()`);
if (!(await poll(audioFull, 480)))
  fail(`active-voice audio fill never completed — ${warm.audioCache}`);

// Go offline on the page AND on the SW target — a SW-side fetch falling
// through to the network must fail honestly.
const offline = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
await send("Network.enable");
await send("Network.emulateNetworkConditions", offline);
const swTarget = (await targets()).find((t) => t.url?.endsWith("/sw.js"));
if (!swTarget) fail("no service_worker target found to emulate");
const swConn = await connect(swTarget.webSocketDebuggerUrl);
await swConn.send("Network.enable");
await swConn.send("Network.emulateNetworkConditions", offline);

await send("Page.reload", { ignoreCache: true });
if (!(await poll(() => evalJs("typeof window.pip === 'object' && !!window.pip"))))
  fail("board did not boot OFFLINE");

const off = await evalJs(`(async () => {
  const controlled = !!navigator.serviceWorker.controller;
  const form = await fetch('/form_table.en.json').then((r) => r.json())
    .then((j) => !!j.aSense).catch(() => false);
  const cat = await fetch('/catalog.json').then((r) => r.ok).catch(() => false);
  const sym = await fetch('/symbols/want.webp')
    .then(async (r) => r.ok && r.headers.get('content-type') === 'image/webp'
      && (await r.arrayBuffer()).byteLength > 0).catch(() => false);
  const tileImg = [...document.querySelectorAll('img')]
    .some((i) => i.src.includes('/symbols/') && i.complete && i.naturalWidth > 0);
  const aud = await fetch(${JSON.stringify(warm.audio)})
    .then(async (r) => r.ok && (await r.arrayBuffer()).byteLength > 0).catch(() => false);
  return { controlled, form, cat, sym, tileImg, aud };
})()`);
console.log("offline:", JSON.stringify(off));

const pass = off.controlled && off.form && off.cat && off.sym && off.tileImg && off.aud;
console.log(pass ? "PASS offline cold boot — board, art, tables, audio all local"
  : "FAIL offline boot — see flags");
chrome.kill();
process.exit(pass ? 0 : 1);
