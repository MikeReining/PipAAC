/**
 * The `team` scenario's node peers (044 F2), split out of e2e_web_peer.mjs.
 * `makeTeamPeer` receives that file's seams (key store, db opener, sync
 * start, file protocol) so there is one place that wires sync.mjs's hooks.
 */
export function makeTeamPeer({
  dir, baseUrl, secret, scenario, put, waitFor, sleep, spawn, readFileSync, join, shared, pathToFileURL,
  sc, pairClient, relayClient, joinDeviceWithToken, groups, opsMod, openDb, peerStore, startSync, dumpTo, selfPath,
}) {
/* ======================================================================
 * 044 F2 - the `team` scenario: owner (the iPad) + two supporters + a second
 * device, against the LOCAL Worker. Four processes, because sync.mjs is a
 * per-process singleton and each device needs its own key store:
 *
 *   host/team   (orchestrator) registers the owner's account with a SOFTWARE
 *               passkey (the simulator cannot run a ceremony), hands the iPad
 *               its sign-in (account-seed.json), grants Lifetime through the
 *               Worker's internal route once the iPad's relay user exists,
 *               spawns the agents, and finally checks the account is gone.
 *   team-agent d2   a second device that joins by the code the iPad shows
 *   team-agent s1   a supporter: accepts the invite, is Allowed, becomes Team
 *                   (owner-only calls are refused by the RELAY), is removed
 *   team-agent s2   a supporter who stays: sets a name, is regranted
 *
 * Every assertion here reads the relay's own answer (HTTP status + error
 * code), or a database / ciphertext - never what the iPad's UI claims.
 * Marker files (<dir>/<name>) are the choreography with the XCUITest.
 * ====================================================================== */
const jfetch = async (path, init) => {
  const r = await fetch(baseUrl + path, init);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error ?? `http ${r.status}`), { status: r.status });
  return j;
};
const jpost = (path, body) => jfetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const tlog = (...a) => console.log(`[peer:${scenario}]`, ...a);

/** The dev mailbox stands in for the email (ENVIRONMENT=development). */
async function mailLink(email, kind, ms = 1200000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = await fetch(`${baseUrl}/accounts/dev/mailbox?email=${encodeURIComponent(email)}`).then((r) => r.ok ? r.json() : null).catch(() => null);
    const hit = m?.link && new RegExp(`[?&]${kind}=([^&#\\s]+)`).exec(m.link);
    if (hit) return decodeURIComponent(hit[1]);
    await sleep(300);
  }
  throw new Error(`no ${kind} mail for ${email}`);
}

/** claim -> software passkey -> register: an account this process holds the
 *  account private key for. `token` is a sign-in link token. */
async function registerSoftAccount(token) {
  const claim = await jpost("/accounts/claim", { token });
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const acct = await sc.genAccountKeys();
  const r = await jpost(`/accounts/${claim.account_id}/register`, {
    challenge: claim.challenge, credential_id: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url"),
    jwk: await crypto.subtle.exportKey("jwk", kp.publicKey), acct_pub: acct.pub, sealed_priv: null,
    prf_salt: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"), email: claim.email });
  return { acct_id: claim.account_id, email: claim.email, session: r.session, pub: acct.pub, priv: await sc.importAccountPriv(acct.priv) };
}

async function teamOrchestrator() {
  const rnd = crypto.randomUUID().slice(0, 8);
  const emails = { owner: `owner-${rnd}@example.com`, s1: `lee-${rnd}@example.com`, s2: `rivera-${rnd}@example.com` };
  await jpost("/accounts/link", { email: emails.owner });
  const owner = await registerSoftAccount(await mailLink(emails.owner, "signin"));
  put("account-seed.json", JSON.stringify({ acct_id: owner.acct_id, email: owner.email, session: owner.session }));
  put("emails.json", JSON.stringify(emails));
  tlog("owner account", owner.acct_id);
  const agents = ["d2", "s1", "s2"].map((role) => {
    const child = spawn(process.execPath, [selfPath, "team-agent", dir, baseUrl, secret, role], { stdio: "inherit" });
    return new Promise((resolve, reject) => child.on("exit", (c) => c === 0 ? resolve() : reject(new Error(`agent ${role} exited ${c}`))));
  });
  agents.forEach((p) => p.catch(() => {}));

  // The iPad's relay user appears once it has a card / first invite: grant Lifetime (Worker internal route).
  let userId = null;
  for (let i = 0; i < 3000 && !userId; i++) {
    try {
      const users = JSON.parse(readFileSync(join(dir, "ipad/people.json"), "utf8")).users;
      userId = users.find((u) => u.sync?.userId)?.sync.userId ?? null;
    } catch { /* not there yet */ }
    if (!userId) await sleep(200);
  }
  if (!userId) throw new Error("the iPad never created its relay user");
  const g = await fetch(`${baseUrl}/users/${userId}/internal/appstore`, {
    method: "POST", headers: { "content-type": "application/json", "x-pip-internal": secret },
    body: JSON.stringify({ op: "grant", otid: `e2e-team-${rnd}` }) });
  if (!g.ok) throw new Error(`lifetime grant: ${g.status}`);
  tlog("lifetime granted for", userId, (await g.json()).entitlement);
  put("lifetime-on", userId);

  await waitFor("ui-account-deleted", 900000);
  // AC-10, measured at the Worker: the session is dead and the account holds no passkey.
  const sess = await fetch(`${baseUrl}/accounts/${owner.acct_id}/invites?session=${encodeURIComponent(owner.session)}`);
  const creds = await jfetch(`/accounts/${owner.acct_id}/credentials`);
  const relink = await jpost("/accounts/link", { email: emails.owner });
  const check = { sessionStatus: sess.status, credentialIds: creds.credential_ids, newAccountForSameEmail: relink.acct_id !== owner.acct_id };
  tlog("account deleted?", JSON.stringify(check));
  put("account-delete-check.json", JSON.stringify(check));
  if (sess.status !== 403 || creds.credential_ids.length) throw new Error(`account not deleted: ${JSON.stringify(check)}`);
  await Promise.all(agents);
  put("host-done", Date.now());
  process.exit(0);
}

const settleOps = async (db) => {
  for (let i = 0; i < 150 && db.prepare("SELECT COUNT(*) c FROM sync_op WHERE relay_seq IS NULL").all()[0].c; i++) await sleep(100);
};
const hasEntity = (db) => db.prepare("SELECT id, spoken_name FROM personal_entity").all();

async function teamAgent(role) {
  const db = openDb(join(dir, `${role}.sqlite`));
  const store = peerStore();
  const identity = await sc.getDeviceIdentity(store);
  opsMod.setDeviceId(identity.deviceId);
  const emails = JSON.parse(await waitFor("emails.json"));
  let me, userId, account = null;
  let invite = null;

  if (role === "d2") {
    const code = (await waitFor("ipad-code.txt", 900000)).toUpperCase().replace(/[^A-Z0-9]/g, "");
    await pairClient(baseUrl).claim(code, {
      device_id: identity.deviceId, sig_pub: await sc.exportPublicKey(identity.verify),
      dh_pub: await sc.exportDhPublic(identity.dh.publicKey), label: "Mac · e2e team device" });
    let grant;
    for (;;) {
      const st = await pairClient(baseUrl).status(code);
      if (st.status === "granted") { grant = st.grant; break; }
      if (st.status === "refused") throw new Error(`d2 refused: ${JSON.stringify(st.grant)}`);
      await sleep(500);
    }
    for (const g of grant.keys ?? []) await sc.putUserKey(store, grant.user_id, await sc.unwrapUserKey(identity.dh.privateKey, g), g.epoch);
    userId = grant.user_id;
    me = { id: userId, name: "", sync: { userId, epoch: grant.epoch ?? 1, cursor: 0 } };
    put("d2-device.txt", identity.deviceId);
  } else {
    // A supporter: the iPad's invite lands in the dev mailbox; open -> sign-in -> register -> claim.
    const token = await mailLink(emails[role], "invite");
    const { link_token } = await jpost(`/accounts/invites/${token}`, { action: "open" });
    account = await registerSoftAccount(link_token);
    await jpost(`/accounts/invites/${token}`, { action: "claim", session: account.session });
    invite = { token };
    put(`${role}-waiting`, JSON.stringify({ acct_id: account.acct_id, token, email: emails[role] }));
    let st;
    for (let i = 0; i < 3000; i++) {
      st = await jfetch(`/accounts/invites/${token}?session=${encodeURIComponent(account.session)}`);
      if (st.status === "granted" && st.grant) break;
      await sleep(500);
    }
    if (st?.status !== "granted") throw new Error(`${role}: never allowed (${st?.status})`);
    userId = st.grant.user_id;
    let maxEpoch = 1;
    for (const k of st.grant.keys) {
      await sc.putUserKey(store, userId, await sc.unwrapUserKey(account.priv, k.grant), k.epoch);
      maxEpoch = Math.max(maxEpoch, k.epoch);
    }
    let joined = false;
    for (const t of st.grant.join_tokens) {
      try {
        await joinDeviceWithToken(baseUrl, userId, { token: t, device_id: identity.deviceId,
          pubkey: await sc.exportPublicKey(identity.verify), dh_pub: await sc.exportDhPublic(identity.dh.publicKey) });
        joined = true; break;
      } catch { /* consumed - next */ }
    }
    if (!joined) throw new Error(`${role}: no join token worked`);
    me = { id: userId, name: "", sync: { userId, epoch: maxEpoch, cursor: 0 } };
  }
  await startSync(db, me);
  for (let i = 0; i < 600 && !hasEntity(db).length; i++) await sleep(100);
  if (!hasEntity(db).some((e) => e.spoken_name === "Maya")) throw new Error(`${role}: never saw the person's word`);
  tlog(role, "sees the person's word:", JSON.stringify(hasEntity(db)));
  const keyAt = (e) => sc.getUserKey(store, userId, e);
  const relay = async () => relayClient({ userId, baseUrl, identity, userKey: await keyAt(1) });
  put(`${role}-synced`, Date.now());

  if (role === "s1") {
    // AC-9 at the relay: undelete is Owner-only. Team -> refused; Owner -> allowed; Team again -> refused.
    const ask = async () => { try { await (await relay()).undeleteUser(); return { ok: true, status: 200 }; }
      catch (e) { return { ok: false, status: e.status, error: e.message }; } };
    const one = await ask();
    tlog("TEAM member, owner-only call ->", JSON.stringify(one));
    if (one.ok || one.status !== 403 || one.error !== "owner_only") throw new Error(`team member was not refused: ${JSON.stringify(one)}`);
    put("s1-check-1", JSON.stringify(one));
    await waitFor("ui-owner-on", 300000);
    const two = await ask();
    tlog("OWNER (made owner), owner-only call ->", JSON.stringify(two));
    if (!two.ok) throw new Error(`owner was refused: ${JSON.stringify(two)}`);
    put("s1-check-2", JSON.stringify(two));
    await waitFor("ui-owner-off", 300000);
    const three = await ask();
    tlog("TEAM again, owner-only call ->", JSON.stringify(three));
    if (three.ok || three.status !== 403 || three.error !== "owner_only") throw new Error(`demoted member was not refused: ${JSON.stringify(three)}`);
    put("s1-check-3", JSON.stringify(three));

    // SY-8: removed -> the relay refuses it, and it cannot read ops sealed after the removal.
    const files = JSON.parse(await waitFor("ops-sample.json", 900000));
    let fetched;
    try { await (await relay()).fetchOps(0); fetched = { ok: true }; } catch (e) { fetched = { ok: false, status: e.status }; }
    tlog("REMOVED supporter fetches ops ->", JSON.stringify(fetched));
    if (fetched.ok || fetched.status !== 403) throw new Error(`removed supporter still reads the relay: ${JSON.stringify(fetched)}`);
    const k1 = await keyAt(1);
    const pre = await sc.openOp(k1, files.pre.env); // positive control: the epoch-1 key opens epoch-1 ops
    let postOpened = null;
    try { postOpened = await sc.openOp(k1, files.post.env); } catch { /* expected */ }
    tlog("old key opens an epoch-1 op:", !!pre, "| opens the post-removal op:", !!postOpened, `(post op epoch ${files.post.epoch})`);
    if (!pre) throw new Error("control failed: the old key should open old ops");
    if (postOpened) throw new Error("the removed supporter decrypted a post-removal op");
    put("s1-secrecy.json", JSON.stringify({ relayStatus: fetched.status, oldOpOpened: true, postRemovalOpened: false, postEpoch: files.post.epoch }));
    await waitFor("ui-final", 900000);
    await sleep(2500);
    dumpTo(db, "s1.dump");
  }

  if (role === "s2") {
    const { setSupporterName } = await import(pathToFileURL(join(shared, "team_names.mjs")).href);
    setSupporterName(db, account.acct_id, "Ms. Rivera");
    await settleOps(db);
    put("s2-named", Date.now());
    const grantEpochs = async () => {
      const st = await jfetch(`/accounts/invites/${invite.token}?session=${encodeURIComponent(account.session)}`);
      return { st, epochs: (st.grant?.keys ?? []).map((k) => k.epoch) };
    };
    await waitFor("ui-cut-active", 900000);
    const stale = await grantEpochs();
    tlog("while the regrant is cut, my account bundle holds epochs", JSON.stringify(stale.epochs));
    if (JSON.stringify(stale.epochs) !== "[1]") throw new Error(`regrant leaked through the cut: ${JSON.stringify(stale.epochs)}`);
    put("s2-stale-ok", JSON.stringify(stale.epochs));
    await waitFor("ui-drained", 900000);
    let now;
    for (let i = 0; i < 300; i++) { now = await grantEpochs(); if (now.epochs.includes(2)) break; await sleep(500); }
    tlog("after the relaunch drained the journal, my bundle holds epochs", JSON.stringify(now.epochs));
    if (!now.epochs.includes(2)) throw new Error("the resumed regrant never reached the remaining supporter");
    const k2 = await sc.unwrapUserKey(account.priv, now.st.grant.keys.find((k) => k.epoch === 2).grant);
    const files = JSON.parse(await waitFor("ops-sample.json", 900000));
    const opened = await sc.openOp(k2, files.post.env); // the regranted key opens a post-removal op
    if (!opened) throw new Error("regranted key cannot open the post-removal op");
    put("s2-regrant-ok", JSON.stringify({ epochs: now.epochs, openedPostRemovalOp: true }));
    await waitFor("ui-final", 900000);
    await sleep(2500);
    dumpTo(db, "s2.dump");
  }

  if (role === "d2") {
    const c = await relay();
    const waitSelf = async (pred, what) => {
      for (let i = 0; i < 300; i++) { const s = await c.selfKey(); if (pred(s)) return s; await sleep(300); }
      throw new Error(`d2: relay never reported ${what}`);
    };
    // SY-14, measured at the relay (device 2 asks the Worker itself).
    await waitFor("ui-deleted", 900000);
    const del = await waitSelf((s) => !!s.delete_at, "pending deletion");
    tlog("relay reports pending deletion, delete_at", del.delete_at, "(~", Math.round((del.delete_at - Date.now()) / 86400000), "days)");
    put("d2-saw-delete", String(del.delete_at));
    await waitFor("ui-undeleted", 900000);
    await waitSelf((s) => !s.delete_at, "the deletion undone");
    tlog("relay: deletion undone");
    put("d2-saw-undelete", Date.now());

    // After the supporter's removal drained: this device makes an edit sealed under the NEW epoch.
    await waitFor("ui-drained", 900000);
    // This device only learns of the rotation when its next write meets the relay's new epoch
    // (the iPad has been idle since): the write below makes it re-key and resubmit under epoch 2.
    const ent = hasEntity(db)[0];
    groups.renameEntity(db, ent.id, "Mayaa");
    await settleOps(db);
    for (let i = 0; i < 100 && (me.sync.epoch ?? 1) < 2; i++) await sleep(200);
    if ((me.sync.epoch ?? 1) < 2) throw new Error("d2 never rekeyed to epoch 2");
    const rows = (await c.fetchOps(0)).ops;
    const pre = rows.find((r) => r.epoch === 1);
    const post = [...rows].reverse().find((r) => r.epoch >= 2);
    if (!pre || !post) throw new Error(`d2: need an epoch-1 and an epoch-2+ op (have epochs ${[...new Set(rows.map((r) => r.epoch))]})`);
    put("ops-sample.json", JSON.stringify({ pre: { epoch: pre.epoch, env: pre.env }, post: { epoch: post.epoch, env: post.env } }));
    put("peer-edit-post.json", JSON.stringify({ t0: Date.now(), name: "Mayaa", epoch: post.epoch }));
    tlog("edit at epoch", post.epoch);
    await waitFor("ui-final", 900000);
    await sleep(2500);
    dumpTo(db, "d2.dump");

    // SY-7: the iPad removes this device -> the relay refuses it from then on.
    await waitFor("ui-d2-removed", 900000);
    let after;
    for (let i = 0; i < 100; i++) {
      try { await (await relay()).listDevices(); after = { ok: true }; } catch (e) { after = { ok: false, status: e.status }; break; }
      await sleep(300);
    }
    tlog("REMOVED device asks the relay ->", JSON.stringify(after));
    if (after.ok || after.status !== 403) throw new Error(`removed device still allowed: ${JSON.stringify(after)}`);
    put("d2-removed-ok", JSON.stringify(after));
  }
  put(`${role}-done`, Date.now());
  process.exit(0);
}

  return { teamOrchestrator, teamAgent };
}
