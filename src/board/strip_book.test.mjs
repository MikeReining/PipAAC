/**
 * 017 step 7 Works Test — score every word; the book drives day one.
 *
 * Proves against the shipped opening book itself: a brand-new user with
 * no history gets the book's words in the strip — book-strong contexts
 * (its top word beats the grammar invite), sentence start (the start
 * table fills all four slots), and hidden words never appear even when
 * the book backs them. Plus: no book and no history still renders no
 * strip (the support gate), and a full-pool score stays inside a sane
 * latency bound. The same opening_book.mjs lookup feeds the funnel
 * feature and the expectations below — the strip shows what the
 * scorer scored.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { stripScored, stripCandidates, bookBand, noSlotOrder } from "../../public/shared/funnel.mjs";
import { bookScores } from "../../public/shared/opening_book.mjs";
import catalog from "../../data/catalog/catalog.json" with { type: "json" };
import defaults from "../../data/prediction/defaults.json" with { type: "json" };

const repoRoot = join(import.meta.dirname, "../..");
const BOOK = JSON.parse(
  readFileSync(join(repoRoot, "data/prediction/opening_book.en.json"), "utf8"));
const MODEL = { weights: { ...defaults.weights.local_only }, tau: defaults.tau, book: BOOK };
const NOW = Date.parse("2026-09-24T08:20:00");

const fresh = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

const lemmaOf = (db, id) =>
  db.prepare(
    `SELECT normalized_text AS t FROM label
     WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'`,
  ).all(id)[0]?.t;
const anySenseOf = (db, lemma) =>
  db.prepare(
    `SELECT lb.sense_id AS id FROM label lb
     WHERE lb.normalized_text = ? AND lb.kind = 'lemma'
       AND lb.status = 'approved' AND lb.locale = 'en'`,
  ).all(lemma)[0]?.id;
const ctxItems = (db, words) =>
  words.map((w) => ({ kind: "sense", id: anySenseOf(db, w) }));

/** The catalog's negation lemmas (R21) — same derivation the device
 *  reads via sense.negation, never a hand-kept list. */
const lemmaById = Object.fromEntries(
  catalog.labels.filter((l) => l.kind === "lemma").map((l) => [l.sense_id, l.normalized_text]));
const NEG = new Set(
  catalog.senses.filter((s) => s.negation).map((s) => lemmaById[s.id]).filter(Boolean));

/** The book's top-N continuations this db can offer under the shipped
 *  defaults: any sense (core words included — Show board words is on),
 *  not hidden, ordered by the book then through the same noSlotOrder
 *  the strip paints with. */
function expectedOffer(db, ctx, n = 4) {
  const hidden = new Set(
    db.prepare("SELECT sense_id AS id FROM sense_mask WHERE status = 'hidden'")
      .all().map((r) => lemmaOf(db, r.id)));
  const ranked = [...bookScores(BOOK, bookBand(db), ctx).entries()]
    .filter(([w]) => !hidden.has(w) && anySenseOf(db, w))
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  return noSlotOrder(ranked, n, (w) => NEG.has(w));
}

test("day one: book-strong contexts lead the strip ('i need' → a, the)", () => {
  const db = fresh();
  const shown = stripCandidates(db, ctxItems(db, ["i", "need"]), NOW, "en", MODEL)
    .map((c) => lemmaOf(db, c.id));
  const expected = expectedOffer(db, ["i", "need"]);
  // The book's top two offerable words carry enough probability to beat
  // every grammar-invited noun — they must lead the strip.
  assert.deepEqual(shown.slice(0, 2), expected.slice(0, 2),
    "the book's top continuations must lead a day-one strip");
  assert.ok(shown.length >= 2, "the strip is populated on day one");
});

test("day one at position 0: the start table fills the strip", () => {
  const db = fresh();
  const shown = stripCandidates(db, [], NOW, "en", MODEL).map((c) => lemmaOf(db, c.id));
  assert.deepEqual(shown, expectedOffer(db, []),
    "an empty sentence offers the book's sentence-start words, in order");
});

test("a hidden word never appears, even when the book backs it", () => {
  const db = fresh();
  const ctx = ["i", "need"];
  const target = expectedOffer(db, ctx)[0];
  db.prepare(
    "INSERT INTO sense_mask (sense_id, status) VALUES (?, 'hidden')")
    .run(anySenseOf(db, target));
  const shown = stripCandidates(db, ctxItems(db, ctx), NOW, "en", MODEL)
    .map((c) => lemmaOf(db, c.id));
  assert.ok(!shown.includes(target), `hidden word '${target}' showed`);
  assert.equal(shown[0], expectedOffer(db, ctx)[0],
    "the next book word inherits the lead slot (invited words fill the rest)");
});

test("full-pool scoring stays inside a sane latency bound", () => {
  const db = fresh();
  const ctx = ctxItems(db, ["i", "want"]);
  stripScored(db, ctx, NOW, "en", MODEL); // warm the statements
  const t0 = performance.now();
  const { candidates } = stripScored(db, ctx, NOW, "en", MODEL);
  const ms = performance.now() - t0;
  console.log(`  stripScored (${candidates.length}-candidate shortlist): ${ms.toFixed(1)}ms`);
  assert.ok(ms < 500,
    `scoring the whole pool took ${ms.toFixed(0)}ms — step 17's budget is in trouble`);
});

test("no book, no history: nothing is offered (support gate)", () => {
  const db = fresh();
  const noBook = { weights: { ...MODEL.weights }, tau: MODEL.tau };
  const shown = stripCandidates(db, [], NOW, "en", noBook);
  assert.deepEqual(shown, [],
    "with no book and no history there is no support — the strip stays empty");
});
