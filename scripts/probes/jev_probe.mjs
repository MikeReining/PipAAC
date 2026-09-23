/**
 * 006 slice 5 live proof: real taps on the board → the strip's Jev
 * leg fires through the local Worker → the impression row records the
 * real jev_status and the upstream model. Measures the actual rows, not
 * the code's self-report.
 *
 *   node scripts/probes/jev_probe.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9250, ORIGIN = "http://localhost:8794";
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-jev-probe2", "--no-first-run", "about:blank"]);
await sleep(2500);

const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let mid = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++mid; pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
const tapWord = (word, root = "#grid") => evalJs(`(() => {
  const c = [...document.querySelectorAll('${root} .cell')]
    .find((n) => (n.textContent || '').trim().toLowerCase() === '${word}');
  if (!c) return null; c.click(); return c.textContent.trim();
})()`);

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: ORIGIN });
await sleep(4000);
const out = { boot: await evalJs(`JSON.stringify({
  cells: document.querySelectorAll('#grid .cell').length,
  corner: !!document.querySelector('#corner'), pip: !!window.pip})`) };

// Seed a noun's history: Groups → Drinks → juice → back to the board.
await evalJs(`document.querySelector('#anchor-groups').click()`);
await sleep(500);
const grp = await evalJs(`(() => {
  const c = [...document.querySelectorAll('#groupgrid .gcell')]
    .find((n) => /drink/i.test(n.textContent || ''));
  if (!c) return [...document.querySelectorAll('#groupgrid .gcell')].map((n) => n.textContent.trim());
  c.click(); return 'drinks';
})()`);
await sleep(600);
out.juice_tap = await tapWord("juice", "#groupgrid");
await sleep(300);
// back to the board via the nav cell
await evalJs(`(() => {
  const c = [...document.querySelectorAll('#groupgrid .gcell')]
    .find((n) => /Groups/.test(n.textContent || ''));
  if (c) c.click();
})()`);
await sleep(500);
out.grpNav = grp;

// Now "I want" — juice is invited (noun) + has recency → a real shortlist.
out.tap_I = await tapWord("I");
await sleep(700);
out.tap_want = await tapWord("want");
await sleep(3000); // let the Jev round-trip land or time out

out.impressions = await evalJs(`window.pip.db.prepare(
  "SELECT position, weight_set, jev_status, jev_model, shown FROM strip_impression ORDER BY id"
).all()`);
out.stripTiles = await evalJs(
  `[...document.querySelectorAll('#strip .pred')].map((n) => (n.textContent||'').trim().slice(0,20))`);

// Sharing off via the real Parent Corner toggle → a new tap sends nothing.
await evalJs(`document.querySelector('#corner').click()`);
await sleep(400);
await evalJs(`document.querySelector('#jev-share [data-v="0"]').click()`);
await sleep(200);
await evalJs(`document.querySelector('#corner').click()`);
await sleep(400);
out.tap_more = await tapWord("more");
await sleep(2000);
out.after_off = await evalJs(`window.pip.db.prepare(
  "SELECT position, jev_status, jev_model FROM strip_impression ORDER BY id").all()`);
out.profile_after = await evalJs(`window.pip.db.prepare(
  "SELECT jev_sharing FROM learner_profile WHERE id='prf_local'").all()`);

console.log(JSON.stringify(out, null, 2));
ws.close(); chrome.kill();
