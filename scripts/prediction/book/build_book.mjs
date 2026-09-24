// Build the shipped opening book: data/prediction/opening_book.en.json
// (017 step 23 item b). Per MLU band, mixes the weighted corpus streams
// from book_sources.json into interpolated 1-3-gram count tables, prunes
// each context to its top next words, and writes a byte-deterministic
// file. CHILDES counts come only from the train split — held-out
// transcripts are never read (the scorer proves that).
//
// Usage: node scripts/prediction/book/build_book.mjs [--weights '<json>']
//   --weights '{"mlu_lt2":{"childes_chi":1,...}}' overrides the manifest
//   band weights for a sweep run (does not edit the file).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../childes/common.mjs';
import { build, childlike, tinydialogues, imagine, childesTrain } from '../childes/book_model.mjs';

const MANIFEST_PATH = path.join(C.REPO, 'data/prediction/book_sources.json');
export const BOOK_PATH = path.join(C.REPO, 'data/prediction/opening_book.en.json');
export const manifest = () => JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

// weight key -> raw word stream for a band (weights come from the manifest)
export function streamsFor(band, weights, trs, trainIdx) {
  const out = [];
  const add = (key, stream) => weights[key] > 0 && out.push([weights[key], stream]);
  add('childes_chi', childesTrain(trs, trainIdx, 'chi', band));
  add('childes_ad', childesTrain(trs, trainIdx, 'ad', band));
  add('childes_chi_all', childesTrain(trs, trainIdx, 'chi'));
  add('childes_ad_all', childesTrain(trs, trainIdx, 'ad'));
  add('childlike', childlike(C.CHILDLIKE, band));
  for (const age of ['2', '5'])
    add(`td_age${age}`, tinydialogues(C.TD(age)));
  add('imagine', imagine(C.IMAGINE_TRAIN));
  return out;
}

// ctx -> Map(word -> weighted count) -> {ctx: {word: P(word|ctx)}},
// top-N words each, contexts below minCount dropped. The device
// interpolates these rows itself (opening_book.mjs) exactly like the
// scorer: LAM3·P(tri) + LAM2·P(bi) + LAM1·P(uni).
function ctxProbs(map, top, minCount) {
  const out = {};
  for (const k of [...map.keys()].sort()) {
    const cnts = map.get(k);
    const tot = [...cnts.values()].reduce((a, b) => a + b, 0);
    if (tot < minCount) continue;
    out[k] = Object.fromEntries(
      [...cnts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, top)
        .map(([w, v]) => [w, +(v / tot).toFixed(4)])
        .filter(([, p]) => p > 0), // sub-0.005% rounds to 0 — dead weight
    );
  }
  return out;
}

// word -> probability table, highest first (uni/start store P, not
// counts — bookScores interpolates these directly like the ctx rows)
const flatProbs = (map) => {
  const tot = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(
    [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([w, v]) => [w, +(v / tot).toFixed(4)])
      .filter(([, p]) => p > 0),
  );
};

export function buildBook({ trs, trainIdx, bandWeights, prune = {} }) {
  const bands = {};
  for (const band of C.BANDS) {
    const p = { triTop: 32, triMin: 2, biTop: 32, biMin: 2, ...prune[band] };
    const book = build(streamsFor(band, bandWeights[band] ?? {}, trs, trainIdx));
    bands[band] = {
      tri: ctxProbs(book.tri, p.triTop, p.triMin),
      bi: ctxProbs(book.bi, p.biTop, p.biMin),
      uni: flatProbs(book.uni),
      start: flatProbs(book.start),
    };
  }
  return { version: 2, bands };
}

export function serialize(book) {
  return JSON.stringify(book) + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const wi = args.indexOf('--weights');
  const override = wi >= 0 ? JSON.parse(args[wi + 1]) : null;
  const m = manifest();
  const bandWeights = override ?? m.bands;
  if (!Object.keys(bandWeights.mlu_lt2 ?? {}).length)
    throw new Error('no band weights in manifest or --weights');

  const trs = C.loadTranscripts();
  const { train: trainIdx } = C.splitIdx(trs.length);
  const book = buildBook({ trs, trainIdx, bandWeights, prune: m.build?.prune ?? {} });
  writeFileSync(BOOK_PATH, serialize(book));
  const size = (book && JSON.stringify(book).length / 1e6).toFixed(2);
  console.log(`wrote ${BOOK_PATH} (${size} MB)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
