/**
 * 015 slice 3 live proof — the QR card (Sync_And_Web_Editing § 9).
 * Drives the real UI across two Chrome profiles:
 *   client A: boot → link → write + history → open the card (QR + short
 *     code, no words) → Save/Share/Replace present → killed ("destroyed").
 *   client B (fresh profile): restore by pasting the card's code →
 *     synced data returns, history empty, the free-user move notice
 *     shows → Replace card → new code, epoch 2 → old proof gets 403 at
 *     the relay, the new one restores.
 * Camera scanning is feature-gated on BarcodeDetector (absent in
 * headless Chrome): the pasted code and a scan decode through the same
 * recoverFromText — the camera path itself is unproven here (waiver).
 *   node scripts/probes/qrcard_probe.mjs
 */
import { spawn, execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const ORIGIN = "http://localhost:8794";
const DIR_A = "/tmp/pip-qrcard-a", DIR_B = "/tmp/pip-qrcard-b";
const PORT_A = 9261, PORT_B = 9262;
rmSync(DIR_A, { recursive: true, force: true });
rmSync(DIR_B, { recursive: true, force: true });

const killChrome = (dir) => {
  try { execSync(`pkill -f "user-data-dir=${dir}"`); } catch { /* none */ }
};
killChrome(DIR_A);
killChrome(DIR_B);

let mid = 0;
const pending = new Map();
const pump = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === "Runtime.exceptionThrown") {
    console.error("PAGE ERROR:", JSON.stringify(m.params.exceptionDetails).slice(0, 400));
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    console.error("PAGE console.error:", m.params.args?.[0]?.value ?? m.params.args?.[0]?.description ?? "");
  }
};

/** Boot a fresh headless profile; returns {send, evalJs, loadApp, chrome}.
 *  The page-target socket can die across a reload — sends time out and
 *  the socket is re-resolved on the next call. */
async function client(port, dir) {
  const chrome = spawn("open", ["-na", "Google Chrome", "--args",
    "--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`, "--no-first-run", "about:blank"]);
  await sleep(2500);
  let ws = null;
  const open = async () => {
    const pageTarget = (await (await fetch(`http://localhost:${port}/json`)).json())
      .find((t) => t.type === "page");
    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    ws.onmessage = pump;
    ws.onclose = () => { ws = null; };
    ws.onerror = () => { ws = null; };
    const enable = (method) => new Promise((res) => {
      const id = ++mid; pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params: {} }));
    });
    await enable("Page.enable");
    await enable("Runtime.enable");
  };
  await open();
  const send = async (m, p = {}) => {
    for (let tries = 0; tries < 3; tries++) {
      if (!ws || ws.readyState !== 1) await open();
      const result = await Promise.race([
        new Promise((res) => {
          const id = ++mid; pending.set(id, res);
          ws.send(JSON.stringify({ id, method: m, params: p }));
        }),
        sleep(10000).then(() => null),
      ]);
      if (result !== null) return result;
      ws = null; // wedged — reconnect and retry
    }
    throw new Error(`cdp ${m}: no response`);
  };
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) {
      throw new Error(JSON.stringify(r.result.exceptionDetails));
    }
    return r.result?.result?.value;
  };
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
  return { send, evalJs, loadApp, chrome, port };
}

const out = {};

// ── Client A: boot, link, write, open the card.
const A = await client(PORT_A, DIR_A);
await A.loadApp();
await A.evalJs("window.confirm = () => true; window.prompt = () => '';");

// Link: "Add a device" runs ensureUser — the relay learns the user and
// sync connects (the pair-code dialog it opens is harmless).
await A.evalJs(`document.getElementById("dev-add").click()`);
let linked = false;
for (let i = 0; i < 30; i++) {
  await sleep(500);
  linked = await A.evalJs("!!window.pip.user.sync?.userId").catch(() => false);
  if (linked) break;
}
if (!linked) throw new Error("ensureUser did not link");
const userId = await A.evalJs("window.pip.user.sync.userId");
await A.evalJs(`document.querySelector("#pairform [data-close]")?.click()`);

// A synced write plus a history row that must never leave the device.
await A.evalJs(`(async () => {
  const { createEntity } = await import("/shared/groups.mjs");
  createEntity(window.pip.db, { name: "QrCardProbe" });
  window.pip.db.exec("INSERT INTO sentence (started_at, ended_at, end_kind, tz_offset_min) VALUES (1000, 2000, 'spoken', -420)");
  const sid = window.pip.db.all("SELECT id FROM sentence ORDER BY id DESC LIMIT 1")[0].id;
  window.pip.db.exec("INSERT INTO learner_event_log (item_kind, item_id, selected_at, sentence_id, position, source, tz_offset_min) VALUES ('entity', 'probe', 1234, " + sid + ", 0, 'grid', -420)");
  await window.pip.flushDb();
})()`);
// Ops flush on a 300 ms debounce — poll until the write is on the relay.
let pendingOps = -1;
for (let i = 0; i < 30; i++) {
  await sleep(500);
  pendingOps = await A.evalJs(
    "window.pip.db.all('SELECT COUNT(*) n FROM sync_op WHERE relay_seq IS NULL')[0].n");
  if (pendingOps === 0) break;
}

// The card: QR, short code, action buttons — and no words.
await A.evalJs(`document.getElementById("dev-sheet").click()`);
await sleep(600);
const card = await A.evalJs(`({
  qr: !!document.querySelector("#rec-body .pair-qr svg"),
  code: document.querySelector("#rec-body .rec-code")?.textContent ?? "",
  words: !!document.querySelector("#rec-body .rec-words"),
  buttons: [...document.querySelectorAll("#rec-body .row button")].map((b) => b.textContent),
  print: !document.getElementById("rec-print").hidden,
})`);
const oldCode = card.code.replace(/\s/g, "");
out.card = {
  qr: card.qr,
  code43: oldCode.length === 43 && /^[A-Za-z0-9_-]+$/.test(oldCode),
  noWords: !card.words,
  actions: ["Save image", "Share…", "Replace card…"].every((t) => card.buttons.includes(t)),
  print: card.print,
  submitted: pendingOps === 0,
};

// Destroyed: kill the whole client.
killChrome(DIR_A);
await sleep(800);

// ── Client B: a fresh profile — restore from the card's code.
const B = await client(PORT_B, DIR_B);
await B.loadApp();
await B.evalJs("window.confirm = () => true; window.prompt = () => '';");

// Paste path: what a scan decodes to — pip:recover:<id>:<code>.
await B.evalJs(`document.getElementById("dev-restore").click()`);
await sleep(400);
await B.evalJs(`(() => {
  document.getElementById("rec-paste").value = "pip:recover:${userId}:${oldCode}";
  document.getElementById("rec-go").click();
})()`);
// Restore reloads the app — wait for pip again, then the move notice.
let restored = false;
for (let i = 0; i < 50; i++) {
  await sleep(500);
  restored = await B.evalJs(
    `!!window.pip && window.pip.user.id === "${userId}"`).catch(() => false);
  if (restored) break;
}
if (!restored) throw new Error("restore did not land on the card's user");
// The restore reloaded the page — dialog stubs went with the document.
await B.evalJs("window.confirm = () => true; window.prompt = () => '';");
await sleep(1500); // sync catch-up + toast
const after = await B.evalJs(`({
  entity: window.pip.db.all("SELECT spoken_name FROM personal_entity WHERE spoken_name='QrCardProbe'").length,
  history: window.pip.db.all("SELECT COUNT(*) n FROM learner_event_log")[0].n,
  toast: document.getElementById("toast-text")?.textContent ?? "",
  epoch: window.pip.user.sync?.epoch,
})`);
out.restore = {
  userRestored: true,
  syncedRowsBack: after.entity === 1,
  historyEmpty: after.history === 0,
  moveNotice: /unlinked/i.test(after.toast),
};

// ── Replace the card through the real button.
await B.evalJs(`document.getElementById("dev-sheet").click()`);
await sleep(600);
await B.evalJs(`[...document.querySelectorAll("#rec-body .row button")]
  .find((b) => b.textContent === "Replace card…").click()`);
await sleep(1500);
const card2 = await B.evalJs(`({
  code: document.querySelector("#rec-body .rec-code")?.textContent ?? "",
  epoch: window.pip.user.sync?.epoch,
})`);
const newCode = card2.code.replace(/\s/g, "");
const proofs = await B.evalJs(`(async () => {
  const b64u = (b) => { const a = new Uint8Array(b); let s = "";
    for (const x of a) s += String.fromCharCode(x);
    return btoa(s).replaceAll("+","-").replaceAll("/","_").replaceAll("=",""); };
  const unb64u = (s) => Uint8Array.from(
    atob(s.replaceAll("-","+").replaceAll("_","/")), (c) => c.charCodeAt(0));
  const proof = async (code) => {
    const root = unb64u(code);
    const msg = new Uint8Array(root.length + 16);
    msg.set(root); msg.set(new TextEncoder().encode("pip-recovery-v1"), root.length);
    return b64u(await crypto.subtle.digest("SHA-256", msg));
  };
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const dh = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const body = async (code) => JSON.stringify({
    proof: await proof(code), device_id: "probe-" + Math.random().toString(36).slice(2),
    pubkey: b64u(await crypto.subtle.exportKey("spki", kp.publicKey)),
    dh_pub: b64u(await crypto.subtle.exportKey("raw", dh.publicKey)) });
  const old = await fetch("${ORIGIN}/users/${userId}/restore",
    { method: "POST", body: await body("${oldCode}") });
  const fresh = await fetch("${ORIGIN}/users/${userId}/restore",
    { method: "POST", body: await body("${newCode}") });
  return { old: old.status, fresh: fresh.status, freshBody: await fresh.json() };
})()`);
out.replace = {
  newCode: newCode.length === 43 && newCode !== oldCode,
  epoch2: card2.epoch === 2,
  oldCard403: proofs.old === 403,
  newCardRestores: proofs.fresh === 200 && proofs.freshBody.ok === true
    && proofs.freshBody.epoch === 2,
};

console.log(JSON.stringify(out, null, 2));
const pass = Object.values(out).every((leg) => Object.values(leg).every(Boolean));
console.log(pass ? "PASS" : "FAIL");
killChrome(DIR_B);
process.exit(pass ? 0 : 1);
