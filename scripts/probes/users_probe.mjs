/**
 * 015 slice 2 live proof — many users on one device
 * (Sync_And_Web_Editing § 12.2). Drives the real UI:
 *   boot → home user opens → write in user A → Parent corner → Add a
 *   user → user B boots empty → write in B → Switch back → A's write
 *   is intact, B's is absent → a second tab on the same user is told,
 *   not allowed → kvvfs + pip_sync migrate into a registry row.
 * Measures the rendered DB rows and registry — never the code's own
 * report.
 *   node scripts/probes/users_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9257, ORIGIN = "http://localhost:8795";
rmSync("/tmp/pip-users-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-users-probe", "--no-first-run", "about:blank"]);
await sleep(2500);

const browser = (await (await fetch(`http://localhost:${PORT}/json/version`)).json());
const bws = new WebSocket(browser.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let mid = 0; const pending = new Map();
bws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const bsend = (m, p = {}) => new Promise((res) => {
  const id = ++mid; pending.set(id, res);
  bws.send(JSON.stringify({ id, method: m, params: p }));
});

const pageTarget = (await (await fetch(`http://localhost:${PORT}/json`)).json())
  .find((t) => t.type === "page");
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = bws.onmessage;
const send = (m, p = {}) => new Promise((res) => {
  const id = ++mid; pending.set(id, res);
  ws.send(JSON.stringify({ id, method: m, params: p }));
});
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

await send("Page.enable");
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
await loadApp();

const out = {};

// ── 1. First boot: one registry user, the home user, opens directly.
const boot = await evalJs(`(async () => ({
  user: window.pip.user,
  users: await window.pip.users(),
  mode: window.pip.db.all("SELECT keyboard_mode, keyboard_order FROM learner_profile WHERE id='prf_local'")[0],
}))()`);
out.firstBoot = {
  oneUser: boot.users.length === 1,
  isHome: boot.user.home === true,
  sameId: boot.users[0].id === boot.user.id,
};

// ── 2. Write in user A (a real settings row), flush, then Add a user.
await evalJs(`(async () => {
  window.pip.db.exec("UPDATE learner_profile SET keyboard_mode='device' WHERE id='prf_local'");
  await window.pip.flushDb();
  return 1;
})()`);
// Headless blocks on real dialogs — answer them deterministically.
await evalJs(`(() => { window.prompt = () => 'Bea'; window.confirm = () => true; return 1; })()`);
const aId = boot.user.id;
await evalJs(`(() => { document.querySelector('#corner').click();
  document.querySelector('#usr-add').click(); return 1; })()`);
await sleep(500);
await loadApp();

// ── 3. User B: a different id, its own DB (A's write absent).
const afterAdd = await evalJs(`(async () => ({
  user: window.pip.user,
  users: await window.pip.users(),
  mode: window.pip.db.all("SELECT keyboard_mode, keyboard_order FROM learner_profile WHERE id='prf_local'")[0],
}))()`);
out.addUser = {
  newId: afterAdd.user.id !== aId,
  twoUsers: afterAdd.users.length === 2,
  bIsClean: afterAdd.mode.keyboard_mode === "pip",
};

// ── 4. Write in B, switch back to A via Parent corner → Users.
await evalJs(`(async () => {
  window.pip.db.exec("UPDATE learner_profile SET keyboard_order='abc' WHERE id='prf_local'");
  await window.pip.flushDb();
  return 1;
})()`);
await evalJs(`(() => { document.querySelector('#corner').click(); return 1; })()`);
for (let i = 0; i < 20; i++) {
  const clicked = await evalJs(`(() => {
    const b = [...document.querySelectorAll('#usr-list button')]
      .find((x) => x.textContent === 'Switch');
    if (b) { b.click(); return true; } return false; })()`);
  if (clicked) break;
  await sleep(300);
}
await sleep(500);
await loadApp();

const backInA = await evalJs(`(async () => ({
  user: window.pip.user,
  mode: window.pip.db.all("SELECT keyboard_mode, keyboard_order FROM learner_profile WHERE id='prf_local'")[0],
}))()`);
out.isolation = {
  backToA: backInA.user.id === aId,
  aKept: backInA.mode.keyboard_mode === "device",
  bAbsent: backInA.mode.keyboard_order !== "abc",
};

// ── 5. Web lock: a second tab on the same user is told, not allowed.
const { result: { targetId } } = await bsend("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await bsend("Target.attachToTarget",
  { targetId, flatten: true });
const send2 = (m, p = {}) => new Promise((res) => {
  const id = ++mid; pending.set(id, res);
  bws.send(JSON.stringify({ id, method: m, params: p, sessionId }));
});
await send2("Page.enable");
await send2("Page.navigate", { url: ORIGIN });
out.webLock = { told: false };
for (let i = 0; i < 20 && !out.webLock.told; i++) {
  await sleep(700);
  const r = await send2("Runtime.evaluate",
    { expression: "document.body?.textContent ?? ''", returnByValue: true });
  out.webLock.told = /open in another tab/.test(r.result?.result?.value ?? "");
}
await bsend("Target.closeTarget", { targetId });

// ── 6. Migration: seed a real kvvfs db + pip_sync, clear the registry,
// reload — the legacy install becomes the home user with its db.
await evalJs(`(async () => {
  // A pre-015 install: its database lived in kvvfs 'local'.
  const s3 = await (await import('/vendor/sqlite-wasm/sqlite3.mjs')).default();
  const d = new s3.oo1.JsStorageDb('local');
  d.exec("CREATE TABLE marker(v INTEGER); INSERT INTO marker VALUES(42)");
  d.close();
  localStorage.setItem('pip_sync', JSON.stringify({ userId: 'u-live', epoch: 1 }));
  // Clear the registry (rows only — deleteDatabase would block on the
  // app's open connection).
  const idb = await new Promise((res) => {
    const q = indexedDB.open('pip-users', 1); q.onsuccess = () => res(q.result); });
  await new Promise((res) => {
    const tx = idb.transaction('kv', 'readwrite');
    tx.objectStore('kv').clear(); tx.oncomplete = res; });
  idb.close();
  return 1;
})()`);
await loadApp();
const migrated = await evalJs(`(async () => ({
  user: window.pip.user,
  marker: window.pip.db.all("SELECT v FROM marker")[0]?.v,
  kvvfsLeft: Object.keys(localStorage).filter((k) => k.startsWith('kvvfs-local-')).length,
  pipSyncLeft: localStorage.getItem('pip_sync'),
}))()`);
out.migration = {
  homeUser: migrated.user.id === "u-live" && migrated.user.home === true,
  syncCarried: migrated.user.sync?.userId === "u-live",
  dbCarried: migrated.marker === 42,
  cleared: migrated.kvvfsLeft === 0 && migrated.pipSyncLeft === null,
};

console.log(JSON.stringify(out, null, 2));
const pass = Object.values(out).every((leg) => Object.values(leg).every(Boolean));
console.log(pass ? "PASS" : "FAIL");
chrome.kill();
process.exit(pass ? 0 : 1);
