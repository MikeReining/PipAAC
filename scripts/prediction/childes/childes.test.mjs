// Works Test for the CHILDES pipeline helpers (017 current-order item 1).
// Always-on legs: RNG port vs CPython vectors, lemmatizer, band edges,
// split semantics. The phrase-table build itself is exercised by
// scripts/prediction/childes/build_phrase_table.mjs over the gitignored
// cache — counts only, no transcript text.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from './common.mjs';

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

test('multiword pieces stay honest: named aliases, else walls', () => {
  // a bare "done" is the "all done" tile (named alias); "way"/"ice"
  // are NOT "no way"/"ice cream" — a piece alone is a wall (020B)
  assert.equal(C.toLemma('done'), 'all done');
  assert.equal(C.toLemma('ice'), null);
  assert.equal(C.toLemma('way'), null);
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
