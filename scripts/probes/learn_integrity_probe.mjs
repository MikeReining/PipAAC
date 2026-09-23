/**
 * 017 step 4 live proof — a keyboard sentence must not corrupt learned
 * weights. Through the real board.js path: two picture-mode sentences
 * spoken, one keyboard sentence spoken (⌨ anchor, letter keys, space to
 * commit), one more picture-mode sentence. Assert every stored weight
 * is finite, none_bias stays within 1.0 of the shipped value, and the
 * keyboard sentence changed nothing — the old bug wrote NaN (→ null)
 * into every weight because keyboard impressions carried x:{}.
 *   PIP_ORIGIN=http://localhost:8794 node scripts/probes/learn_integrity_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9267, ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:8794";
const DIR = "/tmp/pip-learn-integrity-probe";
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

const weights = () => evalJs(
  `window.pip.db.prepare("SELECT weight_set, weights, examples_seen FROM prediction_weights").all()`);
const impressions = () => evalJs(
  `window.pip.db.prepare("SELECT mode, jev_status, chosen_source FROM strip_impression").all()`);

/* Tap two grid cells, then Speak — a pick is needed after each
 * impression to label it, so one-word sentences train nothing. */
const pictureSentence = async (n) => {
  const tapped = await evalJs(`(async () => {
    const cells = [...document.querySelectorAll('#grid .cell')]
      .filter((c) => !c.disabled && !c.classList.contains('empty')
        && !c.classList.contains('anchor-cell'));
    const first = cells[${n} % cells.length];
    if (!first) return null;
    first.click();
    await new Promise((r) => setTimeout(r, 300));
    cells[(${n} + 1) % cells.length].click();
    await new Promise((r) => setTimeout(r, 300));
    document.querySelector('#speak').click();
    return first.textContent;
  })()`);
  if (!tapped) throw new Error("no tappable grid cell found");
  await sleep(1200);
};

/* Open the keyboard, type letters, commit with space — a keyboard
 * sentence through the real kbPress/commitKbItem path. */
const keyboardSentence = async () => {
  await evalJs(`(async () => {
    document.querySelector('#anchor-kb').click();
    await new Promise((r) => setTimeout(r, 400));
    const keys = [...document.querySelectorAll('#kb .kb-key:not(.kb-util)')];
    const space = () => [...document.querySelectorAll('#kb .kb-key')]
      .find((k) => k.querySelector('.sub')?.textContent === 'space')?.click();
    const word = async (w) => {
      for (const ch of w) {
        keys.find((k) => k.textContent.trim() === ch)?.click();
        await new Promise((r) => setTimeout(r, 150));
      }
      space();
      await new Promise((r) => setTimeout(r, 300));
    };
    await word('go');
    await word('to');
    document.querySelector('#speak').click();
    await new Promise((r) => setTimeout(r, 300));
    document.querySelector('#anchor-kb').click(); // back to picture mode
    return 1;
  })()`);
  await sleep(1200);
};

const out = {};
await pictureSentence(3);
out.afterPic1 = await weights();
await pictureSentence(7);
const beforeKb = await weights();
await keyboardSentence();
out.kbImpressions = (await impressions()).filter((i) => i.mode === "keyboard");
const afterKb = await weights();
out.kbDelta = JSON.stringify(beforeKb) !== JSON.stringify(afterKb);
await pictureSentence(11);
out.afterPic3 = await weights();

console.log(JSON.stringify(out, null, 2));
const rows = out.afterPic3;
const shipped = await evalJs(`window.pip.catalog.prediction.weights.local_only`);
const finite = rows.every((r) =>
  Object.values(JSON.parse(r.weights)).every((v) => Number.isFinite(v)));
const noneBias = JSON.parse(rows.find((r) => r.weight_set === "local_only").weights).none_bias;
const ok =
  rows.length >= 1 && finite &&
  Math.abs(noneBias - shipped.none_bias) <= 1.0 &&
  out.kbImpressions.length > 0 &&
  out.kbDelta === false;
console.log(ok
  ? "PASS keyboard sentence logged as metrics only — weights finite, unchanged by it"
  : "FAIL — see output");
process.exit(ok ? 0 : 1);
