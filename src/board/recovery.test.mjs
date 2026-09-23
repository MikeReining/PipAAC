/**
 * Recovery sheet (011 slice 8, Sync_And_Web_Editing § 9) — the 24 words
 * carry the recovery root; every epoch key derives from it, so a fresh
 * device holding only the words opens every op the board ever sealed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  keyToWords, parseRecoveryPayload, recoveryPayload, recoveryProof, wordsToKey,
} from "../../public/shared/recovery.mjs";
import { RECOVERY_WORDS } from "../../public/shared/recovery_words.mjs";
import {
  deriveEpochKey, ensureRecoveryRoot, getUserKey, memoryKeyStore, openOp, sealOp,
  userRootName,
} from "../../public/shared/sync_crypto.mjs";

const FILE_WORDS = readFileSync(
  new URL("../../data/recovery/words_en.txt", import.meta.url), "utf8")
  .trim().split("\n");

const randRoot = () => crypto.getRandomValues(new Uint8Array(32));

test("wordlist is the BIP-0039 English list: 2048 unique lowercase words", () => {
  assert.equal(RECOVERY_WORDS.length, 2048);
  assert.equal(new Set(RECOVERY_WORDS).size, 2048);
  assert.deepEqual(RECOVERY_WORDS, FILE_WORDS);
  assert.ok(RECOVERY_WORDS.every((w) => /^[a-z]+$/.test(w)));
});

test("words round-trip a 32-byte root", async () => {
  for (let i = 0; i < 8; i++) {
    const root = randRoot();
    const phrase = await keyToWords(root, RECOVERY_WORDS);
    assert.equal(phrase.split(" ").length, 24);
    assert.deepEqual(await wordsToKey(phrase, RECOVERY_WORDS), root);
  }
});

test("words reject typos, wrong counts, and bad checksums", async () => {
  const phrase = await keyToWords(randRoot(), RECOVERY_WORDS);
  await assert.rejects(() => wordsToKey("apple ".repeat(24), RECOVERY_WORDS),
    /checksum/);
  await assert.rejects(() => wordsToKey(phrase.split(" ").slice(0, 23).join(" "),
    RECOVERY_WORDS), /24 words/);
  const swapped = phrase.split(" ");
  [swapped[0], swapped[23]] = [swapped[23], swapped[0]];
  await assert.rejects(() => wordsToKey(swapped.join(" "), RECOVERY_WORDS));
  await assert.rejects(
    () => wordsToKey(`notaword ${"apple ".repeat(22)}apple`, RECOVERY_WORDS),
    /unknown recovery word/);
});

test("the proof is stable and root-specific", async () => {
  const a = randRoot(); const b = randRoot();
  assert.equal(await recoveryProof(a), await recoveryProof(a));
  assert.notEqual(await recoveryProof(a), await recoveryProof(b));
});

test("payload parse: pip:recover URI and bare user-id + words", async () => {
  const userId = "11111111-2222-3333-4444-555555555555";
  const phrase = await keyToWords(randRoot(), RECOVERY_WORDS);
  const fromUri = parseRecoveryPayload(recoveryPayload(userId, phrase));
  assert.equal(fromUri.userId, userId);
  assert.equal(fromUri.phrase, phrase);
  const bare = parseRecoveryPayload(`${userId} ${phrase}`);
  assert.equal(bare.userId, userId);
  assert.equal(parseRecoveryPayload("not a sheet"), null);
  assert.equal(parseRecoveryPayload(`${userId} ${phrase.split(" ").slice(0, 5).join(" ")}`), null);
});

test("a fresh keystore holding only the root opens every epoch's ops", async () => {
  // Device A sets up sync: root minted, epoch keys derived. 015 slice
  // 2 scopes both under the user's id.
  const storeA = memoryKeyStore();
  const root = await ensureRecoveryRoot(storeA, "u-a");
  const op1 = { op_id: "op_1", kind: "add_item", entity_id: "ent_x", slot: 0 };
  const op2 = { op_id: "op_2", kind: "rename_entity", entity_id: "ent_x", name: "x" };
  const env1 = await sealOp(await getUserKey(storeA, "u-a", 1), op1);
  const env2 = await sealOp(await getUserKey(storeA, "u-a", 3), op2); // after rotations

  // Device B restores from the sheet — it has the root under the
  // restored user's scope, nothing else.
  const storeB = memoryKeyStore();
  await storeB.put(userRootName("u-a"),
    await wordsToKey(await keyToWords(root, RECOVERY_WORDS), RECOVERY_WORDS));
  assert.deepEqual(await openOp(await getUserKey(storeB, "u-a", 1), env1), op1);
  assert.deepEqual(await openOp(await getUserKey(storeB, "u-a", 3), env2), op2);

  // A paired device with a wrapped epoch key but no root cannot mint
  // other epochs — getUserKey falls back to a fresh random key that
  // cannot open epoch-1 envelopes.
  const storeC = memoryKeyStore();
  await assert.rejects(
    () => getUserKey(storeC, "u-a", 1).then((k) => openOp(k, env1)));
});

test("epoch keys differ by epoch and match across stores", async () => {
  const root = randRoot();
  const k1 = await deriveEpochKey(root, 1);
  const k3 = await deriveEpochKey(root, 3);
  const k1b = await deriveEpochKey(root, 1);
  const op = { op_id: "op_x", kind: "add_item" };
  const env = await sealOp(k1, op);
  assert.deepEqual(await openOp(k1b, env), op);
  await assert.rejects(() => openOp(k3, env));
});
