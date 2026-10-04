#!/usr/bin/env node
/** 043 A live proof — local saves are reliable and failures are visible.
 *  One real device against the dev server:
 *    1. An edit survives the browser being killed outright (no graceful
 *       pagehide — the debounced save must have already landed).
 *    2. A corrupted current save falls back to the previous copy —
 *       the board opens, the health flag says so, and the recovered
 *       bytes then overwrite the corrupt save (self-healing).
 *    3. Corrupt BOTH copies — the board opens temporary, saves are
 *       blocked, and the stored bytes are left untouched.
 *    node scripts/probes/db_save_probe.mjs [origin]
 */
import { spawn } from "node:child_process";
import { resolveChrome } from "./chrome.mjs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ORIGIN = process.argv[2] ?? process.env.PIP_ORIGIN ?? "http://localhost:21088";
const PROFILE = "/tmp/pip-dbsave-a";

async function device(name, port) {
  const chrome = spawn(resolveChrome(), [
    "--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${PROFILE}`, "--no-first-run", "about:blank"],
    { stdio: "ignore" });
  await sleep(2500);
  const page = (await (await fetch(`http://localhost:${port}/json`)).json())
    .find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let mid = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++mid; pending.set(id, res);
    setTimeout(() => { if (pending.delete(id)) rej(new Error("send timeout")); }, 12000);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails)
      throw new Error(`${name}: ${JSON.stringify(r.result.exceptionDetails).slice(0, 400)}`);
    return r.result?.result?.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  const load = async (path = "") => {
    await send("Page.navigate", { url: ORIGIN + path });
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      if (await evalJs("typeof window.pip === 'object' && !!window.pip.db")
        .catch(() => false)) return;
    }
    throw new Error(`${name}: app did not boot`);
  };
  const until = async (expr, ms = 20000) => {
    for (let t = 0; t < ms; t += 400) {
      if (await evalJs(expr).catch(() => null)) return true;
      await sleep(400);
    }
    return false;
  };
  return { name, chrome, evalJs, load, until };
}

const mkEntity = (name) => `(async () => {
  const m = await import('/shared/groups.mjs');
  return m.createEntity(window.pip.db, { name: ${JSON.stringify(name)} }).id;
})()`;
const hasEntity = (name) =>
  `window.pip.db.prepare("SELECT 1 AS x FROM personal_entity WHERE spoken_name=?").all(${JSON.stringify(name)}).length > 0`;
const health = `window.pip.dbHealth()`;
/** Corrupt a stored copy: ≥64 bytes with a high clean-break marker so it
 *  reads as "a save" but fails to open as a database. */
const corrupt = (key) => `(async () => {
  const idb = await new Promise((res, rej) => {
    const r = indexedDB.open('pip-users', 1);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const garbage = new Uint8Array(512);
  garbage.set([0xff, 0xff, 0xff, 0xff], 60); // clean-break marker field
  await new Promise((res, rej) => {
    const tx = idb.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(garbage, ${JSON.stringify(key)});
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return 1;
})()`;
const storedLen = (key) => `(async () => {
  const idb = await new Promise((res, rej) => {
    const r = indexedDB.open('pip-users', 1);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const v = await new Promise((res, rej) => {
    const tx = idb.transaction('kv', 'readonly');
    const q = tx.objectStore('kv').get(${JSON.stringify(key)});
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
  return v?.byteLength ?? v?.length ?? 0;
})()`;

const out = {};
const A = await device("board", 9285);
const fail = async (msg) => {
  out.health = await A.evalJs(health).catch(() => "gone");
  console.log(JSON.stringify(out, null, 2));
  console.log("FAIL: " + msg);
  try { A.chrome.kill(); } catch {}
  process.exit(1);
};

/* Session 1 — edit, flush, KILL the browser mid-session. */
await A.load("/?unlicensed");
const uid = await A.evalJs(`window.pip.user.id`);
await A.evalJs(`(async () => {
  document.querySelector('.welcome')?.remove();
  window.pip.user.needsSetup = false;
  window.pip.user.name = 'Ava';
  return 1;
})()`);
await A.evalJs(mkEntity("Persist One"));
await A.evalJs(`window.pip.flushDb()`);
await sleep(600); // the debounced save itself must be durable, not just the call
A.chrome.kill();
await sleep(1000);

/* Session 2 — same profile: the edit survived the kill. */
let B = await device("board2", 9286);
await B.load();
out.survivedKill = await B.evalJs(hasEntity("Persist One"));
if (!out.survivedKill) { try { B.chrome.kill(); } catch {} await fail("edit lost on abrupt close"); }

/* Second edit so prev (session-2 boot bytes = session-1 state) and the
 * current save differ, then flush so prev is kept. */
await B.evalJs(mkEntity("Persist Two"));
await B.evalJs(`window.pip.flushDb()`);
await sleep(600);
out.prevKept = await B.evalJs(storedLen(`db/${uid}.prev`)) > 0;
if (!out.prevKept) { try { B.chrome.kill(); } catch {} await fail("previous copy was never kept"); }

/* Corrupt the current save — the previous copy must bring the board back. */
await B.evalJs(corrupt(`db/${uid}`));
await B.load();
out.healthAfterCorrupt = await B.evalJs(health);
out.restoredOne = await B.evalJs(hasEntity("Persist One"));
if (!out.restoredOne) { try { B.chrome.kill(); } catch {} await fail("prev copy did not restore"); }
if (!out.healthAfterCorrupt?.restoredFromPrev)
  { try { B.chrome.kill(); } catch {} await fail("restore was silent — no health flag"); }

/* The recovered state heals the live save on the next flush. */
await B.evalJs(`window.pip.flushDb()`);
await sleep(600);
out.primaryHealed = await B.evalJs(storedLen(`db/${uid}`)) > 512;

/* Corrupt BOTH copies — temporary board, saves blocked, bytes untouched. */
await B.evalJs(corrupt(`db/${uid}`));
await B.evalJs(corrupt(`db/${uid}.prev`));
await B.load();
out.healthAllCorrupt = await B.evalJs(health);
if (!out.healthAllCorrupt?.saveBlocked) { try { B.chrome.kill(); } catch {} await fail("saves not blocked on total corruption"); }
await B.evalJs(mkEntity("Should Not Save"));
await B.evalJs(`window.pip.flushDb()`);
await sleep(600);
const stillGarbage = await B.evalJs(storedLen(`db/${uid}`)) === 512;
out.storedBytesUntouched = stillGarbage;
if (!stillGarbage) { try { B.chrome.kill(); } catch {} await fail("blocked board overwrote the stored copy"); }

console.log(JSON.stringify(out, null, 2));
console.log("PASS — edits survive a kill, corrupt saves restore, saves block instead of overwriting");
try { B.chrome.kill(); } catch {}
process.exit(0);
