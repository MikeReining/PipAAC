/**
 * 014 slice 7 live proof — the `?` family tile and Expand mode.
 * On Core 15 the `?` cell at slot 13 opens its family in the Smart
 * bar: why · when · where · who in fixed slots, on every launch.
 * A pick joins the sentence and the bar returns to Predict. The
 * Parent Corner editor reorders the family and the new order is the
 * one the bar shows — position is the truth, synced as an op.
 *   node scripts/probes/family_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9264, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:8794";
rmSync("/tmp/pip-family-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-family-probe", "--no-first-run", "about:blank"]);
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
const loadApp = async () => {
  await send("Page.navigate", { url: ORIGIN });
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if (await evalJs("typeof window.pip === 'object' && !!window.pip")
      .catch(() => false)) return;
  }
  throw new Error("app did not boot");
};

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
await loadApp();

// Fresh profile: walk the welcome so the board is real, then clear the
// tour/overlay sheets the way a tap would.
for (let i = 0; i < 20; i++) {
  await sleep(300);
  if (await evalJs(`!!document.querySelector('.welcome-choice')`)
    .catch(() => false)) break;
}
await evalJs(`(() => {
  document.querySelector('.welcome-choice[data-v="child"]')?.click();
})()`);
await sleep(300);
await evalJs(`(() => { document.querySelector('.welcome-go')?.click(); })()`);
// Continue saves the profile and reloads — wait for the board again.
await loadApp();
await evalJs(`(() => { document.querySelector('.tour-skip')?.click(); })()`);
await sleep(300);
await evalJs(`(() => {
  for (const el of document.querySelectorAll('.overlay, .welcome, .tour'))
    el.style.display = 'none';
})()`);

const out = {};
const trayWords = `[...document.querySelectorAll('#tray .pred')]
  .map((c) => (c.querySelector('.plabel')?.textContent || c.textContent || '').trim())`;
// The bf_q tile reads "question" (the ? lives in its art).
const qTile = `[...document.querySelectorAll('#grid .cell')]
  .find((c) => (c.querySelector('.tlabel')?.textContent || '').trim() === 'question')`;

// Clean slate — a prior run's edits must not skew the order assertions.
// Emptying the family lets importCatalog re-seed the default order.
await evalJs(`(async () => {
  window.pip.db.exec("DELETE FROM bar_family_item; DELETE FROM bar_family;");
  const m = await import('/shared/import.mjs');
  m.importCatalog(window.pip.db, window.pip.catalog);
  return 1;
})()`);

// Core 15 — the question tile lives at slot 12.
await evalJs(`(() => {
  window.pip.db.exec(
    "UPDATE learner_profile SET board_layout = 'grid15' WHERE id = 'prf_local'");
  window.pip.repaint();
})()`);
await sleep(400);

out.tile = await evalJs(`(() => {
  const cells = [...document.querySelectorAll('#grid .cell')];
  const q = ${qTile};
  return { cells: cells.length, hasQ: !!q, slot: cells.indexOf(q) };
})()`);

// Tap it — the bar shows the family in fixed order; on Core 15 the
// Keyboard column folds so all four fit, and Groups keeps the last slot.
await evalJs(`(() => { ${qTile}?.click(); })()`);
await sleep(400);
out.expanded = await evalJs(`(() => ({
  tiles: ${trayWords},
  gridCols: document.querySelector('#tray').style.gridTemplateColumns,
}))()`);

// Tap `why` — it joins the sentence and the bar returns to Predict.
await evalJs(`(() => {
  [...document.querySelectorAll('#tray .pred')]
    .find((c) => (c.querySelector('.plabel')?.textContent || '').trim() === 'why').click();
})()`);
await sleep(400);
out.afterPick = await evalJs(`(() => ({
  bar: [...document.querySelectorAll('#bar .chip, #bar .word')]
    .map((c) => (c.textContent || '').trim()),
  tray: ${trayWords},
}))()`);

// Parent Corner → Smart bar → reorder: who to the front.
out.editor = await evalJs(`(() => {
  document.querySelector('#corner').click();
  const chip = [...document.querySelectorAll('#fam-list .fam-chip')]
    .find((c) => (c.textContent || '').includes('question'));
  chip?.click();
  const rows = [...document.querySelectorAll('#fam-items .fi-row')]
    .map((r) => (r.textContent || '').trim());
  // Move the last row (who) to the front: three ‹ taps, re-querying
  // each time — every click re-renders the list.
  for (let k = 0; k < 3; k++) {
    const who = [...document.querySelectorAll('#fam-items .fi-row')]
      .find((r) => (r.querySelector('.fi-label')?.textContent || '').includes('who'));
    who?.querySelectorAll('button')[0]?.click();
  }
  document.querySelector('#fam-save').click();
  return { rowsBefore: rows, formOpen: document.querySelector('#familyform').classList.contains('open') };
})()`);
await sleep(300);

// Reopen — the adult's order is what the bar shows.
await evalJs(`(() => { ${qTile}?.click(); })()`);
await sleep(400);
out.reordered = await evalJs(trayWords);

// Restart — the edited order persists.
await loadApp();
await evalJs(`(() => { ${qTile}?.click(); })()`);
await sleep(400);
out.afterReload = await evalJs(trayWords);

console.log(JSON.stringify(out, null, 2));
const ok =
  out.tile.cells === 15 && out.tile.hasQ && out.tile.slot === 12 &&
  out.expanded.tiles.slice(0, 4).join(" ") === "why when where who" &&
  out.afterPick.bar.join(" ").toLowerCase().includes("why") &&
  out.reordered[0] === "who" &&
  out.afterReload[0] === "who";
console.log(ok ? "PASS smart bar family expand + fixed order + editor"
  : "FAIL — see output");
chrome.kill();
process.exit(ok ? 0 : 1);
