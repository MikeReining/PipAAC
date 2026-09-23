/**
 * 014 slice 4 live proof — the Cells picker, move-cost preview, and
 * transition highlight. Owner-visible path: Parent Corner → Cells seg →
 * pick 90 → the preview sheet lists what moves BEFORE anything does →
 * Apply → the board redraws at 90 cells and moved words carry the soft
 * `.moved` ring. An adult override made on grid60 survives the switch
 * and lands again when the adult switches back. The four grammar
 * groups render on the Groups index.
 *   node scripts/probes/cells_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9263, ORIGIN = "http://localhost:8794";
rmSync("/tmp/pip-cells-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-cells-probe", "--no-first-run", "about:blank"]);
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

const out = {};

// An adult override on grid60 first (through the real write owner):
// `stop` moves to slot 2 — the switch must not erase it.
out.override = await evalJs(`(async () => {
  const m = await import('/shared/coremove.mjs');
  const stop = window.pip.db.prepare(
    "SELECT sense_id FROM label WHERE text='stop' AND kind='lemma' AND locale='en' AND status='approved'"
  ).all()[0].sense_id;
  m.moveCore(window.pip.db, 'grid60', stop, 2);
  window.pip.repaint();
  await new Promise((r) => setTimeout(r, 300));
  const words = [...document.querySelectorAll('#grid .cell')]
    .map((c) => (c.textContent || '').trim());
  return { slot2: words[2], count: words.length };
})()`);

// Parent Corner → the Cells segment.
out.seg = await evalJs(`(() => {
  document.querySelector('#corner').click();
  const btns = [...document.querySelectorAll('#cells-seg button')]
    .map((b) => ({ v: b.dataset.v, on: b.classList.contains('on') }));
  return { btns, adultOnly: !document.body.classList.contains('editing') };
})()`);

// Pick 90 — the preview opens BEFORE anything changes.
out.preview = await evalJs(`(() => {
  const layoutBefore = window.pip.db.prepare(
    "SELECT board_layout AS l FROM learner_profile WHERE id='prf_local'").all()[0].l;
  [...document.querySelectorAll('#cells-seg button')]
    .find((b) => b.dataset.v === 'grid90').click();
  return {
    layoutBefore,
    layoutStill: window.pip.db.prepare(
      "SELECT board_layout AS l FROM learner_profile WHERE id='prf_local'").all()[0].l,
    formOpen: document.querySelector('#cellsform').classList.contains('open'),
    title: document.querySelector('#cells-title').textContent,
    summary: document.querySelector('#cells-summary').textContent,
    rows: document.querySelectorAll('#cells-moved .mv-row').length,
  };
})()`);

// Apply — the board redraws at 90 and moved words carry the ring.
await evalJs(`document.querySelector('#cells-apply').click()`);
await sleep(400);
out.applied = await evalJs(`(() => ({
  layout: window.pip.db.prepare(
    "SELECT board_layout AS l FROM learner_profile WHERE id='prf_local'").all()[0].l,
  cells: document.querySelectorAll('#grid .cell').length,
  movedCells: document.querySelectorAll('#grid .cell.moved').length,
  markRows: window.pip.db.prepare("SELECT COUNT(*) AS n FROM move_mark").all()[0].n,
  seg90on: [...document.querySelectorAll('#cells-seg button')]
    .find((b) => b.dataset.v === 'grid90').classList.contains('on'),
}))()`);

// The four grammar groups render on the Groups index.
await evalJs(`document.querySelector('#anchor-groups').click()`);
await sleep(300);
out.grammarGroups = await evalJs(`(() => {
  const tiles = [...document.querySelectorAll('#groupgrid .gcell')]
    .map((c) => (c.textContent || '').trim());
  return {
    people: tiles.some((t) => t.includes('More people')),
    doing: tiles.some((t) => t.includes('More doing')),
    where: tiles.some((t) => t.includes('More where')),
    describing: tiles.some((t) => t.includes('More describing')),
  };
})()`);

// Back to the board, switch back to 60 — the override lands again.
out.back = await evalJs(`(async () => {
  [...document.querySelectorAll('#groupgrid .gcell')]
    .find((c) => (c.textContent || '').includes('Board'))?.click();
  document.querySelector('#corner').click();
  [...document.querySelectorAll('#cells-seg button')]
    .find((b) => b.dataset.v === 'grid60').click();
  document.querySelector('#cells-apply').click();
  await new Promise((r) => setTimeout(r, 400));
  const words = [...document.querySelectorAll('#grid .cell')]
    .map((c) => (c.textContent || '').trim());
  return { cells: words.length, slot2: words[2] };
})()`);

// Restart — the layout and marks persist.
await loadApp();
out.afterReload = await evalJs(`(() => ({
  layout: window.pip.db.prepare(
    "SELECT board_layout AS l FROM learner_profile WHERE id='prf_local'").all()[0].l,
  cells: document.querySelectorAll('#grid .cell').length,
}))()`);

console.log(JSON.stringify(out, null, 2));
const ok =
  out.override.slot2 === "stop" &&
  out.seg.btns.length === 3 && out.seg.btns.find((b) => b.v === "grid60")?.on &&
  out.preview.layoutBefore === "grid60" &&
  out.preview.layoutStill === "grid60" &&   // preview changed nothing
  out.preview.formOpen && out.preview.rows > 0 &&
  out.preview.summary.length > 0;
const ok2 =
  out.applied.layout === "grid90" &&
  out.applied.cells > 60 &&
  out.applied.movedCells > 0 &&
  out.applied.markRows === out.applied.movedCells &&
  out.grammarGroups.people && out.grammarGroups.doing &&
  out.grammarGroups.where && out.grammarGroups.describing &&
  out.back.slot2 === "stop" &&              // the override landed again
  out.afterReload.layout === "grid60" &&
  out.afterReload.cells === out.back.cells;
console.log(ok && ok2 ? "PASS cells picker + move cost + transition marks"
  : "FAIL — see output");
chrome.kill();
process.exit(ok && ok2 ? 0 : 1);
