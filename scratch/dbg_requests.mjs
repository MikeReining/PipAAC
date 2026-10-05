// Scratch: which URLs load before the board paints? (speed-gate diagnosis)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const ORIGIN = process.argv[2] ?? "http://localhost:21088";
const PORT = 9299;
rmSync("/tmp/pip-req-probe", { recursive: true, force: true });
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/pip-req-probe", "--no-first-run", "about:blank"],
  { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill(); } catch {} });

let page = null;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500);
  page = (await (await fetch(`http://localhost:${PORT}/json`)
    .catch(() => null))?.json().catch(() => null) ?? [])
    .find((t) => t.type === "page");
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let mid = 0; const pending = new Map();
const requests = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Network.requestWillBeSent") {
    requests.push({ url: m.params.request.url, wall: m.params.wallTime * 1000 });
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++mid; pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = (expression) =>
  send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    .then((r) => r.result?.result?.value);

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
  window.__marks = {};
  setInterval(() => {
    const cell = document.querySelector("#grid .cell");
    if (cell && window.__marks.tile === undefined)
      window.__marks.tile = performance.now();
  }, 15);
})();` });

requests.length = 0;
await send("Page.navigate", { url: `${ORIGIN}/` });
const deadline = Date.now() + 60_000;
let boardAt = null;
while (Date.now() < deadline) {
  const m = await evalJs("window.__marks || {}");
  if (m?.tile) { boardAt = m.tile; break; }
  await sleep(150);
}
const origin = await evalJs("performance.timeOrigin");
const cutoff = origin + (boardAt ?? 60000);
const before = requests.filter((r) => r.wall <= cutoff).map((r) => r.url);
const groups = new Map();
for (const u of before) {
  const path = u.replace(ORIGIN, "").split("?")[0];
  const key = path.replace(/\/[^/]*$/, "/") || path;
  groups.set(key, (groups.get(key) ?? 0) + 1);
}
console.log("total before board:", before.length);
for (const [k, n] of [...groups].sort((a, b) => b[1] - a[1])) {
  console.log(String(n).padStart(5), k);
}
console.log("\nsample urls:");
for (const u of before.slice(0, 15)) console.log(" ", u.replace(ORIGIN, ""));
chrome.kill();
process.exit(0);
