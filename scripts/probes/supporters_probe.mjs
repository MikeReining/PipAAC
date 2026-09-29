/**
 * 015 slice 5 live Works Test — supporters on a user. Two Chrome
 * profiles with virtual authenticators against real `wrangler dev`:
 *
 *   P (owner): Maya linked + Lifetime, signs into her account, invites
 *     SLP by email.
 *   S (supporter, fresh Chrome): the emailed link lands on ?invite=,
 *     runs the normal passkey sign-in, claims the invite, and waits.
 *   P's corner shows "waiting for your Allow"; Allow registers S's
 *     account on Maya's relay and grants wrapped keys + tagged join
 *     tokens. S imports Maya WITH her keys, edits (adds Zebra), and
 *     P's device receives the op through the relay.
 *   P Removes S: the relay cascades S's devices + tokens, the account
 *     grant revokes, and the user re-keys. S's next read AND write —
 *     signed by S's real device — get 403; the post-removal op is
 *     sealed under epoch 2 and does not open under the epoch-1 key S
 *     still holds.
 *   Payload scan: no name or op content crosses in the clear (account
 *     emails are identifiers and do cross).
 *
 *   PIP_ORIGIN=http://localhost:8795 node scripts/probes/supporters_probe.mjs
 */
import { spawn } from "node:child_process";
import { rmSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const ORIGIN = process.env.PIP_ORIGIN ?? "http://localhost:8794";
const STAMP = Date.now();
const EMAIL_P = `parent-${STAMP}@example.com`;
const EMAIL_S = `slp-${STAMP}@example.com`;
const repo = new URL("../..", import.meta.url).pathname;
const licenseSecret = Object.fromEntries(
  readFileSync(`${repo}.dev.vars`, "utf8").split("\n")
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/))
    .filter(Boolean).map((m) => [m[1], m[2]])).PIP_LICENSE_SECRET;
const { licenseFor } = await import(`${repo}src/worker/license.mjs`);

const stubDialogs = `window.prompt = () => 'Maya'; window.confirm = () => true; window.alert = () => {};`;
const tapLog = `window.__tapPosts = () => {
    try { return JSON.parse(localStorage.getItem('__pip_posts') ?? '[]'); } catch { return []; }
  };
  if (!window.__tap) { window.__tap = 1;
    const f = window.fetch.bind(window);
    window.fetch = (...a) => {
      try {
        if (a[1]?.body && typeof a[1].body === "string") {
          const posts = window.__tapPosts();
          posts.push({ url: String(a[0]), body: a[1].body });
          localStorage.setItem('__pip_posts', JSON.stringify(posts.slice(-200)));
        }
      } catch {}
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
    await send("Page.addScriptToEvaluateOnNewDocument",
      { source: stubDialogs + tapLog });
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
  const fireJs = async (expr) => {
    try { return await evalOnce(expr); }
    catch (e) { console.error(`[${name}] fire err: ${String(e).slice(0, 120)}`); return null; }
  };
  const navTo = async (url) => {
    try { await send("Page.navigate", { url }); }
    catch (e) { console.error(`[${name}] nav err: ${String(e).slice(0, 100)}`); }
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
  return { name, chrome, evalJs, fireJs, navTo, loadApp, until, send, addAuth };
}

const P = await device("P", 9311, "/tmp/pip-sup-p-probe");
const out = {};
await P.addAuth();

/* --- P: Maya, linked, Lifetime, signed in --- */
console.error("== P: create Maya");
await P.loadApp();
for (let i = 0; i < 3; i++) {
  await P.fireJs(`(async () => {
    ${stubDialogs}
    document.querySelector('#corner')?.click();
    document.querySelector('#usr-add')?.click();
    return 1;
  })()`);
  await sleep(1500);
  await P.evalJs(stubDialogs + tapLog).catch(() => {});
  await P.until(`window.pip?.user?.name === 'Maya'`, 20000);
  out.mayaName = await P.evalJs(`window.pip?.user?.name ?? ''`).catch(() => "");
  if (out.mayaName === "Maya") break;
}
out.pBoot = out.mayaName === "Maya";

console.error("== P: link + Lifetime");
await P.fireJs(`(async () => {
  document.querySelector('#corner').click();
  document.querySelector('#dev-add').click();
  return 1;
})()`);
out.linked = await P.until(`!!window.pip?.user?.sync?.userId`, 20000);
const mayaId = await P.evalJs(`window.pip?.user?.id`);
const license = await licenseFor(licenseSecret, mayaId);
await P.fireJs(`(async () => {
  document.querySelector('#dev-license').value = ${JSON.stringify(license)};
  document.querySelector('#dev-activate').click();
  return 1;
})()`);
out.lifetime = await P.until(
  `document.querySelector('#dev-lifetime')?.textContent.includes('Lifetime')`, 15000);

console.error("== P: sign in");
await P.fireJs(`(async () => {
  document.querySelector('#corner')?.click();
  document.querySelector('#acct-email').value = ${JSON.stringify(EMAIL_P)};
  document.querySelector('#acct-send')?.click();
  return 1;
})()`);
const pLink = await P.evalJs(`(async () => {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const mail = await fetch('/accounts/dev/mailbox?email=' + encodeURIComponent(${JSON.stringify(EMAIL_P)}))
      .then((r) => r.json()).catch(() => ({}));
    if (mail.link) return mail.link;
  }
  return null;
})()`);
if (!pLink) throw new Error("P: no sign-in link in dev mailbox");
await P.navTo(new URL(pLink).href);
out.pSignedIn = await P.until(
  `document.querySelector('#pair-body')?.textContent.includes('Done')`, 60000);

/* --- P invites S by email --- */
console.error("== P: invite S");
await P.fireJs(`(async () => {
  document.querySelector('#corner').click();
  document.querySelector('#sup-email').value = ${JSON.stringify(EMAIL_S)};
  document.querySelector('#sup-invite')?.click();
  return 1;
})()`);
out.invited = await P.until(
  `document.querySelector('#sup-list')?.textContent.includes(${JSON.stringify(EMAIL_S)})`,
  15000);
const sLink = await P.evalJs(`(async () => {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const mail = await fetch('/accounts/dev/mailbox?email=' + encodeURIComponent(${JSON.stringify(EMAIL_S)}))
      .then((r) => r.json()).catch(() => ({}));
    if (mail.link?.includes('invite=')) return mail.link;
  }
  return null;
})()`);
if (!sLink) throw new Error("S: no invite link in dev mailbox");

/* --- S: invite link → sign-in → claim → waits for Allow --- */
console.error("== S: land on invite");
const S = await device("S", 9312, "/tmp/pip-sup-s-probe");
await S.addAuth();
await S.loadApp(new URL(sLink).href);
// The landing flow: open → account sign-in (registers a passkey on the
// virtual authenticator) → claim → the overlay says it waits for Allow.
out.sWaiting = await S.until(
  `document.querySelector('#pair-body')?.textContent.includes('waiting for the family to Allow')`,
  90000);

/* --- P: the pending request shows; Allow grants it --- */
console.error("== P: Allow");
out.pSeesPending = await P.until(`(() => {
  document.querySelector('#corner').click();
  return document.querySelector('#sup-list')?.textContent.includes('waiting for your Allow');
})()`, 60000);
await P.fireJs(`(() => {
  const row = [...document.querySelectorAll('#sup-list .dev-row')]
    .find((r) => r.textContent.includes('waiting for your Allow'));
  row?.querySelector('button')?.click();
  return 1;
})()`);
out.pAllowed = await P.until(
  `document.querySelector('#sup-list')?.textContent.includes('can edit')`, 30000);

/* --- S: the grant lands; Maya imports with her keys --- */
console.error("== S: grant lands");
out.sGranted = await S.until(
  `document.querySelector('#pair-body')?.textContent.includes('the user is on this device')`,
  60000);
const sUsers = await S.evalJs(`(async () => {
  const rows = await window.pip.users();
  return rows.map((u) => ({ id: u.id, name: u.name, sync: !!u.sync }));
})()`);
out.sHasMaya = sUsers?.some((u) => u.id === mayaId && u.sync);

/* --- S edits Maya; P's device receives the op --- */
console.error("== S: switch to Maya + add Zebra");
await S.evalJs(`sessionStorage.setItem('pip_active_user', ${JSON.stringify(mayaId)})`);
await S.navTo(ORIGIN);
await S.until(`typeof window.pip === 'object' && !!window.pip`, 20000);
await S.evalJs(stubDialogs + tapLog);
out.sActiveMaya = await S.until(`window.pip?.user?.id === ${JSON.stringify(mayaId)}`, 10000);
await S.fireJs(`(async () => {
  document.querySelector('#corner')?.click();
  document.querySelector('#add-mywords')?.click();
  const name = document.querySelector('#add-name');
  name.value = 'Zebra';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  document.querySelector('#add-new')?.click();
  return 1;
})()`);
await sleep(800);
out.sZebraSaved = await S.until(
  `window.pip.db.prepare("SELECT COUNT(*) AS n FROM personal_entity WHERE spoken_name='Zebra'").all()[0].n === 1`,
  15000);
// S genuinely has relay access before removal — otherwise the later
// 403s prove nothing (an unregistered device also gets 403).
out.sRegistered = await S.evalJs(`(async () => {
  const crypto2 = await import('/shared/sync_crypto.mjs');
  const sc = await import('/shared/sync_client.mjs');
  const ks = crypto2.openKeyStore();
  const identity = await crypto2.getDeviceIdentity(ks);
  const key = await crypto2.getUserKey(ks, ${JSON.stringify(mayaId)}, 1);
  const cl = sc.relayClient({ userId: ${JSON.stringify(mayaId)},
    baseUrl: location.origin, identity, userKey: key });
  return cl.fetchOps(0).then(() => 'ok').catch((e) => e.status ?? e.message);
})()`);

// The op rides the relay to P — measure P's DB, not S's report of a send.
console.error("== P: receives Zebra");
out.pGotZebra = await P.until(
  `window.pip.db.prepare("SELECT COUNT(*) AS n FROM personal_entity WHERE spoken_name='Zebra'").all()[0].n === 1`,
  40000);

/* --- P removes S: cascade + revoke + rotation --- */
console.error("== P: Remove S");
await P.fireJs(`(async () => {
  ${stubDialogs}
  document.querySelector('#corner').click();
  const row = [...document.querySelectorAll('#sup-list .dev-row')]
    .find((r) => r.textContent.includes('can edit'));
  row?.querySelector('button')?.click();
  return 1;
})()`);
out.pRotated = await P.until(`window.pip?.user?.sync?.epoch >= 2`, 30000);
out.pSupportersGone = await P.until(`(() => {
  document.querySelector('#corner').click();
  return document.querySelector('#sup-list')?.textContent.includes('No supporters');
})()`, 20000);

/* --- S's next read and write, signed by its real device, get 403 --- */
console.error("== S: 403s");
out.s403 = await S.evalJs(`(async () => {
  const crypto2 = await import('/shared/sync_crypto.mjs');
  const sc = await import('/shared/sync_client.mjs');
  const ks = crypto2.openKeyStore();
  const identity = await crypto2.getDeviceIdentity(ks);
  const key = await crypto2.getUserKey(ks, ${JSON.stringify(mayaId)}, 1);
  const cl = sc.relayClient({ userId: ${JSON.stringify(mayaId)},
    baseUrl: location.origin, identity, userKey: key });
  const read = await cl.fetchOps(0).then(() => 'ok').catch((e) => e.status);
  const write = await cl.submit([{ op_id: 'probe_${STAMP}', kind: 'set_setting',
    args: '{}' }]).then(() => 'ok').catch((e) => e.status);
  return { read, write };
})()`);

/* --- post-removal ops are sealed under the epoch S never received --- */
console.error("== P: post-removal op + epoch proof");
await P.fireJs(`(async () => {
  document.querySelector('#corner')?.click();
  document.querySelector('#add-mywords')?.click();
  const name = document.querySelector('#add-name');
  name.value = 'PostRemoval';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  document.querySelector('#add-new')?.click();
  return 1;
})()`);
await sleep(800);
await P.until(
  `window.pip.db.prepare("SELECT COUNT(*) AS n FROM personal_entity WHERE spoken_name='PostRemoval'").all()[0].n === 1`,
  15000);
await sleep(2500); // let the op flush to the relay
out.epochProof = await P.evalJs(`(async () => {
  const crypto2 = await import('/shared/sync_crypto.mjs');
  const sc = await import('/shared/sync_client.mjs');
  const ks = crypto2.openKeyStore();
  const identity = await crypto2.getDeviceIdentity(ks);
  const key1 = await crypto2.getUserKey(ks, ${JSON.stringify(mayaId)}, 1);
  const key2 = await crypto2.getUserKey(ks, ${JSON.stringify(mayaId)}, 2);
  const cl = sc.relayClient({ userId: ${JSON.stringify(mayaId)},
    baseUrl: location.origin, identity, userKey: key2 });
  const ops = await cl.fetchOps(0);
  // The PostRemoval op may not be the last row (place_item follows it)
  // — find the epoch-2 op whose plaintext carries the word.
  let epoch = 0, underOld = 'none', underNew = 'missing';
  for (const r of ops.ops) {
    if ((r.epoch ?? 1) < 2) continue;
    const plain = await crypto2.openOp(key2, r.env).catch(() => null);
    if (!plain) return { epoch: r.epoch, underOld: 'n/a', underNew: 'fail' };
    if (JSON.stringify(plain).includes('PostRemoval')) {
      epoch = r.epoch;
      underNew = 'opens';
      underOld = await crypto2.openOp(key1, r.env)
        .then(() => 'OPENED').catch(() => 'sealed');
    }
  }
  return { epoch, underOld, underNew };
})()`);

/* --- payload scan: nothing readable crossed on either browser --- */
console.error("== tail: payload scan");
const scanPosts = `(async () => {
  const banned = ['Maya', 'Zebra', 'PostRemoval'];
  const posts = window.__tapPosts ? window.__tapPosts() : [];
  const leaks = posts
    .map((p) => ({ url: p.url, hits: banned.filter((w) => p.body.includes(w)) }))
    .filter((p) => p.hits.length);
  return { scanned: posts.length, leaks };
})()`;
out.postsP = await P.evalJs(scanPosts);
out.postsS = await S.evalJs(scanPosts);

console.log(JSON.stringify(out, null, 2));
const ok =
  out.pBoot && out.mayaName === "Maya" && out.linked && out.lifetime &&
  out.pSignedIn && out.invited && out.sWaiting && out.pSeesPending &&
  out.pAllowed && out.sGranted && out.sHasMaya && out.sActiveMaya &&
  out.sZebraSaved && out.sRegistered === 'ok' && out.pGotZebra &&
  out.pRotated && out.pSupportersGone &&
  out.s403?.read === 403 && out.s403?.write === 403 &&
  out.epochProof?.epoch >= 2 && out.epochProof?.underOld === 'sealed' &&
  out.epochProof?.underNew === 'opens' &&
  out.postsP?.scanned > 0 && out.postsP?.leaks.length === 0 &&
  out.postsS?.scanned > 0 && out.postsS?.leaks.length === 0;
console.log(ok
  ? "PASS supporters: invite → Allow → edit both ways → Remove 403s + epoch-2 seal"
  : "FAIL — see output");
P.chrome.kill(); S.chrome.kill();
