/**
 * 009 slice 7 live proof (iPad surface): Parent corner → Add to My Words
 * → "Paste a list" → paste rows → preview → Add all → the entities and
 * placements exist. Measures the DB, not the toast.
 *   node scripts/probes/bulk_probe.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9251, ORIGIN = "http://localhost:8794";
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-bulk-probe", "--no-first-run", "about:blank"]);
await sleep(2500);

const page = (await (await fetch(`http://localhost:${PORT}/json`)).json())
  .find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let mid = 0; const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (m, p = {}) => new Promise((res) => {
  const id = ++mid; pending.set(id, res);
  ws.send(JSON.stringify({ id, method: m, params: p }));
});
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: ORIGIN });
await sleep(4000);
const out = { boot: await evalJs(
  `JSON.stringify({cells: document.querySelectorAll('#grid .cell').length, pip: !!window.pip})`) };

// Parent corner → add to My Words → the paste-a-list affordance.
await evalJs(`document.querySelector('#corner').click()`); await sleep(400);
await evalJs(`document.querySelector('#add-mywords').click()`); await sleep(400);
out.addformOpen = await evalJs(`document.querySelector('#addform').classList.contains('open')`);
await evalJs(`document.querySelector('#add-bulk').click()`); await sleep(400);
out.bulkformOpen = await evalJs(`document.querySelector('#bulkform').classList.contains('open')`);
out.bulkTitle = await evalJs(`document.querySelector('#bulk-title').textContent`);

// Paste a list: an own word dup, a catalog word, a new word, a blank line.
await evalJs(`(() => {
  const ta = document.querySelector('#bulk-paste');
  ta.value = 'juice\\nAunt Deb\\ntramampoline\\n\\njuice';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(400);
out.preview = await evalJs(
  `[...document.querySelectorAll('#bulk-preview .ed-prow')].map((r) => r.textContent.trim())`);
out.addLabel = await evalJs(`document.querySelector('#bulk-add').textContent`);

await evalJs(`document.querySelector('#bulk-add').click()`); await sleep(600);
out.myWords = await evalJs(`window.pip.db.prepare(
  "SELECT e.spoken_name FROM group_cell gc JOIN personal_entity e ON e.id=gc.item_id AND gc.item_kind='entity' WHERE gc.group_id='grp_my_words'"
).all().map((r) => r.spoken_name)`);
out.juiceCell = await evalJs(`window.pip.db.prepare(
  "SELECT COUNT(*) AS n FROM group_cell gc JOIN label l ON l.sense_id=gc.item_id AND l.kind='lemma' WHERE gc.group_id='grp_my_words' AND gc.item_kind='sense' AND l.text='juice'"
).all()[0].n`);
out.entities = await evalJs(`window.pip.db.prepare(
  "SELECT spoken_name FROM personal_entity WHERE status='active'").all().map((r) => r.spoken_name)`);

console.log(JSON.stringify(out, null, 2));
ws.close(); chrome.kill();
