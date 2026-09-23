/**
 * 017 steps 3 + 5 live proof — both learning paths train on the right
 * evidence, and a stored moment replays exactly. Jev is stubbed at the
 * network boundary (window.fetch on /jev/rank): it answers in time for
 * some strip moments and late for others. Three spoken sentences.
 * Asserts: both weight rows exist; with_jev.examples_seen equals the
 * number of labeled picture moments with a stored Jev answer (late
 * counts); local_only never trains the jev feature; every stored
 * moment's shown_final matches a fresh replayImpression.
 *   PIP_ORIGIN=http://localhost:8795 node scripts/probes/learn_paths_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9268, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:8795";
const DIR = "/tmp/pip-learn-paths-probe";
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

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
await loadApp();

/* Stub /jev/rank at the fetch boundary: odd calls answer ~instantly,
 * even calls take 400 ms (past the 150 ms paint window). Probabilities
 * are shaped to the request's own criteria count. */
await evalJs(`(() => {
  let n = 0;
  const orig = window.fetch;
  window.fetch = (url, init) => {
    if (!String(url).includes('/jev/rank')) return orig(url, init);
    n++;
    const body = JSON.parse(init.body);
    const nc = Object.keys(body.questions.next_word.criteria)
      .filter((k) => k !== 'none').length;
    const probabilities = { none: 0.05 };
    for (let i = 1; i <= nc; i++) {
      probabilities['c' + i] = i === 1 ? 0.7 : 0.25 / Math.max(1, nc - 1);
    }
    const slow = n % 2 === 0;
    return new Promise((res) => setTimeout(() => res(new Response(
      JSON.stringify({ model: 'jev-stub', answers: { next_word: { probabilities } } }),
      { status: 200, headers: { 'content-type': 'application/json' } })),
      slow ? 400 : 10));
  };
  window.__jevCalls = () => n;
  return 1;
})()`);

/* An entity gives the strip an eligible candidate from pick two on
 * (a verb tail invites noun-ish candidates); the repeated "i want"
 * sentences give 'want' frequency so position-1 moments have a
 * shortlist — without evidence the strip is empty and Jev skips. */
await evalJs(`(async () => {
  const g = await import('/shared/groups.mjs');
  g.createEntity(window.pip.db, { name: 'Mama' });
  window.pip.repaint();
  return 1;
})()`);
await sleep(500);

const tapWord = async (label) => evalJs(`(async () => {
  const el = [...document.querySelectorAll('#grid .cell')]
    .find((c) => !c.disabled && !c.classList.contains('empty')
      && !c.classList.contains('anchor-cell')
      && c.textContent.trim().toLowerCase() === ${JSON.stringify(label)});
  if (!el) return null;
  el.click();
  return el.textContent.trim();
})()`);

const say = async (words) => {
  for (const w of words) {
    const t = await tapWord(w);
    if (!t) throw new Error(`no cell for "${w}"`);
    await sleep(650);
  }
  await evalJs(`document.querySelector('#speak').click()`);
  await sleep(1400);
};

const out = {};
await say(["i", "want", "more"]); // builds evidence: 'want' gets freq
await say(["i", "want", "more"]); // jev moments at positions 1 and 2
await say(["i", "want", "more"]);

out.weights = await evalJs(
  `window.pip.db.prepare("SELECT weight_set, weights, examples_seen FROM prediction_weights").all()`);
out.impressions = await evalJs(
  `window.pip.db.prepare("SELECT mode, jev_status, jev_probs IS NOT NULL AS has_probs, shown_final IS NOT NULL AS has_final, chosen_id IS NOT NULL AS labeled FROM strip_impression").all()`);
out.jevCalls = await evalJs(`window.__jevCalls()`);
out.replay = await evalJs(`(async () => {
  const f = await import('/shared/funnel.mjs');
  const rows = window.pip.db.prepare("SELECT * FROM strip_impression").all();
  return rows.map((r) => {
    const rep = f.replayImpression(r);
    return { id: r.id, ok: rep.ok, diffs: rep.diffs.slice(0, 3) };
  });
})()`);

console.log(JSON.stringify(out, null, 2));
const local = out.weights.find((r) => r.weight_set === "local_only");
const wj = out.weights.find((r) => r.weight_set === "with_jev");
const shipped = await evalJs(`window.pip.catalog.prediction.weights.local_only`);
const expectJevSeen = out.impressions.filter(
  (i) => i.has_probs && i.labeled && i.mode === "picture").length;
const ok =
  local && wj &&
  wj.examples_seen === expectJevSeen && expectJevSeen > 0 &&
  JSON.parse(local.weights).jev === shipped.jev &&
  Object.values(JSON.parse(local.weights)).every(Number.isFinite) &&
  Object.values(JSON.parse(wj.weights)).every(Number.isFinite) &&
  out.impressions.every((i) => i.has_final || !i.labeled) &&
  out.replay.every((r) => r.ok);
console.log(`local ${local?.examples_seen} ex | with_jev ${wj?.examples_seen} ex ` +
  `(expected ${expectJevSeen}) | jev calls ${out.jevCalls}`);
console.log(ok
  ? "PASS both paths train separately; every stored moment replays"
  : "FAIL — see output");
process.exit(ok ? 0 : 1);
