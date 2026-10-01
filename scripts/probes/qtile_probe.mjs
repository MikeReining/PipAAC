/** One-off visual proof: the bf_q family tile draws as a Purple word
 *  tile — label strip "question", ? art on white. */
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9270, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:21090";
rmSync("/tmp/pip-qtile-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-qtile-probe", "--no-first-run", "about:blank"]);
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
  { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: `${ORIGIN}/?reseed` });
let booted = false;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  if (await evalJs("typeof window.pip === 'object' && !!window.pip")
    .catch(() => false)) { booted = true; break; }
}
if (!booted) { console.log("FAIL: app did not boot"); chrome.kill(); process.exit(1); }

// Welcome screen: "A child" → Continue → save + reload.
await evalJs(`(() => {
  document.querySelector('.welcome-choice[data-v="child"]')?.click();
})()`);
await sleep(300);
await evalJs(`(() => { document.querySelector('.welcome-go')?.click(); })()`);
booted = false;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  if (await evalJs(`typeof window.pip === 'object' && !!window.pip
      && !document.querySelector('.welcome')`)
    .catch(() => false)) { booted = true; break; }
}
if (!booted) { console.log("FAIL: board never showed"); chrome.kill(); process.exit(1); }

// The demo/tour sheet may sit over the board — skip it properly.
await evalJs(`(() => { document.querySelector('.tour-skip')?.click(); })()`);
await sleep(300);
await evalJs(`(() => {
  for (const el of document.querySelectorAll('.overlay, .welcome, .tour'))
    el.style.display = 'none';
})()`);
await evalJs(`(() => {
  window.pip.db.exec(
    "UPDATE learner_profile SET board_layout = 'grid15' WHERE id = 'prf_local'");
  window.pip.repaint();
})()`);
await sleep(800);

const out = await evalJs(`(() => {
  const cells = [...document.querySelectorAll('#grid .cell')];
  const i = cells.findIndex((c) =>
    (c.querySelector('.tlabel')?.textContent || '').trim() === 'question');
  const q = cells[i];
  const fam = window.pip.db
    .prepare("SELECT name, glyph, speaks FROM bar_family WHERE id = 'bf_q'").all()[0];
  return {
    cells: cells.length,
    slot: i,
    cls: q?.className ?? null,
    label: q?.querySelector('.tlabel')?.textContent ?? null,
    img: q?.querySelector('.tart img')?.getAttribute('src') ?? null,
    family: fam ?? null,
    gridCols: document.querySelector('#grid').style.gridTemplateColumns,
  };
})()`);
console.log(JSON.stringify(out, null, 2));

await sleep(400);

const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
if (!shot.result?.data) { console.log("shot err:", JSON.stringify(shot).slice(0, 300)); }
else writeFileSync("/tmp/qtile_board.png", Buffer.from(shot.result.data, "base64"));

const ok = out.cells === 15 && out.slot === 12
  && /r-Purple/.test(out.cls ?? "") && !/anchor-cell/.test(out.cls ?? "")
  && out.label === "question" && out.img === "/symbols/question.svg"
  && out.family?.name === "question";
console.log(ok ? "PASS bf_q renders as a Purple word tile" : "FAIL — see output");

// Expand mode on Core 15: tapping the tile must show all four family
// words — the Keyboard column folds so `who` isn't clipped into a
// second row, and Groups slides into the last slot (2026-10-01).
await evalJs(`(() => {
  const q = [...document.querySelectorAll('#grid .cell')]
    .find((c) => (c.querySelector('.tlabel')?.textContent || '').trim() === 'question');
  q?.click();
})()`);
await sleep(600);

const expanded = await evalJs(`(() => {
  const trayCols = document.querySelector('#tray').style.gridTemplateColumns;
  const cards = [...document.querySelectorAll('#tray .pred')]
    .map((e) => e.querySelector('.plabel')?.textContent?.trim() ?? '?');
  return {
    cards,
    traySpan: document.querySelector('#tray').style.gridColumn,
    trayCols,
    kbHidden: document.getElementById('anchor-kb').hidden,
    groupsShown: !document.getElementById('anchor-groups').hidden,
  };
})()`);
console.log(JSON.stringify(expanded, null, 2));

const shot2 = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
if (shot2.result?.data) writeFileSync("/tmp/qtile_expanded.png", Buffer.from(shot2.result.data, "base64"));

const okExpand = JSON.stringify(expanded.cards.slice(0, 4))
    === JSON.stringify(["why", "when", "where", "who"])
  && expanded.kbHidden && expanded.groupsShown
  && /span 4/.test(expanded.traySpan);
console.log(okExpand
  ? "PASS expand shows why · when · where · who; Keyboard folds, Groups stays"
  : "FAIL expand — see output");

// Pick `who` — the bar returns to Predict and the Keyboard anchor returns.
await evalJs(`(() => {
  [...document.querySelectorAll('#tray .pred')]
    .find((e) => e.querySelector('.plabel')?.textContent?.trim() === 'who')
    ?.click();
})()`);
await sleep(600);
const after = await evalJs(`(() => ({
  kbHidden: document.getElementById('anchor-kb').hidden,
  sent: [...document.querySelectorAll('#sentence .word, #sent .word, .sent-word')]
    .map((e) => e.textContent.trim()).join(' '),
}))()`);
console.log(JSON.stringify(after));
const okBack = after.kbHidden === false;
console.log(okBack ? "PASS Keyboard anchor restored after pick" : "FAIL anchor stayed hidden");

const pass = ok && okExpand && okBack;
chrome.kill();
process.exit(pass ? 0 : 1);
