/**
 * 030 slice 1 — the picture index's pure truths: captions, the draw
 * subject, the score/auto rule, and the language tiebreak.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  captionForDrawing,
  decideAuto,
  drawSubject,
  queryText,
  resolveLanguage,
  scoreOf,
  signalsKey,
} from "./picture_index.mjs";

const CFG = { auto_cutoff: 0.6, auto_cutoff_by_lang: {}, pick_weight: 0.05, reject_weight: 0.1 };

test("query joins text and description with the caption separator", () => {
  assert.equal(queryText("  Apple  ", " red one "), "apple — red one");
  assert.equal(queryText("apple"), "apple");
});

test("WT8: a personal drawing's caption is the description — never the name", () => {
  const cap = captionForDrawing({
    scope: "personal", text: "Cooper", description: "Our Golden Retriever",
  });
  assert.equal(cap, "our golden retriever");
  assert.equal(/cooper/i.test(cap), false);
  assert.equal(captionForDrawing({
    scope: "common", text: "Trampoline", description: "in a backyard",
  }), "trampoline — in a backyard");
  assert.equal(captionForDrawing({ scope: "common", text: "Trampoline" }), "trampoline");
});

test("draw subject: personal keys by description alone, so two names share a drawing", () => {
  const cooper = drawSubject({ scope: "personal", text: "Cooper", description: "our golden retriever" });
  const max = drawSubject({ scope: "personal", text: "Max", description: "Our Golden Retriever" });
  assert.equal(cooper, "our golden retriever");
  assert.equal(cooper, max);
  assert.equal(drawSubject({ scope: "common", text: "Apple", description: "red" }), "apple|red");
});

test("signals key: personal counts against the description, common against the text", () => {
  assert.equal(signalsKey("personal", "Cooper", "our dog"), "our dog");
  assert.equal(signalsKey("common", "Apple Sauce", ""), "apple sauce");
});

test("score: picks lift, rejects sink, log-shaped", () => {
  assert.equal(scoreOf(0.5, {}, CFG), 0.5);
  const boosted = scoreOf(0.5, { picks: 20 }, CFG);
  assert.ok(boosted > 0.5);
  const sunk = scoreOf(0.5, { rejects: 20 }, CFG);
  assert.ok(sunk < 0.5);
});

test("auto: cutoff, per-language override, pin wins, block means null", () => {
  // decideAuto's contract: candidates arrive pre-sorted by score.
  const cands = [{ image_id: "b", score: 0.9 }, { image_id: "a", score: 0.7 }];
  assert.equal(decideAuto({ candidates: cands }, CFG, "en"), "b");
  const low = [{ image_id: "a", score: 0.5 }];
  assert.equal(decideAuto({ candidates: low }, CFG, "en"), null);
  const cfgDe = { ...CFG, auto_cutoff_by_lang: { de: 0.4 } };
  assert.equal(decideAuto({ candidates: low }, cfgDe, "de"), "a");
  assert.equal(decideAuto({ candidates: low, pinned: "z" }, CFG, "en"), "z");
  assert.equal(
    decideAuto({ candidates: low, blocked: ["a"] }, cfgDe, "de"), null);
});

test("language tiebreak: close top-two prefers the app locale", () => {
  assert.equal(resolveLanguage({
    choice: "en", probabilities: { en: 0.5, de: 0.42 }, locale: "de-DE",
  }), "de");
  // Not close: Jev's label stands.
  assert.equal(resolveLanguage({
    choice: "en", probabilities: { en: 0.9, de: 0.05 }, locale: "de-DE",
  }), "en");
  // Locale not in the top two: Jev's label stands.
  assert.equal(resolveLanguage({
    choice: "en", probabilities: { en: 0.4, fr: 0.39, de: 0.01 }, locale: "de",
  }), "en");
  assert.equal(resolveLanguage({ choice: "es", probabilities: { es: 1 } }), "es");
});
