#!/usr/bin/env node
/**
 * Density-switch probe: iPad landscape, Settings → Cells seg → grid30 →
 * Apply — then measure the strip and the Groups index for stale-geometry
 * symptoms (tray children vs template columns; door labels clipped or
 * missing). Run against an agent copy:
 *   node scripts/probes/density_probe.mjs [origin]
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const ORIGIN = process.argv[2] ?? "http://localhost:21088";
const PORT = 9266;
rmSync("/tmp/pip-density-probe", { recursive: true, force: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-density-probe", "--no-first-run", "about:blank"],
  { stdio: "ignore" });
let page = null;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500);
  page = (await (await fetch(`http://localhost:${PORT}/json`)
    .catch(() => null))?.json().catch(() => null) ?? [])
    .find((t) => t.type === "page");
}
if (!page) { chrome.kill(); throw new Error("chrome CDP never came up"); }
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
  const r = await send("Runtime.evaluate",
    { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails };
  return r.result?.result?.value;
};
const loadApp = async (url = ORIGIN) => {
  await send("Page.navigate", { url });
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if (await evalJs("typeof window.pip === 'object' && !!window.pip?.db")
      .catch(() => false)) return;
  }
  throw new Error("app did not boot");
};

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 1180, height: 820, deviceScaleFactor: 1, mobile: true });
await loadApp();

const dump = `(() => {
  const strip = document.getElementById('strip');
  const tray = document.getElementById('tray');
  const tr = tray.getBoundingClientRect();
  const cs = getComputedStyle(tray);
  const kids = [...tray.children].map((k) =>
    k.className + ':' + (k.textContent || '').trim().slice(0, 12));
  const doors = [...document.querySelectorAll('#groupgrid .gcell.door')].map((d) => {
    const lb = d.querySelector('.glabel');
    const im = d.querySelector('.glyph img');
    const ir = im?.getBoundingClientRect();
    if (!lb) return { label: null };
    const lr = lb.getBoundingClientRect(), dr = d.getBoundingClientRect();
    return {
      label: lb.textContent,
      fs: getComputedStyle(lb).fontSize,
      cellH: Math.round(dr.height),
      imgH: ir ? Math.round(ir.height) : null,
      clipped: lr.bottom > dr.bottom - 2 || lr.top < dr.top - 2 || lr.height === 0,
    };
  });
  return {
    stripCols: strip.style.gridTemplateColumns,
    trayCols: tray.style.gridTemplateColumns,
    traySpan: cs.gridColumn,
    trayH: Math.round(tr.height),
    stripH: Math.round(strip.getBoundingClientRect().height),
    kids,
    doors: doors.slice(0, 12),
    doorCount: doors.length,
  };
})()`;

const out = {};
out.before = await evalJs(dump);

// Settings → Board → Cells seg → 30 → Apply (the real owner path).
await evalJs(`document.getElementById('corner').click()`);
await sleep(300);
out.picked = await evalJs(`(() => {
  const b = [...document.querySelectorAll('#cells-seg button')]
    .find((b) => b.dataset.v === 'grid30');
  if (!b) return null;
  b.click();
  return b.dataset.v;
})()`);
await sleep(300);
await evalJs(`document.getElementById('cells-apply').click()`);
await sleep(600);
out.afterApply = await evalJs(dump);

// Tap a word so the faces claim the last slot — the 2026-10-01 fix's
// proof: grid30 must still show three word cards + faces, not one.
await evalJs(`document.querySelector('#grid .cell:not(.ghost)')?.click()`);
await sleep(600);
out.withWord = await evalJs(dump);

// Into the Groups index — door labels at the new size.
await evalJs(`document.getElementById('anchor-groups').click()`);
await sleep(600);
out.groupIndex = await evalJs(dump);

// Back to the board, switch to grid60, re-open the index — the user's
// landscape screenshot showed the wider grid where cells are shortest.
await evalJs(`document.getElementById('anchor-groups').click()`);
await sleep(400);
await evalJs(`document.getElementById('corner').click()`);
await sleep(300);
await evalJs(`(() => {
  const b = [...document.querySelectorAll('#cells-seg button')]
    .find((b) => b.dataset.v === 'grid60');
  if (b) b.click();
})()`);
await sleep(300);
await evalJs(`document.getElementById('cells-apply').click()`);
await sleep(600);
await evalJs(`document.getElementById('anchor-groups').click()`);
await sleep(600);
out.grid60Index = await evalJs(dump);

console.log(JSON.stringify(out, null, 2));
chrome.kill();
