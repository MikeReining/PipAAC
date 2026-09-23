/**
 * 014 slice 1 live proof: the same board renders at 15, 60, and 90
 * cells — bar and strip in place, Groups/Keyboard anchors visible, no
 * cell under the minimum touch size. grid15 isn't a shipped map yet
 * (slice 2 writes the starters) so the probe injects the shape and its
 * cells at runtime — what the renderer must handle, not the catalog.
 *   node scripts/probes/layout_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9254, ORIGIN = "http://localhost:8794", MIN_PX = 40;
rmSync("/tmp/pip-layout-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-layout-probe", "--no-first-run", "about:blank"]);
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

const measure = `(async () => {
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cells = [...document.querySelectorAll('#grid .cell')];
  const sizes = cells.map((c) => {
    const r = c.getBoundingClientRect();
    return Math.min(r.width, r.height);
  });
  const preds = document.querySelectorAll('#tray .pred').length;
  const anchors = [...document.querySelectorAll('#strip .anchor')]
    .map((a) => a.textContent.trim());
  const bar = document.querySelector('#bar').getBoundingClientRect();
  return {
    layout: window.pip.db.prepare(
      "SELECT board_layout AS l FROM learner_profile WHERE id='prf_local'").all()[0].l,
    cells: cells.length,
    minCell: Math.min(...sizes),
    zeroCells: sizes.filter((s) => s === 0).length,
    gridRect: (() => { const r = document.querySelector('#grid').getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)]; })(),
    bodyClass: document.body.className,
    preds, anchors, barVisible: bar.width > 0,
    groupAnchorCell: !!document.querySelector('#grid .anchor-cell'),
  };
})()`;

const out = {};

// grid60 — the shipped default.
out.grid60 = await evalJs(measure);

// grid90 — ships in the catalog: 83 words + Groups cell + 6 reserved.
await evalJs(`window.pip.db.exec(
  "UPDATE learner_profile SET board_layout = 'grid90' WHERE id = 'prf_local'")`);
await evalJs(`window.pip.repaint()`);
await sleep(400);
out.grid90 = await evalJs(measure);

// grid15 — injected shape (5×3) over the first 15 grid60 words.
await evalJs(`(() => {
  window.pip.catalog.layouts.grid15 = { cols: 5, rows: 3, anchors: [] };
  const rows = window.pip.db.prepare(
    "SELECT sense_id FROM core_cell WHERE layout = 'grid60' ORDER BY slot_index LIMIT 15").all();
  const ins = window.pip.db.prepare(
    "INSERT OR IGNORE INTO core_cell (id, layout, sense_id, slot_index) VALUES (?, 'grid15', ?, ?)");
  rows.forEach((r, i) => ins.run('cel_grid15_' + String(i).padStart(3, '0'), r.sense_id, i));
  window.pip.db.exec(
    "UPDATE learner_profile SET board_layout = 'grid15' WHERE id = 'prf_local'");
})()`);
await evalJs(`window.pip.repaint()`);
await sleep(400);
out.grid15 = await evalJs(measure);

// A group page at 15 cells: 12 items + Next (Food has ~30 items).
await evalJs(`document.querySelector('#anchor-groups').click()`);
await sleep(400);
out.index15 = await evalJs(`(() => {
  const cells = document.querySelectorAll('#groupgrid .gcell').length;
  const next = [...document.querySelectorAll('#groupgrid .gcell')]
    .find((n) => (n.textContent || '').includes('Next'));
  return { cells, hasNext: !!next };
})()`);
await evalJs(`(() => {
  const g = [...document.querySelectorAll('#groupgrid .gcell')]
    .find((n) => (n.textContent || '').trim().startsWith('Food'));
  g?.click();
})()`);
await sleep(400);
out.food15 = await evalJs(`(() => {
  const cells = [...document.querySelectorAll('#groupgrid .gcell')];
  const items = cells.filter((c) => c.dataset.slot).length;
  const next = cells.find((c) => (c.textContent || '').includes('Next'));
  return { cells: cells.length, items, nextBadge: next?.querySelector('.badge')?.textContent ?? null };
})()`);

// Back to the board (page → index → board), then back to grid60.
await evalJs(`(() => {
  [...document.querySelectorAll('#groupgrid .gcell')]
    .find((n) => (n.textContent || '').includes('Groups'))?.click();
})()`);
await sleep(300);
await evalJs(`(() => {
  [...document.querySelectorAll('#groupgrid .gcell')]
    .find((n) => (n.textContent || '').includes('Board'))?.click();
})()`);
await sleep(300);
await evalJs(`window.pip.db.exec(
  "UPDATE learner_profile SET board_layout = 'grid60' WHERE id = 'prf_local'")`);
await evalJs(`window.pip.repaint()`);
await sleep(400);
out.backTo60 = await evalJs(measure);

console.log(JSON.stringify(out, null, 2));
ws.close(); chrome.kill();
