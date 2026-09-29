/**
 * 023 §1e Works Test — the Settings PIN.
 *
 * Create → ask on every open → wrong fails → Forgot opens only on the
 * reset phrase. memoryKeyStore stands in for IndexedDB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PIN_RE, checkPin, hasPin, isResetPhrase, setPin } from "../../public/shared/pin.mjs";
import { memoryKeyStore } from "../../public/shared/sync_crypto.mjs";

test("create, check, wrong-pin, bad shapes", async () => {
  const s = memoryKeyStore();
  assert.equal(await hasPin(s), false);
  await assert.rejects(() => setPin(s, "12"));      // too short
  await assert.rejects(() => setPin(s, "12345"));   // too long
  await assert.rejects(() => setPin(s, "abcd"));    // not digits
  await setPin(s, "4321");
  assert.equal(await hasPin(s), true);
  assert.equal(await checkPin(s, "4321"), true);
  assert.equal(await checkPin(s, "1234"), false);
  assert.equal(await checkPin(s, ""), false);
  assert.equal(PIN_RE.test("1234"), true);
  assert.equal(PIN_RE.test("123456"), false);
});

test("forgot: only the reset phrase opens a new PIN", () => {
  for (const ok of ["new pin", "New PIN", "  new   pin "]) assert.equal(isResetPhrase(ok), true, ok);
  for (const no of ["", "new", "pin", "newpin", "1234", "new pin please"]) {
    assert.equal(isResetPhrase(no), false, no);
  }
});

test("one PIN per device; changing it replaces the old one", async () => {
  const s = memoryKeyStore();
  await setPin(s, "2468");
  assert.equal(await hasPin(s), true);
  assert.equal(await checkPin(s, "2468"), true);
  assert.equal(await checkPin(s, "1357"), false);
  // Change: the new PIN replaces the old one for everyone.
  await setPin(s, "1357");
  assert.equal(await checkPin(s, "1357"), true);
  assert.equal(await checkPin(s, "2468"), false);
});

test("no PIN until one is set; turning it off clears it", async () => {
  const { clearPin } = await import("../../public/shared/pin.mjs");
  const s = memoryKeyStore();
  assert.equal(await hasPin(s), false);
  await setPin(s, "2468");
  assert.equal(await hasPin(s), true);
  await clearPin(s);
  assert.equal(await hasPin(s), false);
  assert.equal(await hasPin(s), false);
});
