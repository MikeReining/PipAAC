/**
 * 023 §1e Works Test — the Settings PIN.
 *
 * Create → ask on every open → wrong fails → recovery by license or
 * by the QR card's root. memoryKeyStore stands in for IndexedDB;
 * verifyAdult never accepts a credential that isn't the user's own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PIN_RE, checkPin, hasPin, setPin, verifyAdult } from "../../public/shared/pin.mjs";
import { memoryKeyStore } from "../../public/shared/sync_crypto.mjs";
import { cardPayload } from "../../public/shared/recovery.mjs";

const UID = "11111111-2222-3333-4444-555555555555";

test("create, check, wrong-pin, bad shapes", async () => {
  const s = memoryKeyStore();
  assert.equal(await hasPin(s, UID), false);
  await assert.rejects(() => setPin(s, UID, "12"));      // too short
  await assert.rejects(() => setPin(s, UID, "abcd"));    // not digits
  await setPin(s, UID, "4321");
  assert.equal(await hasPin(s, UID), true);
  assert.equal(await checkPin(s, UID, "4321"), true);
  assert.equal(await checkPin(s, UID, "1234"), false);
  assert.equal(await checkPin(s, UID, ""), false);
  assert.equal(PIN_RE.test("123456"), true);
  assert.equal(PIN_RE.test("1234567"), false);
});

test("forgot: the stored license resets, another license does not", async () => {
  const s = memoryKeyStore();
  await s.put(`user/${UID}/license`, "pip-life-real");
  assert.equal(await verifyAdult(s, UID, "pip-life-real"), true);
  assert.equal(await verifyAdult(s, UID, "pip-life-other"), false);
  assert.equal(await verifyAdult(s, UID, "pip-life-"), false);
});

test("forgot: the QR card's root verifies, a different user's fails", async () => {
  const s = memoryKeyStore();
  const root = crypto.getRandomValues(new Uint8Array(32));
  await s.put(`user/${UID}/root`, root);
  const card = cardPayload(UID, root);
  assert.equal(await verifyAdult(s, UID, card), true);
  // A different user's card, or the right code with a different root.
  const other = crypto.getRandomValues(new Uint8Array(32));
  assert.equal(await verifyAdult(s, UID, cardPayload(UID, other)), false);
  const OTHER_UID = "99999999-8888-7777-6666-555555555555";
  assert.equal(await verifyAdult(s, UID, cardPayload(OTHER_UID, root)), false);
});

test("one PIN per device: every person on it opens with the same digits", async () => {
  const s = memoryKeyStore();
  const OTHER = "99999999-8888-7777-6666-555555555555";
  await setPin(s, UID, "2468");
  assert.equal(await hasPin(s, OTHER), true);
  assert.equal(await checkPin(s, OTHER, "2468"), true);
  assert.equal(await checkPin(s, OTHER, "1357"), false);
  // Change: the new PIN replaces the old one for everyone.
  await setPin(s, OTHER, "1357");
  assert.equal(await checkPin(s, UID, "1357"), true);
  assert.equal(await checkPin(s, UID, "2468"), false);
});

test("a PIN from before the device PIN still opens, then becomes the device PIN", async () => {
  const s = memoryKeyStore();
  const OTHER = "99999999-8888-7777-6666-555555555555";
  const legacy = [...new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(`pip-pin:${UID}:4321`)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  await s.put(`user/${UID}/pin`, legacy);
  assert.equal(await hasPin(s, UID), true);
  assert.equal(await hasPin(s, OTHER), false);
  assert.equal(await checkPin(s, UID, "1111"), false);
  assert.equal(await checkPin(s, UID, "4321"), true);
  // Migrated: the other person on the device now opens with it too.
  assert.equal(await checkPin(s, OTHER, "4321"), true);
});
