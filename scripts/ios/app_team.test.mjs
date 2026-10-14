/**
 * 044 F2 proof: team roles, invites, removal with key rotation + regrant,
 * the device list, and cloud-data / account deletion - the BUILT core
 * (pip-core.js in a bare node:vm realm) with a fake __pipHost in node
 * (scripts/ios/app_team.fakes.mjs):
 *   - crypto + keychain: the real public/shared/sync_crypto.mjs behind
 *     opaque handles (what PipHostCrypto.swift does with CryptoKit);
 *   - the app's database: node:sqlite behind dbExec/dbRun/dbAll;
 *   - the Worker: a fake that RECORDS every request and enforces the
 *     relay's own owner-only rule (src/worker/relay.js ownerOnly).
 * Assertions read the recorded requests, the keychain and the registry -
 * not the facade's own events. The relay itself (real Worker) is exercised
 * by scripts/ios/e2e_sync.sh's `team` scenario.
 *
 * Run: scripts/test.sh scripts/ios/app_team.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import * as real from "../../public/shared/sync_crypto.mjs";
import { BASE, LABEL, fixture, rawKey, supporter } from "./app_team.fakes.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, what, ms = 8000) => {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`);
    await sleep(5);
  }
};

/* ---------------- tests ---------------- */

test("registered at core load: the regrant drain has its account verbs (setSyncAccountOps)", async () => {
  const { dev } = await fixture();
  const ops = await dev.ctx.PIPCORE.team.regrantOps();
  assert.equal(ops.acctId, "acct_owner");
  assert.equal(ops.session, "sess-owner");
  assert.deepEqual(Object.keys(ops).sort(), ["acctId", "buildUserGrant", "grantInvite", "listInvites", "session"]);
  dev.store.delete("account/state");
  assert.equal(await dev.ctx.PIPCORE.team.regrantOps(), null, "signed out: nothing to drain with");
});

test("AC-4: invite by email posts the account invite for this person; signed-out and bad email say the web's words", async () => {
  const { worker, dev, userId } = await fixture();
  await dev.act("invite", { email: "teacher@school.org" });
  const post = worker.find("POST", /^\/accounts\/acct_owner\/invites$/);
  assert.equal(post.length, 1);
  assert.deepEqual(post[0].body, { session: "sess-owner", email: "teacher@school.org", user_id: userId });
  assert.ok(dev.toasts().includes("Invite sent to teacher@school.org — nothing syncs until you Allow it."));
  let st = await dev.state();
  assert.equal(st.canInvite, true);
  assert.deepEqual(st.rows.map((r) => [r.label, r.buttons.map((b) => b.title)]),
    [["teacher@school.org — invited", ["Cancel"]]]);

  await dev.act("invite", { email: "nope" });
  assert.ok(dev.toasts().includes("Enter the supporter's email first."));
  dev.store.delete("account/state");
  await dev.act("invite", { email: "a@b.co" });
  assert.ok(dev.toasts().includes("Sign in first — supporter invites go through your account."));
  assert.equal(worker.find("POST", /\/invites$/).length, 1, "neither refusal reached the Worker");
  st = await dev.state();
  assert.equal(st.canInvite, false, "no account, no invite form");
});

test("AC-4: a declined/cancelled invite posts decline", async () => {
  const { worker, dev } = await fixture();
  await dev.act("invite", { email: "a@b.co" });
  const st = await dev.state();
  await dev.act(st.rows[0].buttons[0].action, st.rows[0].buttons[0].args);
  assert.deepEqual(worker.find("POST", /^\/accounts\/invites\/inv1$/).map((r) => r.body.action), ["decline"]);
  assert.equal((await dev.state()).rows.length, 0, "declined invites leave the list");
});

test("AC-5: Allow registers the account on the relay and grants wrapped keys the supporter can open", async () => {
  const { worker, dev, userId } = await fixture();
  const sup = await supporter(worker, "acct_sup", "mom@example.com");
  await dev.act("invite", { email: sup.email });
  Object.assign(worker.invites[0], { to_acct: sup.acct, to_acct_pub: sup.pub, status: "pending_allow" });
  const st = await dev.state();
  assert.deepEqual(st.rows.map((r) => [r.label, r.buttons.map((b) => b.title)]),
    [["mom@example.com — waiting for an owner's Allow", ["Allow"]]]);
  await dev.act(st.rows[0].buttons[0].action, st.rows[0].buttons[0].args);

  assert.deepEqual(worker.find("POST", new RegExp(`^/users/${userId}/supporters$`))[0].body,
    { acct_id: "acct_sup", email: "mom@example.com" });
  const grant = worker.find("POST", /^\/accounts\/invites\/inv1$/).find((r) => r.body.action === "grant").body;
  assert.equal(grant.session, "sess-owner");
  assert.deepEqual(grant.keys.map((k) => k.epoch), [1]);
  // The supporter's account key opens the grant: the user key, byte for byte.
  const opened = await real.unwrapUserKey(sup.priv, grant.keys[0].grant);
  assert.equal(await rawKey(opened), await rawKey(dev.k1));
  // The sealed profile opens only with that key.
  const profile = JSON.parse(new TextDecoder().decode(await real.openBlob(opened, grant.sealed_profile)));
  assert.equal(profile.name, "Ann");
  // Join tokens are tagged for this account (so removal cascades to its devices).
  assert.equal(grant.join_tokens.length, 4);
  assert.ok(grant.join_tokens.every((t) => t.endsWith("acct_sup")));
  assert.ok(dev.toasts().includes("Allowed — mom@example.com gets Ann."));
  const after = await dev.state();
  assert.deepEqual(after.rows.map((r) => r.label), ["mom@example.com — team, can edit everything"]);
});

test("AC-6: Make owner / Make team posts the flag; the last owner and a refusal say the web's words", async () => {
  const { worker, dev } = await fixture();
  worker.supporters.push({ acct_id: "acct_sup", email: "mom@example.com", owner: false });
  let st = await dev.state();
  const make = st.rows[0].buttons[0];
  assert.deepEqual([make.title, make.action, make.args], ["Make owner", "setOwner", { acct: "acct_sup", owner: true }]);
  st = await dev.act(make.action, make.args);
  assert.deepEqual(worker.find("POST", /\/owner$/).at(-1).body, { owner: true });
  assert.equal(st.rows[0].label, "mom@example.com — owner");
  assert.equal(st.rows[0].buttons[0].title, "Make team");
  st = await dev.act("setOwner", { acct: "acct_sup", owner: false });
  assert.deepEqual(worker.find("POST", /\/owner$/).at(-1).body, { owner: false });
  assert.equal(st.rows[0].label, "mom@example.com — team, can edit everything");

  worker.lastOwnerError = true;
  await dev.act("setOwner", { acct: "acct_sup", owner: false });
  assert.ok(dev.toasts().includes("Someone has to stay an owner."));
  worker.lastOwnerError = false;
  worker.callerOwner = false;
  await dev.act("setOwner", { acct: "acct_sup", owner: true });
  assert.ok(dev.toasts().includes("Couldn't change that: owner_only"));
});

test("AC-9: a Team member's screen has no owner buttons, no invite, no delete - and the relay refuses what is tried anyway", async () => {
  const { worker, dev, userId } = await fixture();
  worker.callerOwner = false;
  worker.supporters.push({ acct_id: "acct_sup", email: "mom@example.com", owner: false });
  worker.devices.push({ device_id: "dev2", dh_pub: null, label: "Mac · Safari", added_at: 1760000000000, via_acct: null });
  const st = await dev.state();
  assert.equal(st.owner, false);
  assert.equal(st.canInvite, false);
  assert.equal(st.showDelete, false);
  assert.match(st.teamNote, /^You can edit everything on Ann's board\. An owner invites and removes people/);
  assert.deepEqual(st.rows.map((r) => r.buttons.length), [0], "rows list, with no buttons");
  assert.ok(st.devices.every((d) => !d.removable));
  // The screen is not the lock: drive the actions directly and read the relay's answer.
  for (const [action, args] of [["removeSupporter", { acct: "acct_sup", email: "mom@example.com", token: null }],
    ["removeDevice", { id: "dev2" }], ["deleteCloud", {}], ["setOwner", { acct: "acct_sup", owner: true }]]) {
    await dev.act(action, args);
  }
  const refused = worker.requests.filter((r) => r.path.startsWith(`/users/${userId}`)
    && ((r.method === "DELETE") || r.path.endsWith("/owner")));
  assert.equal(refused.length, 4, "every owner-only call went to the relay");
  assert.equal(worker.supporters.length, 1, "the relay did not remove the supporter");
  assert.equal(worker.devices.length, 2, "the relay did not remove the device");
  assert.equal(worker.deleteAt, null);
  assert.ok(dev.toasts().includes("Remove failed: owner_only"));
});

test("AC-7/SY-8: removing a supporter cascades, rotates the key from the card root, and regrants the rest", async () => {
  const { worker, dev, userId } = await fixture();
  const s1 = await supporter(worker, "acct_s1", "gone@example.com");
  const s2 = await supporter(worker, "acct_s2", "stay@example.com");
  worker.supporters.push({ acct_id: s1.acct, email: s1.email, owner: false }, { acct_id: s2.acct, email: s2.email, owner: false });
  worker.invites.push(
    { token: "t1", user_id: userId, email: s1.email, to_acct: s1.acct, to_acct_pub: s1.pub, status: "granted" },
    { token: "t2", user_id: userId, email: s2.email, to_acct: s2.acct, to_acct_pub: s2.pub, status: "granted" });
  // A device of the removed supporter, and our own.
  worker.devices.push({ device_id: "s1-dev", dh_pub: await real.exportDhPublic((await real.getDeviceIdentity(real.memoryKeyStore())).dh.publicKey),
    label: "S1 phone", added_at: 1760000000000, via_acct: s1.acct });
  let st = await dev.state();
  assert.ok(st.devices.some((d) => d.title === "S1 phone — team member"));

  st = await dev.act("removeSupporter", { acct: s1.acct, email: s1.email, token: "t1" });
  const paths = worker.requests.map((r) => `${r.method} ${r.path}`);
  const iDel = paths.indexOf(`DELETE /users/${userId}/supporters/acct_s1`);
  const iRev = paths.findIndex((p, i) => i > iDel && p === "POST /accounts/invites/t1");
  const iKeys = paths.indexOf(`POST /users/${userId}/keys`);
  const iGrant = paths.findIndex((p, i) => i > iKeys && p === "POST /accounts/invites/t2");
  assert.ok(iDel >= 0 && iDel < iRev && iRev < iKeys && iKeys < iGrant, `order: cascade, revoke, rotate, regrant (${paths.join(" | ")})`);
  assert.equal(worker.invites[0].status, "revoked");
  // Rotation: epoch 2 derived from the card root, wrapped for every remaining device that has a key.
  assert.equal(worker.epoch, 2);
  assert.deepEqual(Object.keys(worker.lastKeys.wrapped), [dev.identity.deviceId], "the removed supporter's device is not wrapped to");
  assert.match(worker.lastKeys.expected_proof, /./);
  const k2 = await real.deriveEpochKey(dev.root16, 2);
  assert.equal(await rawKey(await real.unwrapUserKey(dev.identity.dh.privateKey, worker.lastKeys.wrapped[dev.identity.deviceId])), await rawKey(k2),
    "the new epoch key is the card's derivation, not a random key");
  assert.equal(dev.rows.get(userId).sync.epoch, 2, "the registry row advanced");
  assert.ok(dev.store.get(`user/${userId}/key_e2`), "the iPad holds epoch 2");
  // The remaining supporter was regranted BOTH epochs; the removed one nothing after.
  const grants = worker.find("POST", /^\/accounts\/invites\/t2$/).filter((r) => r.body.action === "grant");
  assert.equal(grants.length, 1);
  assert.deepEqual(grants[0].body.keys.map((k) => k.epoch), [1, 2]);
  assert.equal(await rawKey(await real.unwrapUserKey(s2.priv, grants[0].body.keys[1].grant)), await rawKey(k2));
  assert.equal(worker.find("POST", /^\/accounts\/invites\/t1$/).filter((r) => r.body.action === "grant").length, 0);
  // The durable obligation left only because every remaining supporter was granted.
  assert.equal(dev.store.get(`regrant/${userId}`), undefined);
  assert.equal(st.regrantPending, false);
  assert.ok(dev.toasts().includes("Removed gone@example.com — this user re-keyed."));
  assert.deepEqual(st.rows.map((r) => r.label), ["stay@example.com — team, can edit everything"]);
});

test("AC-7: a regrant that dies mid-way leaves the journal; the next drain finishes it", async () => {
  const { worker, dev, userId } = await fixture();
  const s1 = await supporter(worker, "acct_s1", "gone@example.com");
  const s2 = await supporter(worker, "acct_s2", "stay@example.com");
  worker.supporters.push({ acct_id: s1.acct, email: s1.email, owner: false }, { acct_id: s2.acct, email: s2.email, owner: false });
  worker.invites.push(
    { token: "t1", user_id: userId, email: s1.email, to_acct: s1.acct, to_acct_pub: s1.pub, status: "granted" },
    { token: "t2", user_id: userId, email: s2.email, to_acct: s2.acct, to_acct_pub: s2.pub, status: "granted" });
  worker.failGrant = true; // the app is killed / offline at the regrant leg
  let st = await dev.act("removeSupporter", { acct: s1.acct, email: s1.email, token: "t1" });
  assert.equal(worker.epoch, 2, "the rotation committed at the relay");
  assert.ok(dev.toasts().some((t) => t.startsWith("Remove failed:")));
  const journal = JSON.parse(dev.store.get(`regrant/${userId}`));
  assert.deepEqual(journal, { epoch: 2 }, "the obligation is durable");
  assert.equal(st.regrantPending, true, "the screen says so");
  assert.equal(worker.invites[1].grant, undefined, "the remaining supporter has NOT been regranted");

  // A new session (relaunch): the registered drain runs and finishes it.
  worker.failGrant = false;
  st = await dev.state("resume");
  assert.deepEqual(worker.invites[1].grant.keys.map((k) => k.epoch), [1, 2]);
  assert.equal(dev.store.get(`regrant/${userId}`), undefined, "journal gone only after the grant");
  assert.equal(st.regrantPending, false);
});

test("AC-7 without a signed-in session the journal waits (cannot be forged healthy)", async () => {
  const { worker, dev, userId } = await fixture();
  const s2 = await supporter(worker, "acct_s2", "stay@example.com");
  worker.supporters.push({ acct_id: s2.acct, email: s2.email, owner: false });
  dev.store.set(`regrant/${userId}`, JSON.stringify({ epoch: 2 }));
  dev.store.delete("account/state");
  const st = await dev.state("resume");
  assert.equal(st.regrantPending, true);
  assert.equal(worker.find("POST", /^\/accounts\/invites\//).length, 0);
});

test("SY-7: the device list names this device, marks team devices, hides Remove from Team; Remove calls the relay and rotates", async () => {
  const { worker, dev, userId } = await fixture();
  worker.devices.push({ device_id: "dev2", dh_pub: null, label: "Mac · Safari", added_at: 1760000000000, via_acct: null },
    { device_id: "dev3", dh_pub: null, label: "", added_at: 1760000000000, via_acct: "acct_x" });
  let st = await dev.state();
  assert.deepEqual(st.devices.map((d) => [d.title, d.removable]), [
    ["iPad · Pip (this one)", false], ["Mac · Safari", true], ["A device — team member", true]]);
  await until(() => worker.find("POST", /\/label$/).length === 1, "this device names itself");
  assert.deepEqual(worker.find("POST", /\/label$/)[0].body, { label: "iPad · Pip" }, "web: an unnamed row is named, never overwritten");

  st = await dev.act("removeDevice", { id: "dev2" });
  assert.equal(worker.find("DELETE", new RegExp(`^/users/${userId}/devices/dev2$`)).length, 1);
  assert.equal(worker.epoch, 2, "removal rotated the key (SY-8)");
  assert.ok(!st.devices.some((d) => d.id === "dev2"));
  assert.equal(st.plan, "Free: Ann is on one device. Pip Lifetime adds every other device.");
});

test("SY-14: delete cloud data schedules 30 days out and Undo restores; the text and Owner-only gating match the web", async () => {
  const { worker, dev } = await fixture();
  let st = await dev.state();
  assert.equal(st.showDelete, true);
  assert.equal(st.deleteState.scheduled, false);
  await dev.act("deleteCloud", {});
  assert.equal(worker.find("DELETE", /^\/users\/u_ann\/$|^\/users\/u_ann$/).length, 1);
  assert.ok(worker.deleteAt, "the relay reports pending deletion");
  assert.ok(dev.toasts().some((t) => t.startsWith("User scheduled for deletion on ")));
  st = await dev.state();
  assert.equal(st.deleteState.scheduled, true);
  assert.match(st.deleteState.text, /^Ann is scheduled for deletion on /);
  await dev.act("undeleteCloud", {});
  assert.equal(worker.deleteAt, null, "undo restores");
  assert.ok(dev.toasts().includes("Deletion cancelled — this user stays."));
  st = await dev.state();
  assert.equal(st.deleteState.scheduled, false);
});

test("AC-10: delete my account asks the Worker with the session, then forgets the sign-in on this device", async () => {
  const { worker, dev } = await fixture();
  await dev.act("deleteAccount", {});
  const del = worker.find("DELETE", /^\/accounts\/acct_owner$/);
  assert.equal(del.length, 1);
  assert.equal(del[0].query, "?session=sess-owner");
  assert.equal(worker.accountAlive, false);
  assert.equal(dev.store.get("account/state"), undefined, "the keychain no longer holds the sign-in");
  assert.deepEqual(dev.lastOf("team.account"), { email: null });
  assert.ok(dev.toasts().includes("Account deleted."));
  // The person is untouched: still linked, still has its keys.
  assert.ok(dev.rows.get("u_ann").sync.userId);
  assert.ok(dev.store.get("user/u_ann/key_e1"));
  assert.equal((await dev.state()).account, null);
});

test("AC-10: a refused delete keeps the sign-in and says so", async () => {
  const { worker, dev } = await fixture();
  dev.store.set("account/state", JSON.stringify({ acct_id: "acct_owner", email: "owner@example.com", session: "stale" }));
  await dev.act("deleteAccount", {});
  assert.ok(dev.toasts().includes("Could not delete (bad_session)"));
  assert.ok(dev.store.get("account/state"), "still signed in");
  assert.equal(worker.accountAlive, true);
});

test("AC-8: team members show by their own synced name, not their email; Your name writes a synced row", async () => {
  const { worker, dev } = await fixture();
  worker.supporters.push({ acct_id: "acct_sup", email: "mom@example.com", owner: false });
  let st = await dev.state();
  assert.equal(st.rows[0].label, "mom@example.com — team, can edit everything");
  // The supporter's name arrived as a synced supporter_name row.
  dev.sqlite.prepare("INSERT INTO supporter_name (acct_id, name) VALUES (?, ?)").run("acct_sup", "Ms. Rivera");
  st = await dev.state();
  assert.equal(st.rows[0].label, "Ms. Rivera — team, can edit everything");

  // "Your name": stored on the device, written to the open person under the account id, op recorded.
  const before = dev.sqlite.prepare("SELECT COUNT(*) c FROM sync_op").get().c;
  await dev.act("setMyName", { name: "  Dad  " });
  assert.equal(dev.sqlite.prepare("SELECT name FROM supporter_name WHERE acct_id = 'acct_owner'").get().name, "Dad");
  const ops = dev.sqlite.prepare("SELECT kind, args FROM sync_op ORDER BY seq").all().slice(before);
  assert.deepEqual(ops.map((o) => [o.kind, JSON.parse(o.args)]), [["set_supporter_name", { acctId: "acct_owner", name: "Dad" }]]);
  st = await dev.state();
  assert.equal(st.myName, "Dad");
});
