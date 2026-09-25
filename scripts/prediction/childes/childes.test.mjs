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

test('be-forms fold into the is-sense; object pronouns fold too (021)', () => {
  // toLemma still returns the surface lemma — the fold lives in
  // lemmatize so the phrase table holds one sense per meaning
  for (const w of ['am', 'is', 'are', 'was', 'were']) assert.equal(C.toLemma(w), w);
  assert.equal(C.toLemma('be'), null);
  assert.deepEqual(C.lemmatize(['i', 'am', 'happy']), ['i', 'is', 'happy']);
  assert.deepEqual(C.lemmatize(['we', 'are', 'here']), ['we', 'is', 'here']);
  // "be" is a form of the is-sense, not a wall anymore
  assert.deepEqual(C.lemmatize(['i', 'want', 'to', 'be', 'there']),
    ['i', 'want', 'to', 'is', 'there']);
  assert.deepEqual(C.lemmatize(['give', 'it', 'to', 'him']),
    ['give', 'it', 'to', 'he']);
  assert.deepEqual(C.lemmatize(['he', 'has', 'it']), ['he', 'have', 'it']);
  assert.deepEqual(C.lemmatize(['i', 'want', 'an', 'apple']),
    ['i', 'want', 'a', 'apple']);
});

test('contractions split into Pip parts, never ghost to a phrase', () => {
  // pronoun/wh-word + be/will tail splits when both parts are Pip words
  for (const [tok, out] of [
    ["i'm", ['i', 'is']], ["it's", ['it', 'is']], ["that's", ['that', 'is']],
    ["you're", ['you', 'is']], ["he's", ['he', 'is']], ["i'll", ['i', 'will']],
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

test('inflected multiword heads fold: the particle belongs to the token (021)', () => {
  // "he wakes up" is he + wakes up — not he + wake up + up (a stray
  // 'up' token once split every wake-up context in the phrase table)
  assert.deepEqual(
    C.analyzeLine(['he', 'wakes', 'up', 'early']).map((t) => t.lemma),
    ['he', 'wake up', null]);
  // an inflected standalone-head lemma still completes the multiword:
  // "cleaning up" is the clean-up sense, not clean(adjective) + up
  assert.deepEqual(
    C.analyzeLine(['she', 'is', 'cleaning', 'up']).map((t) => t.lemma),
    ['she', 'is', 'clean up']);
  // but "is clean" alone stays the adjective, and a lone "wake" keeps
  // its alias target without eating the next word
  assert.deepEqual(
    C.analyzeLine(['the', 'room', 'is', 'clean']).map((t) => t.lemma),
    ['the', null, 'is', 'clean']);
  assert.deepEqual(
    C.analyzeLine(['i', 'wake', 'him']).map((t) => t.lemma),
    ['i', 'wake up', 'he']);
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

test('pickForm: longest ending wins, pooled verbs fallback, next word flips (021)', async () => {
  const { pickForm } = await import('../../../public/shared/forms.mjs');
  const table = {
    aSense: 'sns_a',
    verbSenses: ['sns_need', 'sns_rare'],
    contexts: {
      'sns_he|sns_need': { 'V;PRS;3;SG': 50, BASE: 10 },
      'sns_he|sns_rare': {},
      'sns_he sns_is|sns_go': { 'V;V.PTCP;PRS': 300, BASE: 5 },
    },
    verbFree: { 'sns_he': { BASE: 9, 'V;PRS;3;SG': 40 } },
    nextVerb: { 'sns_what|sns_do|sns_he': { 'V;PRS;3;SG': 800, BASE: 4 } },
    aAn: { 'sns_apple': { 'DET;PHON': 60, BASE: 3 }, 'sns_ball': { BASE: 80 } },
  };
  // he + need -> needs (per-word table)
  assert.equal(pickForm(table, ['sns_he'], 'sns_need'), 'V;PRS;3;SG');
  // he is + go -> going: the 2-word ending answers
  assert.equal(pickForm(table, ['sns_he', 'sns_is'], 'sns_go'), 'V;V.PTCP;PRS');
  // a verb with no per-word row falls to the pooled verb table
  assert.equal(pickForm(table, ['sns_he'], 'sns_rare'), 'V;PRS;3;SG');
  // nothing anywhere -> default
  assert.equal(pickForm(table, ['sns_x', 'sns_y'], 'sns_x'), 'BASE');
  // next word flips: what + do + he -> does
  assert.equal(pickForm(table, ['sns_what'], 'sns_do', 'sns_he'), 'V;PRS;3;SG');
  // a/an by next word; no next-word data -> a
  assert.equal(pickForm(table, ['sns_i', 'sns_want'], 'sns_a', 'sns_apple'), 'DET;PHON');
  assert.equal(pickForm(table, ['sns_i', 'sns_want'], 'sns_a', 'sns_ball'), 'BASE');
  assert.equal(pickForm(table, ['sns_i'], 'sns_a', 'sns_zzz'), 'BASE');
});

test('pickForm: a tie falls to the shorter phrase; a tied ending vetoes its <s> subset (021 follow-up)', async () => {
  const { pickForm } = await import('../../../public/shared/forms.mjs');
  const table = {
    aSense: 'sns_a',
    verbSenses: ['sns_like'],
    contexts: {
      // line-start "my mom like" twice (BASE) — the same ending's broad
      // evidence is tied 2-2, so the ending doesn't decide at all and
      // 'mom|like' answers (the founder's my-mom case)
      '<s> sns_my sns_mom|sns_like': { BASE: 2 },
      'sns_my sns_mom|sns_like': { BASE: 2, 'V;PRS;3;SG': 2 },
      'sns_mom|sns_like': { 'V;PRS;3;SG': 97, BASE: 85 },
      // anchored stays decisive when the broad row is not tied
      '<s> sns_he|sns_go': { 'V;PRS;3;SG': 400, 'V;V.PTCP;PRS': 50 },
      'sns_he|sns_go': { 'V;V.PTCP;PRS': 800, 'V;PRS;3;SG': 100 },
      // a mid-level tie also falls through
      'sns_x sns_he|sns_go': { 'V;PRS;3;SG': 9, BASE: 9 },
    },
    verbFree: {}, nextVerb: {}, aAn: {},
  };
  assert.equal(
    pickForm(table, ['sns_my', 'sns_mom'], 'sns_like'), 'V;PRS;3;SG');
  // line-start "he go" still reads the anchored row (goes, not going)
  assert.equal(
    pickForm(table, ['sns_he'], 'sns_go'), 'V;PRS;3;SG');
  // mid-line "x he" + go: the plain 2-word ending decides (going)
  assert.equal(
    pickForm(table, ['sns_y', 'sns_he'], 'sns_go'), 'V;V.PTCP;PRS');
  // a tied mid ending falls to the 1-word ending's answer
  assert.equal(
    pickForm(table, ['sns_x', 'sns_he'], 'sns_go'), 'V;V.PTCP;PRS');
});
