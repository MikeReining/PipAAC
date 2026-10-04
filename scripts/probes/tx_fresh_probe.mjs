#!/usr/bin/env node
/** 043 D live proof — a delayed transform answer must never overwrite a
 *  bar that changed since the press. fetch is stubbed ONLY for
 *  /api/v1/transform (a held-open response the probe releases on cue);
 *  everything else is the real app: real cells tapped, real #tx-fix
 *  click, real #clear click, the bar DOM read as the verdict.
 *
 *    node scripts/probes/tx_fresh_probe.mjs [origin]
 */
import { spawn } from "node:child_process";
import { resolveChrome } from "./chrome.mjs";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const ORIGIN = process.argv[2] ?? process.env.PIP_ORIGIN ?? "http://localhost:21088";
const PORT = 9278;
const PROFILE = `/tmp/pip-tx-fresh-${process.pid}`;
rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(resolveChrome(), [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, "--no-first-run", "about:blank"],
  { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill(); } catch {} });

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
const send = (method, params = {}) => new Promise((res) => {
  const id = ++mid; pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) {
    throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  }
  return r.result?.result?.value;
};
const pollUntil = async (fn, ms, step = 150) => {
  const deadline = Date.now() + ms;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(step);
  }
  return last;
};
const BAR = `[...document.querySelectorAll('#bar .chip .clabel')].map((n) => n.textContent.trim()).join(' ')`;

await send("Runtime.enable");
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.prompt = () => "Bea Probe";
` });
await send("Page.navigate", { url: `${ORIGIN}/` });

/* Welcome drive — the real first-run path (same as speed_probe). */
await pollUntil(() => evalJs(`!!document.querySelector('#welcome-name, .welcome')`), 60_000);
await evalJs(`(() => {
  const name = document.querySelector("#welcome-name");
  if (name) name.value = "Ada Probe";
  document.querySelector('.welcome-choice[data-v="child"]')?.click();
  document.querySelector(".welcome-go")?.click();
  return true;
})()`);
await pollUntil(() => evalJs(`!!document.querySelector('#grid .cell')`), 60_000);
await pollUntil(async () =>
  !(await evalJs(`!!document.querySelector('.welcome, #welcome-name')`)), 15_000);

/* finish() reloads into the first-run tour (pip_tour flag) — it owns
 * every tap and transform while it runs. Skip it; the board is then
 * the real one. */
await pollUntil(() => evalJs(`!!document.querySelector('.tour-skip')`), 30_000);
await evalJs(`document.querySelector('.tour-skip')?.click()`);
await pollUntil(async () =>
  !(await evalJs(`!!document.querySelector('.tour-skip')`)), 15_000);

/* Fault injection: only /api/v1/transform is held open; every other
 * request is the real app. */
await evalJs(`(() => {
  window.__tx = { calls: 0, resolve: null };
  const of = window.fetch;
  window.fetch = (url, opts) => {
    if (String(url).includes("/api/v1/transform")) {
      window.__tx.calls++;
      return new Promise((res) => {
        window.__tx.resolve = () => res(new Response(
          JSON.stringify({ text: "STALE ANSWER ARRIVED" }),
          { status: 200, headers: { "content-type": "application/json" } }));
      });
    }
    return of(url, opts);
  };
  return true;
})()`);

const tap = (i) => evalJs(`(() => {
  const cells = [...document.querySelectorAll('#grid .cell')]
    .filter((c) => c.querySelector('.tlabel') && !c.classList.contains('masked'));
  cells[${i}]?.click();
  return cells[${i}] ? (cells[${i}].textContent || '').trim() : null;
})()`);

const out = { scenarios: {} };

/* ---- scenario 1: clear while the answer is in flight ------------- */
await tap(0); await sleep(300); await tap(1); await sleep(300);
out.scenarios.clear = { barBefore: await evalJs(BAR) };
out.scenarios.clear.txDisabled = await evalJs(`document.querySelector('#tx-fix').disabled`);
out.scenarios.clear.txHidden = await evalJs(`document.querySelector('#tx-fix').hidden`);
await evalJs(`document.querySelector('#tx-fix').click()`);
out.scenarios.clear.fired = await pollUntil(() => evalJs(`window.__tx.calls >= 1`), 10_000);
out.scenarios.clear.calls = await evalJs(`window.__tx.calls`);
await evalJs(`document.querySelector('#clear').click()`);
await sleep(200);
out.scenarios.clear.barAfterClear = await evalJs(BAR);
await evalJs(`window.__tx.resolve()`);
await sleep(1500);
out.scenarios.clear.barAfterLand = await evalJs(BAR);

/* ---- scenario 2: a new tap while the answer is in flight ---------- */
await tap(2); await sleep(300);
out.scenarios.edit = { barBefore: await evalJs(BAR) };
await evalJs(`document.querySelector('#tx-fix').click()`);
await pollUntil(() => evalJs(`window.__tx.calls >= 2`), 10_000);
const midTap = await tap(3); await sleep(200);
out.scenarios.edit.barAfterEdit = await evalJs(BAR);
await evalJs(`window.__tx.resolve()`);
await sleep(1500);
out.scenarios.edit.barAfterLand = await evalJs(BAR);
out.scenarios.edit.midTap = midTap;
/* ---- scenario 3: unchanged bar — the answer must still apply ------ */
await evalJs(`document.querySelector('#clear').click()`);
await sleep(200);
await tap(4); await sleep(300);
await evalJs(`document.querySelector('#tx-fix').click()`);
await pollUntil(() => evalJs(`window.__tx.calls >= 3`), 10_000);
await evalJs(`window.__tx.resolve()`);
await sleep(1500);
out.scenarios.fresh = { barAfterLand: await evalJs(BAR) };
out.calls = await evalJs(`window.__tx.calls`);

const s1 = out.scenarios.clear;
const s2 = out.scenarios.edit;
const checks = {
  "bar built before press": !!s1.barBefore,
  "clear emptied the bar mid-flight": s1.barAfterClear === "",
  "late answer did not restore the cleared bar":
    s1.barAfterLand === "" || !s1.barAfterLand.includes("STALE"),
  "edit landed while in flight": s2.barAfterEdit !== s2.barBefore,
  "late answer did not replace the edited bar":
    !!s2.barAfterLand && !s2.barAfterLand.includes("STALE"),
  "a fresh answer still applies": out.scenarios.fresh.barAfterLand === "STALE ANSWER ARRIVED",
  "all transform calls actually fired": out.calls === 3,
};
out.checks = checks;
console.log(JSON.stringify(out, null, 2));
const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
chrome.kill();
if (failed.length) {
  console.log("FAIL: " + failed.join("; "));
  process.exit(1);
}
console.log("PASS — stale transforms never touch a moved bar");
process.exit(0);
