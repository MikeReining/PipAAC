/**
 * 013 slice 7 live proof — one attention layer renders every use (§ 2):
 * spotlight glow, live model, the 014 move mark, and the prediction
 * halo all paint through the same pass. The DOM is the instrument —
 * classes on rendered cells, not module state. Also proves the bug the
 * consolidation fixed: halos used to vanish on any grid repaint until
 * the next strip paint.
 *   PIP_ORIGIN=http://localhost:8795 node scripts/probes/layer_shared_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9265, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:8794";
rmSync("/tmp/pip-layer-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-layer-probe", "--no-first-run", "about:blank"]);
await sleep(2500);

let ws, mid = 0; const pending = new Map();
const wire = (s) => {
  s.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
};
const send = (m, p = {}) => new Promise((res, rej) => {
  const id = ++mid; pending.set(id, res);
  // A dead-but-open ws never responds — reject so evalJs can
  // reconnect instead of hanging forever.
  setTimeout(() => {
    if (pending.delete(id)) rej(new Error(`send timeout: ${m}`));
  }, 12000);
  try { ws.send(JSON.stringify({ id, method: m, params: p })); }
  catch (e) { pending.delete(id); rej(e); }
});
const connect = async () => {
  const page = (await (await fetch(`http://localhost:${PORT}/json`)).json())
    .find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  wire(ws);
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",
    { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
};
const evalOnce = async (expr) => {
  const r = await send("Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
const evalJs = async (expr) => {
  try { return await evalOnce(expr); }
  catch { await connect(); return evalOnce(expr); }
};

await connect();
await send("Page.navigate", { url: ORIGIN });
for (let i = 0; i < 40; i++) {
  await sleep(500);
  if (await evalJs("typeof window.pip === 'object' && !!window.pip")
    .catch(() => false)) break;
  if (i === 39) throw new Error("app did not boot");
}

const out = {};

// Tap "I" — a real pick through the UI so continuations have a tail.
// Seed consecutive-pick history first: continuations are capped at 4,
// so without bigrams the grammar invitation can fill the cap with
// fringe words and nothing halos (correct behavior — this seeds the
// signal a real child builds by talking).
out.tap = await evalJs(`(async () => {
  window.pip.db.exec("DELETE FROM spotlight_item; DELETE FROM spotlight_list; DELETE FROM spotlight_session; DELETE FROM move_mark; DELETE FROM learner_event_log;");
  const idOf = (w) => window.pip.db.prepare(
    "SELECT sense_id AS id FROM label WHERE normalized_text = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'"
  ).all(w)[0].id;
  const seq = ["want","want","want","go","go","eat"];
  let at = Date.now() - 60000;
  const ins = window.pip.db.prepare(
    "INSERT INTO learner_event_log (item_kind, item_id, selected_at) VALUES ('sense', ?, ?)");
  for (const w of seq) { ins.run(idOf("i"), at++); ins.run(idOf(w), at++); }
  const cell = [...document.querySelectorAll('#grid .cell')]
    .find((c) => (c.textContent || '').trim().toLowerCase() === 'i');
  cell?.click();
  await new Promise((r) => setTimeout(r, 500));
  return window.pip.sentence.map((i) => i.id);
})()`);

// "Highlight likely next words" ON through the real seg control — a
// pronoun invites verbs, so halos land on grid cells with no history.
out.hl = await evalJs(`(async () => {
  document.querySelector('#hl-next button[data-v="1"]').click();
  await new Promise((r) => setTimeout(r, 500));
  return {
    likely: document.querySelectorAll('#grid .cell.likely').length,
    labels: [...document.querySelectorAll('#grid .cell.likely .tlabel')]
      .map((n) => n.textContent.trim().toLowerCase()),
  };
})()`);

// The consolidation's fix: a full grid repaint must keep the halos —
// before, the DOM pass was the only place they were ever re-added.
out.repaint = await evalJs(`(async () => {
  window.pip.repaint();
  await new Promise((r) => setTimeout(r, 500));
  return {
    likely: document.querySelectorAll('#grid .cell.likely').length,
    labels: [...document.querySelectorAll('#grid .cell.likely .tlabel')]
      .map((n) => n.textContent.trim().toLowerCase()),
  };
})()`);

// 014's move mark: a moved word gets the layer's soft ring — and if it
// is also a likely word, both marks compose on the same cell.
out.moved = await evalJs(`(async () => {
  const sid = window.pip.db.prepare(
    "SELECT sense_id AS id FROM label WHERE text = 'want' AND kind = 'lemma' AND status = 'approved' AND locale = 'en'"
  ).all()[0].id;
  window.pip.db.prepare(
    "INSERT INTO move_mark (sense_id, until) VALUES (?, ?)"
  ).run(sid, Date.now() + 14 * 86400000);
  window.pip.repaint();
  await new Promise((r) => setTimeout(r, 500));
  return {
    moved: [...document.querySelectorAll('#grid .cell.moved .tlabel')]
      .map((n) => n.textContent.trim().toLowerCase()),
    likely: document.querySelectorAll('#grid .cell.likely').length,
  };
})()`);

// Spotlight session on "want" — the moved cell is also a target: the
// layer composes glow + moved on one cell, dims the rest, and every
// dimmed cell stays tappable (never a muzzle).
out.spot = await evalJs(`(async () => {
  const sid = window.pip.db.prepare(
    "SELECT sense_id AS id FROM label WHERE text = 'want' AND kind = 'lemma' AND status = 'approved' AND locale = 'en'"
  ).all()[0].id;
  window.pip.spotlight.startSession({ name: "Layer", targets: ["sense:" + sid] });
  await new Promise((r) => setTimeout(r, 500));
  const want = [...document.querySelectorAll('#grid .cell')]
    .find((c) => (c.textContent || '').trim().toLowerCase() === 'want');
  const dimmed = [...document.querySelectorAll('#grid .cell.dimmed')].slice(0, 5);
  return {
    classes: want ? [...want.classList] : [],
    dimmed: document.querySelectorAll('#grid .cell.dimmed').length,
    tappable: dimmed.every((c) => getComputedStyle(c).pointerEvents !== 'none'),
  };
})()`);

// End the session — spotlight marks clear; moved and likely survive.
out.end = await evalJs(`(async () => {
  window.pip.spotlight.endSession();
  await new Promise((r) => setTimeout(r, 500));
  return {
    glow: document.querySelectorAll('#grid .cell.glow').length,
    dimmed: document.querySelectorAll('#grid .cell.dimmed').length,
    moved: document.querySelectorAll('#grid .cell.moved').length,
    likely: document.querySelectorAll('#grid .cell.likely').length,
    cells: window.pip.db.prepare("SELECT COUNT(*) AS n FROM core_cell").all()[0].n,
  };
})()`);

console.log(JSON.stringify(out, null, 2));
const ok =
  out.tap.length === 1 &&
  out.hl.likely >= 1 && out.hl.likely <= 3 &&
  out.repaint.likely === out.hl.likely &&
  JSON.stringify(out.repaint.labels) === JSON.stringify(out.hl.labels) &&
  out.moved.moved.length === 1 && out.moved.moved[0] === "want" &&
  out.moved.likely === out.hl.likely &&
  out.spot.classes.includes("glow") && out.spot.classes.includes("moved") &&
  out.spot.dimmed > 0 && out.spot.tappable &&
  out.end.glow === 0 && out.end.dimmed === 0 &&
  out.end.moved === 1 && out.end.likely === out.hl.likely;
console.log(ok ? "PASS one attention layer renders every use" : "FAIL — see output");
chrome.kill();
