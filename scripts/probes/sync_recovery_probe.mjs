#!/usr/bin/env node
/** 043 B live proof — one sync recovery flow. Two real devices against
 *  the dev relay:
 *    A (licensed board) ↔ B (joined laptop)
 *  1. Both offline-edit, B reconnects — boards converge, no reload.
 *  2. B's Chrome is killed outright and relaunched on the same profile
 *     — the boot path converges too (process kill + absence).
 *  Truth is read on each device's own synced tables (personal_entity),
 *  never the sync loop's report.
 *    node scripts/probes/sync_recovery_probe.mjs [origin]
 */
import { spawn } from "node:child_process";
import { resolveChrome } from "./chrome.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { licenseFor } from "../../src/worker/license.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const licenseSecret = Object.fromEntries(
  readFileSync(join(repoRoot, ".dev.vars"), "utf8").split("\n")
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/))
    .filter(Boolean).map((m) => [m[1], m[2]])).PIP_LICENSE_SECRET;
const ORIGIN = process.argv[2] ?? process.env.PIP_ORIGIN ?? "http://localhost:21088";

const stubDialogs =
  `window.confirm=()=>true;window.prompt=()=>'';window.alert=()=>{};1`;

async function device(name, port, profile) {
  const chrome = spawn(resolveChrome(), [
    "--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, "--no-first-run", "about:blank"],
    { stdio: "ignore" });
  await sleep(2500);
  let ws = null, mid = 0;
  const pending = new Map();
  ws = null;
  const page0 = (await (await fetch(`http://localhost:${port}/json`)).json())
    .find((t) => t.type === "page");
  ws = new WebSocket(page0.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const consoleLog = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.consoleAPICalled"
        && ["warning", "error"].includes(m.params?.type)) {
      consoleLog.push(m.params.type + ": " +
        (m.params.args ?? []).map((a) => a.value ?? a.description ?? "?").join(" ").slice(0, 300));
    }
    if (m.method === "Runtime.exceptionThrown") {
      consoleLog.push("EXC: " +
        JSON.stringify(m.params.exceptionDetails?.exception?.description
          ?? m.params.exceptionDetails?.text).slice(0, 300));
    }
  };
  const send = (m, p = {}) => new Promise((res, rej) => {
    const id = ++mid; pending.set(id, res);
    setTimeout(() => {
      if (pending.delete(id)) rej(new Error(`${name}: send timeout`));
    }, 12000);
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails)
      throw new Error(`${name}: ${JSON.stringify(r.result.exceptionDetails)}`);
    return r.result?.result?.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride",
    { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
  const loadApp = async (path = "", activeUser = null) => {
    if (activeUser) {
      await send("Page.addScriptToEvaluateOnNewDocument", { source:
        `sessionStorage.setItem('pip_active_user', ${JSON.stringify(activeUser)});` });
    }
    await send("Page.navigate", { url: ORIGIN + path });
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      if (await evalJs("typeof window.pip === 'object' && !!window.pip.db")
        .catch(() => false)) {
        await evalJs(stubDialogs);
        return;
      }
    }
    throw new Error(`${name}: app did not boot`);
  };
  const until = async (expr, budgetMs = 30000) => {
    for (let t = 0; t < budgetMs; t += 400) {
      if (await evalJs(expr).catch(() => null)) return true;
      await sleep(400);
    }
    return false;
  };
  const offline = (off) => send("Network.emulateNetworkConditions",
    { offline: off, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const skipTour = () => evalJs(`document.querySelector('.tour-skip')?.click(), 1`)
    .catch(() => 0);
  return { name, chrome, send, evalJs, loadApp, until, offline, skipTour,
    consoleLog };
}

const mkEntity = (name) => `(async () => {
  const m = await import('/shared/groups.mjs');
  return m.createEntity(window.pip.db, { name: ${JSON.stringify(name)} }).id;
})()`;
const hasEntity = (name) =>
  `window.pip.db.prepare("SELECT 1 AS x FROM personal_entity WHERE spoken_name=?").all(${JSON.stringify(name)}).length > 0`;
const profile = (p) => join("/tmp", p);

const spawned = [];
const A = await device("ipad", 9280, profile("pip-sync-a"));
const B = await device("laptop", 9281, profile("pip-sync-b"));
spawned.push(A, B);
const out = {};
const opDump = (d) => d.evalJs(
  `window.pip.db.prepare("SELECT seq, relay_seq, substr(op_id,1,12) AS op, substr(device_id,1,16) AS dev, kind, substr(args,1,40) AS args FROM sync_op ORDER BY seq").all()`)
  .catch((e) => String(e));
const baseDump = (d) => d.evalJs(
  `!!window.pip.db.prepare("SELECT 1 AS x FROM sync_baseline WHERE id=1").all()[0]`)
  .catch(() => "gone");
const fail = async (msg, extra) => {
  out.opsA = await opDump(A).catch(() => "gone");
  out.opsB = await opDump(B).catch(() => "gone");
  out.baseB = await baseDump(B).catch(() => "gone");
  out.entsB = await B.evalJs(
    `window.pip.db.prepare("SELECT id, spoken_name FROM personal_entity").all()`)
    .catch(() => "gone");
  // The ingest chain surfaces its last failure through syncHealth now.
  out.userSyncB = await B.evalJs(`JSON.stringify(window.pip.user?.sync)`)
    .catch(() => "gone");
  out.consoleB = B.consoleLog?.slice(-12) ?? "n/a";
  out.healthB = await B.evalJs(
    `import('/shared/sync.mjs').then((m) => m.syncHealth())`)
    .catch((e) => "err " + e.message);
  out.drainErrB = await B.evalJs(`(async () => {
    const m = await import('/shared/ops.mjs');
    try { m.drainOps(window.pip.db, []); return 'ok'; }
    catch (e) { return String(e.stack || e); }
  })()`).catch(() => "gone");
  console.log(JSON.stringify({ ...out, ...extra }, null, 2));
  console.log("FAIL: " + msg);
  for (const d of spawned) { try { d.chrome.kill(); } catch {} }
  process.exit(1);
};

/* A: licensed Luca board, Add-a-device code (the proven flow from
 * add_device_probe). */
await A.loadApp("/?unlicensed");
await A.evalJs(`(async () => {
  document.querySelector('.welcome')?.remove();
  window.pip.user.needsSetup = false;
  window.pip.user.name = 'Luca';
  document.querySelector('#corner').click();
  document.querySelector('#dev-add').click();
  return 1;
})()`);
if (!await A.until(`!!window.pip.user.sync?.userId`)) await fail("A never linked");
const userId = await A.evalJs(`window.pip.user.sync.userId`);
const license = await licenseFor(licenseSecret, userId);
await A.evalJs(`(() => {
  document.querySelector('#pairform [data-close]')?.click();
  document.querySelector('#dev-license').value = ${JSON.stringify(license)};
  document.querySelector('#dev-activate').click();
  return 1;
})()`);
if (!await A.until(`document.querySelector('#dev-lifetime')?.textContent.includes('Lifetime')`))
  await fail("A never went Lifetime");
await A.evalJs(`document.querySelector('#dev-add').click(), 1`);
if (!await A.until(`!!document.querySelector('#pair-body .pair-code')`)) await fail("no pair code");
const code = await A.evalJs(`document.querySelector('#pair-body .pair-code').textContent`);

/* B: joins through the welcome's Enter-a-code. */
await B.loadApp();
if (!await B.until(`!!document.querySelector('.welcome-join-go')`, 60000))
  await fail("B welcome never came up");
await B.evalJs(`document.querySelector('.welcome-join-go').click(), 1`);
if (!await B.until(`!!document.querySelector('#pair-role [data-v="board"]')`, 15000))
  await fail("B role sheet never came up");
await B.evalJs(`(() => {
  // The sheet asks whose device this is before it will take the code.
  document.querySelector('#pair-role [data-v="board"]').click();
  const input = document.querySelector('#pair-code');
  input.value = ${JSON.stringify(code.toLowerCase())};
  input.dispatchEvent(new Event('input'));
  return 1;
})()`);
if (!await B.until(`window.pip?.user?.id === ${JSON.stringify(userId)}`, 60000))
  await fail("B never joined");
await B.skipTour();

/* Baseline: an op made online converges. B is still digesting the
 * join snapshot, so give the fresh device room — and keep a trail of
 * B's op log while we wait. */
await A.evalJs(mkEntity("Shared Seed"));
out.trail = [];
{
  let ok = false;
  for (let t = 0; t < 120000 && !ok; t += 1500) {
    const trail = await B.evalJs(`(() => {
      const ops = window.pip.db.prepare("SELECT seq || ':' || relay_seq AS s FROM sync_op ORDER BY seq").all().map(r=>r.s).join(',');
      const c = window.pip.user?.sync?.cursor;
      return 'cursor=' + c + ' ops=' + ops;
    })()`).catch(() => "err");
    if (!out.trail.length || out.trail.at(-1) !== trail) out.trail.push(trail);
    ok = await B.evalJs(hasEntity("Shared Seed")).catch(() => false);
    if (!ok) await sleep(1500);
  }
  if (!ok) await fail("baseline never converged");
}
out.baseline = true;

/* Both edit, B offline the whole time. */
await B.offline(true);
await sleep(1000); // let the socket actually drop
await A.evalJs(mkEntity("Edit From A"));
await B.evalJs(mkEntity("Edit From B"));
await A.evalJs(`window.pip.flushDb()`);
out.bSeesADuringOffline = await B.evalJs(hasEntity("Edit From A")).catch(() => "eval-fail");
out.aSeesBDuringOffline = await A.evalJs(hasEntity("Edit From B"));
if (out.aSeesBDuringOffline) await fail("B's edit leaked while it was offline");

/* B comes back — reconnect must fetch what it missed and flush its own. */
await B.offline(false);
out.bConverged = await B.until(hasEntity("Edit From A"), 45000);
out.aConverged = await A.until(hasEntity("Edit From B"), 45000);
if (!out.bConverged || !out.aConverged) await fail("no convergence after reconnect");

/* Process termination + absence: kill B's browser outright, relaunch
 * the same profile OFFLINE (the service worker serves the shell while
 * sync fails), then bring the network back — the boot path must still
 * converge. Meanwhile A adds one more op while B is dead. */
B.chrome.kill();
await sleep(1000);
await A.evalJs(mkEntity("Edit While B Dead"));

const B2 = await device("laptop2", 9282, profile("pip-sync-b"));
spawned.push(B2);
await B2.offline(true);
try {
  await B2.loadApp("", userId);
  out.offlineBoot = true;
} catch {
  out.offlineBoot = false;
}
await sleep(2500); // let the dead-network recovery attempts run
await B2.offline(false);
out.b2Converged = await B2.until(
  `${hasEntity("Edit From A")} && ${hasEntity("Edit From B")} && ${hasEntity("Edit While B Dead")}`,
  60000);
await A.evalJs(`window.pip.flushDb()`);
out.aSeesAll = await A.evalJs(
  `${hasEntity("Edit From A")} && ${hasEntity("Edit From B")} && ${hasEntity("Edit While B Dead")}`);
if (!out.b2Converged || !out.aSeesAll) await fail("relaunch did not converge");

console.log(JSON.stringify(out, null, 2));
console.log("PASS — devices converge after offline edits, reconnect, and a kill");
for (const d of [A, B2]) { try { d.chrome.kill(); } catch {} }
process.exit(0);
