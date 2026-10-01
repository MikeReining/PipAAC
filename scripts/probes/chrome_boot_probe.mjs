#!/usr/bin/env node
/**
 * Boot probe: load the app in headless Chrome at iPad landscape metrics,
 * capture console errors / unhandled rejections / a screenshot, and dump
 * the topbar's geometry + computed styles. Run against an agent copy:
 *   node scripts/probes/chrome_boot_probe.mjs [origin]
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const ORIGIN = process.argv[2] ?? "http://localhost:21088";
const PORT = 9265;
rmSync("/tmp/pip-chrome-boot", { recursive: true, force: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-chrome-boot", "--no-first-run", "about:blank"],
  { stdio: "ignore" });
let page = null;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500);
  page = (await (await fetch(`http://localhost:${PORT}/json`)
    .catch(() => null))?.json().catch(() => null) ?? [])
    .find((t) => t.type === "page");
}
if (!page) { chrome.kill(); throw new Error("chrome CDP never came up"); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let mid = 0; const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (m, p = {}) => new Promise((res) => {
  const id = ++mid; pending.set(id, res);
  ws.send(JSON.stringify({ id, method: m, params: p }));
});
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate",
    { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails };
  return r.result?.result?.value;
};

const logs = [];
await send("Runtime.enable");
await send("Log.enable");
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type))
    logs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
  if (m.method === "Runtime.exceptionThrown")
    logs.push(`EXCEPTION: ${JSON.stringify(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails).slice(0, 800)}`);
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
    logs.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`);
});

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: `${ORIGIN}/?reseed` });

const until = async (expr, ms = 8000) => {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    last = await evalJs(expr);
    if (last && !last.__err) return last;
    await sleep(200);
  }
  return last;
};

// Fresh profile: name → Continue is the path that hides the sentence bar
// on iPad Chrome. Walk it, then measure the bar in the real viewport.
await until(`!!document.querySelector("#welcome-name") || !!window.pip?.db`);
const stepped = await evalJs(`(() => {
  const name = document.querySelector("#welcome-name");
  if (!name) return { skipped: true };
  name.value = "Ada";
  document.querySelector('.welcome-choice[data-v="child"]').click();
  document.querySelector(".welcome-go").click();
  return { skipped: false };
})()`);
if (stepped?.__err) throw new Error(JSON.stringify(stepped));
await until(`!document.querySelector(".welcome") && document.body.classList.contains("touring")`);
await sleep(400); // tour ring is placed on an interval

const report = await evalJs(`(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { rect: [b.x|0, b.y|0, b.width|0, b.height|0],
      display: cs.display, bg: cs.backgroundColor, color: cs.color,
      visibility: cs.visibility, opacity: cs.opacity }; };
  const cover = (() => {
    const t = document.querySelector("#topbar"); if (!t) return null;
    const b = t.getBoundingClientRect();
    const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return el ? { tag: el.tagName, id: el.id, cls: el.className } : null;
  })();
  const stray = [...document.querySelectorAll(".cell, .pred, .chip")]
    .filter((el) => { const b = el.getBoundingClientRect();
      const g = document.querySelector("#grid").getBoundingClientRect();
      const s = document.querySelector("#strip").getBoundingClientRect();
      return b.width > 0 && b.top < g.top && b.bottom > s.bottom; })
    .map((el) => ({ cls: el.className, id: el.id, rect: (() => { const b = el.getBoundingClientRect(); return [b.x|0,b.y|0,b.width|0,b.height|0]; })() }));
  return {
    ua: navigator.userAgent,
    topbar: r(document.querySelector("#topbar")),
    bar: r(document.querySelector("#bar")),
    strip: r(document.querySelector("#strip")),
    grid: r(document.querySelector("#grid")),
    cover, stray,
    bodyH: document.body.getBoundingClientRect().height,
    innerH: innerHeight,
    welcome: !!document.querySelector(".welcome"),
    touring: document.body.classList.contains("touring"),
    pipReady: !!window.pip?.db,
    bootFail: !!document.querySelector("#boot-fail"),
    // The document must refuse a scroll. The iPad bug is not this number —
    // it is a visual-viewport pan with scrollY still 0 — but a scrollable
    // document is how that pan gets stuck.
    scrollLocked: (() => {
      scrollTo(0, 300);
      const y = scrollY;
      scrollTo(0, 0);
      return y === 0;
    })(),
    // Moving #app moves the sentence bar by the same amount. A resize
    // then re-pins #app to the real visual viewport (offset 0 here).
    shift: (() => {
      const app = document.getElementById("app");
      const bar = document.querySelector("#topbar");
      const before = bar.getBoundingClientRect().top;
      app.style.top = "72px";
      const moved = bar.getBoundingClientRect().top;
      window.visualViewport.dispatchEvent(new Event("resize"));
      const restored = bar.getBoundingClientRect().top;
      return { before: before | 0, moved: moved | 0, restored: restored | 0,
        delta: (moved - before) | 0 };
    })(),
    ring: (() => {
      const want = [...document.querySelectorAll("#grid .cell")].find((el) =>
        el.querySelector(".tlabel")?.textContent?.trim().toLowerCase() === "want");
      const ring = document.querySelector(".tour-ring");
      if (!want || !ring) return { want: !!want, ring: !!ring };
      const w = want.getBoundingClientRect();
      const g = ring.getBoundingClientRect();
      const overlap = g.left < w.right && g.right > w.left && g.top < w.bottom && g.bottom > w.top;
      return { overlap, want: [w.x|0, w.y|0, w.width|0, w.height|0],
        ring: [g.x|0, g.y|0, g.width|0, g.height|0] };
    })(),
  };
})()`);

if (stepped?.skipped) {
  console.log(JSON.stringify({ report, logs, stepped }, null, 2));
  chrome.kill();
  throw new Error("welcome never appeared — the name-then-Continue path was not measured");
}
const top = report?.topbar?.rect;
const barOnScreen = top && top[1] >= 0 && top[1] < 80 && top[3] > 40;
const shiftOk = report?.shift && report.shift.delta >= 60 && report.shift.delta <= 84
  && Math.abs(report.shift.restored - report.shift.before) <= 2;
if (!barOnScreen || !shiftOk || report?.ring?.overlap !== true || report?.welcome || !report?.touring) {
  console.log(JSON.stringify({ report, logs, stepped, barOnScreen, shiftOk }, null, 2));
  chrome.kill();
  throw new Error("sentence bar or tour ring failed the welcome-path check");
}

const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot.result?.data) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/pip-chrome-boot.png", Buffer.from(shot.result.data, "base64"));
}

console.log(JSON.stringify({ report, logs }, null, 2));
chrome.kill();
process.exit(0);
