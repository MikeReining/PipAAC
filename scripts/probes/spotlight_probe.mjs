/**
 * 013 slice 1 live proof — the layer's laws on the real board: a
 * spotlight on `stop` (board word) + `juice` (group word) dims every
 * other cell and walks the route; tapping a DIMMED cell still speaks
 * and joins the sentence; the coordinate map is byte-identical; the
 * chip ends it.
 *   node scripts/probes/spotlight_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9255, ORIGIN = "http://localhost:8794";
rmSync("/tmp/pip-spot-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-spot-probe", "--no-first-run", "about:blank"]);
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
const mapDump = `JSON.stringify({
  core: window.pip.db.prepare("SELECT * FROM core_cell ORDER BY layout, slot_index").all(),
  grp: window.pip.db.prepare("SELECT * FROM group_cell ORDER BY group_id, layout, page, slot_index").all() })`;

out.mapBefore = await evalJs(mapDump);

// Spotlight: `stop` (on the board) + `juice` (inside a group).
out.start = await evalJs(`(() => {
  const sid = (w) => window.pip.db.prepare(
    "SELECT sense_id AS s FROM label WHERE text=? AND kind='lemma' AND locale='en' AND status='approved'"
  ).all(w)[0].s;
  return window.pip.spotlight.start(['sense:' + sid('stop'), 'sense:' + sid('juice')], 'Brown Bear');
})()`);
await sleep(300);

out.board = await evalJs(`(() => {
  const cells = [...document.querySelectorAll('#grid .cell')];
  const cls = (w) => cells.find((c) =>
    (c.textContent || '').trim().toLowerCase() === w)?.className ?? null;
  return {
    glow: cells.filter((c) => c.classList.contains('glow')).length,
    dimmed: cells.filter((c) => c.classList.contains('dimmed')).length,
    stop: cls('stop'),
    want: cls('want'),
    anchorGlow: document.querySelector('#anchor-groups').classList.contains('glow'),
    chip: document.querySelector('#spot-chip').textContent,
    chipHidden: document.querySelector('#spot-chip').hidden,
  };
})()`);

// Law 1 — never a muzzle: tap a DIMMED cell; it must speak + append.
out.tapDimmed = await evalJs(`(() => {
  const c = [...document.querySelectorAll('#grid .cell')]
    .find((n) => n.classList.contains('dimmed'));
  const label = (c.textContent || '').trim();
  c.click();
  return { label };
})()`);
await sleep(400);
out.afterTap = await evalJs(`(() => ({
  sentence: window.pip.sentence.map((i) => i.text ?? i.id),
  events: window.pip.db.prepare("SELECT COUNT(*) AS n FROM learner_event_log").all()[0].n,
}))()`);

// Route walk — the group index glows the containing group's tile.
await evalJs(`document.querySelector('#anchor-groups').click()`);
await sleep(400);
out.index = await evalJs(`(() => {
  const cells = [...document.querySelectorAll('#groupgrid .gcell')];
  return {
    glowing: cells.filter((c) => c.classList.contains('glow'))
      .map((c) => (c.textContent || '').trim()),
    dimmed: cells.filter((c) => c.classList.contains('dimmed')).length,
  };
})()`);

// Into the glowing group — `juice`'s cell glows.
await evalJs(`(() => {
  [...document.querySelectorAll('#groupgrid .gcell.glow')][0]?.click();
})()`);
await sleep(500);
out.groupPage = await evalJs(`(() => {
  const cells = [...document.querySelectorAll('#groupgrid .cell')];
  return {
    juice: cells.find((c) => (c.textContent || '').trim().toLowerCase() === 'juice')
      ?.className ?? 'not on page 1',
    glowCount: cells.filter((c) => c.classList.contains('glow')).length,
  };
})()`);

// The chip ends it — everything clears.
await evalJs(`document.querySelector('#spot-chip').click()`);
await sleep(300);
await evalJs(`(() => {
  [...document.querySelectorAll('#groupgrid .gcell')]
    .find((n) => (n.textContent || '').includes('Groups'))?.click();
})()`);
await sleep(200);
await evalJs(`(() => {
  [...document.querySelectorAll('#groupgrid .gcell')]
    .find((n) => (n.textContent || '').includes('Board'))?.click();
})()`);
await sleep(300);
out.afterEnd = await evalJs(`(() => ({
  glow: document.querySelectorAll('#grid .glow').length,
  dimmed: document.querySelectorAll('#grid .dimmed').length,
  chipHidden: document.querySelector('#spot-chip').hidden,
  anchorGlow: document.querySelector('#anchor-groups').classList.contains('glow'),
}))()`);
out.mapAfter = await evalJs(mapDump);
out.mapIdentical = out.mapBefore === out.mapAfter;

console.log(JSON.stringify(out, null, 2));
ws.close(); chrome.kill();
