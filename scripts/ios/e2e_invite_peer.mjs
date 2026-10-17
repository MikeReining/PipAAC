/**
 * The `invite` scenario's node peer (044 IL): the FAMILY's side of a
 * supporter invite, played against the LOCAL Worker so the iPad can be the
 * invitee. Split out of e2e_web_peer.mjs like e2e_team_peer.mjs; that file
 * hands over its seams.
 *
 *   owner   the peer's person (a relay user with Lifetime, synced) plus a
 *           SOFTWARE-passkey account for the family (the simulator cannot
 *           run a ceremony for the owner either).
 *   invite  the owner invites the iPad's supporter by email; the link comes
 *           out of the Worker's dev mailbox (ENVIRONMENT=development) and is
 *           what the XCUITest hands the app (`-PipOpenURL`).
 *   allow   once the INVITE ITSELF (asked of the Worker, not the iPad's
 *           screen) is claimed, the owner Allows exactly as devices-ui.js
 *           allowInvite does: relay addSupporter, the user key wrapped to the
 *           invitee's account public key, a sealed profile, join tokens.
 *   after   measured at the relay: this iPad registered as a device of the
 *           person (join token spent), then an edit made AFTER the Allow is
 *           what the iPad must show once it opens the person - which it can
 *           only do with the granted key and the relay registration.
 *
 * Marker files (<dir>/<name>) are the choreography with InviteE2ETests.
 */
export function makeInvitePeer({ baseUrl, put, waitFor, sleep, log, sc, groups }) {
  const jfetch = async (path, init) => {
    const r = await fetch(baseUrl + path, init);
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(j?.error ?? `http ${r.status}`), { status: r.status });
    return j;
  };
  const jpost = (path, body) => jfetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const te = new TextEncoder();

  async function mailLink(email, kind, ms = 120000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const m = await fetch(`${baseUrl}/accounts/dev/mailbox?email=${encodeURIComponent(email)}`).then((r) => r.ok ? r.json() : null).catch(() => null);
      const hit = m?.link && new RegExp(`[?&]${kind}=([^&#\\s]+)`).exec(m.link);
      if (hit) return decodeURIComponent(hit[1]);
      await sleep(300);
    }
    throw new Error(`no ${kind} mail for ${email}`);
  }

  /** claim -> software passkey -> register: the family's account. */
  async function registerSoftAccount(token) {
    const claim = await jpost("/accounts/claim", { token });
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const acct = await sc.genAccountKeys();
    const r = await jpost(`/accounts/${claim.account_id}/register`, {
      challenge: claim.challenge, credential_id: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url"),
      jwk: await crypto.subtle.exportKey("jwk", kp.publicKey), acct_pub: acct.pub, sealed_priv: null,
      prf_salt: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"), email: claim.email });
    return { acct_id: claim.account_id, email: claim.email, session: r.session };
  }

  async function ownerFlow({ me, client, entityId, identity, userKey, newName, db, settle }) {
    const rnd = crypto.randomUUID().slice(0, 8);
    const ownerEmail = `family-${rnd}@example.com`;
    const inviteeEmail = `lee-${rnd}@example.com`;
    await jpost("/accounts/link", { email: ownerEmail });
    const owner = await registerSoftAccount(await mailLink(ownerEmail, "signin"));
    await jpost(`/accounts/${owner.acct_id}/invites`, { session: owner.session, email: inviteeEmail, user_id: me.sync.userId });
    const token = await mailLink(inviteeEmail, "invite");
    const status = () => jfetch(`/accounts/invites/${token}?session=${encodeURIComponent(owner.session)}`);
    log("invite sent; status", (await status()).status);
    put("invite-url.txt", `${baseUrl}/?invite=${token}`);
    put("invite-email.txt", inviteeEmail);

    // The iPad opens the link, makes its passkey, claims. Asked of the Worker.
    await waitFor("ui-opened", 300000);
    let st;
    for (let i = 0; i < 600; i++) {
      st = await status();
      if (st.status === "pending_allow" && st.to_acct) break;
      await sleep(200);
    }
    if (st?.status !== "pending_allow") throw new Error(`the iPad never claimed the invite (${st?.status})`);
    log("the Worker says the invite is claimed by", st.to_acct, "- status", st.status);
    put("worker-claimed.json", JSON.stringify({ status: st.status, to_acct: st.to_acct }));

    // Allow (devices-ui.js allowInvite / buildUserGrant).
    await client.addSupporter(st.to_acct, st.email);
    const toPub = (await jfetch(`/accounts/${st.to_acct}/state`)).acct_pub;
    const keys = [{ epoch: 1, grant: await sc.wrapUserKey(userKey, toPub) }];
    const joinTokens = (await client.mintJoinTokens(4, st.to_acct)).tokens ?? [];
    const sealed_profile = await sc.sealBlob(userKey, te.encode(JSON.stringify({ name: me.name, photo: null })), 1);
    await jpost(`/accounts/invites/${token}`, { action: "grant", session: owner.session, keys, sealed_profile, join_tokens: joinTokens });
    log("Allowed;", (await status()).status);
    put("allowed", Date.now());

    // The iPad says it is done; the relay says whether it really is one of the person's devices.
    await waitFor("ui-landed", 300000);
    let devices;
    for (let i = 0; i < 100; i++) {
      devices = (await client.listDevices()).devices ?? [];
      if (devices.some((d) => d.device_id !== identity.deviceId)) break;
      await sleep(200);
    }
    const others = devices.filter((d) => d.device_id !== identity.deviceId);
    log("devices on the person's relay besides the peer:", JSON.stringify(others.map((d) => ({ id: d.device_id.slice(0, 8), via: d.via_acct }))));
    put("relay-devices.json", JSON.stringify({ others: others.length, viaInviteeAccount: others.filter((d) => d.via_acct === st.to_acct).length }));
    if (!others.length) throw new Error("the iPad never registered on the person's relay");

    // An edit made after the Allow: the iPad can only show it by decrypting with the granted key.
    groups.renameEntity(db, entityId, newName);
    await settle(db);
    put("peer-edit.json", JSON.stringify({ t0: Date.now(), name: newName }));
    await waitFor("ui-saw-edit", 300000);
    return { token, owner, invitee: st };
  }

  return { ownerFlow };
}
