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
  listInvites, openInvite, redeemLicense, registerAccount, requestLink,
  revokeInvite, saveAccountState, shareUserToAccount, signInAccount,
} from "../shared/account.mjs";
import { addUser, listUsers, removeUser } from "../shared/users.mjs";
import { supporterNames } from "../shared/team_names.mjs";

const $ = (id) => document.getElementById(id);

/** What a person calls this device — "iPad · Safari", "Mac · Chrome".
 *  iPadOS Safari reports itself as a Mac; touch gives it away. */
export function deviceName(nav = globalThis.navigator) {
  const ua = nav?.userAgent ?? "";
  const touch = (nav?.maxTouchPoints ?? 0) > 1;
  const kind = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch) ? "iPad"
    : /iPhone/.test(ua) ? "iPhone"
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet")
    : /CrOS/.test(ua) ? "Chromebook"
    : /Macintosh/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows PC"
    : /Linux/.test(ua) ? "Linux computer" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /Firefox|FxiOS/.test(ua) ? "Firefox"
    : /Chrome|CriOS/.test(ua) ? "Chrome"
    : /Safari/.test(ua) ? "Safari" : "";
  return browser ? `${kind} · ${browser}` : kind;
}

/** A typed or scanned code: letters and digits only, upper case. */
const cleanCode = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const showCode = (c) => `${c.slice(0, 4)} ${c.slice(4)}`;

export function mountDevices({
  db, me, saveUser, userStore, flushDb, toast,
  initSync, onSyncApplied, onModel, qrcode, settings,
  // Re-seals the running sync client after a key rotation (015 s5) —
  // injected so this module stays free of the sqlite-backed db graph.
  syncRekey = async () => null,
  // People on this device lives in people-ui.js; repaint it after changes.
  renderUsers = async () => {},
}) {
  /* ------------------------------------------------------------------ *
   * Linked devices + pairing (sync § 3). The device that already has the
   * person shows an 8-char code (and QR / link); the new device types
   * it, and the user key travels wrapped to the new device's dh key
   * through the pairing lobby — the relay never sees it.
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
    pairOverlay.classList.remove("over-welcome");
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
        label: deviceName(),
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
    $("dev-add").hidden = !isOwner;
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
        const mine = d.device_id === identity.deviceId;
        // Rows from before device names carry none: this device names
        // itself now; the others read "A device" until they open Pip.
        if (mine && !d.label) client.setLabel(deviceName()).catch(() => {});
        const row = document.createElement("div");
        row.className = "dev-row";
        const name = document.createElement("span");
        name.className = "dev-id";
        const added = d.added_at
          ? new Date(d.added_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
        name.textContent = (mine ? `${d.label || deviceName()} (this one)` : d.label || "A device")
          + (d.via_acct ? " — team member" : "")
          + (added ? ` · added ${added}` : "");
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
      // A purchase or redeemed code lands lifetime worker-side — pick
      // the license copy up so voice calls can present it (024).
      if (self?.entitlement === "lifetime"
          && !(await store.get(`user/${me.id}/license`))) {
        await claimLicense(client, store, { quiet: true }).catch(() => {});
      }
    } catch (err) {
      list.innerHTML = '<p class="hint">Relay unreachable — devices cannot be listed.</p>';
    }
  }

  /** The relay is the truth: when it says lifetime, hand the device its
   *  license copy (the pip-life-* token voice calls present). Returns
   *  the token, or null while the grant hasn't landed. */
  async function claimLicense(client, store, { quiet = false } = {}) {
    const { entitlement, license } = await client.entitlement();
    if (entitlement !== "lifetime" || !license) return null;
    await store.put(`user/${me.id}/license`, license);
    if (!quiet) toast(`Pip Lifetime is on for ${me.name || "this person"}.`);
    return license;
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

  $("usr-add").onclick = async () => {
    const name = prompt("Name this person", "");
    if (name === null) return; // Cancel adds no one
    const added = await addUser(userStore, { name: name.trim() });
    // 041 B5: the welcome is the first-family flow — an added person
    // lands on their board. People-and-places stays on the Overview
    // checklist (Settings) instead of a forced first-open question.
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
    $("my-name-row").hidden = $("acct-row").hidden; // supporters only
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
    const names = supporterNames(db); // each supporter's own name, synced
    const memberRow = (acct, email, token) => mkRow(
      `${names.get(acct) ?? email ?? acct} — ${levelOf(acct) === "owner" ? "owner" : "team, can edit everything"}`,
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

  /** This device is the NEW device: type the code the other device
   *  shows, then wait for it to hand over the key. Reachable from the
   *  welcome, from Team & devices, and from app.pipaac.org/join#CODE. */
  async function joinFlow(prefill = "") {
    // The welcome is its own top layer; the sheet sits above it at the
    // body's level (#app is a stacking context under the welcome).
    if (me.needsSetup || document.querySelector(".welcome")) {
      document.body.append(pairOverlay);
      pairOverlay.classList.add("over-welcome");
    }
    openPair("Join with a code");
    pairBody.innerHTML = `
      <p class="hint">On the device that already has the board, open
        <b>Settings → Team &amp; devices → Add a device</b>. Type the code it shows.</p>
      <input type="text" id="pair-code" maxlength="9" autocomplete="off" autocapitalize="characters"
        spellcheck="false" aria-label="Code"
        style="width:100%; box-sizing:border-box; text-transform:uppercase; letter-spacing:4px; font-size:24px; text-align:center;" />
      <p class="hint" id="pair-status" role="status"></p>`;
    const input = pairBody.querySelector("#pair-code");
    const status = pairBody.querySelector("#pair-status");
    let busy = false;
    const tryCode = async () => {
      const code = cleanCode(input.value);
      if (code.length !== 8 || busy) return;
      busy = true;
      status.textContent = "Connecting…";
      try {
        const store = openKeyStore();
        const identity = await getDeviceIdentity(store);
        await pairClient(relayBase).claim(code, {
          device_id: identity.deviceId,
          sig_pub: await exportPublicKey(identity.verify),
          dh_pub: await exportDhPublic(identity.dh.publicKey),
          label: deviceName(),
        });
        if (!input.isConnected) return;
        input.disabled = true;
        status.textContent = "Connected — finishing on the other device…";
        waitForGrant(code, identity, store, status);
      } catch (e) {
        busy = false;
        status.textContent = e.status === 410
          ? "That code ran out. Make a new one on the other device."
          : e.status === 409
            ? "That code was already used. Make a new one on the other device."
            : e.status === 404
              ? "That code isn't open — check the letters, or make a new one."
              : `Could not reach Pip: ${e.message}`;
      }
    };
    input.addEventListener("input", tryCode);
    input.value = prefill ? showCode(cleanCode(prefill)) : "";
    if (prefill) tryCode(); else input.focus();
  }

  function waitForGrant(code, identity, store, status) {
    pairPoll = setInterval(async () => {
      try {
        const st = await pairClient(relayBase).status(code);
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
        // A fresh device's untouched welcome person is a placeholder —
        // the joined person replaces it instead of sitting beside it.
        const fresh = me.needsSetup && me.id !== st.grant.user_id;
        if (fresh) await removeUser(userStore, me.id);
        // 015 slice 2: the linked user joins this device's registry — the
        // relay id is the registry id — and the app opens it. A user that
        // joins by link is the partner device (013 § 5a: the coach view
        // renders only for role 'partner').
        const linked = await addUser(userStore, {
          id: st.grant.user_id,
          sync: { userId: st.grant.user_id, epoch, cursor: 0 },
          role: "partner",
          home: fresh,
        });
        status.textContent = "Joined — opening the board…";
        sessionStorage.setItem("pip_active_user", linked.id);
        // Flushing would write the removed placeholder's database back.
        if (!fresh) await flushDb();
        location.replace("/");
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

  /** This device HAS the person: show a code (and QR / link) for the
   *  new device, then hand it the key the moment it claims the code. */
  async function offerFlow() {
    await ensureUser();
    const { client, identity, userKey } = await userClient();
    const who = me.name || "this board";
    // The relay's own answer decides the free limit (one device); the
    // sheet asks first so nobody types a code only to be refused.
    const [{ devices }, self] = await Promise.all([client.listDevices(), client.selfKey()]);
    if (self?.entitlement !== "lifetime" && devices.length >= 1) {
      openPair("Add a device");
      const why = document.createElement("p");
      why.className = "hint";
      why.textContent = `Free Pip lives on one device. Pip Lifetime puts ${who} on every phone, laptop, and tablet you use.`;
      pairBody.append(why);
      const door = document.createElement("button");
      door.className = "btn";
      door.textContent = "See Pip Lifetime · $49";
      door.onclick = () => { closePair(); settings?.show?.("lifetime", { focus: true }); };
      pairBody.append(door);
      return;
    }
    const { pair } = await pairClient(relayBase).offer();
    const link = `${location.origin}/join#${pair}`;
    openPair(`Open ${who} on another device`);
    pairBody.innerHTML = `
      <p class="hint">On the other device, go to <b>${location.host}/join</b>
        and type this code. On a phone, just point the camera at the square.</p>`;
    const code = document.createElement("div");
    code.className = "pair-code";
    code.textContent = showCode(pair);
    const qr = document.createElement("div");
    qr.className = "pair-qr";
    const q = qrcode(0, "M");
    q.addData(link);
    q.make();
    qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
    const send = document.createElement("button");
    send.className = "btn secondary";
    send.textContent = "Send the link instead";
    send.onclick = async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: `Open ${who} in Pip`, url: link });
        } else {
          await navigator.clipboard.writeText(link);
          toast("Link copied — paste it in a text or email. It works for 10 minutes.");
        }
      } catch { /* share sheet dismissed */ }
    };
    const status = document.createElement("p");
    status.className = "hint";
    status.setAttribute("role", "status");
    status.textContent = "Waiting for the other device… This code works for 10 minutes.";
    pairBody.append(code, qr, send, status);

    let granting = false;
    pairPoll = setInterval(async () => {
      if (granting) return;
      let st;
      try {
        st = await pairClient(relayBase).status(pair);
      } catch (e) {
        if (e.status === 410) {
          clearInterval(pairPoll);
          pairPoll = null;
          status.textContent = "This code ran out.";
          send.hidden = true;
          pairGo.hidden = false;
          pairGo.textContent = "New code";
          pairGo.onclick = () => offerFlow().catch(() => {});
        }
        return; // relay hiccup — poll again
      }
      if (st.status !== "claimed") return;
      granting = true;
      clearInterval(pairPoll);
      pairPoll = null;
      const name = st.label || "the other device";
      try {
        await client.addDevice(st.device_id, st.sig_pub, { dh_pub: st.dh_pub, label: st.label });
      } catch (e) {
        // The relay refused — tell the new device too, not a silent wait.
        const msg = e.message === "upgrade_required"
          ? "Pip Lifetime is needed for more than one device."
          : `Pip refused the device: ${e.message}`;
        status.textContent = msg;
        await pairClient(relayBase).grant(pair, { refused: msg }).catch(() => {});
        return;
      }
      const wrapped = await wrapUserKey(userKey, st.dh_pub);
      await pairClient(relayBase).grant(pair, {
        user_id: me.sync.userId, by_device: identity.deviceId,
        epoch: me.sync.epoch ?? 1, ...wrapped });
      const done = document.createElement("p");
      done.className = "pair-done";
      done.textContent = `✓ ${who} is on ${name}.`;
      pairBody.replaceChildren(done);
      await renderDevices();
    }, 2000);
  }

  $("dev-add").onclick = () => offerFlow().catch((e) => {
    openPair("Add a device");
    pairBody.innerHTML = `<p class="hint">Could not reach Pip: ${e.message}</p>`;
  });
  const join = (code) => joinFlow(code).catch((e) => {
    openPair("Join with a code");
    pairBody.innerHTML = `<p class="hint">Could not reach Pip: ${e.message}</p>`;
  });
  $("usr-join").onclick = () => join();
  // app.pipaac.org/join#CODE — the QR, the sent link, or a typed address.
  if (location.pathname === "/join") {
    const code = location.hash.slice(1);
    history.replaceState(null, "", "/");
    join(code);
  }
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
    localStorage.removeItem(`pip-unlicensed:${me.id}`); // ends the 040 preview flag
    await renderDevices();
  }

  // One field, two shapes (015 slice 6): a pip-life-* key activates
  // straight on the relay; a PIP-XXXX-… code redeems worker-side —
  // then the license copy comes back from the same relay read.
  $("dev-activate").onclick = async () => {
    const key = $("dev-license").value.trim();
    if (!key) return;
    try {
      if (key.startsWith("pip-life-")) {
        await activateLicense(key);
      } else {
        await ensureUser({ quiet: true }).catch((e) => { if (!me.sync?.userId) throw e; });
        await redeemLicense(me.id, key);
        const { client, store } = await userClient();
        await claimLicense(client, store, { quiet: true });
      }
      $("dev-license").value = "";
      await renderDevices();
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

  /** After Stripe Checkout returns (?purchased=), poll the relay for
   *  the license copy — the webhook usually lands within a second. */
  async function claimPurchasedLicense() {
    if (!me.sync?.userId) return null;
    const { client, store } = await userClient();
    return claimLicense(client, store);
  }

  return { userClient, renderAccount, renderUsers, ensureUser, activateLicense,
    claimPurchasedLicense, join };
}
