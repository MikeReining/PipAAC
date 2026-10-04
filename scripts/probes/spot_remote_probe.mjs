/**
 * Spotlight across two devices (founder, 2026-10-04) — the Works Test.
 *  Two real Chrome profiles on the local relay: A is the person's board,
 *  B joins and answers "Who uses this device?" with Supporter. B starts a
 *  spotlight through the real pick flow. Then, measured on rendered
 *  classes, the tap log, and the sync log:
 *   - A shows no glow, no dimming, no 🔦 chip; B's words glow.
 *   - B taps `want`: it lights on A (and nothing logs or speaks on B).
 *   - A presses `want`: the light ends, A logs it as with-the-glow, and
 *     B's `want` shows 1. A presses again: B shows 2, logged on its own.
 *   PIP_ORIGIN=http://localhost:21089 node scripts/probes/spot_remote_probe.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { licenseFor } from "../../src/worker/license.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const licenseSecret = Object.fromEntries(
  readFileSync(join(repoRoot, ".dev.vars"), "utf8").split("\n")
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/))
    .filter(Boolean).map((m) => [m[1], m[2]])).PIP_LICENSE_SECRET;
const ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:21089";
const CHROME = process.env.CHROME_BIN
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const stubDialogs =
  `window.confirm=()=>true;window.prompt=()=>'';window.alert=()=>{};` +
  `window.__spokes=0;` +
  `try{speechSynthesis.speak=()=>window.__spokes++;}catch(e){}1`;

async function device(name, port, profile) {
  rmSync(profile, { recursive: true, force: true });
  // The binary itself, not `open -na`: kill() then reaches Chrome.
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await fetch(`http://localhost:${port}/json`).then(() => true, () => false)) break;
  }
  let ws = null, mid = 0;
  const pending = new Map();
  const wire = (sock) => {
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
  };
  const send = (m, p = {}) => new Promise((res, rej) => {
    const id = ++mid; pending.set(id, res);
    try { ws.send(JSON.stringify({ id, method: m, params: p })); }
    catch (e) { pending.delete(id); rej(e); }
  });
  const connect = async () => {
    const page = (await (await fetch(`http://localhost:${port}/json`)).json())
      .find((t) => t.type === "page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    wire(ws);
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride",
      { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
  };
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails)
      throw new Error(`${name}: ${JSON.stringify(r.result.exceptionDetails)}`);
    return r.result?.result?.value;
  };
  await connect();
  const loadApp = async () => {
    await send("Page.navigate", { url: ORIGIN });
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      if (await evalJs("typeof window.pip === 'object' && !!window.pip")
        .catch(() => false)) {
        await evalJs(stubDialogs);
        return;
      }
    }
    throw new Error(`${name}: app did not boot`);
  };
  const ensureLive = async () => {
    try { await evalJs("1"); } catch { await connect(); }
  };
  const until = async (expr, budgetMs = 15000) => {
    for (let t = 0; t < budgetMs; t += 400) {
      if (await evalJs(expr).catch(() => null)) return true;
      await sleep(400);
      await ensureLive();
    }
    return false;
  };
  // PIP_SHOTS=<dir>: save what each device shows at the key moments.
  const shot = async (label) => {
    if (!process.env.PIP_SHOTS) return;
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(process.env.PIP_SHOTS, `${name}-${label}.png`), Buffer.from(r.result.data, "base64"));
  };
  return { name, chrome, evalJs, loadApp, ensureLive, until, shot };
}

const A = await device("board", 9262, "/tmp/pip-spotr-a");
const B = await device("supporter", 9263, "/tmp/pip-spotr-b");
const out = {};
const cellJs = (word) => `[...document.querySelectorAll('#grid .cell')]
  .find((c) => (c.querySelector('.tlabel')?.textContent || c.textContent || '').trim().toLowerCase() === '${word}')`;
const tapJs = (word) => `(${cellJs(word)})?.click(), 1`;
const lastLog = `window.pip.db.prepare("SELECT spotlit FROM learner_event_log ORDER BY rowid DESC LIMIT 1").all()[0]?.spotlit`;
const count = (D, sql) => D.evalJs(`window.pip.db.prepare("SELECT COUNT(*) c FROM ${sql}").all()[0].c`);

// Pairing: A opens Add a device (creates the relay user), activates
// Lifetime, and shows the code; B answers the role question, types it.
await A.loadApp();
await A.evalJs(`(() => {
  document.querySelector('#corner').click();
  document.querySelector('#dev-add').click();
  return 1;
})()`);
out.linked = await A.until(`!!window.pip.user.sync?.userId`);
const userId = await A.evalJs(`window.pip.user.sync.userId`);
const license = await licenseFor(licenseSecret, userId);
await A.evalJs(`(() => {
  document.querySelector('#pairform [data-close]')?.click();
  document.querySelector('#dev-license').value = ${JSON.stringify(license)};
  document.querySelector('#dev-activate').click();
  return 1;
})()`);
out.lifetime = await A.until(
  `document.querySelector('#dev-lifetime').textContent.includes('Lifetime')`);
// The first Add a device flow can finish after it was closed; let it
// settle, then open a fresh one and read its code once it holds still.
await sleep(3000);
await A.evalJs(`(() => {
  document.querySelector('#pairform [data-close]')?.click();
  document.querySelector('#dev-add').click();
  return 1;
})()`);
out.codeShown = await A.until(`!!document.querySelector('#pair-body .pair-code')`);
await sleep(2500);
const code = await A.evalJs(`document.querySelector('#pair-body .pair-code').textContent`);
await B.loadApp();
out.roleAsked = await B.evalJs(`(() => {
  document.querySelector('#corner').click();
  document.querySelector('#usr-join').click();
  const input = document.querySelector('#pair-code');
  input.value = ${JSON.stringify(code)};
  input.dispatchEvent(new Event('input'));
  // The code alone does not join: the role is asked first.
  const asked = document.querySelector('#pair-status').textContent.startsWith('Choose');
  document.querySelector('#pair-role [data-v="supporter"]').click();
  return asked;
})()`);
out.bJoined = await B.until(
  `window.pip.user.id === ${JSON.stringify(userId)} && window.pip.user.role === 'partner'`, 20000);
out.bBoard = await B.until(`document.querySelectorAll('#grid .cell').length > 10`);

out.aIsBoard = await A.evalJs(`(() => {
  document.querySelector('#pairform [data-close]')?.click();
  return window.pip.user.role !== 'partner'
    && document.querySelector('#dev-role [data-v="board"]').classList.contains('on');
})()`);
await A.evalJs(`(() => { document.querySelector('#menu [data-close], #set-close')?.click(); return 1; })()`);

// B starts a spotlight through the real pick flow: Spotlight words →
// tap want and go → Start.
await B.evalJs(`(async () => {
  document.querySelector('#corner').click();
  await new Promise((r) => setTimeout(r, 500)); // Settings opens through the PIN gate
  document.querySelector('.set-nav-btn[data-sec="spotlight"]').click();
  document.querySelector('#spot-pick').click();
  ${tapJs("want")};
  ${tapJs("go")};
  document.querySelector('#spot-pick-start').click();
  return 1;
})()`);
out.bSession = await B.evalJs(`window.pip.spotlight.session?.by_supporter`);
out.aGotSession = await A.until(`window.pip.spotlight.session?.by_supporter === 1`, 15000);
await sleep(600);
out.aPlain = await A.evalJs(`(() => {
  const c = ${cellJs("want")}, o = ${cellJs("stop")};
  return !c.classList.contains('glow') && !o.classList.contains('dimmed')
    && document.querySelector('#spot-chip').hidden
    && document.querySelector('#modelbar').hidden;
})()`);
out.bGlows = await B.evalJs(`(() => {
  const c = ${cellJs("want")};
  return c.classList.contains('glow') && ${cellJs("stop")}.classList.contains('dimmed')
    && !document.querySelector('#modelbar').hidden && window.pip.spotlight.modeling;
})()`);

// B models `want`: it lights on A; B's tap never enters B's instruments.
const before = {
  bEvents: await count(B, "learner_event_log"), bSentence: await B.evalJs(`window.pip.sentence.length`),
  aOps: await count(A, "sync_op"), bOps: await count(B, "sync_op"),
};
await B.evalJs(tapJs("want"));
out.aLit = await A.until(`(() => { const c = ${cellJs("want")};
  return c.classList.contains('glow') && c.classList.contains('modeled'); })()`, 10000);
await A.evalJs(`document.querySelector('.welcome')?.remove(), 1`); // A skipped setup
await A.shot("1-modeled");
await B.shot("1-modeling");
out.aOnlyThat = await A.evalJs(`!${cellJs("go")}.classList.contains('glow')`);
out.bTip = await B.evalJs(`document.querySelector('#model-line').textContent`);

// A presses `want` while lit: the light ends, logged with the glow; B counts 1.
await A.evalJs(tapJs("want"));
out.aLitPress = await A.evalJs(lastLog);
out.aLightEnded = await A.evalJs(`!${cellJs("want")}.classList.contains('modeled')`);
out.bCount1 = await B.until(`${cellJs("want")}.dataset.spotCount === '1'`, 10000);
// Again, unlit: logged on its own; B counts 2.
await A.evalJs(tapJs("want"));
out.aOwnPress = await A.evalJs(lastLog);
out.bCount2 = await B.until(`${cellJs("want")}.dataset.spotCount === '2'`, 10000);
await B.shot("2-counts");
out.bTotal = await B.evalJs(`document.querySelector('#model-count').textContent`);
out.aNoCounts = await A.evalJs(`!document.querySelector('[data-spot-count]')`);

const after = {
  bEvents: await count(B, "learner_event_log"), bSentence: await B.evalJs(`window.pip.sentence.length`),
  aOps: await count(A, "sync_op"), bOps: await count(B, "sync_op"),
};
out.log = { before, after };

if (process.env.PIP_SHOTS) {
  for (const sec of ["spotlight", "team"]) {
    await B.evalJs(`(async () => {
      if (!document.querySelector('#menu').classList.contains('open')) document.querySelector('#corner').click();
      await new Promise((r) => setTimeout(r, 500));
      document.querySelector('.set-nav-btn[data-sec="${sec}"]').click();
      const row = document.querySelector('${sec === "team" ? "#dev-role" : "#spot-model-row"}');
      row.scrollIntoView({ block: 'center' });
      return 1;
    })()`);
    await sleep(400);
    await B.shot(`3-${sec}`);
  }
}
console.log(JSON.stringify(out, null, 2));
const ok = out.linked && out.lifetime && out.codeShown && out.roleAsked &&
  out.bJoined && out.bBoard && out.aIsBoard &&
  out.bSession === 1 && out.aGotSession && out.aPlain && out.bGlows &&
  out.aLit && out.aOnlyThat && out.bTip.length > 0 &&
  out.aLitPress === 1 && out.aLightEnded && out.bCount1 &&
  out.aOwnPress === 0 && out.bCount2 && out.aNoCounts &&
  after.bEvents === before.bEvents && after.bSentence === before.bSentence &&
  // Live messages never reach the sync log; A's two presses are taps,
  // not edits, so neither device records an op.
  after.aOps === before.aOps && after.bOps === before.bOps;
console.log(ok ? "PASS spotlight across two devices" : "FAIL — see output");
A.chrome.kill();
B.chrome.kill();
process.exit(ok ? 0 : 1);
