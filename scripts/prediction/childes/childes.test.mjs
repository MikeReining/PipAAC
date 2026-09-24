// Works Test for the real-children scorer (017 current-order item 1).
// Always-on legs: RNG port vs CPython vectors, lemmatizer, band edges,
// split semantics. Cache-gated leg: with the gitignored CHILDES cache
// present, rebuild events and score the CHILDES books — prints the
// measured table beside the documented § Real children table and random.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as C from './common.mjs';
import * as S from './score.mjs';
import { build } from './book_model.mjs';

test('PyRandom reproduces CPython shuffle/randbelow', () => {
  assert.deepEqual(
    new C.PyRandom(20260923).shuffle([...Array(20).keys()]),
    [1, 5, 2, 13, 17, 14, 4, 12, 8, 16, 10, 0, 3, 15, 6, 18, 19, 9, 7, 11],
  );
  const r = new C.PyRandom(42);
  const o = [...Array(50).keys()];
  r.shuffle(o);
  assert.deepEqual(o.slice(0, 15), [25, 23, 19, 11, 4, 45, 26, 9, 29, 16, 31, 21, 12, 3, 39]);
});

test('lemmatizer maps inflections, irregulars, OOV', () => {
  assert.deepEqual(C.lemmatize(['went', 'home']), ['go', 'home']);
  assert.equal(C.toLemma('mommy'), 'mom');
  assert.equal(C.toLemma('nite'), 'night');
  assert.equal(C.toLemma('woof'), 'dog');
  assert.equal(C.toLemma('xyzzyqq'), null);
});

test('am/is/are are vocabulary words, not the ghost lemma be', () => {
  // surface lemmas win over IRREG: Pip has am/is/are tiles, not "be"
  assert.deepEqual(C.lemmatize(['i', 'am', 'happy']), ['i', 'am', 'happy']);
  for (const w of ['am', 'is', 'are', 'was', 'were']) assert.equal(C.toLemma(w), w);
  // no lemmatizer path may produce 'be' — Pip has no such tile
  for (const w of ['been', 'being', 'be']) assert.equal(C.toLemma(w), null);
});

test('contractions split into Pip parts, never ghost to a phrase', () => {
  // pronoun/wh-word + be/will tail splits when both parts are Pip words
  for (const [tok, out] of [
    ["i'm", ['i', 'am']], ["it's", ['it', 'is']], ["that's", ['that', 'is']],
    ["you're", ['you', 'are']], ["he's", ['he', 'is']], ["i'll", ['i', 'will']],
    ["what's", ['what', 'is']], ["there's", ['there', 'is']],
  ]) assert.deepEqual(C.lemmatize([tok]), out, `${tok}`);
  // negative contractions that are lemmas stay whole
  for (const tok of ["don't", "can't", "won't", "didn't"])
    assert.deepEqual(C.lemmatize([tok]), [tok]);
  // other n't splits stem + not
  assert.deepEqual(C.lemmatize(["isn't"]), ['is', 'not']);
  // a contraction must never map to a multi-word phrase (was: i'm ->
  // "wait, i'm spelling", you're -> "you're welcome")
  assert.equal(C.toLemma("i'm"), null);
  assert.equal(C.toLemma("you're"), null);
  // both parts must be Pip words: "let" is not a lemma -> let's is out
  assert.deepEqual(C.lemmatize(["let's"]), [null]);
  // phrase lemmas still match on expanded tokens
  assert.deepEqual(C.lemmatize(['i', "don't", 'know']), ['i don\'t know']);
});

test('multiword pieces resolve to the parent lemma, never a ghost', () => {
  // a bare "done" is the "all done" tile; "way" -> "no way"
  assert.equal(C.toLemma('done'), 'all done');
  assert.equal(C.toLemma('ice'), 'ice cream');
  assert.equal(C.toLemma('way'), 'no way');
  // a piece that is itself a lemma keeps its own lemma
  assert.equal(C.toLemma('all'), 'all');
  assert.equal(C.toLemma('my'), 'my');
  // every lemmatized token is either null or an offerable lemma —
  // no ghost lemmas anywhere in the pipeline
  const vocab = new Set(C.LEMMAS);
  for (const w of ['done', 'ice', 'way', 'wake', 'police', 'been', 'cookies',
                   'said', 'brought', 'gotta', 'lemme', 'nana', 'tummy',
                   'binky', 'veggies', 'pic']) {
    const l = C.toLemma(w);
    assert.ok(l === null || vocab.has(l), `${w} -> ${l} not offerable`);
  }
});

test('band edges and split semantics', () => {
  assert.equal(C.band(1.9), 'mlu_lt2');
  assert.equal(C.band(2), 'mlu_2_35');
  assert.equal(C.band(3.5), 'mlu_2_35');
  assert.equal(C.band(3.51), 'mlu_gt35');
  const { test: t, train } = C.splitIdx(100);
  assert.equal(t.size, 20);
  assert.equal(train.size, 80);
  for (const i of t) assert(!train.has(i));
});

// Baseline = the repo scorer's own measured numbers (founder ruling
// 2026-09-24: the repo's numbers are the baseline; the 5399d37 table was
// produced by a scratch iteration that predates the corpus download).
// 2026-09-24b: re-baselined after the contraction fix — be/will tails
// split into Pip words (i'm -> i am), so ~80k held-out tokens stop being
// OOV context-breakers. Every number rose; these are the measured values.
// 2026-09-24c: re-baselined for core board v2 (018) — is/mom/dad are
// root core now, so the non-core metric loses ~41k high-frequency
// events (the copula was the easiest target on the board). The
// all-words and 'no' cells already counted them; they don't move.
const BASELINE = {
  'CHILDES child speech': { mlu_lt2: [42.6, 12.6, 14.5], mlu_2_35: [51.5, 21.8, 23.7], mlu_gt35: [48.7, 26.1, 28.0] },
};
// R21 (item 6): all-words and 'no'-word cells, slot on vs off — same
// repo-measured basis as the table above.
const BASELINE_R21 = {
  mlu_lt2: [27.0, 85.4, 85.2], mlu_2_35: [39.0, 69.1, 68.2], mlu_gt35: [39.6, 66.6, 63.3],
};

test('real-children scorer: events + books reproduce the repo baseline', { skip: !existsSync(C.TRANSCRIPTS) && 'no CHILDES cache' }, () => {
  const trs = C.loadTranscripts();
  const { test: testIdx, train } = C.splitIdx(trs.length);
  assert.equal(trs.length, 10828);
  assert.equal(testIdx.size, 2165);
  const events = S.buildEvents(trs, testIdx);
  assert.equal(events.length, 938609); // deterministic port invariant
  assert.equal(events.filter((e) => !C.CORE.has(e.target)).length, 352018);
  const childBook = build([[1.0, (function* () {
    for (const i of [...train].sort((a, b) => a - b))
      for (const [s, w] of trs[i]) if (C.CHILD_TAGS.has(s)) yield w;
  })()]]);
  const out = S.score(childBook, events);
  const pct = (x) => +(x * 100).toFixed(1);
  const rand = pct(C.RANDOM_HIT);
  console.log(`\n  random top-4 = ${rand}% (4 of ${C.NONCORE_VOCAB} non-core)`);
  for (const b of C.BANDS) {
    const [el, ef, ea] = BASELINE['CHILDES child speech'][b];
    const [l, f, a] = [pct(out[b + '|later']), pct(out[b + '|first']), pct(out[b + '|afterAdult'])];
    console.log(`  ${b}: later ${l}%  first ${f}%  after-adult ${a}%`);
    assert.ok(Math.abs(l - el) <= 0.2, `later ${l} vs baseline ${el}`);
    assert.ok(Math.abs(f - ef) <= 0.2, `first ${f} vs baseline ${ef}`);
    assert.ok(Math.abs(a - ea) <= 0.2, `afterAdult ${a} vs baseline ${ea}`);
    const [eAll, eNo, eNoOff] = BASELINE_R21[b];
    const [al, no, noOff] = [pct(out[b + '|all']), pct(out[b + '|noSlot']), pct(out[b + '|noPlain'])];
    console.log(`           all ${al}%  'no' ${no}% (off ${noOff}%)`);
    assert.ok(Math.abs(al - eAll) <= 0.2, `all ${al} vs baseline ${eAll}`);
    assert.ok(Math.abs(no - eNo) <= 0.2, `noSlot ${no} vs baseline ${eNo}`);
    assert.ok(Math.abs(noOff - eNoOff) <= 0.2, `noPlain ${noOff} vs baseline ${eNoOff}`);
  }
});
