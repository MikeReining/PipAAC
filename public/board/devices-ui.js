/**
 * Parent Corner devices: pairing, the users on this device, entitlement,
 * and supporter sign-in. The child's board never asks for an account.
 */
import {
  ensureRecoveryRoot, exportDhPublic, exportPublicKey, getDeviceIdentity,
  getUserKey, openKeyStore, putUserKey, unwrapUserKey, wrapUserKey,
} from "../shared/sync_crypto.mjs";
import { recoveryProof } from "../shared/recovery.mjs";
import { joinDeviceWithToken, pairClient, relayClient } from "../shared/sync_client.mjs";
import {
  accountState, claimToken, importAccountUsers, registerAccount,
  requestLink, saveAccountState, shareUserToAccount, signInAccount,
} from "../shared/account.mjs";
import { addUser, listUsers, putUser, removeUser, setHome } from "../shared/users.mjs";

const $ = (id) => document.getElementById(id);

export function mountDevices({
  db, me, saveUser, userStore, flushDb, toast,
  initSync, onSyncApplied, onModel, qrcode,
}) {
  /* ------------------------------------------------------------------ *
   * Linked devices + pairing (sync § 3). The new device shows an 8-char
   * code (and QR); a linked device types or scans it, taps Allow, and the
   * user key travels wrapped to the new device's dh key through the
   * pairing lobby — the relay never sees it.
   * ------------------------------------------------------------------ */

  const relayBase = location.origin;
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
  async function ensureUser() {
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
    toast("This user syncs now — print or save the QR card: Parent corner → Backup");
    return next;
  }

  async function renderDevices() {
    const list = $("dev-list");
    const cfg = me.sync;
    $("dev-lifetime-row").hidden = !cfg?.userId;
    $("dev-delete-row").hidden = !cfg?.userId;
    if (!cfg?.userId) {
      list.innerHTML = '<p class="hint">This user is only on this device.</p>';
      return;
    }
    try {
      const store = openKeyStore();
      const identity = await getDeviceIdentity(store);
      const userKey = await getUserKey(store, me.id, cfg.epoch ?? 1);
      const client = relayClient({ userId: cfg.userId, baseUrl: relayBase, identity, userKey });
      const [{ devices }, self] = await Promise.all([client.listDevices(), client.selfKey()]);
      list.innerHTML = "";
      for (const d of devices) {
        const row = document.createElement("div");
        row.className = "dev-row";
        const name = document.createElement("span");
        name.className = "dev-id";
        name.textContent = d.device_id === identity.deviceId
          ? `${d.device_id} (this device)` : d.device_id;
        row.append(name);
        if (d.device_id !== identity.deviceId) {
          const rm = document.createElement("button");
          rm.className = "btn secondary";
          rm.textContent = "Remove";
          rm.onclick = () => removeDeviceFlow(client, store, identity, d.device_id);
          row.append(rm);
        }
        list.append(row);
      }
      renderEntitlement(self);
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
      state.innerHTML = `<p class="hint"><b>This user is scheduled for deletion on ${when}.</b></p>`;
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
        + (u.name || "This user") + (u.home ? " — opens first" : "")
        + (locked ? " 🔒 needs an Allow or QR card" : "");
      row.append(name);
      if (u.id !== me.id && !locked) {
        const sw = document.createElement("button");
        sw.className = "btn secondary";
        sw.textContent = "Switch";
        sw.onclick = async () => {
          sessionStorage.setItem("pip_active_user", u.id);
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
        const n = prompt("Name this user", u.name || "");
        if (n === null) return;
        if (u.id === me.id) await saveUser({ name: n.trim() });
        else await putUser(userStore, { ...u, name: n.trim() });
        await renderUsers();
      };
      row.append(edit);
      if (!u.home) {
        const home = document.createElement("button");
        home.className = "btn secondary";
        home.textContent = "Opens first";
        home.onclick = async () => {
          await setHome(userStore, u.id);
          if (u.id === me.id) me.home = true;
          await renderUsers();
          renderAccount(); // the sign-in row hides on the child's device
        };
        row.append(home);
      }
      list.append(row);
    }
  }

  $("usr-add").onclick = async () => {
    const name = prompt("Name this user", "") ?? "";
    const added = await addUser(userStore, { name: name.trim() });
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
  }
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
          joinDevice: async (userId, token) => {
            const identity = await getDeviceIdentity(openKeyStore());
            return joinDeviceWithToken(relayBase, userId, {
              token, device_id: identity.deviceId,
              pubkey: await exportPublicKey(identity.verify),
              dh_pub: await exportDhPublic(identity.dh.publicKey) });
          } });
        const locked = imported.filter((u) => !u.unlocked).length;
        say(locked
          ? `${imported.length} user(s) added — ${locked} locked until an Allow or QR card brings their keys.`
          : `${imported.length} user(s) added.`);
      } else {
        say("Create your passkey…");
        const r = await registerAccount({
          acctId: claim.account_id, challenge: claim.challenge, email: claim.email });
        session = r.session;
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
    } catch (e) {
      say(`Sign-in failed — ${e.message}. Ask for a fresh link and try again.`);
    }
  }

  // An emailed sign-in link: strip the query so a reload never replays,
  // then run the ceremony once boot is up.
  const signinToken = new URLSearchParams(location.search).get("signin");
  if (signinToken) {
    history.replaceState({}, "", location.pathname);
    accountLanding(signinToken).catch(() => {});
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
    hint.textContent = "On the other device: Parent corner → Add a device → type this code → Allow.";
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

  /* Pip Lifetime (dev path, 011/9): a minted license activates on the
   * relay — the client only transports it. Payments wire into the same
   * seam later. */
  $("dev-activate").onclick = async () => {
    const key = $("dev-license").value.trim();
    if (!key) return;
    try {
      const { client } = await userClient();
      await client.setEntitlement(key);
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

  return { userClient, renderAccount };
}
