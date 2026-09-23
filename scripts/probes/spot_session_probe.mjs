/**
 * 013 slice 2 live proof — Spotlight on one device, the spec's own test:
 * "start, restart the app — still on; pass midnight — off." Driven
 * through the real UI (Parent corner → Spotlight → pick words on the
 * board), then a reload stands in for an app restart, and expiring the
 * row stands in for midnight. Measures rendered classes and the synced
 * row — never the module's own report.
 *   node scripts/probes/spot_session_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9256, ORIGIN = "http://localhost:8794";
rmSync("/tmp/pip-spot2-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-spot2-probe", "--no-first-run", "about:blank"]);
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
const glowState = `(() => ({
  glow: document.querySelectorAll('#grid .cell.glow').length,
  dimmed: document.querySelectorAll('#grid .cell.dimmed').length,
  chip: document.querySelector('#spot-chip').textContent,
  chipHidden: document.querySelector('#spot-chip').hidden,
  session: !!window.pip.spotlight.session,
}))()`;

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
const loadApp = async () => {
  await send("Page.navigate", { url: ORIGIN });
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if (await evalJs("typeof window.pip === 'object' && !!window.pip")
      .catch(() => false)) return;
  }
  throw new Error("app did not boot");
};
await loadApp();

const out = {};

// Clean slate — a previous run's lists/session must not skew the count.
await evalJs(`(() => {
  window.pip.db.exec("DELETE FROM spotlight_item; DELETE FROM spotlight_list; DELETE FROM spotlight_session;");
  return 1;
})()`);

// Parent corner → Spotlight → pick two board words → save as a list.
out.open = await evalJs(`(() => {
  document.querySelector('#corner').click();
  document.querySelector('#open-spot').click();
  const wasOpen = document.querySelector('#spotform').classList.contains('open');
  const lists = document.querySelector('#spot-lists').textContent;
  document.querySelector('#spot-pick').click();
  // Picking happens on the board — the sheet closes behind it.
  return { formOpen: wasOpen, lists,
    formClosed: !document.querySelector('#spotform').classList.contains('open'),
    pickbar: !document.querySelector('#spot-pickbar').hidden };
})()`);

out.picked = await evalJs(`(() => {
  const tap = (w) => [...document.querySelectorAll('#grid .cell')]
    .find((c) => (c.textContent || '').trim().toLowerCase() === w)?.click();
  tap('stop'); tap('want');
  return {
    count: document.querySelector('#spot-pick-count').textContent,
    pickedCells: document.querySelectorAll('#grid .cell.picked').length,
    picking: window.pip.spotlight.picking,
    sentence: window.pip.sentence.length, // picks never speak or append
  };
})()`);

out.saved = await evalJs(`(() => {
  document.querySelector('#spot-pick-save').click();
  const name = document.querySelector('#spot-list-name');
  name.value = 'Probe List';
  document.querySelector('#spot-name-save').click();
  return {
    lists: window.pip.spotlight.lists(),
    formOpen: document.querySelector('#spotform').classList.contains('open'),
    pickbarHidden: document.querySelector('#spot-pickbar').hidden,
  };
})()`);

// Start the saved list from the sheet.
await evalJs(`(() => {
  [...document.querySelectorAll('.spot-list-row button')]
    .find((b) => b.textContent === 'Start').click();
  return 1;
})()`);
await sleep(400);
out.running = await evalJs(glowState);

// Restart the app — the glow must come back from the synced row.
await loadApp();
out.afterRestart = await evalJs(glowState);

// Midnight passes — expire the row and reload: the board stays off.
await evalJs(`window.pip.db.prepare(
  "UPDATE spotlight_session SET ends_at = ? WHERE id = 1").run(Date.now() - 1000)`);
await loadApp();
out.afterMidnight = await evalJs(glowState);

console.log(JSON.stringify(out, null, 2));
const ok =
  out.open.formOpen && out.open.formClosed && out.open.pickbar &&
  out.picked.count === "2 picked" && out.picked.pickedCells === 2 &&
  out.picked.sentence === 0 &&
  out.saved.lists.length === 1 && out.saved.lists[0].n === 2 &&
  out.saved.pickbarHidden &&
  out.running.glow === 2 && !out.running.chipHidden &&
  out.running.chip.includes("Probe List") && out.running.session &&
  out.afterRestart.glow === 2 && !out.afterRestart.chipHidden &&
  out.afterRestart.session &&
  out.afterMidnight.glow === 0 && out.afterMidnight.chipHidden &&
  !out.afterMidnight.session;
console.log(ok ? "PASS spotlight session on one device" : "FAIL — see output");
chrome.kill();
process.exit(ok ? 0 : 1);
