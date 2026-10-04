#!/usr/bin/env node
/** 041 Slice D — the boot-speed gate. Headless Chrome via CDP on a
 *  fresh profile: iPad landscape, 4x CPU throttle (a classroom iPad),
 *  fast Wi-Fi profile. Measures the three first impressions the founder
 *  budgeted in docs/phases/041 §1:
 *
 *    first visit   — board + pictures + welcome card visible
 *    repeat launch — board visible (SW-controlled, the production path)
 *    add a person  — their board visible, and NO welcome card
 *
 *  Plus: requests before the board, when the language tables became
 *  ready, and whether any precache traffic preceded the board.
 *
 *    PIP_ORIGIN=http://localhost:21088 node scripts/probes/speed_probe.mjs
 *    node scripts/probes/speed_probe.mjs http://localhost:21088
 *
 *  Exits 1 over a scripts/probes/speed_budgets.json budget. The marks
 *  are read from performance.now() inside the page — the probe watches
 *  the device, it never asks the device how it feels (measure-the-
 *  actual-thing rule). */
import { spawn } from "node:child_process";
import { resolveChrome } from "./chrome.mjs";
import { rmSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ORIGIN = process.env.PIP_ORIGIN ?? process.argv[2] ?? "http://localhost:21088";
const BUDGETS = JSON.parse(readFileSync(
  fileURLToPath(new URL("./speed_budgets.json", import.meta.url)), "utf8"));
const PORT = 9277;
/* Unique dir per run — a prior Chrome can still be flushing IndexedDB on
 * SIGTERM, and reusing its profile makes the "first visit" boot a user
 * who already finished setup (no welcome). */
const PROFILE = `/tmp/pip-speed-probe-${process.pid}`;

/* In-page milestone clock. Runs before every document; each mark is the
 * first performance.now() at which the condition held. Polls fast —
 * marks are what we measure, the probe only reads them. */
const MARKS_SOURCE = `(() => {
  // The add-a-person drive answers prompt() deterministically — headless
  // can auto-cancel a real dialog before a handler lands.
  window.prompt = () => "Bea Probe";
  window.__marks = {};
  const m = (k) => { if (window.__marks[k] === undefined) window.__marks[k] = performance.now(); };
  setInterval(() => {
    try {
      if (document.querySelector("#welcome-name, .welcome")) m("welcome");
      const cell = document.querySelector("#grid .cell");
      if (cell) m("tile");
      const img = cell && cell.querySelector(".tart img");
      if (img && img.complete && img.naturalWidth > 0) m("picture");
      if (window.pip && window.pip.db) m("db");
      if (window.pip && window.pip.languageReady) m("language");
    } catch {}
  }, 15);
})();`;

rmSync(PROFILE, { recursive: true, force: true });
const CHROME = resolveChrome();
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, "--no-first-run", "about:blank"],
  { stdio: "ignore" });
const bail = (msg, extra) => {
  if (extra) console.log(JSON.stringify(extra, null, 2));
  console.log(`FAIL: ${msg}`);
  chrome.kill();
  process.exit(1);
};
process.on("exit", () => { try { chrome.kill(); } catch {} });

let page = null;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500);
  page = (await (await fetch(`http://localhost:${PORT}/json`)
    .catch(() => null))?.json().catch(() => null) ?? [])
    .find((t) => t.type === "page");
}
if (!page) bail("chrome CDP never came up");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let mid = 0;
const pending = new Map();
const requests = [];        // Network.requestWillBeSent since last nav
const pageErrors = [];
let navCount = 0;           // Page.frameNavigated events observed
const navUrls = [];
const execCtxs = [];        // Runtime.executionContextCreated main-world ids
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Network.requestWillBeSent") {
    requests.push({ url: m.params.request.url, wall: m.params.wallTime * 1000 });
  }
  if (m.method === "Runtime.exceptionThrown") {
    pageErrors.push(JSON.stringify(
      m.params.exceptionDetails?.exception?.description
        ?? m.params.exceptionDetails).slice(0, 500));
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    pageErrors.push("console: " + m.params.args
      .map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 500));
  }
  if (m.method === "Log.entryAdded" && ["error", "warning"].includes(m.params.entry.level)) {
    pageErrors.push(`log/${m.params.entry.level}: ${m.params.entry.text}`.slice(0, 500));
  }
  if (m.method === "Page.frameNavigated") {
    navCount++;
    navUrls.push(m.params.frame?.url);
  }
  if (m.method === "Runtime.executionContextCreated") {
    const c = m.params.context;
    if (c.auxData?.isDefault) execCtxs.push({ id: c.id, name: c.name });
  }
  if (m.method === "Page.javascriptDialogOpening") {
    send("Page.handleJavaScriptDialog",
      { accept: true, promptText: "Bea Probe" }).catch(() => {});
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++mid;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expression, contextId) => {
  const params = { expression, awaitPromise: true, returnByValue: true };
  if (contextId) params.contextId = contextId;
  const r = await send("Runtime.evaluate", params);
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails };
  return r.result?.result?.value;
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setCPUThrottlingRate", { rate: 4 });
await send("Network.emulateNetworkConditions",
  { offline: false, latency: 10, downloadThroughput: 6_250_000, uploadThroughput: 3_125_000 });
await send("Page.addScriptToEvaluateOnNewDocument", { source: MARKS_SOURCE });

// Evaluate in the newest main-world context — after an in-page
// location.reload() the default context can lag one document behind.
const latestCtx = () => execCtxs.at(-1)?.id;
const marks = () => evalJs("window.__marks || {}", latestCtx())
  .then((m) => (m && !m.__err) ? m : {});
const timeOrigin = () => evalJs("performance.timeOrigin");
const pollUntil = async (fn, ms, step = 100) => {
  const deadline = Date.now() + ms;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(step);
  }
  return last;
};

/* ---- scenario 1: first visit ------------------------------------ */
requests.length = 0;
await send("Page.navigate", { url: `${ORIGIN}/` });

const first = await pollUntil(async () => {
  const m = await marks();
  return (m.tile && m.picture && m.welcome) ? m : null;
}, 90_000);
if (!first) bail("first visit: board + pictures + welcome never all visible", { marks: await marks() });

const origin0 = await timeOrigin();
const firstAbs = origin0 + Math.max(first.tile, first.picture, first.welcome);
/* § 1 budget: "requests before first paint". First paint is the
 * paint-timing entry, not the board mark — most of the module/asset
 * graph legitimately streams in while the first frame draws. The
 * background-work guard is audioRequestsBeforeBoard + the SW check. */
const firstPaint = await evalJs(
  `performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint")?.startTime
    ?? performance.getEntriesByType("paint")[0]?.startTime ?? null`);
const reqsBeforePaint = requests.filter((r) =>
  firstPaint != null && r.wall <= origin0 + firstPaint).length;
const reqsBeforeBoard = requests.filter((r) => r.wall <= firstAbs).length;
/* The onramp's own spoken clips (/audio/onramp/*) are part of the
 * welcome card, not background fill — the guard is against voice/cache
 * audio competing with the board (041 A1). */
const audioBeforeBoard = requests.filter((r) =>
  r.wall <= firstAbs && r.url.includes("/audio/")
    && !r.url.includes("/audio/onramp/")).length;

/* Walk the welcome (the real first-run path): name → child → Continue,
 * so the repeat launch below is the production repeat path — a board
 * open, not a welcome replay. */
await evalJs(`(() => {
  const name = document.querySelector("#welcome-name");
  if (name) name.value = "Ada Probe";
  document.querySelector('.welcome-choice[data-v="child"]')?.click();
  document.querySelector(".welcome-go")?.click();
  return true;
})()`);
const welGone = await pollUntil(async () =>
  !(await evalJs("!!document.querySelector('.welcome, #welcome-name')")), 15_000);
if (!welGone) bail("welcome never dismissed after Continue");

/* ---- wait for the SW's precache (the production repeat path) ----- */
const swReady = await pollUntil(() => evalJs(
  "navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller).catch(() => false) : Promise.resolve(false)"), 180_000);
if (!swReady) console.log("WARN: service worker never became ready — repeat launch measures the uncontrolled path");
const precacheDone = await pollUntil(() => evalJs(`(async () => {
  const m = await (await fetch('/sw-manifest.json')).json();
  const c = await caches.open('pip-shell-' + m.buildId).catch(() => null);
  if (!c) return false;
  return (await c.keys()).length >= m.files.length;
})()`), 180_000);
if (!precacheDone) console.log("WARN: precache did not complete before the repeat-launch measure");

/* ---- scenario 2: repeat launch ----------------------------------- */
requests.length = 0;
await send("Page.navigate", { url: `${ORIGIN}/` });
const repeat = await pollUntil(async () => {
  const m = await marks();
  return (m.tile && m.picture) ? m : null;
}, 60_000);
if (!repeat) bail("repeat launch: board never visible", { marks: await marks() });
const repeatBoard = Math.max(repeat.tile, repeat.picture);
// index.html stamps window.__pipSwReg when registration starts — the
// board-ready + idle hop takes a beat, so poll briefly (A1).
const swReg = await pollUntil(() => evalJs("window.__pipSwReg ?? null")
  .then((v) => (v == null || v?.__err) ? null : v), 15_000);
const language = repeat.language ?? (await pollUntil(async () =>
  (await marks()).language ?? null, 30_000)) ?? null;

/* ---- scenario 3: add a person ------------------------------------ */
// The settings "＋ Add a person" button — a programmatic click is the
// real path. prompt() is stubbed with a name for the drive (headless
// answers dialogs before our handler reliably only under Page.enable,
// and a null answer takes the Cancel path — no add at all).
requests.length = 0;
const preActive = await evalJs("sessionStorage.getItem('pip_active_user')");
const userCount = () => evalJs(`new Promise((res) => {
  const req = indexedDB.open("pip-users", 1);
  req.onsuccess = () => {
    const r = req.result.transaction("kv", "readonly").objectStore("kv").getAllKeys();
    r.onsuccess = () => res(r.result.filter((k) => String(k).startsWith("user/")).length);
    r.onerror = () => res(-1);
  };
  req.onerror = () => res(-2);
})`).then((v) => (v && typeof v === "object" && v.__err) ? -3 : v);
const addClicked = await evalJs(`(() => {
  const b = document.getElementById("usr-add");
  if (!b) return false;
  b.click();
  return true;
})()`);
if (!addClicked) bail("#usr-add not found — the add-a-person drive broke");
// switchTo() reloads. The OLD document still carries full marks, so
// first wait for the navigation to commit — only then do marks belong
// to the added person's boot.
const navBefore = navCount;
const reloaded = await pollUntil(() => navCount > navBefore || null, 30_000);
if (!reloaded) bail("add a person: reload never happened",
  { marks: await marks(), pageErrors, navUrls,
    activeBefore: preActive,
    activeAfter: await evalJs("sessionStorage.getItem('pip_active_user')"),
    usersAfter: await userCount(),
    promptIs: await evalJs("String(window.prompt).slice(0, 80)"),
    bootErrs: await evalJs("window.__pipBoot?.errors ?? []") });
let sawWelcome = false;
const added = await pollUntil(async () => {
  const m = await marks();
  if (m.welcome !== undefined) sawWelcome = true;
  return (m.tile && m.picture && m.db) ? m : null;
}, 60_000);
if (!added) bail("add a person: new board never visible",
  { marks: await marks(), pageErrors });
if (added.tile === repeat.tile) bail("add a person: marks identical to repeat launch — the reload boot never re-marked",
  { marks: await marks(), pageErrors, navUrls, execCtxs });
const addBoard = Math.max(added.tile, added.picture);

/* ---- report ------------------------------------------------------ */
const firstMs = Math.round(Math.max(first.tile, first.picture, first.welcome));
const report = {
  origin: ORIGIN,
  throttle: "4x CPU, iPad landscape, fast Wi-Fi profile",
  firstVisitMs: firstMs,
  marks1: Object.fromEntries(Object.entries(first).map(([k, v]) => [k, Math.round(v)])),
  repeatLaunchMs: Math.round(repeatBoard),
  marks2: Object.fromEntries(Object.entries(repeat).map(([k, v]) => [k, Math.round(v)])),
  addPersonMs: Math.round(addBoard),
  marks3: Object.fromEntries(Object.entries(added).map(([k, v]) => [k, Math.round(v)])),
  addPersonWelcome: sawWelcome,
  requestsBeforePaint: reqsBeforePaint,
  requestsBeforeBoard: reqsBeforeBoard,
  audioRequestsBeforeBoard: audioBeforeBoard,
  swRegisteredAtMs: swReg == null ? null : Math.round(swReg),
  languageReadyAfterBoardMs: language != null ? Math.round(language - repeatBoard) : null,
  budgets: BUDGETS,
};

const checks = [
  ["first visit ≤ budget", firstMs <= BUDGETS.firstVisitMs],
  ["repeat launch ≤ budget", repeatBoard <= BUDGETS.repeatLaunchMs],
  ["add a person ≤ budget", addBoard <= BUDGETS.addPersonMs],
  ["requests before first paint ≤ budget", reqsBeforePaint <= BUDGETS.requestsBeforeBoard],
  ["no audio requested before the board", audioBeforeBoard === 0],
  ["no welcome for an added person", !sawWelcome],
  // index.html stamps window.__pipSwReg when registration starts; it must
  // follow the board DOM (tile mark) — the precache never competes with
  // the first boot fetches (041 A1).
  ["SW registered only after the board",
    swReg != null && swReg >= repeat.tile],
  ["language ready within budget of the board",
    language == null || (language - repeatBoard) <= BUDGETS.languageReadyAfterBoardMs],
];
report.checks = Object.fromEntries(checks.map(([k, v]) => [k, v ? "PASS" : "FAIL"]));
console.log(JSON.stringify(report, null, 2));

const failed = checks.filter(([, v]) => !v).map(([k]) => k);
chrome.kill();
if (failed.length) {
  console.log(`FAIL over budget: ${failed.join("; ")}`);
  process.exit(1);
}
console.log("PASS — all speed budgets met");
process.exit(0);
