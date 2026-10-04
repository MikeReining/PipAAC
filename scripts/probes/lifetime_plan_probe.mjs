/**
 * Pip Lifetime — one answer everywhere (founder 2026-10-04: the sidebar
 * said "Pip Lifetime ✓" while the page sold $49 with no Buy and Add a
 * device refused). Real Chrome against the running worker:
 *   1. Free: Add a device says free + Get Pip Lifetime; the page sells
 *      with a working Buy; the sidebar leads with Get Pip Lifetime.
 *   2. Mismatch: a valid license on the device, the relay still free.
 *      Opening Settings hands it to the relay — the page turns into
 *      "Luka has Pip Lifetime", the sidebar shows "Pip Lifetime ✓" under
 *      Luka, and Add a device shows a code (the relay enforces that).
 *   3. A bad license on the device is dropped — nothing claims Lifetime.
 *   PIP_ORIGIN=http://localhost:21090 node scripts/probes/lifetime_plan_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:21090";

const stubDialogs =
  `window.confirm=()=>true;window.prompt=()=>'';window.alert=()=>{};1`;

async function device(name, port, profile) {
  rmSync(profile, { recursive: true, force: true });
  const chrome = spawn("open", ["-na", "Google Chrome", "--args",
    "--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, "--no-first-run", "about:blank"]);
  await sleep(2500);
  let ws = null, mid = 0;
  const pending = new Map();
  const wire = (sock) => {
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
  };
  const send = (m, p = {}) => new Promise((res, rej) => {
    const id = ++mid; pending.set(id, res);
    // A dead-but-open ws (page reloaded under us) never responds —
    // reject so ensureLive can reconnect instead of hanging forever.
    setTimeout(() => {
      if (pending.delete(id)) rej(new Error(`${name}: send timeout`));
    }, 12000);
    try { ws.send(JSON.stringify({ id, method: m, params: p })); }
    catch (e) { pending.delete(id); rej(e); }
  });
  const connect = async () => {
    const page = (await (await fetch(`http://localhost:${port}/json`)).json())
      .find((t) => t.type === "page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    wire(ws);
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride",
      { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
  };
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails)
      throw new Error(`${name}: ${JSON.stringify(r.result.exceptionDetails)}`);
    return r.result?.result?.value;
  };
  await connect();
  const loadApp = async () => {
    await send("Page.navigate", { url: `${ORIGIN}/?unlicensed` });
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      if (await evalJs("typeof window.pip === 'object' && !!window.pip")
        .catch(() => false)) {
        await evalJs(stubDialogs);
        return;
      }
    }
    throw new Error(`${name}: app did not boot`);
  };
  const ensureLive = async () => {
    try { await evalJs("1"); } catch { await connect(); }
  };
  const until = async (expr, budgetMs = 15000) => {
    for (let t = 0; t < budgetMs; t += 400) {
      if (await evalJs(expr).catch(() => null)) return true;
      await sleep(400);
      await ensureLive();
    }
    return false;
  };
  // PIP_SHOTS=<dir> saves a PNG of each step for a human look.
  const shot = async (label) => {
    if (!process.env.PIP_SHOTS) return;
    const { result } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(process.env.PIP_SHOTS, `${name}-${label}.png`), Buffer.from(result.data, "base64"));
  };
  return { name, chrome, evalJs, loadApp, ensureLive, until, shot };
}


const out = {};
const openSettings = (d) => d.evalJs(`(() => {
  document.querySelector('#menu')?.classList.remove('open');
  document.querySelector('#corner').click();
  return 1;
})()`);
const lifePage = `(() => {
  const sec = document.querySelector('section[data-sec="lifetime"]');
  const nav = [...document.querySelectorAll('#set-nav > *')];
  const btn = nav.find((n) => n.dataset?.sec === 'lifetime');
  let grp = null;
  for (const n of nav) { if (n.classList.contains('set-grp')) grp = n.textContent; if (n === btn) break; }
  return {
    owned: !document.querySelector('#life-owned').hidden,
    ownedTitle: document.querySelector('#life-owned h2').textContent.trim(),
    salesShown: [...sec.querySelectorAll('.life-sale')].filter((e) => !e.hidden).length,
    buyShown: !document.querySelector('#life-buy').closest('[hidden]'),
    navTitle: btn?.querySelector('.set-navtext')?.firstChild?.textContent ?? null,
    navGroup: grp,
    navFirst: nav.find((n) => n.dataset?.sec)?.dataset.sec,
    plan: document.querySelector('#dev-plan').textContent,
  };
})()`;
const storedLicense = (d) => d.evalJs(`(async () => {
  const m = await import('/shared/sync_crypto.mjs');
  return (await m.openKeyStore().get('user/' + window.pip.user.id + '/license')) ?? null;
})()`);
const putLicense = (d, lic) => d.evalJs(`(async () => {
  const m = await import('/shared/sync_crypto.mjs');
  await m.openKeyStore().put('user/' + window.pip.user.id + '/license', ${JSON.stringify(lic)});
  return 1;
})()`);

async function freshLuka(d) {
  await d.loadApp();
  await d.evalJs(`(async () => {
    document.querySelector('.welcome')?.remove();
    window.pip.user.needsSetup = false;
    window.pip.user.name = 'Luka';
    return 1;
  })()`);
  await openSettings(d);
  await d.evalJs(`document.querySelector('#dev-add').click(), 1`);
  return d.until(`!!window.pip.user.sync?.userId`);
}

// 1 — free.
const A = await device("ipad", 9285, "/tmp/pip-plan-a-probe");
out.aSynced = await freshLuka(A);
out.freeSheet = await A.until(`document.querySelector('#pair-body')?.textContent.includes('Free Pip is on one device')`);
out.freeButton = await A.evalJs(`[...document.querySelectorAll('#pair-body button')].map((b) => b.textContent).join('|')`);
await A.evalJs(`document.querySelector('#pairform [data-close]').click(), 1`);
await A.until(`document.querySelector('#dev-plan').textContent.length > 0`);
out.free = await A.evalJs(lifePage);
await A.shot("free");

// 2 — a valid license on the device, the relay still free.
const lic = await A.evalJs(`(async () => (await (await fetch('/api/v1/voice/dev-license', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ user_id: window.pip.user.id }) })).json()).license)()`);
await putLicense(A, lic);
await openSettings(A);
out.healed = await A.until(`!document.querySelector('#life-owned').hidden`, 20000);
out.owned = await A.evalJs(lifePage);
await A.evalJs(`document.querySelector('[data-sec="lifetime"]') && document.querySelector('#set-nav [data-sec="lifetime"]').click(), 1`);
await A.shot("owned");
await A.evalJs(`document.querySelector('#dev-add').click(), 1`);
out.codeAfterHeal = await A.until(`!!document.querySelector('#pair-body .pair-code')`);
await A.evalJs(`document.querySelector('#pairform [data-close]').click(), 1`);

// 3 — a bad license on the device is dropped.
const C = await device("phone", 9286, "/tmp/pip-plan-c-probe");
await freshLuka(C);
await C.evalJs(`document.querySelector('#pairform [data-close]').click(), 1`);
await putLicense(C, "pip-life-bogus");
await openSettings(C);
out.badDropped = await C.until(`(async () => {
  const m = await import('/shared/sync_crypto.mjs');
  return !(await m.openKeyStore().get('user/' + window.pip.user.id + '/license'));
})()`, 20000);
out.bad = await C.evalJs(lifePage);
await C.evalJs(`document.querySelector('#set-nav [data-sec="lifetime"]').click(), 1`);
await C.shot("forsale");

console.log(JSON.stringify(out, null, 2));
const ok = out.aSynced && out.freeSheet && out.freeButton.includes("Get Pip Lifetime")
  && !out.free.owned && out.free.buyShown && out.free.salesShown > 3 && out.free.navFirst === "lifetime"
  && out.free.navTitle === "Get Pip Lifetime" && out.free.plan.startsWith("Free")
  && out.healed && out.owned.owned && out.owned.salesShown === 0 && !out.owned.buyShown
  && out.owned.ownedTitle === "Luka has Pip Lifetime"
  && out.owned.navTitle === "Pip Lifetime ✓" && out.owned.navGroup === "Luka"
  && out.owned.plan.startsWith("Pip Lifetime") && out.codeAfterHeal
  && out.badDropped && !out.bad.owned && out.bad.buyShown && out.bad.navTitle === "Get Pip Lifetime";
console.log(ok ? "PASS one Lifetime answer on every screen" : "FAIL — see output");
for (const d of [A, C]) d.chrome.kill();
process.exit(ok ? 0 : 1);
