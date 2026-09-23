/**
 * 014 slice 3 live proof — an adult drags a core word. Real pointer
 *  events through editPointer in Edit mode: stop drags onto want, the
 *  cells swap, the change survives a reload, and the catalog row is
 *  untouched (the override is profile data).
 *   node scripts/probes/core_move_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9262, ORIGIN = "http://localhost:8794";
rmSync("/tmp/pip-move-probe", { recursive: true, force: true });
const chrome = spawn("open", ["-na", "Google Chrome", "--args",
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/pip-move-probe", "--no-first-run", "about:blank"]);
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

const out = {};
const gridWords = `[...document.querySelectorAll('#grid .cell')]
  .map((c) => (c.textContent || '').trim())`;

// Enter Edit mode and return to the board (adult editing the home grid).
out.editPath = await evalJs(`(() => {
  document.querySelector('#corner').click();
  document.querySelector('#edit-groups').click();
  [...document.querySelectorAll('#groupgrid .gcell')]
    .find((c) => (c.textContent || '').includes('Board'))?.click();
  return {
    editing: document.body.classList.contains('editing'),
    boardVisible: !document.querySelector('#grid').closest('[hidden]'),
  };
})()`);
await sleep(300);

// Drag `stop` onto `want` with real pointer events.
const rects = await evalJs(`(() => {
  const at = (w) => [...document.querySelectorAll('#grid .cell')]
    .findIndex((c) => (c.textContent || '').trim().toLowerCase() === w);
  const center = (i) => {
    const r = document.querySelectorAll('#grid .cell')[i].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  return { from: center(at('stop')), to: center(at('want')) };
})()`);
await send("Input.dispatchMouseEvent",
  { type: "mousePressed", x: rects.from.x, y: rects.from.y, button: "left", clickCount: 1 });
for (let i = 1; i <= 8; i++) {
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: rects.from.x + ((rects.to.x - rects.from.x) * i) / 8,
    y: rects.from.y + ((rects.to.y - rects.from.y) * i) / 8,
    button: "left",
  });
  await sleep(30);
}
await send("Input.dispatchMouseEvent",
  { type: "mouseReleased", x: rects.to.x, y: rects.to.y, button: "left", clickCount: 1 });
await sleep(400);

out.afterDrag = await evalJs(`(() => {
  const words = ${gridWords};
  return {
    slot0: words[0], slot1: words[1], slot29: words[29],
    overrides: window.pip.db.prepare("SELECT * FROM core_override").all(),
    catalogStop: window.pip.db.prepare(
      "SELECT slot_index FROM core_cell WHERE layout='grid60' AND sense_id=(SELECT sense_id FROM label WHERE text='stop' AND kind='lemma' AND locale='en' AND status='approved')"
    ).all()[0]?.slot_index,
  };
})()`);

// Restart — the adult's placement persists.
await loadApp();
out.afterReload = await evalJs(`(() => {
  const words = ${gridWords};
  return { slot0: words[0], slot1: words[1], slot29: words[29] };
})()`);

console.log(JSON.stringify(out, null, 2));
// grid60: want is slot 2, stop is slot 29 — after the swap they trade.
const ok =
  out.editPath.editing &&
  out.afterDrag.slot29 === "want" && out.afterDrag.slot0 === "I" &&
  out.afterDrag.overrides.length === 2 &&
  out.afterDrag.catalogStop === 29 &&
  out.afterReload.slot29 === "want" &&
  await evalJs(`(() => {
    const w = ${gridWords};
    return w[2] === 'stop';
  })()`);
console.log(ok ? "PASS adult move on the core board" : "FAIL — see output");
chrome.kill();
process.exit(ok ? 0 : 1);
