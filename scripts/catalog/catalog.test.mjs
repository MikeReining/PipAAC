import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseLaunchLexiconMarkdown } from "./extract_launch_lexicon.mjs";
import {
  buildCatalog,
  buildDigitAliases,
  parseCoordinateMapMarkdown,
} from "./build_catalog.mjs";
import { clipPayloadFromWbb, summarizeAudioResolution } from "./wbb_audio.mjs";
import { PARTNER_SENSES } from "../../public/shared/keymaps.mjs";
import { localPathForAudioKey, r2GetArgs } from "./storage.mjs";
import { repoRoot } from "./paths.mjs";

test("parseLaunchLexiconMarkdown extracts 680 tier 1+2 words", () => {
  const raw = readFileSync(join(repoRoot, "docs/product/Initial_Vocabulary_600.md"), "utf8");
  const parsed = parseLaunchLexiconMarkdown(raw);
  assert.equal(parsed.entries.length, 680);
  assert.equal(parsed.entries[0].spokenText, "I");
  assert.equal(parsed.entries[0].tier, 1);
  const tier1 = parsed.entries.filter((e) => e.tier === 1);
  assert.equal(tier1.length, 78);
});

test("lexicon spoken texts are clean — no compound artifact words", () => {
  const raw = readFileSync(join(repoRoot, "docs/product/Initial_Vocabulary_600.md"), "utf8");
  const parsed = parseLaunchLexiconMarkdown(raw);
  const bySlot = new Map(parsed.entries.map((e) => [e.slot, e]));
  for (const [slot, want] of [
    [248, "wipe"], [529, "clean"], [521, "light"], [509, "orange"],
    [511, "pink"], [552, "light"], [606, "bathroom"],
  ]) {
    assert.equal(bySlot.get(slot).spokenText, want);
  }
  // "dark color" was a duplicate of "dark" (#205); the digits are gone —
  // Numbers & Counting's word forms are the only 1–10 set.
  assert.ok(!bySlot.has(551), "dark color duplicate must be removed");
  for (const slot of [577, 578, 579, 580, 581, 582]) {
    assert.ok(!bySlot.has(slot), `digit slot ${slot} must be removed`);
  }
  const digits = parsed.entries.filter((e) => /^[0-9]+$/.test(e.spokenText));
  assert.deepEqual(digits, []);
});

test("cross-listed Tier 1 senses carry a valid zone category", () => {
  const raw = readFileSync(join(repoRoot, "docs/product/Initial_Vocabulary_600.md"), "utf8");
  const parsed = parseLaunchLexiconMarkdown(raw);
  const cross = parsed.entries.filter((e) => e.tier === 1 && e.category);
  assert.equal(cross.length, 16);
  const zones = new Set(parsed.entries.filter((e) => e.tier === 2).map((e) => e.category));
  for (const e of cross) assert.ok(zones.has(e.category), `unknown zone: ${e.category}`);
  const byWord = new Map(cross.map((e) => [e.spokenText, e.category]));
  assert.equal(byWord.get("mom"), "People, Family & Roles");
  assert.equal(byWord.get("dad"), "People, Family & Roles");
  assert.equal(byWord.get("sad"), "Feelings, Emotions & Sensory States");
  assert.equal(byWord.get("hurt"), "Body, Health & Hygiene");
  assert.equal(byWord.get("help"), "Social Etiquette, Pragmatic Interjections & Urgent/Safety");
});

test("homograph senses share one utterance; only the owner label is default", () => {
  const lexRaw = readFileSync(join(repoRoot, "docs/product/Initial_Vocabulary_600.md"), "utf8");
  const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
  const catalog = buildCatalog(
    parseLaunchLexiconMarkdown(lexRaw),
    parseCoordinateMapMarkdown(mapRaw),
  );
  // Three shared spoken texts: orange (131/509), bathroom (158/606), light (521/552).
  assert.equal(catalog.utterances.length, catalog.senses.length - 3);
  for (const [word, owner] of [["orange", "sns_0131"], ["bathroom", "sns_0158"], ["light", "sns_0521"]]) {
    const group = catalog.labels.filter((l) => l.normalized_text === word);
    assert.equal(group.length, 2, `${word} should have two sense labels`);
    const utts = new Set(group.map((l) => l.utterance_id));
    assert.equal(utts.size, 1, `${word} labels must share one utterance`);
    const owners = group.filter((l) => l.default_for_text === 1);
    assert.equal(owners.length, 1);
    assert.equal(owners[0].sense_id, owner);
  }
});

test("digit aliases 1–10 land on their Number sense, sharing its utterance (004 slice 2)", () => {
  const lexRaw = readFileSync(join(repoRoot, "docs/product/Initial_Vocabulary_600.md"), "utf8");
  const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
  const catalog = buildCatalog(
    parseLaunchLexiconMarkdown(lexRaw),
    parseCoordinateMapMarkdown(mapRaw),
  );
  const lemmaOf = catalog.labels.filter(
    (l) => l.kind === "lemma" && l.part_of_speech === "Number",
  );
  const lemmaByText = new Map(lemmaOf.map((l) => [l.normalized_text, l]));
  for (const [digit, word] of Object.entries(
    JSON.parse(readFileSync(join(repoRoot, "data/number_aliases.json"), "utf8")).locales.en,
  )) {
    const alias = catalog.labels.find((l) => l.kind === "alias" && l.text === digit);
    assert.ok(alias, `alias label for ${digit}`);
    const lemma = lemmaByText.get(word);
    assert.ok(lemma, `lemma for ${word}`);
    assert.equal(alias.sense_id, lemma.sense_id, `${digit} must sit on ${word}'s sense`);
    assert.equal(alias.utterance_id, lemma.utterance_id, `${digit} plays ${word}'s clip`);
    assert.equal(alias.status, "approved");
    assert.equal(alias.default_for_text, 1);
    assert.equal(alias.part_of_speech, "Number");
  }
});

test("a digit alias resolving to zero or two senses fails the build", () => {
  const lexicon = {
    entries: [
      { slot: 1, spokenText: "one", partOfSpeech: "Number" },
      { slot: 2, spokenText: "Two", partOfSpeech: "Number" },
      { slot: 3, spokenText: "two", partOfSpeech: "Number" },
      { slot: 4, spokenText: "one", partOfSpeech: "Noun" },
    ],
  };
  // zero Number senses
  assert.throws(() =>
    buildDigitAliases(lexicon, { locales: { en: { "9": "nine" } } }),
  );
  // two Number senses share the normalized lemma
  assert.throws(() =>
    buildDigitAliases(lexicon, { locales: { en: { "2": "two" } } }),
  );
  // a non-Number homograph must not count
  const ok = buildDigitAliases(lexicon, { locales: { en: { "1": "one" } } });
  assert.equal(ok[0].sense_id, "sns_0001");
});

test("every PARTNER_SENSES id exists with an approved lemma per locale (004 slice 4)", () => {
  const lexRaw = readFileSync(join(repoRoot, "docs/product/Initial_Vocabulary_600.md"), "utf8");
  const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
  const catalog = buildCatalog(
    parseLaunchLexiconMarkdown(lexRaw),
    parseCoordinateMapMarkdown(mapRaw),
  );
  const senseIds = new Set(catalog.senses.map((s) => s.id));
  // When a second locale ships its labels, the same assertion runs for
  // it — a market cannot launch with a silent partner key.
  for (const locale of ["en"]) {
    for (const id of PARTNER_SENSES) {
      assert.ok(senseIds.has(id), `partner sense ${id} missing`);
      assert.ok(
        catalog.labels.some(
          (l) =>
            l.sense_id === id &&
            l.locale === locale &&
            l.kind === "lemma" &&
            l.status === "approved",
        ),
        `partner sense ${id} has no approved ${locale} lemma`,
      );
    }
  }
});

test("clipPayloadFromWbb maps manifest fields", () => {
  const payload = clipPayloadFromWbb({
    id: "aud_abc",
    key: "audio/dog/deadbeeff00d.mp3",
    verifiedSha256: "deadbeeff00ddeadbeeff00ddeadbeeff00ddeadbeeff00ddeadbeeff00d",
    source: "bitsboard-recorded",
    voice: "recorded",
    spokenText: "dog",
    senseId: "dog",
  });
  assert.deepEqual(payload, {
    key: "audio/dog/deadbeeff00d.mp3",
    sha256: "deadbeeff00ddeadbeeff00ddeadbeeff00ddeadbeeff00ddeadbeeff00d",
    source: "bitsboard-recorded",
    voice: "recorded",
    wbbAudioId: "aud_abc",
    spokenText: "dog",
  });
});

test("summarizeAudioResolution counts hits and misses", () => {
  const summary = summarizeAudioResolution([
    { status: "hit" },
    { status: "hit" },
    { status: "miss" },
  ]);
  assert.deepEqual(summary, { total: 3, hits: 2, misses: 1 });
});

test("localPathForAudioKey mirrors R2 layout", () => {
  const path = localPathForAudioKey("/cache", "audio/cat/abc123def456.mp3");
  assert.equal(path, "/cache/audio/cat/abc123def456.mp3");
});

test("r2GetArgs targets workbookbench-catalog", () => {
  assert.deepEqual(r2GetArgs("audio/x/y.mp3", "/tmp/y.mp3"), [
    "r2",
    "object",
    "get",
    "workbookbench-catalog/audio/x/y.mp3",
    "--file",
    "/tmp/y.mp3",
    "--remote",
  ]);
});
