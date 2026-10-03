/**
 * 038 live proof — the Sentence bar setting on the real page: the DOM
 * itself is the instrument (button .hidden, #speak's computed width,
 * --play-grow on #topbar, the stored learner_profile column), never the
 * setting's own report. Media play is spied so "hear the sentence" is
 * measured on the audio element, not a toast.
 *   PIP_ORIGIN=http://localhost:21089 node scripts/probes/bar_settings_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9261, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:21089";
rmSync("/tmp/pip-bar-settings-probe", { recursive: true, force: true });
const CHROME = process.env.CHROME_BIN
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-bar-settings-probe", "--no-first-run", "about:blank"], { stdio: "ignore" });
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

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: ORIGIN });
let booted = false;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  if (await evalJs("typeof window.pip === 'object' && !!window.pip").catch(() => false)) {
    booted = true; break;
  }
}
if (!booted) throw new Error("app did not boot");

// A fresh profile opens to first-open setup and then the tour — pass both.
// The welcome's Continue navigates to a fresh document (034): re-wait for
// window.pip on the new page before touching the DOM.
await evalJs(`(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  if (document.querySelector('#welcome-name')) {
    document.querySelector('#welcome-name').value = 'Probe';
    document.querySelector('.welcome-choice[data-v="child"]').click();
    document.querySelector('.welcome-go').click();
    await w(1000);
  }
  return 1;
})()`);
for (let i = 0; i < 40; i++) {
  await sleep(500);
  if (await evalJs("typeof window.pip === 'object' && !!window.pip && !!document.getElementById('speak')")
    .catch(() => false)) break;
}
await evalJs(`(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  [...document.querySelectorAll('button')]
    .find((b) => b.offsetParent && b.textContent.trim() === 'Skip')?.click();
  await w(300);
  return 1;
})()`);

const out = {};
const w = "const w = (ms) => new Promise((r) => setTimeout(r, ms));";
const vis = (id) => `!document.getElementById('${id}').hidden`;

// Default: Everything — every button shows, Play at its base width.
out.fresh = await evalJs(`(() => ({
  fix: ${vis("tx-fix")}, question: ${vis("tx-question")},
  past: ${vis("tx-past")}, future: ${vis("tx-future")},
  backspace: ${vis("backspace")}, clear: ${vis("clear")},
  grow: document.getElementById('topbar').style.getPropertyValue('--play-grow') || "0",
  speakW: getComputedStyle(document.getElementById('speak')).width,
  stored: window.pip.db.prepare(
    "SELECT bar_controls AS c FROM learner_profile WHERE id='prf_local'").all()[0].c,
}))()`);

// Settings → Talking → Just play: only Play, grown.
out.justPlay = await evalJs(`(async () => { ${w}
  window.__plays = 0;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__plays++; return Promise.resolve(); };
  document.querySelector('#corner').click(); await w(500);
  document.querySelector('.set-nav-btn[data-sec="talking"]').click(); await w(200);
  document.querySelector('#bar-preset button[data-v="play"]').click(); await w(200);
  const shown = [...document.querySelectorAll('#bar-toggles button')]
    .filter((b) => b.classList.contains('on')).map((b) => b.dataset.c);
  const preset = document.querySelector('#bar-preset button.on')?.dataset.v;
  const subtitle = [...document.querySelectorAll('.set-nav-btn[data-sec="talking"] .set-sum')]
    .map((s) => s.textContent).join();
  document.querySelector('#set-done').click(); await w(300);
  return {
    shown, preset, subtitle,
    fix: ${vis("tx-fix")}, question: ${vis("tx-question")},
    past: ${vis("tx-past")}, future: ${vis("tx-future")},
    backspace: ${vis("backspace")}, clear: ${vis("clear")},
    dockHidden: document.getElementById('bar-btns').hidden,
    speak: ${vis("speak")},
    grow: document.getElementById('topbar').style.getPropertyValue('--play-grow'),
    speakW: getComputedStyle(document.getElementById('speak')).width,
    stored: window.pip.db.prepare(
      "SELECT bar_controls AS c FROM learner_profile WHERE id='prf_local'").all()[0].c,
  };
})()`);

// The bar still works: a word goes in, Play speaks it (the media element
// is the instrument — a disabled or dead button can't fake play()).
out.plays = await evalJs(`(async () => { ${w}
  const cell = [...document.querySelectorAll('#grid .cell')]
    .find((c) => c.textContent.trim().toLowerCase() === 'want')
    ?? document.querySelector('#grid .cell');
  cell.click(); await w(400);
  const sentence = window.pip.sentence.length;
  document.getElementById('speak').click(); await w(600);
  return { sentence, plays: window.__plays,
    speakEnabled: !document.getElementById('speak').disabled };
})()`);

// Play + Question: only ❓ joins Play; the warn line shows for Backspace.
out.playQuestion = await evalJs(`(async () => { ${w}
  document.querySelector('#corner').click(); await w(500);
  document.querySelector('.set-nav-btn[data-sec="talking"]').click(); await w(200);
  document.querySelector('#bar-preset button[data-v="question"]').click(); await w(200);
  const r = {
    shown: [...document.querySelectorAll('#bar-toggles button')]
      .filter((b) => b.classList.contains('on')).map((b) => b.dataset.c),
    warn: !document.getElementById('bar-warn').hidden,
    question: ${vis("tx-question")}, fix: ${vis("tx-fix")},
    grow: document.getElementById('topbar').style.getPropertyValue('--play-grow'),
    stored: window.pip.db.prepare(
      "SELECT bar_controls AS c FROM learner_profile WHERE id='prf_local'").all()[0].c,
  };
  // A hidden button is never a spotlight target; a shown one is.
  const spot = window.pip.spotlight.start(
    ["control:fix", "control:question", "sense:sns_0015"], "probe");
  r.spotSkipped = spot.skipped;
  r.spotHas = [...window.pip.spotlight.active.targets];
  window.pip.spotlight.end();
  document.querySelector('#set-done').click();
  return r;
})()`);

console.log(JSON.stringify(out, null, 2));
ws.close();
chrome.kill();
