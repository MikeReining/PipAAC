/**
 * 013 slice 4 live proof — live modeling on the mirror, the spec's own
 *  test: "a tap on the phone glows the word on the iPad and fades; the
 *  sync log has no new row." Two real Chrome profiles on the local
 *  relay: B pairs in as the same user, turns on Model mode, and taps a
 *  board word — A's cell glows, then fades; a word tapped inside a
 *  group lights the route walk on A. Measured on rendered classes and
 *  the sync_op log on BOTH devices — the model tap must leave no row.
 *   node scripts/probes/spot_model_probe.mjs
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
  `window.confirm=()=>true;window.prompt=()=>'';window.alert=()=>{};` +
  `window.__spokes=0;` +
  `try{speechSynthesis.speak=()=>window.__spokes++;}catch(e){}1`;

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
  return { name, chrome, evalJs, loadApp, ensureLive, until };
}

const A = await device("ipad", 9262, "/tmp/pip-spot4a-probe");
const B = await device("phone", 9263, "/tmp/pip-spot4b-probe");
const out = {};

// Same pairing as the mirror probe: A opens Add a device (ensureUser),
// activates Lifetime, and shows the code B types.
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

// A shows the code (Add a device); B types it (Team & devices → Join with a code).
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
out.bJoined = await B.until(
  `window.pip.user.id === ${JSON.stringify(userId)} && window.pip.user.sync?.userId === ${JSON.stringify(userId)}`,
  20000);
out.bBoard = await B.until(`document.querySelectorAll('#grid .cell').length > 10`);

// Baselines the works test measures against.
const before = {
  aOps: await A.evalJs(`window.pip.db.prepare("SELECT COUNT(*) c FROM sync_op").all()[0].c`),
  bOps: await B.evalJs(`window.pip.db.prepare("SELECT COUNT(*) c FROM sync_op").all()[0].c`),
  bEvents: await B.evalJs(`window.pip.db.prepare("SELECT COUNT(*) c FROM learner_event_log").all()[0].c`),
  bSentence: await B.evalJs(`window.pip.sentence.length`),
};

// B turns on Model mode through the real sheet.
out.modelOn = await B.evalJs(`(async () => {
  document.querySelector('#corner').click();
  await new Promise((r) => setTimeout(r, 500)); // Settings opens through the PIN gate
  document.querySelector('.set-nav-btn[data-sec="spotlight"]').click();
  document.querySelector('#spot-model').click();
  return {
    bar: !document.querySelector('#modelbar').hidden,
    modeling: window.pip.spotlight.modeling,
  };
})()`);

// B taps `stop` on its board — it must glow on A and fade.
await B.evalJs(`(() => {
  [...document.querySelectorAll('#grid .cell')]
    .find((c) => (c.textContent || '').trim().toLowerCase() === 'stop')?.click();
  return 1;
})()`);
out.aGlows = await A.until(`(() => {
  const c = [...document.querySelectorAll('#grid .cell')]
    .find((c) => (c.textContent || '').trim().toLowerCase() === 'stop');
  return c?.classList.contains('glow');
})()`, 10000);
await sleep(4800); // the model fades on its own (MODEL_FADE_MS = 4000)
out.aFaded = await A.evalJs(`(() => {
  const c = [...document.querySelectorAll('#grid .cell')]
    .find((c) => (c.textContent || '').trim().toLowerCase() === 'stop');
  return !c?.classList.contains('glow') && window.pip.spotlight.modelGlow.length === 0;
})()`);

// A word inside a group lights the route walk on A's home view.
await B.evalJs(`(() => {
  document.querySelector('#anchor-groups').click();
  return 1;
})()`);
await B.until(`[...document.querySelectorAll('#groupgrid .gcell')].length > 3`);
await B.evalJs(`(() => {
  [...document.querySelectorAll('#groupgrid .gcell')]
    .find((c) => (c.textContent || '').includes('Drinks'))?.click();
  return 1;
})()`);
await B.until(`[...document.querySelectorAll('#groupgrid .cell')]
  .some((c) => (c.textContent || '').trim().toLowerCase() === 'juice')`);
await B.evalJs(`(() => {
  [...document.querySelectorAll('#groupgrid .cell')]
    .find((c) => (c.textContent || '').trim().toLowerCase() === 'juice')?.click();
  return 1;
})()`);
out.aRouteWalk = await A.until(`(() => {
  const anchor = document.querySelector('#anchor-groups');
  return anchor.classList.contains('glow') && window.pip.spotlight.modelGlow.length === 1;
})()`, 10000);

// The works test's log leg: nothing reached the sync log on either
// device, and B's tap never entered the child's instruments.
const after = {
  aOps: await A.evalJs(`window.pip.db.prepare("SELECT COUNT(*) c FROM sync_op").all()[0].c`),
  bOps: await B.evalJs(`window.pip.db.prepare("SELECT COUNT(*) c FROM sync_op").all()[0].c`),
  bEvents: await B.evalJs(`window.pip.db.prepare("SELECT COUNT(*) c FROM learner_event_log").all()[0].c`),
  bSentence: await B.evalJs(`window.pip.sentence.length`),
  aSpokes: await A.evalJs(`window.__spokes`),
};
out.log = { before, after };

console.log(JSON.stringify(out, null, 2));
const ok = out.linked && out.lifetime && out.codeShown &&
  out.bJoined && out.bBoard &&
  out.modelOn.bar && out.modelOn.modeling &&
  out.aGlows && out.aFaded && out.aRouteWalk &&
  after.aOps === before.aOps && after.bOps === before.bOps &&
  after.bEvents === before.bEvents && after.bSentence === before.bSentence &&
  after.aSpokes === 0;
console.log(ok ? "PASS live modeling on the mirror" : "FAIL — see output");
A.chrome.kill();
B.chrome.kill();
process.exit(ok ? 0 : 1);
