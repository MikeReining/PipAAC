/**
 * 009 slice 8 live proof: a real multi-file selection produces one draft
 * row per photo; naming three and saving writes exactly three entities
 * with photos into the target group — the blank row is flagged, not
 * saved. Measured on the DB, not the UI's say-so.
 *   node scripts/probes/photos_probe.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9252, ORIGIN = "http://localhost:8794";
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-photos-probe", "--no-first-run", "about:blank"]);
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
await send("DOM.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: ORIGIN });
await sleep(4000);
const out = {};

// Parent corner → add to My Words → Add photos.
await evalJs(`document.querySelector('#corner').click()`); await sleep(300);
await evalJs(`document.querySelector('#add-mywords').click()`); await sleep(300);
await evalJs(`document.querySelector('#add-photos').click()`); await sleep(300);

// Feed the real input four files via CDP.
const doc = await send("DOM.getDocument");
const node = await send("DOM.querySelector",
  { nodeId: doc.result.root.nodeId, selector: "#add-photos-input" });
await send("DOM.setFileInputFiles", {
  nodeId: node.result.nodeId,
  files: ["/tmp/pip-photo-mom.png", "/tmp/pip-photo-dad.png",
          "/tmp/pip-photo-nana.png", "/tmp/pip-photo-blank.png"],
});
await sleep(800);
out.photoformOpen = await evalJs(`document.querySelector('#photoform').classList.contains('open')`);
out.rows = await evalJs(`[...document.querySelectorAll('#photo-rows .prow')].map((r) => ({
  name: r.querySelector('input').value, blank: r.classList.contains('blank'),
  tag: r.querySelector('.tag').textContent, hasImg: !!r.querySelector('img')?.src?.startsWith('blob:') }))`);
out.saveLabel = await evalJs(`document.querySelector('#photo-save').textContent`);

// Blank the fourth row's name, save the rest.
await evalJs(`(() => {
  const i = [...document.querySelectorAll('#photo-rows .prow input')][3];
  i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(200);
out.afterBlank = await evalJs(`[...document.querySelectorAll('#photo-rows .prow')].map((r) =>
  ({ name: r.querySelector('input').value, blank: r.classList.contains('blank'),
     tag: r.querySelector('.tag').textContent }))`);
await evalJs(`document.querySelector('#photo-save').click()`);
await sleep(1500);
out.saved = await evalJs(`window.pip.db.prepare(
  "SELECT e.spoken_name, e.photo_key FROM group_membership gc JOIN personal_entity e ON e.id=gc.item_id WHERE gc.group_id='grp_my_words'"
).all()`);
out.blankRows = await evalJs(`window.pip.db.prepare(
  "SELECT COUNT(*) AS n FROM personal_entity WHERE spoken_name IS NULL OR spoken_name = '' OR spoken_name = 'pip photo blank'"
).all()[0].n`);
out.opfs = await evalJs(`(async () => {
  const root = await navigator.storage.getDirectory();
  const names = [];
  for await (const k of root.keys()) names.push(k);
  return names.length;
})()`);

console.log(JSON.stringify(out, null, 2));
ws.close(); chrome.kill();
