/** Scratch: prove the navigation fallback. Boot online, let the SW
 *  precache, then DELETE /index.html from the shell (iOS evicts the
 *  entry while keeping the registration), go offline on page + SW,
 *  and navigate to / — must land on the offline page, not a dead
 *  browser error. */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9283, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:21089";
rmSync("/tmp/pip-navfallback", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-navfallback", "--no-first-run", "about:blank"]);

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
  ws.onopen = () => resolve({ send, evalJs });
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
await send("Page.navigate", { url: `${ORIGIN}/` });
if (!(await poll(() => evalJs("typeof window.pip === 'object' && !!window.pip"))))
  fail("app did not boot online");
if (!(await poll(() => evalJs(
  "navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false"))))
  fail("service worker never became ready");
if (!(await poll(() => evalJs("!!navigator.serviceWorker.controller"))))
  fail("page never came under SW control");

// iOS-evicts-the-entry simulation: shell cache loses index.html.
const evicted = await evalJs(`(async () => {
  const m = await (await fetch('/sw-manifest.json')).json();
  const c = await caches.open('pip-shell-' + m.buildId);
  return c.delete('/index.html');
})()`);
if (!evicted) fail("could not delete index.html from shell cache");

const offline = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
await send("Network.enable");
await send("Network.emulateNetworkConditions", offline);
const swTarget = (await targets()).find((t) => t.url?.endsWith("/sw.js"));
if (!swTarget) fail("no service_worker target");
const swConn = await connect(swTarget.webSocketDebuggerUrl);
await swConn.send("Network.enable");
await swConn.send("Network.emulateNetworkConditions", offline);

await send("Page.navigate", { url: `${ORIGIN}/` });
await sleep(1500);
const got = await poll(() => evalJs(
  `document.readyState === 'complete' && !!document.getElementById('retry')`), 20);
const body = await evalJs("document.body?.innerText ?? '<<no body>>'").catch(() => "<<eval failed>>");
console.log("landed:", JSON.stringify({ got, body: body.slice(0, 120) }));
console.log(got
  ? "PASS nav fallback — dead-shell navigation lands on the offline retry page"
  : "FAIL — navigation did not reach the offline page");
chrome.kill();
process.exit(got ? 0 : 1);
