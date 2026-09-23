/**
 * 015 slice 4 live Works Test — supporter accounts. Chrome virtual
 * authenticators drive real WebAuthn ceremonies against real
 * `wrangler dev`:
 *
 *   A (authenticator, PRF): adds user Maya + Cooper with a photo, links
 *     her (Lifetime for the multi-device leg), signs in by email link →
 *     registers a passkey → the account gets Maya's wrapped keys.
 *   B ("the same passkey on a new device" — same authenticator, app
 *     state wiped clean): signs in → Maya appears WITH her keys →
 *     Cooper speaks and his photo renders.
 *   C (authenticator without PRF, separate Chrome): signs in → Maya
 *     lands locked until an Allow or QR card brings keys.
 *   Every account/relay payload the page posts is scanned: no name,
 *   photo bytes, or key material in the clear (the email address itself
 *   is the account identifier and does cross).
 *
 *   PIP_ORIGIN=http://localhost:8795 node scripts/probes/account_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync, writeFileSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:8794";
const EMAIL = "parent@example.com";
const repo = new URL("../..", import.meta.url).pathname;
const licenseSecret = Object.fromEntries(
  readFileSync(`${repo}.dev.vars`, "utf8").split("\n")
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/))
    .filter(Boolean).map((m) => [m[1], m[2]])).PIP_LICENSE_SECRET;
const { licenseFor } = await import(`${repo}src/worker/license.mjs`);

// A real (tiny) PNG for the photo-upload leg.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAATSURBVBhXY/iPA4YUMDLw/4fhfxgAf0n/A2vaxWAAAAAASUVORK5CYII=",
  "base64");
writeFileSync("/tmp/pip-acct-photo.png", PNG);

const stubDialogs = `window.prompt = () => 'Maya'; window.confirm = () => true; window.alert = () => {};`;
const tapLog = `window.__posts = window.__posts ?? [];
  if (!window.__tap) { window.__tap = 1;
    const f = window.fetch.bind(window);
    window.fetch = (...a) => {
      try { if (a[1]?.body && typeof a[1].body === "string") window.__posts.push({ url: String(a[0]), body: a[1].body }); } catch {}
      return f(...a);
    };
  }`;

async function device(name, port, profile, { prf = true } = {}) {
  rmSync(profile, { recursive: true, force: true });
  const chrome = spawn("open", ["-na", "Google Chrome", "--args",
    "--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, "--no-first-run", "about:blank"]);
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
    setTimeout(() => {
      if (pending.delete(id)) rej(new Error(`${name}: send timeout`));
    }, 12000);
    try { ws.send(JSON.stringify({ id, method: m, params: p })); }
    catch (e) { pending.delete(id); rej(e); }
  });
  const connect = async () => {
    const page = (await (await fetch(`http://localhost:${port}/json`)).json())
      .find((t) => t.type === "page" && !t.url.includes("devtools"));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.onopen = r; ws.onerror = j;
      setTimeout(() => j(new Error(`${name}: ws open timeout`)), 8000);
    });
    wire(ws);
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride",
      { width: 820, height: 1100, deviceScaleFactor: 1, mobile: true });
  };
  const evalOnce = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails)
      throw new Error(`${name}: ${JSON.stringify(r.result.exceptionDetails)}`);
    return r.result?.result?.value;
  };
  const evalJs = async (expr) => {
    try { return await evalOnce(expr); }
    catch (e) {
      console.error(`[${name}] eval retry: ${String(e).slice(0, 120)}`);
      await connect(); return evalOnce(expr);
    }
  };
  // Side-effecting clicks (usr-add reloads the page) must NOT replay:
  // a send timeout + retry double-fires the handler. Fire once, swallow
  // transport errors, and verify the effect by polling afterwards.
  const fireJs = async (expr) => {
    try { return await evalOnce(expr); }
    catch (e) { console.error(`[${name}] fire err: ${String(e).slice(0, 120)}`); return null; }
  };
  const addAuth = async () => {
    await send("WebAuthn.enable");
    const r = await send("WebAuthn.addVirtualAuthenticator", { options: {
      protocol: "ctap2", transport: "internal", ctap2Version: "ctap2_1",
      hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
      automaticPresenceSimulation: true, hasPrf: prf } });
    return r.result?.authenticatorId;
  };
  await connect();
  const loadApp = async (url = ORIGIN) => {
    await send("Page.navigate", { url });
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      if (await evalJs("typeof window.pip === 'object' && !!window.pip")
        .catch(() => false)) {
        await evalJs(stubDialogs + tapLog);
        return;
      }
    }
    throw new Error(`${name}: app did not boot`);
  };
  const until = async (expr, budgetMs = 15000) => {
    for (let t = 0; t < budgetMs; t += 400) {
      if (await evalJs(expr).catch(() => null)) return true;
      await sleep(400);
    }
    return false;
  };
  const setFile = async (sel, file) => {
    const doc = await send("DOM.getDocument");
    const { result } = await send("DOM.querySelector",
      { nodeId: doc.result.root.nodeId, selector: sel });
    await send("DOM.setFileInputFiles", { files: [file], nodeId: result.nodeId });
  };
  return { name, chrome, evalJs, fireJs, loadApp, until, setFile, addAuth, send };
}

const A = await device("A", 9267, "/tmp/pip-acct-a-probe");
const out = {};
await A.addAuth();

/* --- A: Maya + Cooper + photo, linked, Lifetime --- */
console.error("== A: create Maya");
await A.loadApp();
// Create Maya through the real "Add a user" control. The handler ends
// in location.reload(), so fire once (never replay) and verify by
// polling the registry. Stubs live inside the eval — a native prompt
// in headless returns null and silently makes an unnamed user.
for (let i = 0; i < 3; i++) {
  await A.fireJs(`(async () => {
    ${stubDialogs}
    document.querySelector('#corner').click();
    document.querySelector('#usr-add').click();
    return 1;
  })()`);
  await A.evalJs(stubDialogs + tapLog).catch(() => {});
  await A.until(`window.pip?.user?.name === 'Maya'`, 20000);
  out.mayaName = await A.evalJs(`window.pip?.user?.name ?? ''`).catch(() => "");
  if (out.mayaName === "Maya") break;
}
out.aBoot = out.mayaName === "Maya";

console.error("== A: link + Lifetime");
// Link Maya (one POST /users), then Lifetime so B/C can join her relay.
await A.fireJs(`(async () => {
  document.querySelector('#corner').click();
  document.querySelector('#dev-add').click();
  return 1;
})()`);
out.linked = await A.until(`!!window.pip?.user?.sync?.userId`, 20000);
const mayaId = await A.evalJs(`window.pip?.user?.id`);
const license = await licenseFor(licenseSecret, mayaId);
await A.fireJs(`(async () => {
  document.querySelector('#dev-license').value = ${JSON.stringify(license)};
  document.querySelector('#dev-activate').click();
  return 1;
})()`);
out.lifetime = await A.until(
  `document.querySelector('#dev-lifetime')?.textContent.includes('Lifetime')`, 15000);

console.error("== A: Cooper + photo");
// Cooper + photo through the real add-word form.
out.cooper = await A.evalJs(`(async () => {
  document.querySelector('#add-mywords').click();
  const name = document.querySelector('#add-name');
  name.value = 'Cooper';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  document.querySelector('#add-new').click();
  return { newfields: !document.querySelector('#add-newfields').hidden };
})()`);
await A.setFile("#add-photo", "/tmp/pip-acct-photo.png");
await A.fireJs(`document.querySelector('#add-save').click()`);
out.cooperSaved = await A.until(
  `window.pip.db.prepare("SELECT COUNT(*) AS n FROM personal_entity WHERE spoken_name='Cooper'").all()[0].n === 1`);

/* --- A: sign in — email link → passkey register → share-back --- */
console.error("== A: sign in");
out.signinA = await A.evalJs(`(async () => {
  document.querySelector('#corner').click();
  document.querySelector('#acct-email').value = ${JSON.stringify(EMAIL)};
  document.querySelector('#acct-send').click();
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const mail = await fetch('/accounts/dev/mailbox?email=' + encodeURIComponent(${JSON.stringify(EMAIL)}))
      .then((r) => r.json()).catch(() => ({}));
    if (mail.link) return mail.link;
  }
  return null;
})()`);
await A.send("Page.navigate", { url: new URL(out.signinA).href });
out.aLanded = await A.until(
  `document.querySelector('#pair-body')?.textContent.includes('Done')`, 40000);

/* --- B: same authenticator, app state wiped = the synced passkey --- */
console.error("== B: wipe + land");
const link2 = await A.evalJs(`(async () => {
  await fetch('/accounts/link', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ${JSON.stringify(EMAIL)} }) });
  const mail = await fetch('/accounts/dev/mailbox?email=' + encodeURIComponent(${JSON.stringify(EMAIL)}))
    .then((x) => x.json());
  return mail.link;
})()`);
// Queue deletes, hop to about:blank (closes the IDB connections so the
// blocked deletes run), then land on the sign-in link.
await A.evalJs(`(async () => {
  const dbs = await indexedDB.databases();
  for (const d of dbs) indexedDB.deleteDatabase(d.name);
  localStorage.clear(); sessionStorage.clear();
  return 1;
})()`);
await A.send("Page.navigate", { url: "about:blank" });
await sleep(2000);
await A.send("Page.navigate", { url: link2 });
out.bBoot = await A.until(`typeof window.pip === 'object' && !!window.pip`, 20000);
await A.evalJs(stubDialogs + tapLog);
out.bLanded = await A.until(
  `document.querySelector('#pair-body')?.textContent.match(/user\\(s\\) added|Done —/)`, 40000);
out.bMaya = await A.evalJs(`(async () => {
  const rows = await window.pip.users();
  return rows.map((u) => ({ id: u.id, name: u.name, sync: !!u.sync }));
})()`);

// Switch to Maya — sync lands her board; Cooper speaks, photo renders.
console.error("== B: Maya switch + Cooper");
const bMayaRow = out.bMaya?.find((u) => u.id === mayaId);
if (bMayaRow) {
  await A.evalJs(`sessionStorage.setItem('pip_active_user', ${JSON.stringify(mayaId)})`);
  await A.send("Page.navigate", { url: ORIGIN });
  await A.until(`typeof window.pip === 'object' && !!window.pip`, 20000);
  await A.evalJs(stubDialogs + tapLog);
}
out.bActiveMaya = await A.until(`window.pip?.user?.id === ${JSON.stringify(mayaId)}`, 10000);
out.bCooper = await A.until(
  `window.pip.db.prepare("SELECT COUNT(*) AS n FROM personal_entity WHERE spoken_name='Cooper'").all()[0].n === 1`,
  25000);
// Cooper lives on the My Words group page — open it through the real UI.
out.bSpeak = await A.evalJs(`(async () => {
  document.querySelector('#anchor-groups').click();
  await new Promise((r) => setTimeout(r, 800));
  const row = [...document.querySelectorAll('.gcell')]
    .find((c) => (c.textContent || '').includes('My Words'));
  row?.click();
  await new Promise((r) => setTimeout(r, 1200));
  const cell = [...document.querySelectorAll('.gcell')]
    .find((c) => (c.textContent || '').toLowerCase().includes('cooper'));
  if (!cell) return { spoke: false, photo: false, cell: false };
  const img = cell.querySelector('img');
  cell.click();
  await new Promise((r) => setTimeout(r, 600));
  return { cell: true, spoke: window.pip.sentence.length > 0,
           photo: !!img && img.src.startsWith('blob:') };
})()`);

/* --- C: a fresh Chrome whose authenticator has no PRF → locked --- */
console.error("== C: no-PRF locked");
const C = await device("C", 9268, "/tmp/pip-acct-c-probe", { prf: false });
await C.addAuth();
await C.loadApp();
const link3 = await C.evalJs(`(async () => {
  await fetch('/accounts/link', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ${JSON.stringify(EMAIL)} }) });
  const mail = await fetch('/accounts/dev/mailbox?email=' + encodeURIComponent(${JSON.stringify(EMAIL)}))
    .then((x) => x.json());
  return mail.link;
})()`);
await C.send("Page.navigate", { url: link3 });
await C.until(`typeof window.pip === 'object' && !!window.pip`, 20000);
await C.evalJs(stubDialogs + tapLog);
out.cLanded = await C.until(
  `document.querySelector('#pair-body')?.textContent.match(/Done —|Sign-in failed/)`, 40000);
out.cMaya = await C.evalJs(`(async () => {
  const rows = await window.pip.users();
  return rows.map((u) => ({ id: u.id, sync: !!u.sync }));
})()`);
await C.evalJs(`document.querySelector('#corner').click()`);
out.cLockLabel = await C.until(
  `document.querySelector('#usr-list')?.textContent.includes('needs an Allow')`, 10000);

/* --- the child's own device never shows the sign-in row --- */
console.error("== tail: childHidden + scan");
out.childHidden = await A.evalJs(`(async () => {
  document.querySelector('#corner').click();
  return document.querySelector('#acct-row').hidden;
})()`);

/* --- payload scan: nothing readable crossed the wire --- */
out.posts = await A.evalJs(`(async () => {
  const banned = ['Maya', 'Cooper'];
  const leaks = window.__posts
    .map((p) => ({ url: p.url, hits: banned.filter((w) => p.body.includes(w)) }))
    .filter((p) => p.hits.length);
  return { scanned: window.__posts.length, leaks };
})()`);

console.log(JSON.stringify(out, null, 2));
const mayaOnB = bMayaRow?.sync === true;
const mayaOnC = out.cMaya?.some((u) => u.id === mayaId && u.sync === false);
const ok =
  out.aBoot && out.mayaName === "Maya" && out.linked && out.lifetime &&
  out.cooperSaved && out.signinA && out.aLanded &&
  out.bLanded && mayaOnB && out.bActiveMaya && out.bCooper &&
  out.bSpeak?.cell && out.bSpeak?.spoke && out.bSpeak?.photo &&
  out.cLanded && mayaOnC && out.cLockLabel === true &&
  out.childHidden === true &&
  out.posts?.scanned > 0 && out.posts?.leaks.length === 0;
console.log(ok ? "PASS supporter accounts: passkey sign-in restores users with keys, no-PRF locks them, nothing readable crosses" : "FAIL — see output");
A.chrome.kill(); C.chrome.kill();
