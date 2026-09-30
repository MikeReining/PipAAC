/**
 * 032 slices C and E live proof — Try it, suggested lists, and ✨ / ❓ as
 * targets, through the real
 * page on a fresh profile. Try it must glow the real grid while leaving no
 * trace: no spotlight_session row, no sync op, no tap in the log, nothing
 * in the sentence — measured in the tables and the DOM, never the demo's
 * own report. Then it ends and the page is back.
 *   PIP_ORIGIN=http://localhost:21089 node scripts/probes/spot_demo_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9258, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:21089";
rmSync("/tmp/pip-spot-demo-probe", { recursive: true, force: true });
// The binary itself, not `open -na`: kill() then reaches Chrome, and a
// running Chrome can't swallow the launch.
const CHROME = process.env.CHROME_BIN
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-spot-demo-probe", "--no-first-run", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 40; i++) {
  await sleep(250);
  if (await fetch(`http://localhost:${PORT}/json`).then(() => true, () => false)) break;
}

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
const count = (t) => `window.pip.db.prepare("SELECT COUNT(*) c FROM ${t}").all()[0].c`;

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
await evalJs(`(() => {
  window.pip.db.exec("DELETE FROM spotlight_item; DELETE FROM spotlight_list; DELETE FROM spotlight_session;");
  return 1;
})()`);
const w = "const w = (ms) => new Promise((r) => setTimeout(r, ms));";

// Suggested lists: all three show while nothing is saved; one tap keeps one.
out.ideas = await evalJs(`(async () => { ${w}
  document.querySelector('#corner').click(); await w(500);
  document.querySelector('.set-nav-btn[data-sec="spotlight"]').click();
  const names = () => [...document.querySelectorAll('.spot-idea .spot-list-name')].map((n) => n.textContent);
  const before = names();
  document.querySelector('.spot-idea .btn').click();
  return { before, after: names(), lists: window.pip.spotlight.lists().map((l) => [l.name, l.n]) };
})()`);

// Try it: measure the grid, the tables, and the sentence — not the demo's report.
out.demo = await evalJs(`(async () => { ${w}
  const ops0 = ${count("sync_op")}, taps0 = ${count("learner_event_log")};
  document.querySelector('#spot-try').click(); await w(400);
  const lit = { glow: document.querySelectorAll('#grid .cell.glow').length,
    dimmed: document.querySelectorAll('#grid .cell.dimmed').length,
    settingsClosed: !document.querySelector('#menu').classList.contains('open') };
  document.querySelector('.spot-demo-card .btn').click(); await w(200);
  // A dimmed word still speaks — and finishes step 2 by itself.
  [...document.querySelectorAll('#grid .cell.dimmed')][0].click(); await w(1000);
  const step = document.querySelector('.spot-demo-card .tour-note').textContent;
  const ledger = { ops: ${count("sync_op")} - ops0, taps: ${count("learner_event_log")} - taps0,
    sessions: ${count("spotlight_session")}, sentence: window.pip.sentence.length };
  document.querySelector('#spot-chip').click(); await w(600);
  return { lit, step, ledger,
    after: { glow: document.querySelectorAll('#grid .cell.glow').length,
      dimmed: document.querySelectorAll('#grid .cell.dimmed').length,
      card: !!document.querySelector('.spot-demo-card'),
      backOnPage: document.querySelector('#menu').classList.contains('open')
        && document.querySelector('.set-sec[data-sec="spotlight"]').classList.contains('on') } };
})()`);

// While a real spotlight runs, Try it steps aside.
out.running = await evalJs(`(async () => { ${w}
  document.querySelector('.spot-card .btn').click(); await w(300);
  document.querySelector('#corner').click(); await w(500);
  document.querySelector('.set-nav-btn[data-sec="spotlight"]').click();
  return { tryHidden: document.querySelector('#spot-try').hidden,
    glow: document.querySelectorAll('#grid .cell.glow').length };
})()`);

// 032 E — moves: a suggested list lights ✨ in the real top bar, and in
// pick mode ✨ is a choosable target that lands on the saved list.
out.moves = await evalJs(`(async () => { ${w}
  document.querySelector('#spot-end')?.click(); await w(200);
  const idea = [...document.querySelectorAll('.spot-idea')]
    .find((c) => c.querySelector('.spot-list-name').textContent === 'Make it a sentence');
  const recipe = idea.querySelector('.spot-recipe')?.textContent ?? '';
  idea.querySelector('.btn').click(); await w(200);
  [...document.querySelectorAll('.spot-card')]
    .find((c) => c.querySelector('.spot-list-name').textContent === 'Make it a sentence')
    .querySelector('.btn').click();
  await w(400);
  const lit = { fix: document.querySelector('#tx-fix').classList.contains('glow'),
    question: document.querySelector('#tx-question').classList.contains('glow'),
    cells: document.querySelectorAll('#grid .cell.glow').length,
    walk: document.querySelector('#anchor-groups').classList.contains('glow') };
  document.querySelector('#spot-chip').click(); await w(200);
  // Pick mode: one word and ❓, then Save.
  document.querySelector('#corner').click(); await w(500);
  document.querySelector('.set-nav-btn[data-sec="spotlight"]').click();
  document.querySelector('#spot-pick').click(); await w(200);
  [...document.querySelectorAll('#grid .cell')].find((c) => c.textContent.trim().toLowerCase() === 'go').click();
  const qDisabled = document.querySelector('#tx-question').disabled;
  document.querySelector('#tx-question').click(); await w(100);
  const picked = { count: document.querySelector('#spot-pick-count').textContent,
    ring: document.querySelector('#tx-question').classList.contains('picked'), qDisabled,
    sentence: window.pip.sentence.length };
  document.querySelector('#spot-pick-save').click();
  document.querySelector('#spot-list-name').value = 'Go ask';
  document.querySelector('#spot-name-save').click(); await w(600);
  const saved = window.pip.spotlight.lists().find((l) => l.name === 'Go ask');
  return { recipe, lit, picked, saved: saved && { n: saved.n, controls: saved.controls },
    afterPick: document.querySelector('#tx-question').disabled };
})()`);

console.log(JSON.stringify(out, null, 2));
const ok =
  out.ideas.before.join() === "First words,Snack time,Play time,Make it a sentence,Ask a question,Say no" &&
  out.ideas.after.join() === "Snack time,Play time,Make it a sentence,Ask a question,Say no" &&
  out.ideas.lists.length === 1 && out.ideas.lists[0][1] === 6 &&
  out.demo.lit.glow === 6 && out.demo.lit.dimmed > 0 && out.demo.lit.settingsClosed &&
  out.demo.step.includes("3 of 3") &&
  out.demo.ledger.ops === 0 && out.demo.ledger.taps === 0 &&
  out.demo.ledger.sessions === 0 && out.demo.ledger.sentence === 0 &&
  out.demo.after.glow === 0 && out.demo.after.dimmed === 0 && !out.demo.after.card &&
  out.demo.after.backOnPage &&
  out.running.tryHidden && out.running.glow === 6 &&
  out.moves.recipe.includes("✨") &&
  out.moves.lit.fix && !out.moves.lit.question && out.moves.lit.cells === 4 && !out.moves.lit.walk &&
  !out.moves.picked.qDisabled && out.moves.picked.ring && out.moves.picked.count === "2 picked" &&
  out.moves.picked.sentence === 0 &&
  out.moves.saved?.n === 1 && out.moves.saved.controls.join() === "question" &&
  out.moves.afterPick === true;
console.log(ok ? "PASS spotlight try-it and suggested lists" : "FAIL — see output");
chrome.kill();
process.exit(ok ? 0 : 1);
