/**
 * 028 § 4.4 / Works Test 6 — recipe parity: the Worker mints with
 * exactly the text the v4 lab proved. The lab re-exports these
 * functions, so importing both proves they are the same code, and the
 * literal strings pin the semantics.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TILE_PROFILE,
  TILE_TEXT_ALLOW_RE,
  TILE_TEXT_MAX,
  formatElevenV4IpaLine,
  ipaOverrideForSoundEffectLabel,
  lexicalV4GuardText,
  needsLexicalV4Guard,
  tileMintText,
} from "./tile_recipe.mjs";
import * as lab from "../../scripts/catalog/elevenlabs_v4_lab.mjs";

test("recipe parity — shared module IS the lab code", () => {
  assert.equal(tileMintText("coughing"), lab.lexicalV4GuardText("coughing"));
  assert.equal(ipaOverrideForSoundEffectLabel, lab.ipaOverrideForSoundEffectLabel);
  assert.equal(needsLexicalV4Guard, lab.needsLexicalV4Guard);
  assert.equal(lexicalV4GuardText, lab.lexicalV4GuardText);
});

test("tileMintText semantics — guard, override, passthrough", () => {
  // lexical guard for labels that name a body sound
  assert.equal(tileMintText("coughing"),
    "[isolated dictionary word, do not make the sound] coughing.");
  assert.equal(tileMintText("sneeze"),
    "[isolated dictionary word, do not make the sound] sneeze.");
  // US-citation IPA overrides for laugh forms
  assert.equal(tileMintText("laughs"), "/lævz/");
  assert.equal(tileMintText("laugh"), "/lævz/");
  assert.equal(tileMintText("laughing"), "/ˈlæfɪŋ/");
  // a plain word passes through unchanged
  assert.equal(tileMintText("scientist"), "scientist");
  assert.equal(tileMintText("peanut butter"), "peanut butter");
  // explicit ipa (admin remint path)
  assert.equal(tileMintText("read", { ipa: "/ɹiːd/" }), "/ɹiːd/");
  assert.equal(tileMintText("ice cream", { ipa: "aɪs kriːm" }),
    "ice cream /aɪs kriːm/");
});

test("§ 4.2 text rules — charset allow list and length", () => {
  assert.equal(TILE_TEXT_MAX, 60);
  assert.equal(TILE_PROFILE, "v4-plain-1");
  for (const ok of ["scientist", "peanut butter", "mom's", "rock-a-bye",
    "c'mon", "what?", "3 pigs", "we&you", "ouch!", "j'adore"]) {
    assert.equal(TILE_TEXT_ALLOW_RE.test(ok), true, ok);
  }
  for (const bad of ["[whispers] hi", "hi/there", "<b>x</b>", "你好",
    "emoji 😀", "a|b", "x;y", "50%", "#tag", "@you"]) {
    assert.equal(TILE_TEXT_ALLOW_RE.test(bad), false, bad);
  }
});

test("formatElevenV4IpaLine — single words drop the grapheme", () => {
  assert.equal(formatElevenV4IpaLine("an", "æn"), "/æn/");
  assert.equal(formatElevenV4IpaLine("two words", "tuː wɜːdz"), "two words /tuː wɜːdz/");
});
