/**
 * 014 slice 9 live proof — the child's person leads the empty Smart bar.
 * Core 15's bar holds two cards, so the old order (hello · Food · person
 * · help) never showed the person there. Now: person · hello · Food ·
 * help, and a narrow bar keeps the front. Measured on the rendered tray.
 *   PIP_ORIGIN=http://localhost:8794 node scripts/probes/idle_person_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9266, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:8794";
const DIR = "/tmp/pip-idle-person-probe";
rmSync(DIR, { recursive: true, force: true });
spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${DIR}`, "--no-first-run", "about:blank"]);
await sleep(2500);

const page = (await (await fetch(`http://localhost:${PORT}/json`)).json())
  .find((t) => t.type === "page");
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
  const r = await send("Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
const loadApp = async () => {
  await send("Page.navigate", { url: ORIGIN });
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if (await evalJs("typeof window.pip === 'object' && !!window.pip")
      .catch(() => false)) return;
  }
  throw new Error("app did not boot");
};
const tray = () => evalJs(`[...document.querySelectorAll('#tray .pred')]
  .map((c) => (c.querySelector('.plabel')?.textContent || '').trim())`);
const setLayout = async (layout) => {
  await evalJs(`(() => {
    window.pip.db.exec(
      "UPDATE learner_profile SET board_layout = '${layout}' WHERE id = 'prf_local'");
    window.pip.repaint();
  })()`);
  await sleep(500);
};

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
await loadApp();

const out = {};
await setLayout("grid15");
out.core15Before = await tray();

await evalJs(`(async () => {
  const g = await import('/shared/groups.mjs');
  g.createEntity(window.pip.db, { name: 'Mama' });
  window.pip.repaint();
  return 1;
})()`);
await sleep(500);
out.core15After = await tray();

await setLayout("grid60");
out.grid60 = await tray();

await setLayout("grid15");
await loadApp();
out.core15Reload = await tray();

const checks = {
  core15NoPersonYet: !out.core15Before.includes("Mama"),
  core15PersonFirst: out.core15After[0] === "Mama" && out.core15After.length === 2,
  grid60AllFourInOrder: JSON.stringify(out.grid60.map((w) => w.toLowerCase()))
    === JSON.stringify(["mama", "hello", "food", "help"]),
  survivesReload: out.core15Reload[0] === "Mama",
};
console.log(JSON.stringify({ out, checks }, null, 2));
ws.close();
spawn("pkill", ["-f", DIR]);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
