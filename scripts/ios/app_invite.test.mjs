/**
 * 044 IL proof: the invitee's side of a supporter invite, in the BUILT core
 * (pip-core.js in a bare node:vm realm) with a fake __pipHost and a fake
 * Worker (scripts/ios/app_invite.fakes.mjs): the real sync_crypto behind
 * opaque handles, a software passkey authenticator, the real WebAuthn
 * verification. Assertions read the Worker's recorded requests, the
 * keychain and the registry - never the facade's own events alone.
 *
 * The family's Allow is played by the test the way the owner's device does
 * it (a key wrapped to the invitee's account public key, a sealed profile,
 * join tokens), so the invitee really opens the key.
 *
 * Run: scripts/test.sh scripts/ios/app_invite.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import * as real from "../../public/shared/sync_crypto.mjs";
import { Authenticator, BASE, FakeWorker, makeDevice, rawKey } from "./app_invite.fakes.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, what, ms = 8000) => {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`);
    await sleep(5);
  }
};
const te = new TextEncoder();
const USER = "user-maya-0001";
const TOKEN = "InviteTokenAbCdEfGhIjKl";
const link = `${BASE}/?invite=${TOKEN}`;

const fixture = async () => {
  const worker = new FakeWorker(); const auth = new Authenticator();
  const dev = makeDevice({ worker, authenticator: auth });
  worker.invite(TOKEN, "teacher@school.org", USER);
  return { worker, auth, dev };
};
const accept = (dev, url = link, ms = 20) =>
  dev.run(`PIPCORE.invite.accept(${JSON.stringify(BASE)}, ${JSON.stringify(url)}, ${ms})`);
const lines = (dev) => dev.events.filter(([n]) => n === "invite.landing").map(([, e]) => `${e.stage}: ${e.text}`);

/** The owner's Allow, as devices-ui.js allowInvite/buildUserGrant builds it. */
async function allow(worker) {
  const userKey = await real.newUserKey();
  const acct = [...worker.accounts.values()].find((a) => a.email === "teacher@school.org");
  const grant = {
    user_id: USER,
    keys: [{ epoch: 1, grant: await real.wrapUserKey(userKey, acct.acct_pub) }],
    sealed_profile: await real.sealBlob(userKey, te.encode(JSON.stringify({ name: "Maya", photo: null })), 1),
    join_tokens: ["join-1", "join-2"],
  };
  worker.allow(TOKEN, grant);
  return userKey;
}

test("the emailed invite link parses; a sign-in link and junk do not", async () => {
  const { dev } = await fixture();
  const t = (s) => dev.run(`PIPCORE.invite.inviteToken(${JSON.stringify(s)})`);
  assert.equal(t(link), TOKEN);
  assert.equal(t(`${BASE}?invite=${TOKEN}`), TOKEN);
  assert.equal(t(`${BASE}/?signin=${TOKEN}`), null);
  assert.equal(t(`${BASE}/?invite=`), null);
  assert.equal(t("nonsense"), null);
  assert.equal(dev.run(`PIPCORE.invite.accept(${JSON.stringify(BASE)}, "nonsense")`).accepted, false);
});

test("open -> sign in (new passkey) -> claim -> wait -> Allow: the user is on this device, key opened, device joined, signed in", async () => {
  const { worker, auth, dev } = await fixture();
  assert.equal(accept(dev).accepted, true);
  await until(() => worker.invites.get(TOKEN).status === "pending_allow", "claimed");
  await until(() => lines(dev).at(-1)?.includes("waiting for the family"), "waiting line");
  assert.deepEqual(dev.say(), [
    "Opening the invite…", "Checking the link…", "Create your passkey…", "Signed in.",
    "Signed in — waiting for the family to Allow this share…"]);
  assert.equal(auth.creates.length, 1, "the invited email got a passkey");
  assert.equal(auth.creates[0].name, "teacher@school.org");
  assert.equal(dev.rows.size, 0, "nothing imported before the Allow");

  const userKey = await allow(worker);
  await until(() => dev.lastOf("invite.landing")?.stage === "done", "done");
  assert.deepEqual(dev.say().slice(-1), ["Allowed — bringing the user over…"]);
  assert.equal(dev.lastOf("invite.landing").text, "Done — the user is on this device.");
  assert.deepEqual(dev.lastOf("invite.landing").imported, [USER]);

  // Read it back from where it lives, not from the event.
  const row = dev.rows.get(USER);
  assert.equal(row.name, "Maya", "the sealed profile was opened with the granted key");
  assert.equal(row.role, "partner");
  assert.deepEqual({ userId: row.sync.userId, epoch: row.sync.epoch, cursor: row.sync.cursor, pending: row.sync.pendingJoin },
    { userId: USER, epoch: 1, cursor: 0, pending: undefined });
  assert.equal(await rawKey(dev.store.get(`user/${USER}/key_e1`)), await rawKey(userKey),
    "the keychain holds the family's own key");
  assert.deepEqual(worker.joined.map((j) => [j.user, j.token]), [[USER, "join-1"]], "this iPad joined the person's relay");
  const st = JSON.parse(dev.store.get("account/state"));
  assert.equal(st.email, "teacher@school.org");
  assert.ok(worker.find("POST", `/accounts/invites/${TOKEN}`).some((r) => r.body.action === "claim" && r.body.session === st.session));
});

test("the family does not approve: the web's sentence, nothing imported", async () => {
  const { worker, dev } = await fixture();
  accept(dev);
  await until(() => worker.invites.get(TOKEN).status === "pending_allow", "claimed");
  worker.invites.get(TOKEN).status = "declined";
  await until(() => dev.lastOf("invite.landing")?.stage === "failed", "failed");
  assert.equal(dev.lastOf("invite.landing").text, "The family did not approve this share.");
  assert.equal(dev.rows.size, 0);
});

test("a revoked invite: the family cancelled it", async () => {
  const { worker, dev } = await fixture();
  accept(dev);
  await until(() => worker.invites.get(TOKEN).status === "pending_allow", "claimed");
  worker.invites.get(TOKEN).status = "revoked";
  await until(() => dev.lastOf("invite.landing")?.stage === "failed", "failed");
  assert.equal(dev.lastOf("invite.landing").text, "The family cancelled this invite.");
});

test("an invite the Worker does not know: the plain words, never a raw code, no passkey made", async () => {
  const { worker, auth, dev } = await fixture();
  accept(dev, `${BASE}/?invite=nopeNopeNopeNopeNope`);
  await until(() => dev.lastOf("invite.landing")?.stage === "failed", "failed");
  assert.equal(dev.lastOf("invite.landing").text, "That invite isn't open any more. Ask them to send a new one.");
  assert.equal(auth.creates.length, 0);
  assert.equal(worker.requests.filter((r) => r.path.endsWith("/register")).length, 0);
});

test("cancelling the passkey sheet ends it in the web's sign-in words; the invite is never claimed", async () => {
  const { worker, auth, dev } = await fixture();
  auth.create = async () => { throw new Error("The operation couldn't be completed. cancelled"); };
  accept(dev);
  await until(() => dev.lastOf("invite.landing")?.stage === "failed", "failed");
  assert.equal(dev.lastOf("invite.landing").text, "Sign-in was cancelled.");
  assert.equal(worker.invites.get(TOKEN).status, "pending_claim");
});

test("a failed sign-in says the web's sign-in sentence", async () => {
  const { worker, auth, dev } = await fixture();
  auth.create = async () => { throw new Error("no secure enclave"); };
  accept(dev);
  await until(() => dev.lastOf("invite.landing")?.stage === "failed", "failed");
  assert.equal(dev.lastOf("invite.landing").text,
    "Sign-in failed — no secure enclave. Ask for a fresh link and try again.");
  assert.equal(worker.invites.get(TOKEN).status, "pending_claim");
});

test("closing the sheet stops the wait: a later Allow brings nothing in", async () => {
  const { worker, dev } = await fixture();
  accept(dev);
  await until(() => worker.invites.get(TOKEN).status === "pending_allow", "claimed");
  dev.run("PIPCORE.invite.cancel()");
  await allow(worker);
  await sleep(150);
  assert.equal(dev.rows.size, 0);
  assert.ok(!lines(dev).some((l) => l.startsWith("done")));
});

test("an account that already has a passkey signs in with it (no second passkey), then waits", async () => {
  const { worker, auth, dev } = await fixture();
  // The teacher already has an account + passkey from an earlier sign-in.
  dev.run(`PIPCORE.account.sendLink(${JSON.stringify(BASE)}, "teacher@school.org")`);
  await until(() => worker.lastLink, "link");
  dev.run(`PIPCORE.account.land(${JSON.stringify(BASE)}, ${JSON.stringify(worker.lastLink)})`);
  await until(() => dev.lastOf("account.landing")?.stage === "done", "first sign-in");
  assert.equal(auth.creates.length, 1);

  accept(dev);
  await until(() => worker.invites.get(TOKEN).status === "pending_allow", "claimed");
  assert.equal(auth.creates.length, 1, "no new passkey");
  assert.ok(dev.say().includes("Sign in with your passkey…"));
  await allow(worker);
  await until(() => dev.lastOf("invite.landing")?.stage === "done", "done");
  assert.equal(dev.rows.get(USER).name, "Maya");
});

test("the export surface Swift calls", async () => {
  const { dev } = await fixture();
  assert.deepEqual([...Object.keys(dev.ctx.PIPCORE.invite)].sort(), ["accept", "cancel", "inviteToken"]);
});
