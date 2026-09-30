/**
 * 013 slice 2 live proof — Spotlight on one device, the spec's own test:
 * "start, restart the app — still on; pass midnight — off." Driven
 * through the real UI (Settings → Spotlight page → pick words on the
 * board, 032), then a reload stands in for an app restart, and expiring
 * the row stands in for midnight. Measures rendered classes and the
 * synced row — never the module's own report.
 *   PIP_ORIGIN=http://localhost:21089 node scripts/probes/spot_session_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9256, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:21089";
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
  untilMidnight: window.pip.spotlight.session
    ? new Date(window.pip.spotlight.session.ends_at).getHours() === 0 : null,
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
// A fresh profile opens to first-open setup and then the tour — pass both.
await evalJs(`(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  if (document.querySelector('#welcome-name')) {
    document.querySelector('#welcome-name').value = 'Probe';
    document.querySelector('.welcome-choice[data-v="child"]').click();
    document.querySelector('.welcome-go').click();
    await w(1000);
  }
  [...document.querySelectorAll('button')]
    .find((b) => b.offsetParent && b.textContent.trim() === 'Skip')?.click();
  await w(300);
  return 1;
})()`);

const out = {};

// Clean slate — a previous run's lists/session must not skew the count.
await evalJs(`(() => {
  window.pip.db.exec("DELETE FROM spotlight_item; DELETE FROM spotlight_list; DELETE FROM spotlight_session;");
  return 1;
})()`);

// Settings → Spotlight page → pick two board words → save as a list.
out.open = await evalJs(`(async () => {
  document.querySelector('#corner').click();
  await new Promise((r) => setTimeout(r, 300));
  const nav = document.querySelector('.set-nav-btn[data-sec="spotlight"]');
  nav.click();
  const page = document.querySelector('.set-sec[data-sec="spotlight"]');
  const shown = page.classList.contains('on');
  const lists = document.querySelector('#spot-lists').textContent;
  const navLine = nav.textContent;
  document.querySelector('#spot-pick').click();
  // Picking happens on the board — Settings closes behind it.
  return { formOpen: shown, lists, navLine,
    formClosed: !document.querySelector('#menu').classList.contains('open'),
    pickbar: !document.querySelector('#spot-pickbar').hidden,
    prompt: document.querySelector('#spot-pick-count').textContent };
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

out.saved = await evalJs(`(async () => {
  document.querySelector('#spot-pick-save').click();
  const name = document.querySelector('#spot-list-name');
  const suggested = name.value;
  name.value = 'Probe List';
  document.querySelector('#spot-name-save').click();
  await new Promise((r) => setTimeout(r, 500)); // Settings reopens through the PIN gate
  return {
    suggested,
    lists: window.pip.spotlight.lists(),
    backOnPage: document.querySelector('#menu').classList.contains('open')
      && document.querySelector('.set-sec[data-sec="spotlight"]').classList.contains('on'),
    pickbarHidden: document.querySelector('#spot-pickbar').hidden,
  };
})()`);

// Start the saved list from the page.
await evalJs(`(() => {
  [...document.querySelectorAll('.spot-card button')]
    .find((b) => b.textContent === 'Start').click();
  return 1;
})()`);
await sleep(400);
out.running = await evalJs(glowState);

// Restart the app — the glow must come back from the synced row. Saves
// are debounced; a real restart comes long after, so flush first.
await evalJs(`window.pip.flushDb().then(() => 1)`);
await loadApp();
out.afterRestart = await evalJs(glowState);

// Midnight passes — expire the row and reload: the board stays off.
await evalJs(`(async () => {
  window.pip.db.prepare("UPDATE spotlight_session SET ends_at = ? WHERE id = 1").run(Date.now() - 1000);
  await window.pip.flushDb(); // a raw write is not persisted until flushed
  return 1;
})()`);
await loadApp();
out.afterMidnight = await evalJs(glowState);

console.log(JSON.stringify(out, null, 2));
const ok =
  out.open.formOpen && out.open.formClosed && out.open.pickbar &&
  out.open.navLine === "SpotlightOff" && out.open.prompt.startsWith("Tap the words") &&
  out.picked.count === "2 picked" && out.picked.pickedCells === 2 &&
  out.picked.sentence === 0 &&
  out.saved.lists.length === 1 && out.saved.lists[0].n === 2 &&
  out.saved.pickbarHidden && out.saved.backOnPage &&
  out.saved.suggested === "stop, want" &&
  out.running.glow === 2 && !out.running.chipHidden &&
  out.running.chip.includes("Probe List") && out.running.session &&
  out.running.untilMidnight === true &&
  out.afterRestart.glow === 2 && !out.afterRestart.chipHidden &&
  out.afterRestart.session &&
  out.afterMidnight.glow === 0 && out.afterMidnight.chipHidden &&
  !out.afterMidnight.session;
console.log(ok ? "PASS spotlight session on one device" : "FAIL — see output");
chrome.kill();
process.exit(ok ? 0 : 1);
