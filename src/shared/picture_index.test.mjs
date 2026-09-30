/**
 * 030 slice 1 — the picture index's pure truths: captions, the draw
 * subject, the score/auto rule, and the language tiebreak.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  captionForDrawing,
  captionLabels,
  decideAuto,
  editDistance,
  labelKey,
  drawSubject,
  queryText,
  resolveLanguage,
  scoreOf,
  signalsKey,
  spellingSuggestion,
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

test("caption labels: catalog strips the category, extended keeps only the label", () => {
  assert.deepEqual(
    captionLabels("stop · stops · stopping · Social Etiquette, Pragmatic Interjections & Urgent/Safety", "catalog"),
    ["stop", "stops", "stopping"]);
  assert.deepEqual(captionLabels("want · wants · wanting", "catalog"), ["want", "wants", "wanting"]);
  assert.deepEqual(captionLabels("green beans · Food · object", "extended"), ["green beans"]);
  assert.deepEqual(captionLabels("saxophone · Toys and play", "extended"), ["saxophone"]);
  assert.deepEqual(captionLabels("crocs", "drawn"), ["crocs"]);
  // A one-word caption is a label even when it collides with a suffix shape.
  assert.deepEqual(captionLabels("food", "drawn"), ["food"]);
});

test("auto tier 1: an exact English label wins at any rank, any score", () => {
  // The real "stop" failure: the stop symbol ranked 4th behind
  // off/out/stoplight — identity jumps it past every higher scorer.
  const cands = [
    { image_id: "off", caption: "off · offs", source: "catalog", score: 0.69 },
    { image_id: "out", caption: "out", source: "catalog", score: 0.66 },
    { image_id: "light", caption: "stoplight · Vehicles & Transportation", source: "catalog", score: 0.659 },
    { image_id: "stop", caption: "stop · stops · stopping", source: "catalog", score: 0.644 },
  ];
  assert.equal(
    decideAuto({ candidates: cands, text: "stop", scope: "common" }, { ...CFG, auto_cutoff: 1.01 }, "en"),
    "stop");
  // Variants count: "wants" names the want symbol.
  const wants = [
    { image_id: "want", caption: "want · wants · wanting", source: "catalog", score: 0.4 },
  ];
  assert.equal(
    decideAuto({ candidates: wants, text: "Wants", scope: "common" }, CFG, "en"),
    "want");
  // Segment equality, not substring: "stop" never matches "stoplight".
  const light = [
    { image_id: "light", caption: "stoplight · Vehicles & Transportation", source: "catalog", score: 0.5 },
  ];
  assert.equal(
    decideAuto({ candidates: light, text: "stop", scope: "common" }, CFG, "en"), null);
  // Identity scans the whole fetched pool — a label match ranked below
  // the displayed top_k still applies.
  const deep = {
    candidates: [{ image_id: "off", caption: "off", source: "catalog", score: 0.7 }],
    pool: [
      { image_id: "off", caption: "off", source: "catalog", score: 0.7 },
      { image_id: "go", caption: "go · goes · going", source: "catalog", score: 0.4 },
    ],
  };
  assert.equal(
    decideAuto({ ...deep, text: "go", scope: "common" }, { ...CFG, auto_cutoff: 1.01 }, "en"),
    "go");
});

test("auto tier 1: the label map applies a word the embedding never surfaced", () => {
  // The real "eat" failure: jam/naan/nuts/mayo outranked the actual
  // eat symbol, which sat below fetch_k — the lexical map still wins.
  const cands = [
    { image_id: "jam", caption: "jam · Food & Drink", source: "catalog", score: 0.68 },
    { image_id: "naan", caption: "naan · Food · object", source: "extended", score: 0.67 },
  ];
  const direct = [{ image_id: "img_eat", asset: "/symbols/eat.png", source: "catalog",
    caption: "eat · eats · eating · Daily Actions & Activity Verbs", sense: "sns_eat" }];
  assert.equal(
    decideAuto({ candidates: cands, direct, text: "eat", scope: "common" },
      { ...CFG, auto_cutoff: 1.01 }, "en"),
    "img_eat");
  // Even with zero vector candidates at all.
  assert.equal(
    decideAuto({ candidates: [], direct, text: "eat", scope: "common" }, CFG, "en"),
    "img_eat");
  // A homograph — one label, two senses ("orange" colour vs fruit) —
  // declines: the adult picks, no auto-apply.
  const orange = [
    { image_id: "img_fruit", caption: "orange · Food & Drink", source: "catalog", sense: "sns_fruit" },
    { image_id: "img_color", caption: "orange · Descriptors", source: "catalog", sense: "sns_color" },
  ];
  assert.equal(
    decideAuto({ candidates: cands, direct: orange, text: "orange", scope: "common" },
      { ...CFG, auto_cutoff: 1.01 }, "en"),
    null);
  // But a same-sense duplicate label is not a homograph — it applies.
  const dupe = [
    { image_id: "img_a", caption: "sofa", source: "catalog", sense: "sns_sofa" },
    { image_id: "img_b", caption: "couch", source: "catalog", sense: "sns_sofa" },
  ];
  assert.equal(
    decideAuto({ candidates: [], direct: dupe, text: "sofa", scope: "common" },
      { ...CFG, auto_cutoff: 1.01 }, "en"),
    "img_a");
  // And duplicate ART of the same word isn't either: catalog +
  // extended "blueberry" is one concept — catalog art wins.
  const blueberries = [
    { image_id: "img_bb", caption: "blueberry", source: "catalog", sense: "sns_bb" },
    { image_id: "ext_bb", caption: "blueberry · Food · object", source: "extended", sense: "ext_bb" },
  ];
  assert.equal(
    decideAuto({ candidates: [], direct: blueberries, text: "blueberry", scope: "common" },
      { ...CFG, auto_cutoff: 1.01 }, "en"),
    "img_bb");
});

test("label fold: spacing and hyphens are orthographic, not semantic", () => {
  assert.equal(labelKey("apple sauce"), "applesauce");
  assert.equal(labelKey("ice-cream"), labelKey("ice cream"));
  assert.equal(labelKey("hotdog"), labelKey("hot dog"));
  assert.equal(labelKey("Mom's"), labelKey("moms"));
  // A folded pool scan catches "hotdog" against caption "hot dog".
  const cands = [
    { image_id: "hd", caption: "hot dog · Food & Drink", source: "catalog", score: 0.5 },
  ];
  assert.equal(
    decideAuto({ candidates: cands, text: "hotdog", scope: "common" },
      { ...CFG, auto_cutoff: 1.01 }, "en"),
    "hd");
});

test("auto tier 1: language, scope, description, and block guards hold", () => {
  const cands = [
    { image_id: "pain", caption: "pain · Body, Health & Hygiene", source: "catalog", score: 0.762 },
  ];
  // French "pain" must not steal the English symbol.
  assert.equal(
    decideAuto({ candidates: cands, text: "pain", scope: "common" }, { ...CFG, auto_cutoff: 1.01 }, "fr"),
    null);
  // Personal scope never auto-applies catalog art.
  assert.equal(
    decideAuto({ candidates: [{ image_id: "gran", caption: "grandma", source: "catalog", score: 0.9 }],
      text: "grandma", scope: "personal" }, { ...CFG, auto_cutoff: 1.01 }, "en"),
    null);
  // A written description means the text alone isn't the meaning.
  assert.equal(
    decideAuto({ candidates: [{ image_id: "bat", caption: "bat", source: "catalog", score: 0.9 }],
      text: "bat", description: "the animal", scope: "common" }, { ...CFG, auto_cutoff: 1.01 }, "en"),
    null);
  // A blocked exact match is null — no neighbour substitutes.
  const stops = [
    { image_id: "off", caption: "off", source: "catalog", score: 0.69 },
    { image_id: "stop", caption: "stop · stops", source: "catalog", score: 0.644 },
  ];
  assert.equal(
    decideAuto({ candidates: stops, text: "stop", scope: "common", blocked: ["stop"] }, CFG, "en"),
    null);
});

test("edit distance: folded keys, the real typos land in range", () => {
  assert.equal(editDistance("bananna", "banana"), 1);
  assert.equal(editDistance("aple", "apple"), 1);
  assert.equal(editDistance("juce", "juice"), 1);
  assert.equal(editDistance("watr", "water"), 1);
  assert.equal(editDistance(labelKey("choclate milk"), labelKey("chocolate milk")), 1);
  assert.equal(editDistance("bananna", "apple"), 6); // unrelated stays far
});

test("typo suggestion: spelling AND the embedding pool must agree", () => {
  const entry = (id, label) => ({ image_id: id, asset: `/s/${id}.png`,
    source: "catalog", caption: `${label} · Food & Drink`, label });
  const labels = {
    banana: [entry("img_banana", "banana")],
    apple: [entry("img_apple", "apple")],
    juice: [entry("img_juice", "juice")],
    water: [entry("img_water", "water")],
    crane: [entry("img_crane", "crane")],
  };
  const poolOf = (...ids) => ids.map((image_id) => ({ image_id }));
  // The real rows: each typo suggests its word when the embedding
  // surfaced that word's picture too.
  for (const [typo, want] of [["bananna", "banana"], ["aple", "apple"],
    ["juce", "juice"], ["watr", "water"]]) {
    const sug = spellingSuggestion({
      key: labelKey(typo), labels, pool: poolOf(`img_${want}`, "img_crane"),
    });
    assert.equal(sug?.text, want, typo);
    assert.equal(sug?.image_id, `img_${want}`);
  }
  // Semantic disagreement vetoes: "crain" is one edit from "crane" but
  // the embedding never surfaced the crane — no suggestion.
  assert.equal(spellingSuggestion({
    key: "crain", labels, pool: poolOf("img_banana", "img_apple"),
  }), null);
  // A correctly spelled word is a label — never "corrected" (d=0).
  assert.equal(spellingSuggestion({
    key: "banana", labels, pool: poolOf("img_banana"),
  }), null);
  // Short words get one edit only — "apl"→"apple" is two edits, so a
  // 3-char key cannot reach a 5-char label.
  assert.equal(spellingSuggestion({
    key: "apl", labels, pool: poolOf("img_apple"),
  }), null);
});

test("typo suggestion: distance budget and best-match pick", () => {
  const entry = (id, label) => ({ image_id: id, source: "catalog",
    asset: `/s/${id}.png`, caption: `${label} · x`, label });
  const labels = {
    dog: [entry("img_dog", "dog")],
    door: [entry("img_door", "door")],
    apple: [entry("img_apple", "apple")],
    banana: [entry("img_banana", "banana")],
  };
  // "dof" (len 3) is one edit from "dog", two from "door" — but a
  // short word's budget is one edit, so only "dog" may suggest.
  const sug = spellingSuggestion({
    key: "dof", labels, pool: [{ image_id: "img_dog" }, { image_id: "img_door" }],
  });
  assert.equal(sug?.image_id, "img_dog");
  // A long word's budget is two: "bananana" → "banana" is d2.
  assert.equal(spellingSuggestion({
    key: "bananana", labels, pool: [{ image_id: "img_banana" }],
  })?.text, "banana");
  // Two candidates at equal distance: the one the embedding ranked
  // higher wins.
  const tie = spellingSuggestion({
    key: "banan", // d1 from banana
    labels,
    pool: [{ image_id: "img_apple" }, { image_id: "img_banana" }],
  });
  assert.equal(tie?.image_id, "img_banana");
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
