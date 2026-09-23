/**
 * Phase 004 slice 7 Works Test — next-word continuations while typing.
 *
 * The standard keystroke-savings measure with an "ideal user": for each
 * word, before each letter, if the target word is on one of the 4 strip
 * cards, tap it (1 tap); otherwise type the next letter (1 tap) and, when
 * the word is finished, space (1 tap). Three conditions on the same
 * fixture:
 *   A — no strip (letters and space only)
 *   B — slice-3 completions only (the board's pre-slice-7 behavior)
 *   C — completions + continuations (this slice)
 * Each run twice: empty event log, then after the fixture was entered
 * once so bigrams exist. Gates: with history C < B taps/word; empty log
 * C never worse than B. The instrument is the committed fixture graded
 * against the real catalog — the code under test cannot influence it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import { buildIndex, suggest } from "../../public/shared/spelling.mjs";
import {
  keyboardContinuations,
  logSelection,
  stripCandidates,
} from "../../public/shared/funnel.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";
import { TEST_MODEL } from "./test_model.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));
const fixture = JSON.parse(
  readFileSync(join(repoRoot, "src/board/fixtures/typing_sentences.en.json"), "utf8"),
);

const db = createDatabase(":memory:");
importCatalog(db, catalog);

/** normalized text -> sense id, for committing typed words like the board does. */
const lemmaByNorm = new Map();
const labelById = new Map(); // "kind:id" -> display text
for (const l of catalog.labels) {
  if (l.locale !== "en" || l.kind !== "lemma" || l.status !== "approved") continue;
  if (!lemmaByNorm.has(l.normalized_text)) lemmaByNorm.set(l.normalized_text, l.sense_id);
  labelById.set(`sense:${l.sense_id}`, l.text);
}

const INDEX = buildIndex(
  catalog.labels
    .filter((l) => l.locale === "en" && l.status === "approved")
    .map((l) => ({ kind: "sense", id: l.sense_id, text: l.text, freq: 0 })),
  "en",
);

test("fixture words are all approved English lemmas", () => {
  for (const s of fixture.sentences) {
    for (const w of s.split(" ")) {
      assert.ok(lemmaByNorm.has(normalizeV1(w)), `${w} in "${s}" is not an en lemma`);
    }
  }
  assert.ok(fixture.sentences.length >= 30);
});

/** The 4 cards an ideal user would see, for one condition. */
function cards(mode, items, buffer, clock) {
  if (mode === "A") return [];
  if (buffer) return suggest(INDEX, buffer, 4);
  if (items.length === 0) return [];
  const sents = items.map((i) => ({ kind: i.kind, id: i.id }));
  const picks =
    mode === "C"
      ? keyboardContinuations(db, sents, "en", clock, TEST_MODEL)
      : stripCandidates(db, sents, clock, "en", TEST_MODEL);
  return picks.map((p) => ({ kind: p.kind, id: p.id, text: labelById.get(`${p.kind}:${p.id}`) }));
}

let clock = 1_000_000;
function commit(items, word, id) {
  const item = { kind: "sense", id, text: word };
  items.push(item);
  logSelection(db, "sense", id, clock);
  clock += 1000; // words a second apart — well inside the 20 s bigram window
}

/** Run the fixture once under one condition; returns taps/word. */
function simulate(mode) {
  let taps = 0;
  let words = 0;
  for (const s of fixture.sentences) {
    const items = []; // a sentence clears after Enter/speak
    for (const word of s.split(" ")) {
      words++;
      let buffer = "";
      let tapped = null;
      for (const ch of word) {
        const hit = cards(mode, items, buffer, clock).find(
          (c) => normalizeV1(c.text ?? "") === word,
        );
        if (hit) {
          tapped = hit;
          taps += 1;
          break;
        }
        buffer += ch;
        taps += 1;
      }
      if (!tapped) taps += 1; // space commits the finished word
      commit(items, word, tapped ? tapped.id : lemmaByNorm.get(word));
    }
  }
  return { taps, words, perWord: taps / words };
}

function runPair(label) {
  const a = simulate("A");
  const b = simulate("B");
  const c = simulate("C");
  const savings = 1 - c.taps / a.taps;
  console.log(
    `${label}: A=${a.taps} taps, B=${b.taps} taps, C=${c.taps} taps` +
      ` over ${a.words} words — keystroke savings C vs A = ${(savings * 100).toFixed(1)}%`,
  );
  return { a, b, c, savings };
}

test("empty log: continuations never cost more than completions alone", () => {
  db.prepare("DELETE FROM learner_event_log").run();
  const { b, c } = runPair("empty log");
  assert.ok(c.taps <= b.taps, `C ${c.taps} > B ${b.taps} taps on an empty log`);
});

test("with history: continuations use fewer taps per word than completions", () => {
  db.prepare("DELETE FROM learner_event_log").run();
  simulate("C"); // enter the fixture once — bigrams now exist
  const { b, c } = runPair("with history");
  assert.ok(
    c.perWord < b.perWord,
    `C ${c.perWord.toFixed(2)} >= B ${b.perWord.toFixed(2)} taps/word with history`,
  );
});

test("an i tail invites core verbs after commit", () => {
  db.prepare("DELETE FROM learner_event_log").run();
  const items = [{ kind: "sense", id: lemmaByNorm.get("i"), text: "i" }];
  const picks = keyboardContinuations(db, items, "en", Date.now(), TEST_MODEL).map((p) => labelById.get(`${p.kind}:${p.id}`));
  console.log(`after "i": ${JSON.stringify(picks)}`);
  const coreVerbs = picks.filter((t) => ["want", "like", "go", "need", "feel"].includes(t));
  assert.ok(picks.length > 0 && coreVerbs.length > 0, `expected core verbs, got ${JSON.stringify(picks)}`);
});
