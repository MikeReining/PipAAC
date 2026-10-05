import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const ORIGIN = "https://app.pipaac.org";
const PORT = 9290;
const PROFILE = `/tmp/pip-dbgprod-${process.pid}`;
rmSync(PROFILE, { recursive: true, force: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
let page = null;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500);
  page = (await (await fetch(`http://localhost:${PORT}/json`).catch(() => null))?.json().catch(() => null) ?? [])
    .find((t) => t.type === "page");
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let mid = 0; const pending = new Map(); const errors = []; const failed = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    errors.push(m.params.exceptionDetails.exception?.description?.slice(0,400) ?? m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errors.push("console: " + m.params.args.map(a=>a.value??a.description??"").join(" ").slice(0,300));
  if (m.method === "Network.loadingFailed")
    failed.push(m.params.errorText + " req=" + m.params.requestId);
  if (m.method === "Network.responseReceived" && m.params.response.status >= 400)
    failed.push(m.params.response.status + " " + m.params.response.url.slice(-80));
};
const send = (m, p = {}) => new Promise((res) => {
  const id = ++mid; pending.set(id, res);
  ws.send(JSON.stringify({ id, method: m, params: p }));
});
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
await send("Page.navigate", { url: ORIGIN + "/" });
await sleep(12000);
const st = await evalJs(`JSON.stringify({
  pip: !!window.pip, db: !!window.pip?.db,
  tile: !!document.querySelector("#grid .cell"),
  welcome: !!document.querySelector("#welcome-name, .welcome"),
  bootErrs: window.__pipBoot?.errors ?? null,
  title: document.title,
  bodyLen: document.body?.innerHTML?.length ?? 0,
})`);
console.log("state:", st);
console.log("errors:", JSON.stringify(errors.slice(0,12), null, 1));
console.log("failed reqs:", JSON.stringify(failed.slice(0,15), null, 1));
chrome.kill(); process.exit(0);
