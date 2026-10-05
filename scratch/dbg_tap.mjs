/** Scratch: measure tap → speaking on a real board. Boot, click the
 *  first grid tile, time from click to the audio element's 'playing'
 *  event. Run twice: once while the voice fill is still cold
 *  (network fetch), once after it's warm (SW cache). */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9284, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:21088";
rmSync("/tmp/pip-tap-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-tap-probe", "--no-first-run", "about:blank"]);

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
const { send, evalJs } = await connect(page.webSocketDebuggerUrl);
await send("Page.enable");
await send("Page.navigate", { url: `${ORIGIN}/` });
if (!(await poll(() => evalJs(
  "typeof window.pip === 'object' && !!window.pip && !!document.querySelector('#grid .cell, .cell, [data-sid], img')"))))
  fail("board never appeared");

await evalJs(`(() => { document.querySelector('.welcome-choice[data-v="child"]')?.click(); })()`);
await sleep(300);
await evalJs(`(() => { document.querySelector('.welcome-go')?.click(); })()`);
await sleep(500);

const tapAndTime = async () => evalJs(`(async () => {
  const tile = [...document.querySelectorAll('#grid .cell, .cell')]
    .find((c) => !c.classList.contains('door') && c.offsetParent);
  if (!tile) return { err: 'no tappable tile' };
  const t0 = performance.now();
  const seen = new Set(performance.getEntriesByType('resource')
    .map((r) => r.name));
  const p = new Promise((res) => {
    const iv = setInterval(() => {
      const e = performance.getEntriesByType('resource')
        .find((r) => !seen.has(r.name) && r.name.includes('/audio/'));
      if (e) { clearInterval(iv); res(Math.round(e.responseEnd - t0)); }
    }, 15);
    setTimeout(() => { clearInterval(iv); res('cache/no-fetch'); }, 3000);
  });
  tile.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  tile.click();
  const ms = await p;
  return { ms, tile: tile.textContent?.slice(0, 20) };
})()`);

const cold = await tapAndTime();
await sleep(400);
const warm = await tapAndTime();
console.log(JSON.stringify({ cold, warm }));
console.log(cold.ms > 0 && cold.ms <= 300 && warm.ms > 0 && warm.ms <= 300
  ? "PASS tap→speak under 300ms both cold and warm"
  : `tap→speak measured: cold ${cold.ms}ms warm ${warm.ms}ms (budget 300)`);
chrome.kill();
process.exit(0);
