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
await sleep(10000); // past the 8s boot-watchdog window, so a false positive shows

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
    // The iPad-Chrome bug is the layout viewport left scrolled after the
    // keyboard closes. Try to scroll; the clip must refuse it.
    scrollLocked: (() => {
      scrollTo(0, 300);
      const y = scrollY;
      scrollTo(0, 0);
      return y === 0;
    })(),
  };
})()`);

const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot.result?.data) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/pip-chrome-boot.png", Buffer.from(shot.result.data, "base64"));
}

console.log(JSON.stringify({ report, logs }, null, 2));
chrome.kill();
process.exit(0);
