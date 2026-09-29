/**
 * Tour audio probe — real-input edition. Same instrumentation, but taps
 * go through Input.dispatchMouseEvent (true user activation) and Chrome
 * runs its real autoplay policy — what a user's tap actually gets.
 *   node scripts/probes/tour_audio_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:21088";
const PORT = 9266;
const PROFILE = "/tmp/pip-tour-audio-probe-real";

rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, "--no-first-run", "about:blank"]);

let ws = null, mid = 0;
const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => {
  const id = ++mid; pending.set(id, res);
  try { ws.send(JSON.stringify({ id, method: m, params: p })); }
  catch (e) { pending.delete(id); rej(e); }
});
const consoleEvents = [];
let page = null;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500);
  page = await fetch(`http://localhost:${PORT}/json`)
    .then((r) => r.json())
    .then((t) => t.find((x) => x.type === "page"))
    .catch(() => null);
}
if (!page) throw new Error("chrome did not come up");
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === "Runtime.consoleAPICalled" &&
    ["error", "warning"].includes(m.params.type)) {
    consoleEvents.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleEvents.push("EXC " + JSON.stringify(m.params.exceptionDetails?.exception?.description
      ?? m.params.exceptionDetails?.text));
  }
};
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails)
    throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });

const BLOCK = process.env.BLOCK_PLAY === "1" ? "true" : "false";
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__plays = [];
  window.__speaks = [];
  window.__errs = [];
  const _play = HTMLMediaElement.prototype.play;
  const __block = ${BLOCK};
  HTMLMediaElement.prototype.play = function () {
    const rec = { src: String(this.src || this.currentSrc).slice(-60), ok: null, err: null };
    window.__plays.push(rec);
    if (__block) {
      rec.ok = false; rec.err = 'NotAllowedError';
      return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    }
    const p = _play.call(this);
    return Promise.resolve(p).then(
      (v) => { rec.ok = true; return v; },
      (e) => { rec.ok = false; rec.err = String(e && e.name || e); throw e; });
  };
  try {
    const _spk = SpeechSynthesis.prototype.speak;
    SpeechSynthesis.prototype.speak = function (u) {
      window.__speaks.push(u && u.text);
      return _spk.call(this, u);
    };
  } catch (e) { window.__errs.push('tts-wrap ' + e); }
  addEventListener('unhandledrejection',
    (e) => window.__errs.push('unhandled ' + (e.reason?.stack || e.reason)));
` });

await send("Page.navigate", { url: `${ORIGIN}/?reseed` });
const until = async (expr, budgetMs = 20000) => {
  for (let t = 0; t < budgetMs; t += 400) {
    if (await evalJs(expr).catch(() => null)) return true;
    await sleep(400);
  }
  return false;
};

// A REAL tap: find the element's center, dispatch mouse press/release.
async function tap(selExpr) {
  const rect = await evalJs(`(() => {
    const el = ${selExpr};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!rect) return false;
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", {
      type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  }
  return true;
}

const out = {};
out.booted = await until(`typeof window.pip === 'object' && !!window.pip`);
out.welcome = await until(`!!document.querySelector('.welcome')`, 8000);
out.activation = await evalJs(
  `navigator.userActivation ? JSON.stringify(navigator.userActivation) : 'n/a'`);

await tap(`[...document.querySelectorAll('.welcome-choice')]
    .find((b) => b.dataset.v === 'child')`);
await sleep(400);
await tap(`document.querySelector('.welcome-go')`);
out.tourStarted = await until(`!!document.querySelector('.tour-card')`, 8000);

const snap = () => evalJs(
  `JSON.stringify({plays: __plays, speaks: __speaks, errs: __errs,
    step: document.querySelector('.tour-say')?.textContent ?? null})`).then(JSON.parse);

out.tapWant = await tap(`[...document.querySelectorAll('#grid .cell')]
    .find((c) => (c.textContent || '').trim().toLowerCase() === 'want')`);
await sleep(1500);
out.afterWant = await snap();

out.tapApple = await tap(`document.querySelector('#tray .pred:not(.ghost)')`);
await sleep(1500);
out.afterApple = await snap();

out.tapFix = await tap(`document.querySelector('#tx-fix')`);
await sleep(4000);
out.afterFix = await snap();

out.tapPast = await tap(`document.querySelector('#tx-past')`);
await sleep(4000);
out.afterPast = await snap();

out.console = consoleEvents.slice(0, 30);
console.log(JSON.stringify(out, null, 1));
chrome.kill();
process.exit(0);
