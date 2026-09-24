// Source-mix sweep for the opening book (step 23 item b's "one cheap
// sweep"). Builds each source's count tables once per band, merges them
// per candidate weight set (equivalent to build()'s weighted counts),
// and scores each mix on the item-1 held-out scorer — the SAME event
// stream and RNG sample for every arm so numbers are comparable.
// Reports every hit rate beside random; the winner goes into
// book_sources.json by hand.
import * as C from '../childes/common.mjs';
import { build, topWords, childlike, tinydialogues, imagine, childesTrain } from '../childes/book_model.mjs';
import { buildEvents, scoreEvents } from '../childes/score.mjs';

const BAND2AGE = { mlu_lt2: '2', mlu_2_35: '5', mlu_gt35: '5' };

function srcStream(name, band, trs, train) {
  switch (name) {
    case 'childes_chi': return childesTrain(trs, train, 'chi', band);
    case 'childes_ad': return childesTrain(trs, train, 'ad', band);
    case 'childes_chi_all': return childesTrain(trs, train, 'chi');
    case 'childes_ad_all': return childesTrain(trs, train, 'ad');
    case 'childlike': return childlike(C.CHILDLIKE, band);
    case 'td': return tinydialogues(C.TD(BAND2AGE[band]));
    case 'imagine': return imagine(C.IMAGINE_TRAIN);
  }
}

// drop singleton contexts to bound memory — merged tables re-derive them
function prune1(book) {
  for (const m of [book.bi, book.tri])
    for (const [k, cnt] of m)
      if ([...cnt.values()].reduce((a, b) => a + b, 0) < 2) m.delete(k);
  return book;
}

function merge(tables, weights) {
  const out = { uni: new Map(), bi: new Map(), tri: new Map(), start: new Map() };
  for (const [src, book] of Object.entries(tables)) {
    const w = weights[src] ?? 0;
    if (!w) continue;
    const bump = (m, k, v) => m.set(k, (m.get(k) ?? 0) + w * v);
    for (const [k, v] of book.uni) bump(out.uni, k, v);
    for (const [k, v] of book.start) bump(out.start, k, v);
    for (const [k, cnt] of book.bi) {
      if (!out.bi.has(k)) out.bi.set(k, new Map());
      for (const [w2, v] of cnt) bump(out.bi.get(k), w2, v);
    }
    for (const [k, cnt] of book.tri) {
      if (!out.tri.has(k)) out.tri.set(k, new Map());
      for (const [w2, v] of cnt) bump(out.tri.get(k), w2, v);
    }
  }
  return out;
}

const CANDIDATES = {
  'chi band':              { childes_chi: 1 },
  'chi all':               { childes_chi_all: 1 },
  'all + band 0.25':       { childes_chi_all: 1, childes_chi: 0.25 },
  'all + band 0.5':        { childes_chi_all: 1, childes_chi: 0.5 },
  'all + band 1':          { childes_chi_all: 1, childes_chi: 1 },
  'all + ad_all 0.3':      { childes_chi_all: 1, childes_ad_all: 0.3 },
  'all + band .5 + ad .3': { childes_chi_all: 1, childes_chi: 0.5, childes_ad_all: 0.3 },
  'band + synth+td':       { childes_chi: 1, childlike: 0.3, td: 0.3 },
};

async function main() {
  const trs = C.loadTranscripts();
  const { test, train } = C.splitIdx(trs.length);
  const events = buildEvents(trs, test);
  const PCT = (x) => (x * 100).toFixed(1);

  // band-independent sources built once
  const allSrcs = {};
  for (const s of ['childes_chi_all', 'childes_ad_all', 'imagine']) {
    process.stdout.write(`building ${s}... `);
    allSrcs[s] = prune1(build([[1.0, srcStream(s, null, trs, train)]]));
    console.log('done');
  }

  for (const band of C.BANDS) {
    console.log(`\n########## ${band} ##########`);
    const tables = { ...allSrcs };
    for (const s of ['childes_chi', 'childes_ad', 'childlike', 'td']) {
      process.stdout.write(`  building ${s}(${band})... `);
      tables[s] = prune1(build([[1.0, srcStream(s, band, trs, train)]]));
      console.log('done');
    }
    for (const [label, w] of Object.entries(CANDIDATES)) {
      const book = merge(tables, w);
      const out = scoreEvents(events, (e) =>
        e.band === band ? topWords(book, e.ctx, 4) : bookTop4Null());
      console.log(
        `  ${label.padEnd(22)} later ${PCT(out[band + '|later'])}%   ` +
        `first ${PCT(out[band + '|first'])}%   after-adult ${PCT(out[band + '|afterAdult'])}%`,
      );
    }
  }
}

// events outside the band under test must not vote — return no prediction
const bookTop4Null = () => [];

main();
