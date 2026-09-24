// Works Test — 017 step 23, the opening book.
// (a) manifest: licenses on the allow list or a written permission file;
//     source hashes verified for what is on disk.
// (b) build: deterministic bytes, train split only, closed vocabulary,
//     interpolated ctx rows, ~2 MB.
// (c) score: the shipped file, through the device lookup, on the item-1
//     scorer — reported beside random, split first/later/after-adult.
// (d) device: funnel `book` feature, book_band setting, worker route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as C from '../childes/common.mjs';
import { build, topWords } from '../childes/book_model.mjs';
import { buildEvents, scoreEvents } from '../childes/score.mjs';
import { bookTop, bookScores, bookLogP } from '../../../public/shared/opening_book.mjs';
import { buildBook, serialize, BOOK_PATH, manifest, streamsFor } from './build_book.mjs';
import { createDatabase, importCatalog } from '../../../src/board/catalog.mjs';
import catalog from '../../../data/catalog/catalog.json' with { type: 'json' };
import { setSetting } from '../../../public/shared/groups.mjs';
import { bookBand, features, featureEnv } from '../../../public/shared/funnel.mjs';

const LICENSES = new Set(['ours', 'MIT', 'CC0', 'CC0-1.0', 'CC BY 4.0', 'CDLA-Sharing-1.0']);
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const PCT = (x) => (x * 100).toFixed(1) + '%';

test('(a) every source is licensed or permitted, with pinned hashes', () => {
  const m = manifest();
  assert.ok(Object.keys(m.sources).length >= 5);
  for (const [name, s] of Object.entries(m.sources)) {
    assert.ok(
      LICENSES.has(s.license) || (s.permission && existsSync(path.join(C.REPO, s.permission))),
      `${name}: license "${s.license}" not on the allow list and no permission file`,
    );
    assert.ok(s.sha256?.length === 64, `${name}: sha256 missing`);
    const p = s.path ? path.join(C.REPO, s.path) : s.cache ? path.join(C.CACHE, s.cache) : null;
    if (p && existsSync(p)) assert.equal(sha(p), s.sha256, `${name}: hash drifted`);
  }
});

// A tiny corpus fixture: train transcript 0 has real utterances; test
// transcript 1 repeats one ctx nobody else produces. Both land mid-band.
function fixtureTrs() {
  const mk = (rows) => rows.map(([s, t]) => [s, t.split(' ')]);
  return [
    mk([
      ['CHI', 'i want cookie'], ['CHI', 'that good'], ['MOT', 'do you want juice'],
      ['CHI', 'i want more'], ['CHI', 'mama look'], ['CHI', 'i want juice'],
      ['CHI', 'cookie good'], ['CHI', 'i like cookie'],
    ]),
    mk([
      ['CHI', 'zebra zebra zebra'], ['CHI', 'zebra zebra zebra'], ['MOT', 'look at that'],
      ['CHI', 'zebra zebra zebra'], ['CHI', 'zebra zebra zebra'], ['CHI', 'zebra zebra zebra'],
      ['CHI', 'zebra zebra zebra'],
    ]),
  ];
}

test('(b) build is byte-deterministic and reads only the train split', () => {
  const trs = fixtureTrs();
  const weights = { mlu_2_35: { childes_chi: 1 } };
  const args = { trs, trainIdx: new Set([0]), bandWeights: weights, triTop: 32, triMin: 1, biTop: 32, biMin: 1 };
  const a = serialize(buildBook(args));
  const b = serialize(buildBook(args));
  assert.equal(a, b, 'rebuild drifted');
  const book = JSON.parse(a);
  assert.equal(book.version, 2);
  assert.deepEqual(Object.keys(book.bands), C.BANDS);
  // the held-out transcript's ctx never lands in the book (R11 + step 23c)
  assert.equal(book.bands.mlu_2_35.tri['zebra zebra'], undefined, 'test transcript leaked');
  assert.equal(book.bands.mlu_2_35.bi['zebra'], undefined, 'test transcript leaked');
  assert.ok(book.bands.mlu_2_35.tri['i want'], 'train ctx missing');
});

test('(b) the shipped file ships only aggregate probabilities over the vocabulary', () => {
  assert.ok(existsSync(BOOK_PATH), 'run build_book.mjs first');
  const raw = readFileSync(BOOK_PATH, 'utf8');
  const book = JSON.parse(raw);
  assert.equal(book.version, 2);
  const vocab = new Set(C.LEMMAS);
  // ctx keys are 1–2 lemmas joined by a space; lemmas may contain spaces
  // themselves, so validate by prefix-matching real lemmas
  const ctxIsLemmas = (key, n) => {
    const rest = C.LEMMAS.filter((l) => key.startsWith(l + ' '))
      .map((l) => key.slice(l.length + 1));
    if (n === 1) return vocab.has(key);
    return rest.some((r) => ctxIsLemmas(r, n - 1));
  };
  for (const band of C.BANDS) {
    const d = book.bands[band];
    for (const [table, n] of [['tri', 2], ['bi', 1]])
      for (const key of Object.keys(d[table])) {
        assert.ok(ctxIsLemmas(key, n), `ctx key "${key}" not lemmas`);
        for (const [w, p] of Object.entries(d[table][key])) {
          assert.ok(vocab.has(w), `word "${w}" not a lemma`);
          assert.ok(p > 0 && p <= 1, `bad probability ${p} for ${w}`);
        }
      }
    for (const table of ['uni', 'start'])
      for (const [w, p] of Object.entries(d[table])) {
        assert.ok(vocab.has(w), `${table} "${w}" not a lemma`);
        assert.ok(p > 0 && p <= 1, `bad probability ${p} for ${w}`);
      }
  }
  // no transcript text, speaker tags, or ids can hide in the file (R11)
  assert.ok(!/[<>]|CHI|MOT|FAT|\d{6}/.test(raw), 'raw transcript marker in the book');
  const mb = raw.length / 1e6;
  assert.ok(mb < 3, `book is ${mb.toFixed(2)} MB — over the ~2 MB target`);
  console.log(`  book size ${mb.toFixed(2)} MB`);
});

test('(d) bookTop/bookScores/bookLogP mirror the scorer interpolation', () => {
  const book = {
    version: 2,
    bands: {
      mlu_2_35: {
        tri: { 'i want': { cookie: 0.9, more: 0.55 } },
        bi: { i: { want: 0.6, like: 0.3 }, want: { more: 0.4 } },
        uni: { cookie: 0.1, more: 0.1, want: 0.2, like: 0.05 },
        start: { i: 0.4, want: 0.1, cookie: 0.05 },
      },
    },
  };
  // 2-word ctx interpolates tri + bi + uni: cookie .9*.55+.1*.15=.51,
  // more .55*.55+.4*.30+.1*.15=.4375, want .6*.30+.2*.15=.21
  assert.deepEqual(bookTop(book, 'mlu_2_35', ['i', 'want'], 2), ['cookie', 'more']);
  // unknown 2-word ctx still gets bi(last) + uni, like the scorer
  assert.deepEqual(bookTop(book, 'mlu_2_35', ['totally', 'i'], 2), ['want', 'like']);
  assert.deepEqual(bookTop(book, 'mlu_2_35', [], 2), ['i', 'want']);
  // filter drops words; start fills the tail
  assert.deepEqual(
    bookTop(book, 'mlu_2_35', ['i', 'want'], 4, new Set(['cookie'])),
    ['more', 'i', 'want'],
  );
  assert.ok(Math.abs(bookLogP(book, 'mlu_2_35', ['i', 'want'], 'cookie') - Math.log(0.51)) < 1e-9);
  assert.ok(Number.isFinite(bookLogP(book, 'mlu_2_35', ['i', 'want'], 'zebra')));
  assert.ok(bookScores(book, 'mlu_2_35', ['i', 'want']).get('cookie') === 0.51);
});

test('(d) funnel book feature: senses get P, entities stay neutral', () => {
  const db = createDatabase(':memory:');
  importCatalog(db, catalog);
  assert.equal(bookBand(db), 'mlu_2_35');
  setSetting(db, 'book_band', 'mlu_lt2');
  assert.equal(bookBand(db), 'mlu_lt2');
  const book = { version: 2, bands: { mlu_lt2: { tri: {}, bi: { i: { want: 0.4 } }, uni: { want: 0.1 }, start: { i: 0.5 } } } };
  const byLemma = (w) => db
    .prepare("SELECT sense_id AS id FROM label WHERE normalized_text = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'")
    .all(w)[0]?.id;
  const sentence = [{ kind: 'sense', id: byLemma('i') }];
  const env = featureEnv(db, sentence, Date.now(), 'en', null, book);
  const want = byLemma('want');
  const x = features(db, { kind: 'sense', id: want }, env);
  assert.equal(x.book, 0.30 * 0.4 + 0.15 * 0.1, 'book feature is interpolated P(word|ctx)');
  const e = features(db, { kind: 'entity', id: 'ent_x' }, env);
  assert.equal(e.book, 0, 'entity should be book-neutral');
});

test('(d) worker serves the shipped book', async () => {
  const worker = (await import('../../../src/worker/index.js')).default;
  const res = await worker.fetch(new Request('https://x/opening_book.en.json'), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.version, 2);
  assert.deepEqual(Object.keys(body.bands), C.BANDS);
});

test('(c) shipped file scores on held-out CHILDES, beside random', { skip: !existsSync(C.TRANSCRIPTS) }, async () => {
  const trs = C.loadTranscripts();
  const { test: testIdx, train } = C.splitIdx(trs.length);
  const events = buildEvents(trs, testIdx);
  const file = JSON.parse(readFileSync(BOOK_PATH, 'utf8'));
  const m = manifest();
  const mem = {};
  for (const band of C.BANDS)
    mem[band] = build(streamsFor(band, m.bands[band] ?? {}, trs, train));
  const outFile = scoreEvents(events, (e) => bookTop(file, e.band, e.ctx, 4, C.CORE));
  const outMem = scoreEvents(events, (e) => topWords(mem[e.band], e.ctx, 4));
  console.log(`  random top-4 = ${PCT(C.RANDOM_HIT)}`);
  for (const band of C.BANDS) {
    for (const pos of ['later', 'first', 'afterAdult']) {
      const k = band + '|' + pos;
      console.log(`  ${k.padEnd(20)} file ${PCT(outFile[k] ?? 0)}  mem ${PCT(outMem[k] ?? 0)}`);
      // file lookup must track the in-memory band book within a point
      assert.ok(Math.abs((outFile[k] ?? 0) - (outMem[k] ?? 0)) <= 0.01, `${k}: file vs memory drift`);
    }
  }
});
