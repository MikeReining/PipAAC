/**
 * Parent Corner devices: pairing, the users on this device, entitlement,
 * and supporter sign-in. The child's board never asks for an account.
 */
import {
  ensureRecoveryRoot, exportDhPublic, exportPublicKey, getDeviceIdentity,
  getUserKey, openKeyStore, putUserKey, sealBlob, unwrapUserKey, wrapUserKey,
} from "../shared/sync_crypto.mjs";
import { recoveryProof } from "../shared/recovery.mjs";
import { joinDeviceWithToken, pairClient, relayClient } from "../shared/sync_client.mjs";
import {
  accountPub, accountState, claimInvite, claimToken, createInvite,
  declineInvite, deleteAccount, grantInvite, importAccountUsers, inviteStatus,
  listInvites, openInvite, registerAccount, requestLink, revokeInvite,
  saveAccountState, shareUserToAccount, signInAccount,
} from "../shared/account.mjs";
import { addUser, listUsers, putUser, removeUser } from "../shared/users.mjs";

const $ = (id) => document.getElementById(id);

export function mountDevices({
  db, me, saveUser, userStore, flushDb, toast,
  initSync, onSyncApplied, onModel, qrcode,
  // Re-seals the running sync client after a key rotation (015 s5) —
  // injected so this module stays free of the sqlite-backed db graph.
  syncRekey = async () => null,
}) {
  /* ------------------------------------------------------------------ *
   * Linked devices + pairing (sync § 3). The new device shows an 8-char
   * code (and QR); a linked device types or scans it, taps Allow, and the
   * user key travels wrapped to the new device's dh key through the
   * pairing lobby — the relay never sees it.
   * ------------------------------------------------------------------ */

  const relayBase = location.origin;
  const te = new TextEncoder();
  const pairOverlay = $("pairform");
  const pairBody = $("pair-body");
  const pairTitle = $("pair-title");
  const pairGo = $("pair-go");
  let pairPoll = null;

  const openPair = (title) => {
    pairTitle.textContent = title;
    pairBody.innerHTML = "";
    pairGo.hidden = true;
    pairOverlay.classList.add("open");
  };
  const closePair = () => {
    clearInterval(pairPoll);
    pairPoll = null;
    pairOverlay.classList.remove("open");
  };
  pairOverlay.addEventListener("click", (e) => {
    if (e.target === pairOverlay || e.target.closest("[data-close]")) closePair();
  });

  /** First linked-device action on a user creates it on the relay. The
   *  recovery root is minted here so the relay holds the sheet's proof
   *  from the start — it stores the hash, never the key. */
  async function ensureUser({ quiet = false } = {}) {
    if (me.sync?.userId) return me.sync;
    const store = openKeyStore();
    const identity = await getDeviceIdentity(store);
    const root = await ensureRecoveryRoot(store, me.id);
    const res = await fetch(`${relayBase}/users`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // The registry id becomes the relay id (015 slice 2).
        user_id: me.id,
        device_id: identity.deviceId,
        pubkey: await exportPublicKey(identity.verify),
        dh_pub: await exportDhPublic(identity.dh.publicKey),
        recovery_proof: await recoveryProof(root),
      }),
    });
    if (!res.ok) throw new Error(`user create: ${res.status}`);
    const { user_id } = await res.json();
    const next = { userId: user_id, epoch: 1, cursor: 0 };
    await saveUser({ sync: next });
    await initSync(db, me, saveUser, location.origin, onSyncApplied, onModel);
    if (!quiet) toast(`${me.name || "This person"} syncs now — make the recovery card: Settings → Backup & privacy`);
    return next;
  }

  /* Owner or Team (relay.js isOwner). The relay's answer on devices/self
   * is the truth; a board that isn't synced has no team, so this device
   * is its owner. Team keeps every edit — only managing people and
   * devices, the license and deletion are owners'. `me.owner` is kept in
   * memory for Settings (checklist), never saved. */
  let owner = true;
  function applyOwner(isOwner) {
    owner = isOwner;
    me.owner = isOwner;
    $("dev-choose").hidden = !isOwner;
    if (!isOwner) $("dev-delete-row").hidden = true;
    $("team-note").hidden = isOwner;
  }

  async function renderDevices() {
    const list = $("dev-list");
    const cfg = me.sync;
    // Anyone may buy or activate Pip Lifetime, synced or not: activating
    // turns the encrypted sync on, since the license lives on the relay.
    $("dev-lifetime-row").hidden = false;
    $("dev-delete-row").hidden = !cfg?.userId;
    if (!cfg?.userId) {
      renderEntitlement(null);
      applyOwner(true);
      list.innerHTML = '<p class="hint">Only on this device so far.</p>';
      return;
    }
    try {
      const store = openKeyStore();
      const identity = await getDeviceIdentity(store);
      const userKey = await getUserKey(store, me.id, cfg.epoch ?? 1);
      const client = relayClient({ userId: cfg.userId, baseUrl: relayBase, identity, userKey });
      const [{ devices }, self] = await Promise.all([client.listDevices(), client.selfKey()]);
      const isOwner = self?.owner !== false;
      list.innerHTML = "";
      for (const d of devices) {
        const row = document.createElement("div");
        row.className = "dev-row";
        const name = document.createElement("span");
        name.className = "dev-id";
        name.textContent = (d.device_id === identity.deviceId
          ? `${d.device_id} (this device)` : d.device_id)
          + (d.via_acct ? " — supporter device" : "");
        row.append(name);
        if (isOwner && d.device_id !== identity.deviceId) {
          const rm = document.createElement("button");
          rm.className = "btn secondary";
          rm.textContent = "Remove";
          rm.onclick = () => removeDeviceFlow(client, store, identity, d.device_id);
          row.append(rm);
        }
        list.append(row);
      }
      renderEntitlement(self);
      applyOwner(isOwner);
    } catch (err) {
      list.innerHTML = '<p class="hint">Relay unreachable — devices cannot be listed.</p>';
    }
  }

  /** Entitlement + pending-deletion state in the corner rows. selfKey is
   *  the relay's own answer — nothing here is a client guess. */
  function renderEntitlement(self) {
    const life = self?.entitlement === "lifetime";
    $("dev-lifetime").innerHTML = `<p class="hint">${
      life ? "Pip Lifetime — unlimited linked devices." : "Free — one linked device."}</p>`;
    $("dev-license-row").hidden = life;
    const state = $("dev-delete-state");
    if (self?.delete_at) {
      const when = new Date(self.delete_at).toLocaleDateString();
      state.innerHTML = `<p class="hint"><b>${me.name || "This person"} is scheduled for deletion on ${when}.</b></p>`;
      $("dev-delete").hidden = true;
      $("dev-undelete").hidden = false;
    } else {
      state.innerHTML = self?.idle_delete_at
        ? `<p class="hint"><b>Warning:</b> no linked device has synced in over two years. This user will be removed on ${new Date(self.idle_delete_at).toLocaleDateString()} unless a device syncs.</p>`
        : "";
      $("dev-delete").hidden = false;
      $("dev-undelete").hidden = true;
    }
  }

  /** Remove locks the door; rotating the user key means the removed
   *  device cannot read anything written after. */
  async function removeDeviceFlow(client, store, identity, targetId) {
    if (!confirm(`Remove ${targetId}? It keeps what it already saw.`)) return;
    const { devices } = await client.listDevices();
    await client.removeDevice(targetId);
    const remaining = devices.filter((d) => d.device_id !== targetId && d.dh_pub);
    const epoch = (me.sync?.epoch ?? 1) + 1;
    // Root-derived when this device holds the recovery root, so a card
    // printed before the removal still opens the new epoch.
    const key = await getUserKey(store, me.id, epoch);
    const wrapped = {};
    for (const d of remaining) wrapped[d.device_id] = await wrapUserKey(key, d.dh_pub);
    await client.rotateKeys(epoch, wrapped);
    await saveUser({ sync: { ...me.sync, epoch } });
    // The running sync client still seals under the old epoch until it
    // sees an incoming e2 op — tell it now so the next edit is sealed
    // under a key the removed device never received.
    await syncRekey(epoch);
    await renderDevices();
  }

  /** Users on this device (015 slice 2): the registry rendered in Parent
   *  corner — switch, name, pick who opens first, add. The active user's
   *  DB flushes before the tab reloads into the other user. */
  async function renderUsers() {
    const list = $("usr-list");
    const rows = await listUsers(userStore);
    const ks = openKeyStore();
    list.innerHTML = "";
    for (const u of rows) {
      const row = document.createElement("div");
      row.className = "dev-row";
      const name = document.createElement("span");
      name.className = "dev-id";
      // Locked (015 slice 4): the account brought this user but not its
      // keys — they arrive by an Allow on another device or a QR card.
      const locked = u.sync?.userId
        && !(await ks.get(`user/${u.id}/key_e${u.sync.epoch ?? 1}`));
      name.textContent = (u.id === me.id ? "● " : "")
        + (u.name || "Unnamed") + (u.home ? " — opens first" : "")
        + (locked ? " 🔒 needs an Allow or QR card" : "");
      row.append(name);
      if (u.id !== me.id && !locked) {
        const sw = document.createElement("button");
        sw.className = "btn secondary";
        sw.textContent = "Switch";
        sw.onclick = async () => {
          sessionStorage.setItem("pip_active_user", u.id);
          sessionStorage.setItem("pip_reopen_settings", "team");
          await flushDb();
          location.reload();
        };
        row.append(sw);
        // Remove from this device only — the user stays on the relay and
        // other devices. Warn when this device may hold the only copy.
        const rm = document.createElement("button");
        rm.className = "btn secondary";
        rm.textContent = "Remove";
        rm.onclick = async () => {
          const label = u.name || "this user";
          const warn = u.sync?.userId
            ? `Remove ${label} from this device? The user stays on the relay and its other devices.`
            : `Remove ${label} from this device? It is not linked anywhere — its words will be gone unless a QR card exists.`;
          if (!confirm(warn)) return;
          await removeUser(userStore, u.id);
          await renderUsers();
        };
        row.append(rm);
      }
      const edit = document.createElement("button");
      edit.className = "btn secondary";
      edit.textContent = "Name";
      edit.onclick = async () => {
        const n = prompt("Name this person", u.name || "");
        if (n === null) return;
        if (u.id === me.id) await saveUser({ name: n.trim() });
        else await putUser(userStore, { ...u, name: n.trim(), nameDirty: true });
        await renderUsers();
      };
      row.append(edit);
      // Which person opens first is Settings → "When Pip opens"
      // (people-ui.js), one control for one fact.
      list.append(row);
    }
  }

  $("usr-add").onclick = async () => {
    const name = prompt("Name this person", "") ?? "";
    const added = await addUser(userStore, { name: name.trim() });
    // 014 § 9 ruling 1: a new profile gets the setup question on first
    // open — "Who do they call for?" — so the family's people can sit
    // in home cells from day one.
    await putUser(userStore, { ...added, needsSetup: true });
    sessionStorage.setItem("pip_active_user", added.id);
    await flushDb();
    location.reload();
  };

  /* --- Supporter account (Sync § 12.3, 015 slice 4): email link +
   *  passkey. Lives in Parent Corner only — the child's board never
   *  asks for a sign-in. --- */
  function renderAccount() {
    // Supporters only (§ 12.3): a partner device or a device not yet
    // carrying a synced home user gets the sign-in row; the child's own
    // board device never does.
    const st = accountState();
    $("acct-row").hidden = !st
      && !!(me.home && me.sync?.userId && me.role !== "partner");
    $("acct-state").innerHTML = st
      ? `<p class="hint">Signed in as <b>${st.email}</b> — this device's users are on the account.</p>`
      : `<p class="hint">Not signed in.</p>`;
    $("acct-form").hidden = !!st;
    $("acct-danger").hidden = !st;
  }
  // 015 slice 7: deleting the account removes this account's access on
  // every user's relay, then the account — the users' boards, devices,
  // licenses and QR cards are untouched.
  $("acct-delete").onclick = async () => {
    const st = accountState();
    if (!st) return;
    if (!confirm(
      `Delete the account ${st.email}? Its sign-in and its supporter access end. ` +
      `The users you support keep everything — words, groups, devices, license, QR cards.`)) return;
    try {
      await deleteAccount(st.acct_id, st.session);
      saveAccountState(null);
      renderAccount();
      toast("Account deleted.");
    } catch (e) {
      toast(`Could not delete (${e.message})`);
    }
  };
  $("acct-send").onclick = async () => {
    const email = $("acct-email").value.trim();
    if (!email.includes("@")) return toast("Enter an email address first");
    try {
      await requestLink(email);
      toast("Link sent — open it on the device you want to sign in.");
    } catch (e) {
      toast(`Could not send the link (${e.message})`);
    }
  };

  /** The emailed link lands here: claim it, run the passkey ceremony,
   *  pull every supported user into the registry (keys unsealed by the
   *  passkey's PRF output), then share this device's own synced users
   *  back to the account. */
  async function accountLanding(token) {
    openPair("Supporter sign-in");
    const body = $("pair-body");
    const say = (t) => { body.innerHTML = `<p class="hint">${t}</p>`; };
    try {
      say("Checking the link…");
      const claim = await claimToken(token);
      let session, priv = null;
      if (claim.has_credentials) {
        say("Sign in with your passkey…");
        const r = await signInAccount({ acctId: claim.account_id,
          email: claim.email, linkChallenge: claim.challenge });
        session = r.session;
        priv = r.priv;
        say("Opening your users…");
        const imported = await importAccountUsers({
          bundle: r.bundle, priv, keyStore: openKeyStore(), userStore,
          putUserKey, addUser,
          // Keys alone don't pull ops — this device also registers on
          // each unlocked user's relay with a bundle join token.
          joinDevice: joinWithToken });
        const locked = imported.filter((u) => !u.unlocked).length;
        say(locked
          ? `${imported.length} user(s) added — ${locked} locked until an Allow or QR card brings their keys.`
          : `${imported.length} user(s) added.`);
      } else {
        say("Create your passkey…");
        const r = await registerAccount({
          acctId: claim.account_id, challenge: claim.challenge, email: claim.email });
        session = r.session;
        priv = r.priv;
        if (!r.prfOk) {
          say("Signed in — this passkey has no PRF, so keys arrive by an Allow or QR card.");
        } else {
          say("Signed in.");
        }
      }
      saveAccountState({ acct_id: claim.account_id, email: claim.email, session });
      // Share back: every synced user this device holds joins the account
      // — wrapped to the account public key, profile sealed to the user's
      // own key. The relay still reads nothing.
      const ks = openKeyStore();
      for (const u of await listUsers(userStore)) {
        if (!u.sync?.userId) continue;
        const epochs = [];
        for (let e = 1; e <= (u.sync.epoch ?? 1); e++) {
          if (await ks.get(`user/${u.id}/key_e${e}`)) epochs.push(e);
        }
        if (!epochs.length) continue;
        // Mint a small pool of join tokens so devices that sign in through
        // the account can register on this user's relay (§ 12.3).
        let joinTokens = [];
        try {
          const identity = await getDeviceIdentity(ks);
          const client = relayClient({ userId: u.id, baseUrl: relayBase,
            identity, userKey: await getUserKey(ks, u.id, u.sync.epoch ?? 1) });
          joinTokens = (await client.mintJoinTokens(4)).tokens ?? [];
        } catch { /* a device not yet on this relay mints nothing */ }
        await shareUserToAccount({
          acctId: claim.account_id, session, keyStore: ks, userId: u.id,
          epochs, name: u.name, photo: u.photo, getUserKey, joinTokens });
      }
      say("Done — your users are on this device.");
      await renderUsers();
      renderAccount();
      return { session, priv, acct_id: claim.account_id, email: claim.email };
    } catch (e) {
      say(`Sign-in failed — ${e.message}. Ask for a fresh link and try again.`);
      return null;
    }
  }

  /** This device joins a user's relay with a bundle join token — the
   *  shared step in account sign-in and invite acceptance. */
  async function joinWithToken(userId, token) {
    const identity = await getDeviceIdentity(openKeyStore());
    return joinDeviceWithToken(relayBase, userId, {
      token, device_id: identity.deviceId,
      pubkey: await exportPublicKey(identity.verify),
      dh_pub: await exportDhPublic(identity.dh.publicKey) });
  }

  // An emailed sign-in link: strip the query so a reload never replays,
  // then run the ceremony once boot is up.
  const signinToken = new URLSearchParams(location.search).get("signin");
  if (signinToken) {
    history.replaceState({}, "", location.pathname);
    accountLanding(signinToken).catch(() => {});
  }

  /* --- Supporters on this user (015 slice 5) ---
   * The owner invites by email; the invitee's link lands on ?invite=,
   * runs the normal sign-in, then waits. Nothing reaches the supporter
   * until a device that already has the user taps Allow — that tap
   * registers the account on the user's relay and grants wrapped keys.
   * Remove cascades on the relay, revokes the account-side grant, and
   * rotates the user key so post-removal ops stay sealed from them. */

  /** Everything a supporter account needs: every epoch key this device
   *  holds wrapped to their account public key, the sealed profile, and
   *  join tokens tagged so removing them cascades to future devices. */
  async function buildUserGrant(ks, u, toPub, forAcct) {
    const keys = [];
    for (let e = 1; e <= (u.sync?.epoch ?? 1); e++) {
      const key = await ks.get(`user/${u.id}/key_e${e}`);
      if (key) keys.push({ epoch: e, grant: await wrapUserKey(key, toPub) });
    }
    let joinTokens = [];
    try {
      const { client } = await userClient();
      joinTokens = (await client.mintJoinTokens(4, forAcct)).tokens ?? [];
    } catch { /* not on this relay yet — no tokens to mint */ }
    const epoch = u.sync?.epoch ?? 1;
    const sealed_profile = keys.length
      ? await sealBlob(await getUserKey(ks, u.id, epoch),
          te.encode(JSON.stringify({ name: u.name ?? "", photo: u.photo ?? null })),
          epoch)
      : null;
    return { keys, sealed_profile, join_tokens: joinTokens };
  }

  async function renderSupporters() {
    const cfg = me.sync;
    $("sup-row").hidden = !cfg?.userId;
    if (!cfg?.userId) return;
    const list = $("sup-list");
    const st = accountState();
    let supporters = [], invites = [], isOwner = owner, client = null;
    try {
      ({ client } = await userClient());
      ({ supporters } = await client.listSupporters());
      isOwner = (await client.selfKey())?.owner !== false;
    } catch { /* relay unreachable — invites may still render */ }
    // Team members see who's on the team; only owners invite and remove.
    $("sup-form").hidden = !st || !isOwner;
    if (st) {
      try {
        ({ invites } = await listInvites(st.acct_id, st.session));
      } catch { /* session expired */ }
    }
    invites = (invites ?? []).filter((i) => i.user_id === me.id
      && ["pending_claim", "pending_allow", "granted"].includes(i.status));
    list.innerHTML = "";
    // buttons: [[text, onClick], …] — none for a Team viewer.
    const mkRow = (label, buttons = []) => {
      const row = document.createElement("div");
      row.className = "dev-row";
      const name = document.createElement("span");
      name.className = "dev-id";
      name.textContent = label;
      row.append(name);
      for (const [text, onClick] of isOwner ? buttons : []) {
        const b = document.createElement("button");
        b.className = "btn secondary";
        b.textContent = text;
        b.onclick = onClick;
        row.append(b);
      }
      list.append(row);
    };
    const levelOf = (acct) => (supporters.find((s) => s.acct_id === acct)?.owner ? "owner" : "team");
    // Owners make someone else an owner (or back to team) with one tap.
    const ownerButton = (acct) => [levelOf(acct) === "owner" ? "Make team" : "Make owner", async () => {
      try {
        await client.setSupporterOwner(acct, levelOf(acct) !== "owner");
      } catch (e) {
        toast(e.status === 409 ? "Someone has to stay an owner." : `Couldn't change that: ${e.message}`);
      }
      await renderSupporters();
    }];
    const memberRow = (acct, email, token) => mkRow(
      `${email ?? acct} — ${levelOf(acct) === "owner" ? "owner" : "team, can edit everything"}`,
      [ownerButton(acct), ["Remove", () => removeSupporterFlow({ acct_id: acct, email, token })]]);
    for (const inv of invites) {
      if (inv.status === "granted") {
        memberRow(inv.to_acct, inv.email, inv.token);
      } else if (inv.status === "pending_allow") {
        mkRow(`${inv.email} — waiting for an owner's Allow`, [["Allow", () => allowInvite(inv)]]);
      } else {
        mkRow(`${inv.email} — invited`, [["Cancel", async () => {
          await declineInvite(inv.token, st.session).catch(() => {});
          await renderSupporters();
        }]]);
      }
    }
    // Relay supporters without a visible invite (e.g. shared from
    // another signed-in device) still list and still remove.
    for (const s of supporters) {
      if (invites.some((i) => i.status === "granted" && i.to_acct === s.acct_id)) continue;
      memberRow(s.acct_id, s.email);
    }
    if (!list.children.length) {
      list.innerHTML = '<p class="hint">No one else yet.</p>';
    }
  }

  /** Allow = register the supporter account on the relay, then hand it
   *  the wrapped keys + join tokens through the invite grant. */
  async function allowInvite(inv) {
    const st = accountState();
    if (!st) return;
    try {
      const { client } = await userClient();
      await client.addSupporter(inv.to_acct, inv.email);
      // to_acct_pub binds at claim; a late-registering invitee may have
      // claimed before its account pub existed — fetch it live.
      const toPub = inv.to_acct_pub ?? await accountPub(inv.to_acct);
      const grant = await buildUserGrant(openKeyStore(), me, toPub, inv.to_acct);
      await grantInvite(inv.token, st.session, grant);
      toast(`Allowed — ${inv.email} gets ${me.name || "this user"}.`);
      await renderSupporters();
    } catch (e) {
      toast(`Allow failed: ${e.message}`);
    }
  }

  /** Remove: relay cascade first (their devices + tokens die), then the
   *  account-side grant revoke, then rotate the user key so every op
   *  written after is sealed under an epoch they never received.
   *  Remaining devices and supporters get the new epoch re-wrapped. */
  async function removeSupporterFlow(sup) {
    const label = sup.email ?? "this supporter";
    if (!confirm(`Remove ${label}? They keep what they already saw — nothing new reaches them.`)) return;
    const st = accountState();
    try {
      const { client, store } = await userClient();
      await client.removeSupporter(sup.acct_id);
      if (sup.token && st) await revokeInvite(sup.token, st.session);
      const { devices } = await client.listDevices();
      const { supporters } = await client.listSupporters();
      const epoch = (me.sync?.epoch ?? 1) + 1;
      const key = await getUserKey(store, me.id, epoch);
      const wrapped = {};
      for (const d of devices) {
        if (d.dh_pub) wrapped[d.device_id] = await wrapUserKey(key, d.dh_pub);
      }
      await client.rotateKeys(epoch, wrapped);
      await saveUser({ sync: { ...me.sync, epoch } });
      await syncRekey(epoch); // running client seals under the new epoch now
      // Regrant remaining supporters so their next sign-in unwraps the
      // new epoch — their bundle rows replace wholesale.
      if (st) {
        const { invites } = await listInvites(st.acct_id, st.session)
          .catch(() => ({ invites: [] }));
        for (const s of supporters) {
          const inv = (invites ?? []).find((i) => i.to_acct === s.acct_id
            && i.status === "granted" && i.to_acct_pub);
          if (!inv) continue;
          const grant = await buildUserGrant(store, me, inv.to_acct_pub, s.acct_id);
          await grantInvite(inv.token, st.session, grant);
        }
      }
      toast(`Removed ${label} — this user re-keyed.`);
      await renderSupporters();
      await renderDevices();
    } catch (e) {
      toast(`Remove failed: ${e.message}`);
    }
  }

  $("sup-invite").onclick = async () => {
    const st = accountState();
    const email = $("sup-email").value.trim();
    if (!st) return toast("Sign in first — supporter invites go through your account.");
    if (!email.includes("@")) return toast("Enter the supporter's email first.");
    try {
      await ensureUser();
      await createInvite(st.acct_id, st.session, email, me.id);
      $("sup-email").value = "";
      toast(`Invite sent to ${email} — nothing syncs until you Allow it.`);
      await renderSupporters();
    } catch (e) {
      toast(`Invite failed: ${e.message}`);
    }
  };

  /** The invitee's side: the emailed link opens here, runs the normal
   *  account sign-in, claims the invite, then waits for the family's
   *  Allow — the grant arrives as a wrapped-keys bundle and imports
   *  exactly like an account user. */
  async function inviteLanding(token) {
    openPair("Supporter invite");
    const body = $("pair-body");
    const say = (t) => { body.innerHTML = `<p class="hint">${t}</p>`; };
    try {
      say("Opening the invite…");
      const { link_token } = await openInvite(token);
      const r = await accountLanding(link_token);
      if (!r) return;
      say("Signed in — waiting for the family to Allow this share…");
      await claimInvite(token, r.session);
      pairPoll = setInterval(async () => {
        try {
          const st = await inviteStatus(token, r.session);
          if (st.status === "granted" && st.grant) {
            clearInterval(pairPoll);
            pairPoll = null;
            say("Allowed — bringing the user over…");
            await importAccountUsers({
              bundle: { users: [st.grant] }, priv: r.priv,
              keyStore: openKeyStore(), userStore, putUserKey, addUser,
              joinDevice: joinWithToken });
            say("Done — the user is on this device.");
            await renderUsers();
          } else if (st.status === "declined" || st.status === "revoked") {
            clearInterval(pairPoll);
            pairPoll = null;
            say("The family did not approve this share.");
          }
        } catch { /* relay hiccup — poll again */ }
      }, 2500);
    } catch (e) {
      say(`Invite failed — ${e.message}.`);
    }
  }

  const inviteToken = new URLSearchParams(location.search).get("invite");
  if (inviteToken) {
    history.replaceState({}, "", location.pathname);
    inviteLanding(inviteToken).catch(() => {});
  }

  /** This device is the NEW device: post keys, show code + QR, poll. */
  async function linkThisDevice() {
    const store = openKeyStore();
    const identity = await getDeviceIdentity(store);
    const { pair } = await pairClient(relayBase).request(
      identity.deviceId,
      await exportPublicKey(identity.verify),
      await exportDhPublic(identity.dh.publicKey),
    );
    openPair("Link this device");
    const code = document.createElement("div");
    code.className = "pair-code";
    code.textContent = pair;
    pairBody.append(code);
    const qr = document.createElement("div");
    qr.className = "pair-qr";
    const q = qrcode(0, "M");
    q.addData(JSON.stringify({ pair }));
    q.make();
    qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
    pairBody.append(qr);
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "On the other device: Settings → Team & devices → Add a device → type this code → Allow.";
    pairBody.append(hint);
    const status = document.createElement("p");
    status.className = "hint";
    status.textContent = "Waiting for Allow…";
    pairBody.append(status);

    pairPoll = setInterval(async () => {
      try {
        const st = await pairClient(relayBase).status(pair);
        if (st.status === "refused") {
          clearInterval(pairPoll);
          pairPoll = null;
          status.textContent = st.grant?.refused ?? "The other device declined.";
          return;
        }
        if (st.status !== "granted") return;
        clearInterval(pairPoll);
        pairPoll = null;
        const key = await unwrapUserKey(identity.dh.privateKey, st.grant);
        // The granter wrapped its CURRENT-epoch key — the grant carries
        // which one; storing it as e1 would break post-rotation ops.
        const epoch = st.grant.epoch ?? 1;
        await putUserKey(store, st.grant.user_id, key, epoch);
        // 015 slice 2: the linked user joins this device's registry — the
        // relay id is the registry id — and the app opens it. A user that
        // joins by link is the partner device (013 § 5a: the coach view
        // renders only for role 'partner').
        const linked = await addUser(userStore, {
          id: st.grant.user_id,
          sync: { userId: st.grant.user_id, epoch, cursor: 0 },
          role: "partner",
        });
        status.textContent = "Linked — syncing…";
        sessionStorage.setItem("pip_active_user", linked.id);
        await flushDb();
        location.reload();
      } catch { /* expired or relay hiccup — poll again */ }
    }, 2000);
  }

  /** Signed relay client for this user — shared by device management,
   *  entitlement, and deletion calls. */
  async function userClient() {
    const cfg = me.sync;
    if (!cfg?.userId) throw new Error("no linked user");
    const store = openKeyStore();
    const identity = await getDeviceIdentity(store);
    const userKey = await getUserKey(store, me.id, cfg.epoch ?? 1);
    return { client: relayClient({ userId: cfg.userId, baseUrl: relayBase, identity, userKey }),
      store, identity, userKey };
  }

  /** This device is the LINKED device: type the code the new one shows. */
  async function addDeviceFlow() {
    await ensureUser();
    openPair("Add a device");
    pairBody.innerHTML = `
      <p class="hint">Type the 8-letter code the new device is showing.</p>
      <input type="text" id="pair-code" maxlength="8" autocomplete="off"
        style="text-transform:uppercase; letter-spacing:4px; font-size:22px; text-align:center;" />`;
    const input = pairBody.querySelector("#pair-code");
    input.focus();
    let pending = null;
    input.addEventListener("input", async () => {
      const code = input.value.trim().toUpperCase();
      if (code.length !== 8) return;
      try {
        const req = await pairClient(relayBase).status(code);
        // A reopened form rebuilds pair-body and detaches this input — a
        // late status() reply must not revive Allow on the new form's
        // empty pending.
        if (!input.isConnected) return;
        pending = { code, req };
        pairBody.querySelector(".hint").textContent =
          `Allow ${req.device_id.slice(0, 12)}… to edit this user?`;
        pairGo.hidden = false;
        pairGo.textContent = "Allow";
      } catch {
        pairBody.querySelector(".hint").textContent = "That code is not open — check it and retry.";
      }
    });
    pairGo.onclick = async () => {
      if (!pending) return;
      const { client, identity, userKey } = await userClient();
      const wrapped = await wrapUserKey(userKey, pending.req.dh_pub);
      try {
        await client.addDevice(pending.req.device_id, pending.req.sig_pub, { dh_pub: pending.req.dh_pub });
      } catch (e) {
        // The relay refused — a free user allows one linked device. The
        // new device gets a real answer, not a silent timeout.
        const msg = e.message === "upgrade_required"
          ? "A free user allows one linked device. Pip Lifetime unlocks more."
          : `The relay refused: ${e.message}`;
        pairBody.querySelector(".hint").textContent = msg;
        await pairClient(relayBase).grant(pending.code, { refused: msg });
        return;
      }
      await pairClient(relayBase).grant(pending.code, {
        user_id: me.sync.userId, by_device: identity.deviceId,
        epoch: me.sync.epoch ?? 1, ...wrapped });
      closePair();
      await renderDevices();
    };
  }

  $("dev-link").onclick = () => linkThisDevice().catch((e) => {
    openPair("Link this device");
    pairBody.innerHTML = `<p class="hint">Could not reach the relay: ${e.message}</p>`;
  });
  $("dev-add").onclick = () => addDeviceFlow().catch((e) => {
    openPair("Add a device");
    pairBody.innerHTML = `<p class="hint">Could not reach the relay: ${e.message}</p>`;
  });
  $("corner").addEventListener("click", renderDevices);
  $("corner").addEventListener("click", renderUsers);
  $("corner").addEventListener("click", renderAccount);
  $("corner").addEventListener("click", renderSupporters);

  /* Pip Lifetime (dev path, 011/9): a minted license activates on the
   * relay — the client only transports it. Payments wire into the same
   * seam later. The license belongs to the user, so anyone on the team
   * may activate it (founder 2026-10-02: the SLP sets the board up, the
   * parent buys). An unsynced board starts syncing first. */
  async function activateLicense(key, { quiet = false } = {}) {
    // The license needs the relay user, not a finished first push: if
    // the user was created but the first sync flush failed, go on.
    await ensureUser({ quiet }).catch((e) => { if (!me.sync?.userId) throw e; });
    const { client, store } = await userClient();
    await client.setEntitlement(key);
    // 024: the sentence-voice endpoint wants the license on every
    // request — the relay keeps the status, the device keeps a copy.
    await store.put(`user/${me.id}/license`, key);
    await renderDevices();
  }

  $("dev-activate").onclick = async () => {
    const key = $("dev-license").value.trim();
    if (!key) return;
    try {
      await activateLicense(key);
      $("dev-license").value = "";
    } catch (e) {
      $("dev-lifetime").innerHTML =
        `<p class="hint">That key did not verify for this user.</p>`;
    }
  };

  /* User deletion (§ 11): confirm → the relay schedules deletion in 30
   * days; Undo cancels. The device keeps its own copy either way. */
  $("dev-delete").onclick = () => {
    openPair("Delete this user?");
    pairBody.innerHTML = `<p class="hint">The user and its backups will be
      deleted from the relay in 30 days. Any linked device can undo it
      before then. This device keeps its local copy.</p>`;
    pairGo.hidden = false;
    pairGo.textContent = "Delete";
    pairGo.onclick = async () => {
      try {
        const { client } = await userClient();
        const { delete_at } = await client.deleteUser();
        closePair();
        toast(`User scheduled for deletion on ${new Date(delete_at).toLocaleDateString()}`);
        await renderDevices();
      } catch (e) {
        pairBody.querySelector(".hint").textContent = `Could not reach the relay: ${e.message}`;
      }
    };
  };
  $("dev-undelete").onclick = async () => {
    try {
      const { client } = await userClient();
      await client.undeleteUser();
      toast("Deletion cancelled — this user stays.");
      await renderDevices();
    } catch (e) {
      toast(`Could not reach the relay: ${e.message}`);
    }
  };

  return { userClient, renderAccount, renderUsers, ensureUser, activateLicense };
}
