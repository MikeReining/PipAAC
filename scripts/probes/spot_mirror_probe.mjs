/**
 * 013 slice 3 live proof — Spotlight on the adult's device, the spec's
 * own test: "end on the phone, the iPad's glow clears." Two real Chrome
 * profiles on the same local relay: A is the child's board, B pairs in
 * as the same user (the adult's mirror). B starts a saved list from its
 * Spotlight sheet — A's board glows and the chip appears; B taps the
 * chip — A clears. Then the reverse leg proves start/end from either
 * side. Measures rendered classes and the synced row on the *other*
 * device — never the module's own report.
 *   node scripts/probes/spot_mirror_probe.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { licenseFor } from "../../src/worker/license.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const licenseSecret = Object.fromEntries(
  readFileSync(join(repoRoot, ".dev.vars"), "utf8").split("\n")
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/))
    .filter(Boolean).map((m) => [m[1], m[2]])).PIP_LICENSE_SECRET;
const ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:8794";

const stubDialogs =
  `window.confirm=()=>true;window.prompt=()=>'';window.alert=()=>{};1`;

async function device(name, port, profile) {
  rmSync(profile, { recursive: true, force: true });
  const chrome = spawn("open", ["-na", "Google Chrome", "--args",
    "--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, "--no-first-run", "about:blank"]);
  await sleep(2500);
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
  /** After an in-page reload the target may swap — reconnect if dead. */
  const ensureLive = async () => {
    try { await evalJs("1"); } catch { await connect(); }
  };
  /** Poll an expression until it is truthy or the budget runs out. */
  const until = async (expr, budgetMs = 15000) => {
    for (let t = 0; t < budgetMs; t += 400) {
      if (await evalJs(expr).catch(() => null)) return true;
      await sleep(400);
      await ensureLive();
    }
    return false;
  };
  return { name, chrome, evalJs, loadApp, ensureLive, until };
}

const glowState = `(() => ({
  glow: document.querySelectorAll('#grid .cell.glow').length,
  dimmed: document.querySelectorAll('#grid .cell.dimmed').length,
  chip: document.querySelector('#spot-chip').textContent,
  chipHidden: document.querySelector('#spot-chip').hidden,
  session: !!window.pip.spotlight.session,
}))()`;

const A = await device("ipad", 9260, "/tmp/pip-spot3a-probe");
const B = await device("phone", 9261, "/tmp/pip-spot3b-probe");
const out = {};

// A opens Add a device — dev-add runs ensureUser, creating the user on
// the relay (free: the Lifetime door). Lifetime activates, then A shows
// the code B types.
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

// A shows the code; B types it. A hands over the key on the claim.
await A.evalJs(`document.querySelector('#dev-add').click(), 1`);
out.codeShown = await A.until(`!!document.querySelector('#pair-body .pair-code')`);
const code = await A.evalJs(`document.querySelector('#pair-body .pair-code').textContent`);
await B.loadApp();
await B.evalJs(`(() => {
  document.querySelector('#corner').click();
  document.querySelector('#usr-join').click();
  const input = document.querySelector('#pair-code');
  input.value = ${JSON.stringify(code)};
  input.dispatchEvent(new Event('input'));
  return 1;
})()`);
out.granted = await A.until(
  `!!document.querySelector('#pair-body .pair-done')`, 15000);
await A.evalJs(`document.querySelector('#pairform [data-close]').click(), 1`);
// B polls every 2s, then unwraps the grant and reloads into the user.
out.bJoined = await B.until(
  `window.pip.user.id === ${JSON.stringify(userId)} && window.pip.user.sync?.userId === ${JSON.stringify(userId)}`,
  20000);
out.bBoard = await B.until(`document.querySelectorAll('#grid .cell').length > 10`);

// A saves a list by picking two board words through the real UI.
await A.evalJs(`(async () => {
  document.querySelector('#corner').click();
  await new Promise((r) => setTimeout(r, 500)); // Settings opens through the PIN gate
  document.querySelector('.set-nav-btn[data-sec="spotlight"]').click();
  document.querySelector('#spot-pick').click();
  const tap = (w) => [...document.querySelectorAll('#grid .cell')]
    .find((c) => (c.textContent || '').trim().toLowerCase() === w)?.click();
  tap('stop'); tap('want');
  document.querySelector('#spot-pick-save').click();
  document.querySelector('#spot-list-name').value = 'Mirror List';
  document.querySelector('#spot-name-save').click();
  return 1;
})()`);
out.aListSaved = await A.until(`window.pip.spotlight.lists().length === 1`);
// The list syncs to B — lists and settings are profile data.
out.bSeesList = await B.until(
  `window.pip.spotlight.lists().some(l => l.name === 'Mirror List')`, 20000);

// The spec's works test: start on the phone → iPad glows; tap the chip
// on the phone → the iPad's glow clears.
await B.evalJs(`(async () => {
  document.querySelector('#corner').click();
  await new Promise((r) => setTimeout(r, 500)); // Settings opens through the PIN gate
  document.querySelector('.set-nav-btn[data-sec="spotlight"]').click();
  [...document.querySelectorAll('.spot-card')]
    .find(r => r.textContent.includes('Mirror List'))
    .querySelector('button').click();
  return 1;
})()`);
out.aGlows = await A.until(
  `document.querySelectorAll('#grid .cell.glow').length === 2 && !document.querySelector('#spot-chip').hidden`,
  15000);
out.aRunning = await A.evalJs(glowState);
await B.evalJs(`document.querySelector('#spot-chip').click()`);
out.aClears = await A.until(
  `document.querySelectorAll('#grid .cell.glow').length === 0 && document.querySelector('#spot-chip').hidden`,
  15000);
out.aCleared = await A.evalJs(glowState);

// Either side: A starts the same list — B glows; A ends — B clears.
await A.evalJs(`(async () => {
  document.querySelector('#corner').click();
  await new Promise((r) => setTimeout(r, 500)); // Settings opens through the PIN gate
  document.querySelector('.set-nav-btn[data-sec="spotlight"]').click();
  [...document.querySelectorAll('.spot-card')]
    .find(r => r.textContent.includes('Mirror List'))
    .querySelector('button').click();
  return 1;
})()`);
out.bGlows = await B.until(
  `document.querySelectorAll('#grid .cell.glow').length === 2 && !document.querySelector('#spot-chip').hidden`,
  15000);
await A.evalJs(`document.querySelector('#spot-chip').click()`);
out.bClears = await B.until(
  `document.querySelectorAll('#grid .cell.glow').length === 0 && document.querySelector('#spot-chip').hidden`,
  15000);

console.log(JSON.stringify(out, null, 2));
const ok = out.linked && out.lifetime && out.codeShown &&
  out.granted && out.bJoined && out.bBoard && out.aListSaved && out.bSeesList &&
  out.aGlows && out.aRunning.session && out.aClears && !out.aCleared.session &&
  out.bGlows && out.bClears;
console.log(ok ? "PASS spotlight on the adult's device" : "FAIL — see output");
A.chrome.kill();
B.chrome.kill();
process.exit(ok ? 0 : 1);
