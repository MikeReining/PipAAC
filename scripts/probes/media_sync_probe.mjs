#!/usr/bin/env node
/** 043 C live proof — media is part of the backup, not just the ops.
 *  Two real devices against the dev relay:
 *    1. A saves a photo + a recording while UNLINKED (the audit case —
 *       syncUploadBlob is a no-op with no handle). Linking must
 *       reconcile them onto the relay without a re-save.
 *    2. B restores the board and must hold the actual BYTES in OPFS —
 *       the photo's sha and a recording that decodes — not just the
 *       photo_key/clip rows.
 *    3. A adds a photo while OFFLINE (upload queued, fails), Chrome is
 *       killed, relaunched online — the queue drains anyway.
 *    4. B is offline while A's media arrives — reconnect heals it.
 *  Truth: OPFS blob bytes + decodeAudioData, never the queue's report.
 *    node scripts/probes/media_sync_probe.mjs [origin]
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
  const page0 = (await (await fetch(`http://localhost:${port}/json`)).json())
    .find((t) => t.type === "page");
  const ws = new WebSocket(page0.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const consoleLog = [];
  const pending = new Map();
  let mid = 0;
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

/* In-page helpers (async iife strings, evaluated per device). */
const mkEntity = (name) => `(async () => {
  const m = await import('/shared/groups.mjs');
  return m.createEntity(window.pip.db, { name: ${JSON.stringify(name)} }).id;
})()`;
/* Deterministic pseudo-photo bytes tagged with a label so each media
 * piece is distinct; returns the blob:<sha> key. */
const addPhoto = (entityExpr, tag) => `(async () => {
  const dbm = await import('/db.js');
  const sm = await import('/shared/sync.mjs');
  const bytes = new Uint8Array(4096).map((_, i) => (i * 31 + ${tag.length}) % 251);
  bytes.set(new TextEncoder().encode(${JSON.stringify(tag)}));
  const { key, bytes: b } = await dbm.savePhoto(new File([bytes], 'p.bin'));
  await sm.syncUploadBlob(b);
  const m = await import('/shared/groups.mjs');
  m.setEntityPhoto(window.pip.db, ${entityExpr}, key);
  return key;
})()`;
/* A small but real WAV (8kHz mono sine, ~250ms) — decodeAudioData on the
 * receiving device is the playable check. */
const addRecording = (entityExpr, tag) => `(async () => {
  const n = 2000, pcm = new Uint8Array(44 + n);
  pcm.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(pcm.buffer).setUint32(4, 36 + n, true);
  pcm.set(new TextEncoder().encode('WAVEfmt '), 8);
  new DataView(pcm.buffer).setUint32(16, 16, true);
  new DataView(pcm.buffer).setUint16(20, 1, true);
  new DataView(pcm.buffer).setUint16(22, 1, true);
  new DataView(pcm.buffer).setUint32(24, 8000, true);
  new DataView(pcm.buffer).setUint32(28, 8000, true);
  new DataView(pcm.buffer).setUint16(32, 1, true);
  new DataView(pcm.buffer).setUint16(34, 8, true);
  pcm.set(new TextEncoder().encode('data'), 36);
  new DataView(pcm.buffer).setUint32(40, n, true);
  for (let i = 0; i < n; i++) pcm[44 + i] = 128 + Math.round(90 * Math.sin(i / 8));
  const dbm = await import('/db.js');
  const sm = await import('/shared/sync.mjs');
  const { key, bytes } = await dbm.savePhoto(new File([pcm], 'r.wav'));
  await sm.syncUploadBlob(bytes);
  const v = await import('/shared/voice.mjs');
  v.setOverride(window.pip.db, { itemKind: 'entity', itemId: ${entityExpr},
    key, recordedText: ${JSON.stringify(tag)} });
  return key;
})()`;
/* Truth reads: photo_key on the entity, blob presence + content hash in
 * OPFS, decode of a healed WAV. All on the device's own state. */
const photoKey = (entityName) => `(async () => {
  const r = window.pip.db.prepare(
    "SELECT photo_key AS k FROM personal_entity WHERE spoken_name = ?").all(${JSON.stringify(entityName)})[0];
  return r?.k ?? null;
})()`;
const blobHealed = (keyExpr) => `(async () => {
  const k = ${keyExpr};
  if (!k?.startsWith('blob:')) return 'no-key';
  const m = await import('/db.js');
  const bytes = await m.loadBlobBytes(k.slice(5));
  if (!bytes) return 'missing';
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return sha === k.slice(5) ? 'ok' : 'corrupt:' + bytes.length;
})()`;
const wavDecodes = (entityName) => `(async () => {
  const r = window.pip.db.prepare(
    "SELECT key AS k FROM clip_override WHERE status='ready' AND entity_id = (SELECT id FROM personal_entity WHERE spoken_name = ?)")
    .all(${JSON.stringify(entityName)})[0];
  if (!r) return 'no-clip-row';
  const m = await import('/db.js');
  const bytes = await m.loadBlobBytes(r.k.slice(5));
  if (!bytes) return 'missing-bytes';
  const ctx = new OfflineAudioContext(1, 8000, 8000);
  const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
  return buf.duration > 0 ? 'ok' : 'silent';
})()`;
const mediaQueue = `(async () => {
  const req = indexedDB.open('pip-keys', 1);
  const idb = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = rej; });
  const q = await new Promise((res) => {
    const t = idb.transaction('keys').objectStore('keys').get('blobq/' + window.pip.user.id);
    t.onsuccess = () => res(t.result ?? []);
    t.onerror = () => res([]);
  });
  return q;
})()`;
const mediaQueueLen = `(async () => (await ${mediaQueue}).length)()`;
const health = `(async () => (await import('/shared/sync.mjs')).syncHealth())()`;

const spawned = [];
let A2 = null;
const cleanup = () => { for (const d of spawned) { try { d.chrome.kill(); } catch {} } };
process.on("exit", cleanup);
const A = await device("ipad", 9283, "/tmp/pip-media-a");
const B = await device("laptop", 9284, "/tmp/pip-media-b");
spawned.push(A, B);
const out = {};
const fail = async (msg, extra) => {
  out.queueA = await A.evalJs(mediaQueue).catch(() => "gone");
  out.healthA = await A.evalJs(health).catch((e) => "err " + e.message);
  if (A2) {
    out.queueA2 = await A2.evalJs(mediaQueue).catch((e) => "err " + e.message);
    out.healthA2 = await A2.evalJs(health).catch((e) => "err " + e.message);
    out.consoleA2 = A2.consoleLog?.slice(-10);
  }
  out.queueB = await B.evalJs(mediaQueue).catch(() => "gone");
  out.healthB = await B.evalJs(health).catch((e) => "err " + e.message);
  out.consoleA = A.consoleLog?.slice(-10) ?? "n/a";
  out.consoleB = B.consoleLog?.slice(-10) ?? "n/a";
  console.log(JSON.stringify({ ...out, ...extra }, null, 2));
  console.log("FAIL: " + msg);
  for (const d of spawned) { try { d.chrome.kill(); } catch {} }
  process.exit(1);
};

/* 1. A: media saved while UNLINKED — photo + recording on one entity. */
await A.loadApp("/?unlicensed");
await A.evalJs(`(async () => {
  document.querySelector('.welcome')?.remove();
  window.pip.user.needsSetup = false;
  window.pip.user.name = 'Luca';
  return 1;
})()`);
const entId = await A.evalJs(mkEntity("Photo Kid"));
out.photoKey = await A.evalJs(addPhoto(JSON.stringify(entId), "prelink-photo"));
out.recKey = await A.evalJs(addRecording(JSON.stringify(entId), "Photo Kid"));
await A.evalJs(`window.pip.flushDb()`);
out.prelinkQueueNote = await A.evalJs(mediaQueueLen); // no sync yet — nothing queued, reconcile covers it

/* 2. Link A ↔ B (the proven pair flow). */
await A.evalJs(`document.querySelector('#corner').click();
  document.querySelector('#dev-add').click(); 1`);
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

await B.loadApp();
if (!await B.until(`!!document.querySelector('.welcome-join-go')`, 60000))
  await fail("B welcome never came up", { bodyB: await B.evalJs(
    `document.body.innerHTML.slice(0, 400) + ' | pip:' + !!window.pip`) });
await B.evalJs(`document.querySelector('.welcome-join-go').click(), 1`);
if (!await B.until(`!!document.querySelector('#pair-role [data-v="board"]')`, 15000))
  await fail("B role sheet never came up");
await B.evalJs(`(() => {
  document.querySelector('#pair-role [data-v="board"]').click();
  const input = document.querySelector('#pair-code');
  input.value = ${JSON.stringify(code.toLowerCase())};
  input.dispatchEvent(new Event('input'));
  return 1;
})()`);
if (!await B.until(`window.pip?.user?.id === ${JSON.stringify(userId)}`, 60000))
  await fail("B never joined");
await B.skipTour();

/* 3. A's pre-link media must reach the relay (queue drained) and B's
 *    OPFS must hold the actual bytes. */
{
  let ok = false; out.drainTrail = [];
  for (let t = 0; t < 90000 && !ok; t += 2000) {
    const q = await A.evalJs(mediaQueueLen).catch(() => "?");
    if (out.drainTrail.at(-1) !== q) out.drainTrail.push(`t=${t}ms q=${q}`);
    ok = q === 0;
    if (!ok) await sleep(2000);
  }
  out.aQueueDrained = ok;
}
out.bPhotoKey = await B.until(
  `(async () => (await ${photoKey("Photo Kid")}) !== null)()`, 90000)
  ? await B.evalJs(photoKey("Photo Kid")) : null;
out.bPhotoBytes = await B.until(
  `(async () => (await ${blobHealed(JSON.stringify(out.photoKey ?? "blob:none"))}) === 'ok')()`, 60000);
out.bRecording = await B.until(
  `(async () => (await ${wavDecodes("Photo Kid")}) === 'ok')()`, 60000);
if (!out.aQueueDrained) await fail("A's media queue never drained");
if (!out.bPhotoKey) await fail("B never got the photo op");
if (!out.bPhotoBytes) await fail("B's OPFS lacks the photo bytes",
  { bPhoto: await B.evalJs(blobHealed(JSON.stringify(out.photoKey))) });
if (!out.bRecording) await fail("B's recording is missing or unplayable",
  { rec: await B.evalJs(wavDecodes("Photo Kid")) });

/* 4. Kill-during-queue: A offline → photo saved (queued, upload fails)
 *    → Chrome killed → relaunched online → queue drains → B heals. */
await A.offline(true);
await sleep(1200);
const ent2 = await A.evalJs(mkEntity("Offline Kid"));
out.offlineKey = await A.evalJs(addPhoto(JSON.stringify(ent2), "offline-killed"));
await sleep(800); // let the failed drain land in the queue
out.queuedWhileOffline = await A.evalJs(mediaQueueLen);
A.chrome.kill();
await sleep(1500);

A2 = await device("ipad2", 9285, "/tmp/pip-media-a");
spawned.push(A2);
await A2.loadApp("", userId);
await A2.offline(false); // belt: emulate offline state does not persist; ensure online
out.a2QueueDrained = await A2.until(
  `(async () => (await ${mediaQueue}).length === 0)()`, 90000);
out.bOfflinePhoto = await B.until(
  `(async () => (await ${photoKey("Offline Kid")}) !== null && (await ${blobHealed(`(await ${photoKey("Offline Kid")})`)}) === 'ok')()`,
  180000);
if (!out.a2QueueDrained) await fail("relaunched A never drained the killed upload");
if (!out.bOfflinePhoto) await fail("B never healed the killed-upload photo",
  { k: await B.evalJs(photoKey("Offline Kid")).catch(() => null),
    refsB: await B.evalJs(`window.pip.db.prepare(
      "SELECT photo_key AS k FROM personal_entity WHERE photo_key LIKE 'blob:%' " +
      "UNION SELECT photo_key FROM image_override WHERE photo_key LIKE 'blob:%' " +
      "UNION SELECT key FROM clip_override WHERE key LIKE 'blob:%' " +
      "UNION SELECT person_photo FROM learner_profile WHERE person_photo LIKE 'blob:%'"
    ).all().map(r => r.k)`).catch((e) => "qerr " + e.message),
    bytesB: await B.evalJs(blobHealed(JSON.stringify(out.offlineKey ?? "blob:none"))).catch((e) => "berr " + e.message) });

/* 5. B offline while a photo lands on A — reconnect must heal. */
await B.offline(true);
await sleep(1200);
const ent3 = await A2.evalJs(mkEntity("Late Kid"));
out.lateKey = await A2.evalJs(addPhoto(JSON.stringify(ent3), "late-photo"));
await A2.evalJs(`window.pip.flushDb()`);
await sleep(1500);
await B.offline(false);
out.bLateHealed = await B.until(
  `(async () => (await ${photoKey("Late Kid")}) !== null && (await ${blobHealed(`(await ${photoKey("Late Kid")})`)}) === 'ok')()`,
  90000);
if (!out.bLateHealed) await fail("B never healed the post-reconnect photo");

console.log(JSON.stringify(out, null, 2));
console.log("PASS — media survives pre-link saves, a killed upload, and offline gaps");
for (const d of spawned) { try { d.chrome.kill(); } catch {} }
process.exit(0);
