/**
 * 013 slice 6 live proof — Coach view on the partner's mirror, the
 * spec's own test: "open the mirror during a Spotlight — the list's
 * words are at the top, and the child's device shows no coach content."
 * Two real Chrome profiles: B pairs in (its registry user carries
 * role 'partner'), A starts a Spotlight — B's coachbar shows the words,
 * a coach-chip tap glows the word on A, the tip shows, the tally counts
 * on B only. Measured on rendered DOM and the sync_op log.
 *   PIP_ORIGIN=http://localhost:8795 node scripts/probes/spot_coach_probe.mjs
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

const A = await device("ipad", 9265, "/tmp/pip-coach-a-probe");
const B = await device("phone", 9266, "/tmp/pip-coach-b-probe");
const out = {};

// Pair: A opens Add a device (ensureUser), activates Lifetime, Allows B.
await A.loadApp();
await A.evalJs(`(() => {
  window.pip.db.exec("DELETE FROM spotlight_item; DELETE FROM spotlight_list; DELETE FROM spotlight_session;");
  document.querySelector('#corner').click();
  document.querySelector('#dev-add').click();
  return 1;
})()`);
out.linked = await A.until(`!!window.pip.user.sync?.userId && !!document.querySelector('#pair-code')`);
const userId = await A.evalJs(`window.pip.user.sync.userId`);
const license = await licenseFor(licenseSecret, userId);
await A.evalJs(`(() => {
  document.querySelector('#dev-license').value = ${JSON.stringify(license)};
  document.querySelector('#dev-activate').click();
  return 1;
})()`);
out.lifetime = await A.until(
  `document.querySelector('#dev-lifetime').textContent.includes('Lifetime')`);

await B.loadApp();
await B.evalJs(`(() => {
  document.querySelector('#corner').click();
  document.querySelector('#dev-link').click();
  return 1;
})()`);
out.codeShown = await B.until(`!!document.querySelector('.pair-code')`);
const code = await B.evalJs(`document.querySelector('.pair-code').textContent`);
await A.evalJs(`(() => {
  const input = document.querySelector('#pair-code');
  input.value = ${JSON.stringify(code)};
  input.dispatchEvent(new Event('input'));
  return 1;
})()`);
out.allowShown = await A.until(`!document.querySelector('#pair-go').hidden`);
await A.evalJs(`document.querySelector('#pair-go').click()`);
out.bJoined = await B.until(
  `window.pip.user.id === ${JSON.stringify(userId)} && window.pip.user.sync?.userId === ${JSON.stringify(userId)}`,
  20000);
await B.ensureLive();
out.bRole = await B.evalJs(`window.pip.user.role`);
out.aRole = await A.evalJs(`window.pip.user.role ?? null`);

// A saves a two-word list through the real API and starts it.
await A.evalJs(`(() => {
  const id = (w) => window.pip.db.prepare(
    "SELECT sense_id AS id FROM label WHERE text = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'"
  ).all(w)[0].id;
  const targets = ['sense:' + id('juice'), 'sense:' + id('water')];
  window.pip.spotlight.saveList('Coach List', targets);
  window.pip.spotlight.startSession({ name: 'Coach List', targets, minutes: 15 });
  return 1;
})()`);

// B's coachbar lights with the session's words; A shows none.
out.bCoach = await B.until(
  `!document.querySelector('#coachbar').hidden && document.querySelectorAll('.coach-word').length === 2`,
  15000);
out.bWords = await B.evalJs(
  `[...document.querySelectorAll('.coach-word')].map((b) => b.textContent.toLowerCase())`);
out.bBasics = await B.evalJs(`(() => ({
  visible: !document.querySelector('#coach-basic').hidden,
  text: document.querySelector('#coach-basic-text').textContent,
}))()`);
out.aCoach = await A.evalJs(`(() => ({
  hidden: document.querySelector('#coachbar').hidden,
  words: document.querySelectorAll('.coach-word').length,
}))()`);

// B taps a coach word — it glows on A (live model), the tip shows, the
// tally counts on B only, and the sync log grows nowhere.
const bOpsBefore = await B.evalJs(
  `window.pip.db.prepare("SELECT COUNT(*) c FROM sync_op").all()[0].c`);
await B.evalJs(`(() => {
  [...document.querySelectorAll('.coach-word')]
    .find((b) => b.textContent.toLowerCase() === 'juice')?.click();
  return 1;
})()`);
out.aGlows = await A.until(`(() => {
  // juice is fringe — the model glow walks the route: the Groups anchor
  // lights on A's board (slice 4 route walk), or the cell itself glows.
  if (document.querySelector('#anchor-groups')?.classList.contains('glow')) return true;
  const inGrid = [...document.querySelectorAll('#grid .cell')];
  const inGroups = [...document.querySelectorAll('.gcell')];
  return inGrid.concat(inGroups).some((c) => c.classList.contains('glow'));
})()`, 10000);
out.afterTap = await B.evalJs(`(() => ({
  tip: document.querySelector('#coach-tip').textContent,
  tipShown: !document.querySelector('#coach-tip').hidden,
  tally: document.querySelector('#coach-tally').textContent,
  ops: window.pip.db.prepare("SELECT COUNT(*) c FROM sync_op").all()[0].c,
  coachEvents: window.pip.db.prepare("SELECT COUNT(*) c FROM coach_event").all()[0].c,
}))()`);
// The tally never reaches A: coach_event is device-local.
out.aCoachEvents = await A.evalJs(
  `window.pip.db.prepare("SELECT COUNT(*) c FROM coach_event").all()[0].c`);

// The basics line: ✕ dismisses it permanently on this device.
out.basicDismiss = await B.evalJs(`(() => {
  const before = document.querySelector('#coach-basic-text').textContent;
  document.querySelector('#coach-basic-x').click();
  const after = document.querySelector('#coach-basic-text').textContent;
  return { before, after, changed: before !== after,
    stillVisible: !document.querySelector('#coach-basic').hidden };
})()`);

console.log(JSON.stringify(out, null, 2));
const ok =
  out.linked && out.lifetime && out.bJoined &&
  out.bRole === "partner" && out.aRole === null &&
  out.bCoach && out.bWords.length === 2 &&
  out.bWords.includes("juice") && out.bWords.includes("water") &&
  out.bBasics.visible && out.bBasics.text.length > 0 &&
  out.aCoach.hidden && out.aCoach.words === 0 &&
  out.aGlows &&
  out.afterTap.tipShown && out.afterTap.tip.includes("juice") &&
  out.afterTap.tally.includes("1 word") &&
  out.afterTap.ops === bOpsBefore &&
  out.afterTap.coachEvents === 1 &&
  out.aCoachEvents === 0 &&
  out.basicDismiss.changed;
console.log(ok ? "PASS coach view on the partner mirror, none on the child" : "FAIL — see output");
A.chrome.kill();
B.chrome.kill();
