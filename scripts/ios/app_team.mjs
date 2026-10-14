/**
 * Team, devices and deletion (phase 044 F2) - PIPCORE.team. The web's
 * Team & devices / Backup & privacy / Your account actions from
 * public/board/devices-ui.js, minus the DOM.
 *
 * The protocol is the shared modules': rotation.mjs (completeRemovalRotation,
 * resumeSupporterRegrant), account.mjs (createInvite, listInvites,
 * grantInvite, declineInvite, revokeInvite, accountPub, deleteAccount),
 * sync_client.mjs (relayClient), team_names.mjs. They run UNCHANGED in the
 * core over the host shims. What the web keeps inside the mountDevices
 * closure is mirrored here (devices-ui.js line ranges):
 *
 *   renderDevices      L161-211   device list, owner/team, plan line
 *   renderEntitlement  L264-286   plan line, deletion state text
 *   rotateAfterRemoval L294-296   completeRemovalRotation(...)
 *   removeDeviceFlow   L300-305   remove, then rotate
 *   renderAccount      L322-335   signed-in line, delete-account row
 *   acct-delete        L339-353   delete the account
 *   buildUserGrant     L473-491   wrapped keys + sealed profile + join tokens
 *   renderSupporters   L493-567   team rows, Allow / Make owner / Cancel
 *   allowInvite        L571-587   Allow
 *   regrantOps         L593-598   setSyncAccountOps(...) - the drain the
 *                                 sync loop runs on every recovery
 *   removeSupporterFlow L606-622  remove, revoke, rotate, regrant
 *   sup-invite         L624-638   invite by email
 *   dev-delete/undelete L1016-1044 schedule / cancel cloud deletion
 *   team-name-ui.js    mountMyName   "Your name"
 *
 * Key rule (C2): key bytes never enter JS - keys are host handles.
 * Results leave as host events (a JSC caller cannot await):
 *   "team.state"  the complete render model (see `build`)
 *   "team.toast"  { text }               the web's toast, verbatim
 *   "team.account" { email | null }      the signed-in line changed
 * Every action ends with a fresh "team.state".
 */
import {
  getDeviceIdentity, getUserKey, openKeyStore, sealBlob, wrapUserKey,
} from "./host/sync_crypto_host.mjs";
import { relayClient } from "../../public/shared/sync_client.mjs";
import {
  completeRemovalRotation, regrantJournalName, resumeSupporterRegrant,
} from "../../public/shared/rotation.mjs";
import { setSyncAccountOps, syncRekey } from "../../public/shared/sync.mjs";
import {
  accountPub, createInvite, declineInvite, deleteAccount as deleteAccountOnRelay,
  grantInvite, listInvites, revokeInvite,
} from "../../public/shared/account.mjs";
import { setSupporterName, supporterNames } from "../../public/shared/team_names.mjs";
import { hostCall } from "./jsc_shims.mjs";
import { appDb } from "./app.mjs";
import { ensureRelayUser } from "./app_pair.mjs";

const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);
const emit = (name, payload) => globalThis.__pipHost.emit(name, JSON.stringify(payload));
const toast = (text) => emit("team.toast", { text });
const te = new TextEncoder();

const STATE_NAME = "account/state"; // app_account.mjs: { acct_id, email, session }
const MY_NAME = "account/my_name";  // devices-ui "pip_my_name": device-only

/** The relay the sync loop talks to; the regrant drain runs inside it. */
let relayBase = null;
export const noteBase = (b) => { if (b) relayBase = b; };

/** account.mjs accountState(), over the keychain. */
export const accountState = async () => (await openKeyStore().get(STATE_NAME)) ?? null;

/** The web's saveUser: patch the registry row (Swift) and keep `me` current. */
const saverFor = (me) => async (patch) => {
  if (patch?.sync) me.sync = patch.sync;
  Object.assign(me, patch);
  await hostCall("saveUser", { userId: me.id, patch });
};

/** devices-ui.js userClient: signed relay client for this user. */
async function userClient(baseUrl, me) {
  const cfg = me.sync;
  if (!cfg?.userId) throw new Error("no linked user");
  const store = openKeyStore();
  const identity = await getDeviceIdentity(store);
  const userKey = await getUserKey(store, me.id, cfg.epoch ?? 1);
  return { client: relayClient({ userId: cfg.userId, baseUrl, identity, userKey }),
    store, identity, userKey };
}

/** devices-ui.js buildUserGrant: every epoch key this device holds wrapped
 *  to the supporter's account public key, the sealed profile, and join
 *  tokens tagged so removing them cascades to future devices. */
export async function buildUserGrant(ks, u, toPub, forAcct) {
  const keys = [];
  for (let e = 1; e <= (u.sync?.epoch ?? 1); e++) {
    const key = await ks.get(`user/${u.id}/key_e${e}`);
    if (key) keys.push({ epoch: e, grant: await wrapUserKey(key, toPub) });
  }
  let joinTokens = [];
  try {
    const { client } = await userClient(relayBase, u);
    joinTokens = (await client.mintJoinTokens(4, forAcct)).tokens ?? [];
  } catch { /* not on this relay yet - no tokens to mint */ }
  const epoch = u.sync?.epoch ?? 1;
  const sealed_profile = keys.length
    ? await sealBlob(await getUserKey(ks, u.id, epoch),
        te.encode(JSON.stringify({ name: u.name ?? "", photo: u.photo ?? null })), epoch)
    : null;
  return { keys, sealed_profile, join_tokens: joinTokens };
}

/** devices-ui.js regrantOps + setSyncAccountOps: the durable regrant drain
 *  needs the account verbs (session, invites, grant rewrites, bundle
 *  building). Registered once at core load so it outlives whichever pass
 *  raised the obligation - the sync loop calls it on every recovery. */
export const regrantOps = async () => {
  const st = await accountState();
  return st ? { acctId: st.acct_id, session: st.session,
    listInvites, grantInvite, buildUserGrant } : null;
};
setSyncAccountOps(regrantOps);

/* ---------------- the render model ---------------- */

const personWord = (me) => (me.name ?? "").trim() || "this person";

/** devices-ui.js renderEntitlement's deletion text. */
function deleteState(me, self) {
  const who = (me.name ?? "").trim() || "This person";
  if (self?.delete_at) {
    return { scheduled: true, at: self.delete_at,
      text: `${who} is scheduled for deletion on ${new Date(self.delete_at).toLocaleDateString()}.`,
      warning: null };
  }
  return { scheduled: false, at: null, text: "",
    warning: self?.idle_delete_at
      ? `Warning: no linked device has synced in over two years. This user will be removed on ${new Date(self.idle_delete_at).toLocaleDateString()} unless a device syncs.`
      : null };
}

/**
 * The whole Team & devices / Backup (delete) / Your account (delete,
 * name) model for one person.
 *   linked          this person has a relay user
 *   owner           the relay's answer (devices/self .owner !== false)
 *   devices[]       { id, title, mine, label, addedAt, removable }
 *   deviceNote      "Only on this device so far." when unlinked
 *   plan            the dev-plan line
 *   teamNote        the "You're on the team" text, or null for an owner
 *   rows[]          { key, label, buttons:[{title, action, args}] }
 *   canInvite       signed in AND owner
 *   deleteState     { scheduled, at, text, warning }
 *   showDelete      linked AND owner (dev-delete-row)
 *   account         { email } | null
 *   myName          this device's own name
 *   regrantPending  a committed rotation still owes supporters the new key
 */
export async function build(baseUrl, me, label, appId) {
  const st = await accountState();
  const base = { linked: false, owner: true, devices: [], rows: [], canInvite: false,
    deviceNote: "Only on this device so far.", plan: "", teamNote: null,
    deleteState: { scheduled: false, at: null, text: "", warning: null },
    showDelete: false, account: st ? { email: st.email } : null,
    myName: (await openKeyStore().get(MY_NAME)) ?? "", regrantPending: false,
    emptyTeam: "No one else yet.", error: null };
  if (!me.sync?.userId) return base;
  const out = { ...base, linked: true, deviceNote: "" };
  const who = personWord(me);
  out.regrantPending = !!(await openKeyStore().get(regrantJournalName(me.id)));
  let client, identity;
  try {
    ({ client, identity } = await userClient(baseUrl, me));
  } catch (e) { return { ...out, error: "Relay unreachable — devices cannot be listed." }; }

  // renderDevices L161-211
  let owner = true;
  try {
    const [{ devices }, self] = await Promise.all([client.listDevices(), client.selfKey()]);
    owner = self?.owner !== false;
    out.owner = owner;
    for (const d of devices) {
      const mine = d.device_id === identity.deviceId;
      if (mine && !d.label) client.setLabel(label).catch(() => {});
      out.devices.push({
        id: d.device_id, mine, label: d.label || "", addedAt: d.added_at ?? null,
        title: (mine ? `${d.label || label} (this one)` : d.label || "A device")
          + (d.via_acct ? " — team member" : ""),
        removable: owner && !mine });
    }
    const lifetime = self?.entitlement === "lifetime";
    out.plan = lifetime ? `Pip Lifetime: ${who} can be on every device.`
      : `Free: ${who} is on one device. Pip Lifetime adds every other device.`;
    out.deleteState = deleteState(me, self);
    out.showDelete = owner;
    out.teamNote = owner ? null
      : `You can edit everything on ${who}'s board. An owner invites and removes people, adds devices, manages the license, and can delete the board.`;
  } catch {
    out.error = "Relay unreachable — devices cannot be listed.";
    return out;
  }

  // renderSupporters L493-567
  let supporters = [], invites = [];
  try { ({ supporters } = await client.listSupporters()); } catch { /* relay unreachable */ }
  if (st) {
    try { ({ invites } = await listInvites(st.acct_id, st.session)); } catch { /* session expired */ }
  }
  out.canInvite = !!st && owner;
  invites = (invites ?? []).filter((i) => i.user_id === me.id
    && ["pending_claim", "pending_allow", "granted"].includes(i.status));
  const levelOf = (acct) => (supporters.find((s) => s.acct_id === acct)?.owner ? "owner" : "team");
  const names = supporterNames(appDb(appId));
  const btn = (title, action, args) => ({ title, action, args });
  const member = (acct, email, token) => ({
    key: `member:${acct}`, acct,
    label: `${names.get(acct) ?? email ?? acct} — ${levelOf(acct) === "owner" ? "owner" : "team, can edit everything"}`,
    buttons: owner ? [
      btn(levelOf(acct) === "owner" ? "Make team" : "Make owner", "setOwner",
        { acct, owner: levelOf(acct) !== "owner" }),
      btn("Remove", "removeSupporter", { acct, email: email ?? null, token: token ?? null }),
    ] : [] });
  for (const inv of invites) {
    if (inv.status === "granted") out.rows.push(member(inv.to_acct, inv.email, inv.token));
    else if (inv.status === "pending_allow") {
      out.rows.push({ key: `invite:${inv.token}`, label: `${inv.email} — waiting for an owner's Allow`,
        buttons: owner ? [btn("Allow", "allow", { token: inv.token })] : [] });
    } else {
      out.rows.push({ key: `invite:${inv.token}`, label: `${inv.email} — invited`,
        buttons: owner ? [btn("Cancel", "cancelInvite", { token: inv.token })] : [] });
    }
  }
  // Relay supporters without a visible invite still list and still remove.
  for (const s of supporters) {
    if (invites.some((i) => i.status === "granted" && i.to_acct === s.acct_id)) continue;
    out.rows.push(member(s.acct_id, s.email));
  }
  return out;
}

/** Compute and publish the model. */
export function refresh(baseUrl, userRowJson, label, appId) {
  noteBase(baseUrl);
  const me = parse(userRowJson);
  build(baseUrl, me, label, appId).then(
    (m) => emit("team.state", { userId: me.id, ...m }),
    (e) => emit("team.state", { userId: me.id, linked: !!me.sync?.userId, error: `Could not load the team: ${e.message}`,
      owner: true, devices: [], rows: [], canInvite: false, deviceNote: "", plan: "", teamNote: null,
      deleteState: { scheduled: false, at: null, text: "", warning: null }, showDelete: false,
      account: null, myName: "", regrantPending: false, emptyTeam: "No one else yet." }));
  return { accepted: true };
}

/* ---------------- actions ---------------- */

/** devices-ui.js rotateAfterRemoval L294. */
const rotateAfterRemoval = (client, store, me, saveUser) =>
  completeRemovalRotation({ store, user: me, client, saveUser, rekey: syncRekey });

/** sup-invite L624-638. */
async function invite(baseUrl, me, label, { email }) {
  const st = await accountState();
  const addr = String(email ?? "").trim();
  if (!st) return toast("Sign in first — supporter invites go through your account.");
  if (!addr.includes("@")) return toast("Enter the supporter's email first.");
  try {
    await ensureRelayUser(baseUrl, me, label); // devices-ui.js ensureUser()
    await createInvite(st.acct_id, st.session, addr, me.id);
    toast(`Invite sent to ${addr} — nothing syncs until you Allow it.`);
  } catch (e) {
    toast(`Invite failed: ${e.message}`);
  }
}

/** allowInvite L571-587: register the supporter account on the relay, then
 *  hand it the wrapped keys + join tokens through the invite grant. */
async function allow(baseUrl, me, _label, { token }) {
  const st = await accountState();
  if (!st) return;
  try {
    const { invites } = await listInvites(st.acct_id, st.session);
    const inv = (invites ?? []).find((i) => i.token === token);
    if (!inv) throw new Error("bad_invite");
    const { client } = await userClient(baseUrl, me);
    await client.addSupporter(inv.to_acct, inv.email);
    // to_acct_pub binds at claim; a late-registering invitee may have
    // claimed before its account pub existed - fetch it live.
    const toPub = inv.to_acct_pub ?? await accountPub(inv.to_acct);
    const grant = await buildUserGrant(openKeyStore(), me, toPub, inv.to_acct);
    await grantInvite(inv.token, st.session, grant);
    toast(`Allowed — ${inv.email} gets ${me.name || "this user"}.`);
  } catch (e) {
    toast(`Allow failed: ${e.message}`);
  }
}

/** The "Cancel" button on an unanswered invite (renderSupporters L552). */
async function cancelInvite(_b, _me, _l, { token }) {
  const st = await accountState();
  if (st) await declineInvite(token, st.session).catch(() => {});
}

/** The Make owner / Make team button (renderSupporters L534-541). */
async function setOwner(baseUrl, me, _l, { acct, owner }) {
  try {
    const { client } = await userClient(baseUrl, me);
    await client.setSupporterOwner(acct, !!owner);
  } catch (e) {
    toast(e.status === 409 ? "Someone has to stay an owner." : `Couldn't change that: ${e.message}`);
  }
}

/** removeSupporterFlow L606-622. The confirm is Swift's. */
async function removeSupporter(baseUrl, me, _l, sup, saveUser) {
  const label = sup.email ?? "this supporter";
  try {
    const { client, store } = await userClient(baseUrl, me);
    await client.removeSupporter(sup.acct);
    const st = await accountState();
    if (sup.token && st) await revokeInvite(sup.token, st.session);
    await rotateAfterRemoval(client, store, me, saveUser);
    await resumeSupporterRegrant({ store, user: me, client, accountOps: regrantOps });
    toast(`Removed ${label} — this user re-keyed.`);
  } catch (e) {
    toast(`Remove failed: ${e.message}`);
  }
}

/** removeDeviceFlow L300-305. The confirm is Swift's. */
async function removeDevice(baseUrl, me, _l, { id }, saveUser) {
  try {
    const { client, store } = await userClient(baseUrl, me);
    await client.removeDevice(id);
    await rotateAfterRemoval(client, store, me, saveUser);
  } catch (e) {
    toast(`Remove failed: ${e.message}`);
  }
}

/** dev-delete L1016-1034. The sheet is Swift's. */
async function deleteCloud(baseUrl, me) {
  try {
    const { client } = await userClient(baseUrl, me);
    const { delete_at } = await client.deleteUser();
    toast(`User scheduled for deletion on ${new Date(delete_at).toLocaleDateString()}`);
    emit("team.deleted", { ok: true });
  } catch (e) {
    emit("team.deleted", { ok: false, message: `Could not reach the relay: ${e.message}` });
  }
}

/** dev-undelete L1035-1044. */
async function undeleteCloud(baseUrl, me) {
  try {
    const { client } = await userClient(baseUrl, me);
    await client.undeleteUser();
    toast("Deletion cancelled — this user stays.");
  } catch (e) {
    toast(`Could not reach the relay: ${e.message}`);
  }
}

/** acct-delete L339-353. The confirm is Swift's. */
async function deleteAccount() {
  const st = await accountState();
  if (!st) return;
  try {
    await deleteAccountOnRelay(st.acct_id, st.session);
    await openKeyStore().del(STATE_NAME);
    emit("team.account", { email: null });
    toast("Account deleted.");
  } catch (e) {
    toast(`Could not delete (${e.message})`);
  }
}

/** team-name-ui.js: this device's own name, written into the open person
 *  as a synced supporter_name row under the account id. */
async function setMyName(_b, _me, _l, { name, appId }) {
  const n = String(name ?? "").trim().slice(0, 80);
  await openKeyStore().put(MY_NAME, n || undefined);
  const st = await accountState();
  if (st?.acct_id) setSupporterName(appDb(appId), st.acct_id, n);
}

const ACTIONS = { invite, allow, cancelInvite, setOwner, removeSupporter, removeDevice,
  deleteCloud, undeleteCloud, deleteAccount, setMyName };

/**
 * One action, then a fresh model. `action` is a button's `action` from the
 * model; `args` its `args`. The web's order and words, nothing else.
 */
export function act(baseUrl, userRowJson, label, appId, action, argsJson) {
  noteBase(baseUrl);
  const me = parse(userRowJson);
  const args = parse(argsJson ?? "{}") ?? {};
  const fn = ACTIONS[action];
  if (!fn) return { accepted: false };
  (async () => {
    await fn(baseUrl, me, label, { ...args, appId }, saverFor(me));
    refresh(baseUrl, JSON.stringify(me), label, appId);
  })().catch((e) => {
    toast(`Could not do that: ${e.message}`);
    refresh(baseUrl, JSON.stringify(me), label, appId);
  });
  return { accepted: true };
}

/** team-name-ui.js follow(): a name set here wins; an empty device adopts
 *  the open person's synced row (a new device after sign-in). -> "team.myname". */
export function followMyName(appId) {
  (async () => {
    const st = await accountState();
    if (!st?.acct_id) { emit("team.myname", { name: "" }); return; }
    const store = openKeyStore();
    const mine = (await store.get(MY_NAME)) ?? "";
    const db = appDb(appId);
    const synced = supporterNames(db).get(st.acct_id) ?? "";
    if (mine && mine !== synced) setSupporterName(db, st.acct_id, mine);
    else if (!mine && synced) await store.put(MY_NAME, synced);
    emit("team.myname", { name: mine || synced });
  })().catch(() => {});
  return { accepted: true };
}

/** What the sync loop does on every recovery (sync.mjs: resumeSupporterRegrant
 *  with the registered account ops), on demand: the Team screen and a fresh
 *  sign-in call it so a pending regrant finishes without waiting for a pass. */
export function resume(baseUrl, userRowJson, label, appId) {
  noteBase(baseUrl);
  const me = parse(userRowJson);
  (async () => {
    if (me.sync?.userId) {
      const { client, store } = await userClient(baseUrl, me);
      await resumeSupporterRegrant({ store, user: me, client, accountOps: regrantOps });
    }
  })().catch((e) => console.error(`team: regrant resume failed: ${e.message}`))
    .then(() => refresh(baseUrl, JSON.stringify(me), label, appId));
  return { accepted: true };
}
