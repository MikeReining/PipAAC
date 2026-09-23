/**
 * 013 slice 5 live proof — the Smart bar lifts a running session's
 * target words in Predict, never taking over (§ 4). Driven through the
 * real board: tap a word, read the rendered tray's labels — the DOM is
 * the instrument, not the module's own report.
 *   PIP_ORIGIN=http://localhost:8795 node scripts/probes/spot_boost_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9264, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:8794";
const TARGETS = ["water", "milk", "juice", "tea"];
rmSync("/tmp/pip-spotboost-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-spotboost-probe", "--no-first-run", "about:blank"]);
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

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: ORIGIN });
for (let i = 0; i < 40; i++) {
  await sleep(500);
  if (await evalJs("typeof window.pip === 'object' && !!window.pip")
    .catch(() => false)) break;
  if (i === 39) throw new Error("app did not boot");
}

const out = {};

// The strip's rendered tiles — labels only, ghost slots excluded.
const stripLabels = `[...document.querySelectorAll('#tray .pred:not(.ghost) .plabel')]
  .map((n) => n.textContent.trim().toLowerCase())`;

// Clean slate, then tap "want" on the board — a real pick through the UI.
out.tap = await evalJs(`(async () => {
  window.pip.db.exec("DELETE FROM spotlight_item; DELETE FROM spotlight_list; DELETE FROM spotlight_session;");
  const cell = [...document.querySelectorAll('#grid .cell')]
    .find((c) => (c.textContent || '').trim().toLowerCase() === 'want');
  cell?.click();
  await new Promise((r) => setTimeout(r, 600));
  return { sentence: window.pip.sentence.map((i) => i.id), strip: ${stripLabels} };
})()`);

// Baseline: zero-evidence targets are not in the Predict bar.
out.baseline = { targetsInStrip: out.tap.strip.filter((l) => TARGETS.includes(l)) };

// Start a session on four fringe words — all never picked (zero evidence).
out.session = await evalJs(`(async () => {
  const ids = ${JSON.stringify(TARGETS)}.map((w) =>
    window.pip.db.prepare(
      "SELECT sense_id AS id FROM label WHERE text = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'"
    ).all(w)[0].id);
  window.pip.spotlight.startSession({ name: "Drinks", targets: ids.map((i) => "sense:" + i), minutes: 15 });
  window.pip.repaint();
  await new Promise((r) => setTimeout(r, 600));
  return { strip: ${stripLabels}, session: !!window.pip.spotlight.session };
})()`);
const targetHits = out.session.strip.filter((l) => TARGETS.includes(l));
out.boost = { targetsInStrip: targetHits, strip: out.session.strip };

// Setting off: the strip ignores the session entirely.
out.off = await evalJs(`(async () => {
  window.pip.db.exec("UPDATE learner_profile SET spot_boost = 0 WHERE id = 'prf_local'");
  window.pip.repaint();
  await new Promise((r) => setTimeout(r, 600));
  return { strip: ${stripLabels} };
})()`);
out.off.targetsInStrip = out.off.strip.filter((l) => TARGETS.includes(l));

// Back on — targets return.
out.on = await evalJs(`(async () => {
  window.pip.db.exec("UPDATE learner_profile SET spot_boost = 1 WHERE id = 'prf_local'");
  window.pip.repaint();
  await new Promise((r) => setTimeout(r, 600));
  return { strip: ${stripLabels} };
})()`);
out.on.targetsInStrip = out.on.strip.filter((l) => TARGETS.includes(l));

// End the session — the bar returns to baseline.
out.ended = await evalJs(`(async () => {
  window.pip.spotlight.endSession();
  window.pip.repaint();
  await new Promise((r) => setTimeout(r, 600));
  return { strip: ${stripLabels}, cells: window.pip.db.prepare("SELECT COUNT(*) AS n FROM core_cell").all()[0].n };
})()`);
out.ended.targetsInStrip = out.ended.strip.filter((l) => TARGETS.includes(l));

console.log(JSON.stringify(out, null, 2));
const ok =
  out.tap.sentence.length === 1 &&
  out.baseline.targetsInStrip.length === 0 &&
  out.session.session &&
  out.boost.targetsInStrip.length >= 1 &&
  out.boost.targetsInStrip.length <= 2 &&
  out.off.targetsInStrip.length === 0 &&
  out.on.targetsInStrip.length >= 1 && out.on.targetsInStrip.length <= 2 &&
  out.ended.targetsInStrip.length === 0;
console.log(ok ? "PASS smart bar boost lifts targets, never takes over" : "FAIL — see output");
chrome.kill();
