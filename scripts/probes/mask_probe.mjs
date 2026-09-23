/**
 * 009 slice 9 live proof: hide `stop` from its word card → its grid cell
 * is a ghost (masked class, disabled); a tap appends nothing and logs no
 * event; "Show word" restores the working cell. Measured on the DOM and
 * the event log — not the toast.
 *   node scripts/probes/mask_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9253, ORIGIN = "http://localhost:8794";
rmSync("/tmp/pip-mask-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-mask-probe", "--no-first-run", "about:blank"]);
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
const barText = `([...document.querySelectorAll('#bar .chip, #sentencebar *')]
  .map((n) => n.textContent.trim()).filter(Boolean).join(' ') || document.querySelector('#bar')?.textContent || '')`;

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: ORIGIN });
await sleep(4000);
const out = {};

const stopCell = `(() => {
  const c = [...document.querySelectorAll('#grid .cell')]
    .find((n) => (n.textContent || '').trim().toLowerCase() === 'stop');
  return c ? { cls: c.className, disabled: !!c.disabled } : null;
})()`;
out.stopBefore = await evalJs(stopCell);

// Library → All → search stop → row → word card → Hide.
await evalJs(`document.querySelector('#corner').click()`); await sleep(300);
await evalJs(`document.querySelector('#open-library').click()`); await sleep(500);
await evalJs(`document.querySelector('#lib-tabs [data-t="all"]').click()`); await sleep(300);
await evalJs(`(() => {
  const q = document.querySelector('#lib-q');
  q.value = 'stop'; q.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(400);
await evalJs(`(() => {
  const r = [...document.querySelectorAll('#lib-list *')]
    .find((n) => (n.textContent || '').trim().toLowerCase() === 'stop');
  (r?.closest('button, .lrow, [role=button]') ?? r)?.click();
})()`);
await sleep(500);
out.cardOpen = await evalJs(`document.querySelector('#wordcard').classList.contains('open')`);
out.hideLabel = await evalJs(`document.querySelector('#wc-hide')?.textContent`);
await evalJs(`document.querySelector('#wc-hide').click()`); await sleep(500);

out.stopHidden = await evalJs(stopCell);
out.dbMask = await evalJs(`window.pip.db.prepare(
  "SELECT sm.status AS st FROM sense_mask sm JOIN label l ON l.sense_id=sm.sense_id AND l.kind='lemma' WHERE l.text='stop'"
).all().map((r) => r.st)`);
out.eventsBefore = await evalJs(`window.pip.db.prepare("SELECT COUNT(*) AS n FROM learner_event_log").all()[0].n`);

// Tap the ghost — nothing may happen.
await evalJs(`(() => {
  const c = [...document.querySelectorAll('#grid .cell')]
    .find((n) => (n.textContent || '').trim().toLowerCase() === 'stop');
  c?.click();
})()`);
await sleep(400);
out.barAfterTap = await evalJs(barText);
out.eventsAfter = await evalJs(`window.pip.db.prepare("SELECT COUNT(*) AS n FROM learner_event_log").all()[0].n`);

// Show restores: reopen the card from the library and unhide.
await evalJs(`document.querySelector('#corner').click()`); await sleep(300);
await evalJs(`document.querySelector('#open-library').click()`); await sleep(400);
await evalJs(`(() => {
  const r = [...document.querySelectorAll('#lib-list *')]
    .find((n) => (n.textContent || '').trim().toLowerCase() === 'stop');
  (r?.closest('button, .lrow, [role=button]') ?? r)?.click();
})()`);
await sleep(400);
out.showLabel = await evalJs(`document.querySelector('#wc-hide')?.textContent`);
await evalJs(`document.querySelector('#wc-hide').click()`); await sleep(500);
out.stopRestored = await evalJs(stopCell);

// And the restored cell speaks again.
await evalJs(`(() => {
  const c = [...document.querySelectorAll('#grid .cell')]
    .find((n) => (n.textContent || '').trim().toLowerCase() === 'stop');
  c?.click();
})()`);
await sleep(400);
out.eventsFinal = await evalJs(`window.pip.db.prepare("SELECT COUNT(*) AS n FROM learner_event_log").all()[0].n`);

console.log(JSON.stringify(out, null, 2));
ws.close(); chrome.kill();
