/**
 * 011 slice 9 live proof (owner-visible): Parent corner on a linked
 * user — a minted license flips the user to Pip Lifetime; "Delete
 * this user" schedules deletion with a visible undo; Undo clears it.
 * Measured on the DOM and the relay's own answers — not the toast.
 *   node scripts/probes/entitlement_probe.mjs
 */
import { execSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9257, ORIGIN = "http://localhost:8794";
rmSync("/tmp/pip-ent-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-ent-probe", "--no-first-run", "about:blank"]);
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
const out = {};
const fail = (msg) => { console.log("FAIL", msg); console.log(out); chrome.kill(); process.exit(1); };

// Link the user: Parent corner → Add a device creates it on the relay.
await evalJs(`document.querySelector('#corner').click()`); await sleep(400);
await evalJs(`document.querySelector('#dev-add').click()`); await sleep(2500);
out.userId = await evalJs(`JSON.parse(localStorage.getItem('pip_sync') || '{}').userId`);
if (!out.userId) fail("user did not link");
await evalJs(`document.querySelector('#pairform [data-close]')?.click()
  || document.querySelector('#pairform').click()`); await sleep(300);
await evalJs(`document.querySelector('#corner').click()`); await sleep(800);

// Free by default.
out.freeLabel = await evalJs(`document.querySelector('#dev-lifetime').textContent.trim()`);
if (!/one linked device/.test(out.freeLabel)) fail("free label missing");

// Activate a minted license — the relay verifies, the row flips.
const license = execSync(
  `node scripts/entitlement/mint.mjs ${out.userId}`, { encoding: "utf8" }).trim();
out.license = license.slice(0, 20) + "…";
await evalJs(`(() => { const i = document.querySelector('#dev-license');
  i.value = ${JSON.stringify(license)}; })()`);
await evalJs(`document.querySelector('#dev-activate').click()`); await sleep(1200);
out.lifetimeLabel = await evalJs(`document.querySelector('#dev-lifetime').textContent.trim()`);
out.licenseRowHidden = await evalJs(`document.querySelector('#dev-lifetime-row').hidden`);
if (!/Lifetime/.test(out.lifetimeLabel) || !out.licenseRowHidden) {
  fail("license did not activate");
}

// Delete → confirm → scheduled with a visible undo.
await evalJs(`document.querySelector('#dev-delete').click()`); await sleep(400);
out.confirmTitle = await evalJs(`document.querySelector('#pair-title').textContent`);
await evalJs(`document.querySelector('#pair-go').click()`); await sleep(1200);
out.deleteState = await evalJs(`document.querySelector('#dev-delete-state').textContent.trim()`);
out.undoVisible = await evalJs(`!document.querySelector('#dev-undelete').hidden`);
if (!/scheduled for deletion/.test(out.deleteState) || !out.undoVisible) {
  fail("deletion not scheduled");
}

// Undo → cleared.
await evalJs(`document.querySelector('#dev-undelete').click()`); await sleep(1200);
out.afterUndo = await evalJs(`document.querySelector('#dev-delete-state').textContent.trim()`);
out.undoGone = await evalJs(`document.querySelector('#dev-undelete').hidden`);
if (out.afterUndo !== "" || !out.undoGone) fail("undo did not clear the schedule");

console.log(JSON.stringify(out, null, 2));
console.log("PASS entitlement + deletion flows");
chrome.kill();
process.exit(0);
