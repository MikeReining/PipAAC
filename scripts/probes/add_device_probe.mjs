/**
 * Add a device — live proof in real Chrome (founder 2026-10-04: "on the
 * iPad where I have Luca, add a device gives me the code; on the laptop
 * I enter it"). Three fresh profiles against the running worker:
 *   A (iPad, has Luca): Settings → Add a device. Free → the Lifetime
 *     door, never a code. Lifetime → a code + QR.
 *   B (laptop, brand new): the welcome's "Enter a code" → types it →
 *     lands on Luca's board. Exactly one person on B — no duplicate.
 *   C (phone): opens ORIGIN/join#CODE (the QR / sent link) → joins
 *     with no typing.
 * Measured on B/C's own registry and boards and A's relay device list.
 *   PIP_ORIGIN=http://localhost:21089 node scripts/probes/add_device_probe.mjs
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
    // A dead-but-open ws (page reloaded under us) never responds —
    // reject so ensureLive can reconnect instead of hanging forever.
    setTimeout(() => {
      if (pending.delete(id)) rej(new Error(`${name}: send timeout`));
    }, 12000);
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
  const loadApp = async (path = "") => {
    await send("Page.navigate", { url: ORIGIN + path });
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
  // PIP_SHOTS=<dir> saves a PNG of each step for a human look.
  const shot = async (label) => {
    if (!process.env.PIP_SHOTS) return;
    const { result } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(process.env.PIP_SHOTS, `${name}-${label}.png`), Buffer.from(result.data, "base64"));
  };
  return { name, chrome, evalJs, loadApp, ensureLive, until, shot };
}

const A = await device("ipad", 9275, "/tmp/pip-add-a-probe");
const B = await device("laptop", 9276, "/tmp/pip-add-b-probe");
const C = await device("phone", 9277, "/tmp/pip-add-c-probe");
const out = {};

// A: a named, set-up board (Luca), then Add a device while free.
// ?unlicensed: localhost would otherwise self-mint a dev license.
await A.loadApp("/?unlicensed");
await A.evalJs(`(async () => {
  document.querySelector('.welcome')?.remove();
  window.pip.user.needsSetup = false;
  window.pip.user.name = 'Luca';
  document.querySelector('#corner').click();
  document.querySelector('#dev-add').click();
  return 1;
})()`);
out.aSynced = await A.until(`!!window.pip.user.sync?.userId`);
out.freeDoor = await A.until(
  `document.querySelector('#pair-body')?.textContent.includes('Pip Lifetime') && !document.querySelector('#pair-body .pair-code')`);
const userId = await A.evalJs(`window.pip.user.sync.userId`);
const license = await licenseFor(licenseSecret, userId);
await A.evalJs(`(() => {
  document.querySelector('#pairform [data-close]').click();
  document.querySelector('#dev-license').value = ${JSON.stringify(license)};
  document.querySelector('#dev-activate').click();
  return 1;
})()`);
out.lifetime = await A.until(
  `document.querySelector('#dev-lifetime').textContent.includes('Lifetime')`);

// A: Add a device again → a code.
await A.evalJs(`document.querySelector('#dev-add').click(), 1`);
out.codeOnA = await A.until(`!!document.querySelector('#pair-body .pair-code')`);
const shown = await A.evalJs(`document.querySelector('#pair-body .pair-code').textContent`);
out.code = shown;
out.qrOnA = await A.evalJs(`!!document.querySelector('#pair-body .pair-qr svg')`);
out.title = await A.evalJs(`document.querySelector('#pair-title').textContent`);
await A.shot("code");

// B: brand-new laptop. The welcome is up; tap "Enter a code", type it.
await B.loadApp();
out.bWelcome = await B.until(`!!document.querySelector('.welcome-join-go')`);
await B.shot("welcome");
await B.evalJs(`(() => {
  document.querySelector('.welcome-join-go').click();
  const input = document.querySelector('#pair-code');
  input.value = ${JSON.stringify(shown.toLowerCase())};
  input.dispatchEvent(new Event('input'));
  return 1;
})()`);
await B.shot("typed");
out.bSheetAboveWelcome = await B.evalJs(`(() => {
  const r = document.querySelector('#pair-code').getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return top?.id === 'pair-code';
})()`);
out.bJoined = await B.until(
  `window.pip?.user?.id === ${JSON.stringify(userId)} && !document.querySelector('.welcome')`, 30000);
await B.ensureLive();
// Exactly one person on B: the joined one replaced the welcome placeholder.
await B.evalJs(`document.querySelector('#corner').click(), 1`);
await B.until(`document.querySelectorAll('#usr-list .usr-row').length > 0`);
out.bUserCount = await B.evalJs(`document.querySelectorAll('#usr-list .usr-row').length`);
out.bRole = await B.evalJs(`window.pip.user.role`);
out.aDone = await A.until(`document.querySelector('#pair-body')?.textContent.includes('Luca is on')`, 15000);
await A.shot("done");
out.aDoneText = await A.evalJs(`document.querySelector('#pair-body').textContent.trim()`);
out.aDevices = await A.evalJs(`document.querySelector('#dev-list').textContent`);
await A.evalJs(`document.querySelector('#pairform [data-close]').click(), 1`);
await A.shot("devices");

// C: phone opens the link from the QR / Send link — no typing.
await A.evalJs(`(() => { document.querySelector('#pairform [data-close]').click(); document.querySelector('#dev-add').click(); return 1; })()`);
await A.until(`!!document.querySelector('#pair-body .pair-code')`);
const code2 = (await A.evalJs(`document.querySelector('#pair-body .pair-code').textContent`)).replace(/\s/g, "");
await C.evalJs(`location.href = ${JSON.stringify(`${ORIGIN}/join#${code2}`)}, 1`);
await sleep(3000);
await C.ensureLive();
out.cJoined = await C.until(`window.pip?.user?.id === ${JSON.stringify(userId)}`, 30000);
out.cUrl = await C.evalJs(`location.pathname + location.hash`);

console.log(JSON.stringify(out, null, 2));
const ok = out.aSynced && out.freeDoor && out.lifetime && out.codeOnA && out.qrOnA
  && out.bWelcome && out.bSheetAboveWelcome && out.bJoined && out.bUserCount === 1
  && out.aDone && out.cJoined;
console.log(ok ? "PASS add a device: code on the device that has the person, typed on the new one" : "FAIL — see output");
for (const d of [A, B, C]) d.chrome.kill();
process.exit(ok ? 0 : 1);
