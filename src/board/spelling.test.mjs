/**
 * Phase 004 slice 3 Works Test — forgiving completions. The matcher
 * finds the intended word through invented spelling, never requires
 * accents, keeps tiers in order, and stays under the keystroke budget.
 *
 * Instrument: the hand-authored invented_spellings.en.json fixture
 * (committed before the matcher existed) graded against the real built
 * catalog — the code under test cannot influence it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { addPersonalEntity } from "./entities.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import {
  buildIndex,
  foldKey,
  soundKeyEnV1,
  suggest,
} from "../../public/shared/spelling.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));
const fixture = JSON.parse(
  readFileSync(join(repoRoot, "src/board/fixtures/invented_spellings.en.json"), "utf8"),
);

const db = createDatabase(":memory:");
importCatalog(db, catalog);
const cooper = addPersonalEntity(db, {
  spokenName: "Cooper",
  photoKey: "fixture:cooper.png",
  category: "Animals & Nature",
});

/** The same entry snapshot board.js feeds buildIndex. */
function catalogEntries(locale = "en") {
  const senses = catalog.labels
    .filter((l) => l.locale === locale && l.status === "approved")
    .map((l) => ({
      kind: "sense",
      id: l.sense_id,
      text: l.text,
      labelKind: l.kind,
      freq: 0,
    }));
  const ents = db
    .prepare("SELECT id, spoken_name FROM personal_entity")
    .all()
    .map((e) => ({ kind: "entity", id: e.id, text: e.spoken_name, freq: 0 }));
  return [...senses, ...ents];
}

const INDEX = buildIndex(catalogEntries(), "en");

test("foldKey folds accents, ß, and separators — and leaves normalize_v1 alone", () => {
  assert.equal(foldKey("école"), "ecole");
  assert.equal(foldKey("Straße"), "strasse");
  assert.equal(foldKey("mother-in-law"), "motherinlaw");
  assert.equal(foldKey("it's"), "its");
  assert.equal(foldKey("all done"), "alldone");
  // normalize_v1 is a different instrument — accents and ß survive it
  assert.equal(normalizeV1("école"), "école");
  assert.equal(normalizeV1("Straße"), "straße");
});

test("sound key: digraphs and letter-name spellings land together", () => {
  assert.equal(soundKeyEnV1("elephant"), "alfnt");
  assert.equal(soundKeyEnV1("elfnt"), "alfnt");
  assert.equal(soundKeyEnV1("lefnt"), "lfnt"); // drops the letter-name lead vowel
  assert.equal(soundKeyEnV1("house"), soundKeyEnV1("hws"));
  assert.equal(soundKeyEnV1("phone"), soundKeyEnV1("fone"));
  assert.equal(soundKeyEnV1("chicken"), soundKeyEnV1("chikn"));
});

test("tiers: exact > prefix > typo > sound-alike", () => {
  // exact beats prefix
  const exact = suggest(INDEX, "and").map((e) => e.text);
  assert.equal(exact[0], "and");
  // prefix
  assert.ok(suggest(INDEX, "ju").some((e) => e.text === "juice"));
  // typo tier (OSA ≤1 on same-length prefix): 'watr' is a 1-edit typo of water's prefix
  const typo = suggest(INDEX, "watr").map((e) => e.text);
  assert.ok(typo.includes("water"), `expected water in ${typo}`);
  // sound-alike tier: 'lefnt' is not within OSA 1 of elephant's prefix but shares its sound key
  const sound = suggest(INDEX, "lefnt").map((e) => e.text);
  assert.ok(sound.includes("elephant"), `expected elephant in ${sound}`);
});

test("required fixture examples resolve in the top four", () => {
  const want = (typed, intended) => {
    const got = suggest(INDEX, typed, 4).map((e) => normalizeV1(e.text));
    assert.ok(got.includes(intended), `${typed} → ${intended}, got ${JSON.stringify(got)}`);
  };
  want("elfnt", "elephant");
  want("hws", "house");
  want("wtr", "water");
  want("kupr", "cooper"); // personal entity through the sound key
});

test("accent-first within a tier: exact-accent text wins", () => {
  const idx = buildIndex(
    [
      { kind: "sense", id: "s1", text: "papa", freq: 9 },
      { kind: "sense", id: "s2", text: "papá", freq: 1 },
      { kind: "sense", id: "s3", text: "école", freq: 1 },
      { kind: "sense", id: "s4", text: "Straße", freq: 1 },
    ],
    "es",
  );
  const papas = suggest(idx, "papá").map((e) => e.text);
  assert.equal(papas[0], "papá");
  assert.ok(papas.includes("papa")); // folded sibling still offered
  assert.equal(suggest(idx, "ecole")[0].text, "école"); // accent never required
  assert.equal(suggest(idx, "strasse")[0].text, "Straße");
});

test("a locale with no sound key skips tier 3 but keeps 0–2", () => {
  const fr = buildIndex([{ kind: "sense", id: "s1", text: "chapeau", freq: 0 }], "fr");
  assert.equal(fr.soundKey, null);
  assert.equal(suggest(fr, "chap").length, 1); // prefix works
  assert.equal(suggest(fr, "shapo").length, 0); // sound-alike does not fire
});

test("recall ≥ 85% over the invented-spelling fixture", () => {
  const misses = [];
  for (const p of fixture.pairs) {
    const got = suggest(INDEX, p.typed, 4).map((e) => normalizeV1(e.text));
    if (!got.includes(p.intended)) {
      misses.push(`${p.typed}→${p.intended} (got ${JSON.stringify(got)})`);
    }
  }
  const recall = (fixture.pairs.length - misses.length) / fixture.pairs.length;
  console.log(
    `invented-spelling recall: ${fixture.pairs.length - misses.length}/${fixture.pairs.length}` +
      ` = ${(recall * 100).toFixed(1)}%` +
      (misses.length ? `; misses: ${misses.join(" | ")}` : ""),
  );
  assert.ok(recall >= 0.85, `recall ${(recall * 100).toFixed(1)}% < 85%`);
});

test("precision: every catalog lemma typed in full ranks its sense first", () => {
  const lemmas = new Map(); // normalized text -> [sense ids]
  for (const l of catalog.labels) {
    if (l.locale !== "en" || l.kind !== "lemma" || l.status !== "approved") continue;
    if (!lemmas.has(l.normalized_text)) lemmas.set(l.normalized_text, []);
    lemmas.get(l.normalized_text).push(l.sense_id);
  }
  for (const [norm, ids] of lemmas) {
    const top = suggest(INDEX, norm, 4)[0];
    assert.ok(
      top && top.kind === "sense" && ids.includes(top.id),
      `lemma ${norm} ranked ${top?.kind}:${top?.text} first`,
    );
  }
});

test("first-3-letters: every prefix hit outranks every typo/sound hit", () => {
  const isPrefixHit = (e, p) =>
    foldKey(e.text).startsWith(p) || e.text.split(/\s+/).some((w) => foldKey(w).startsWith(p));
  const lemmas = catalog.labels.filter(
    (l) => l.locale === "en" && l.kind === "lemma" && l.status === "approved",
  );
  for (const l of lemmas) {
    const p = foldKey(l.text).slice(0, 3);
    if (p.length < 3) continue;
    const results = suggest(INDEX, p, 4);
    let sawNonPrefix = false;
    for (const e of results) {
      if (isPrefixHit(e, p)) assert.ok(!sawNonPrefix, `${p}: prefix hit ${e.text} ranked after a non-prefix hit`);
      else sawNonPrefix = true;
    }
  }
});

test("suggestions cap at four", () => {
  assert.ok(suggest(INDEX, "a", 4).length <= 4);
  assert.ok(suggest(INDEX, "s", 4).length <= 4);
});

test("entity typed-name joins the index: kupr offers Cooper", () => {
  const got = suggest(INDEX, "kupr", 4);
  const hit = got.find((e) => e.kind === "entity");
  assert.ok(hit, `no entity in ${JSON.stringify(got.map((e) => e.text))}`);
  assert.equal(hit.id, cooper.id);
});

test("median suggest() under 5 ms over the full catalog + entities", () => {
  const inputs = [
    ...fixture.pairs.map((p) => p.typed),
    ...catalog.labels
      .filter((l) => l.locale === "en" && l.kind === "lemma")
      .flatMap((l) => [l.normalized_text.slice(0, 2), l.normalized_text.slice(0, 3)]),
  ];
  const times = [];
  for (let i = 0; i < 1000; i++) {
    const s = performance.now();
    suggest(INDEX, inputs[i % inputs.length], 4);
    times.push(performance.now() - s);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  console.log(`suggest() median over ${times.length} inputs: ${median.toFixed(3)} ms`);
  assert.ok(median < 5, `median ${median.toFixed(2)} ms ≥ 5 ms`);
});
