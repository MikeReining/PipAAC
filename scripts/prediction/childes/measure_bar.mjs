// measure_bar.mjs — the instrument for the children-side cutoff, not a
// test. Runs the app's own stripRanked over the CHILDES HELD-OUT split
// (the shipped table is built from train, so this is honest
// measurement, not the code grading itself) and reports:
//   (a) hit rate by share band — a candidate's share of the times its
//       ending was seen vs how often it really was the next word;
//   (b) for cutoffs 0/3%/5%/10%: avg tiles, empty-bar %, next-word-on-
//       bar %, and shown-tile-right %.
// Moments: every position after the first word of child lines made
// entirely of catalog words — an AAC user can only tap catalog words.
// Truth = the child's actual next word, or "sentence ended".
//
//   node scripts/prediction/childes/measure_bar.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as C from './common.mjs';
import { createDatabase, importCatalog } from '../../../src/board/catalog.mjs';
import { stripRanked } from '../../../public/shared/funnel.mjs';
import catalog from '../../../data/catalog/catalog.json' with { type: 'json' };

const kids = JSON.parse(
  readFileSync(path.join(C.REPO, 'data/prediction/phrase_table.en.json'), 'utf8'));

const lemmaSense = new Map();
for (const l of catalog.labels) {
  if (l.kind === 'lemma' && l.status === 'approved' && l.locale === 'en'
      && !lemmaSense.has(l.normalized_text)) {
    lemmaSense.set(l.normalized_text, l.sense_id);
  }
}

// --- gather moments from the held-out split --------------------------
const trs = C.loadTranscripts();
const { test } = C.splitIdx(trs.length, 20260923);
const NOW = Date.parse('2026-09-24T08:20:00');
const db = createDatabase(':memory:');
importCatalog(db, catalog);

const BANDS = [
  [0.5, '50%+'], [0.2, '20-50%'], [0.1, '10-20%'],
  [0.05, '5-10%'], [0.02, '2-5%'], [0, '<2%'],
];
const bandOf = (s) => BANDS.findIndex(([lo]) => s >= lo);
const bandHit = BANDS.map(() => 0), bandTot = BANDS.map(() => 0);
const CUTOFFS = [0, 0.03, 0.05, 0.10];
const m = CUTOFFS.map(() => ({ tiles: 0, empty: 0, onBar: 0, right: 0 }));

let moments = 0, skippedCtx = 0;
const bar = (phrase) =>
  stripRanked(db, phrase, NOW, 'en', kids);

for (const i of test) {
  for (const [spk, words] of trs[i]) {
    if (!C.CHILD_TAGS.has(spk)) continue;
    const sids = [];
    let allMapped = true;
    for (const lem of C.lemmatize(words)) {
      const sid = lem === null ? null : lemmaSense.get(lem);
      if (sid == null) { allMapped = false; break; }
      sids.push(sid);
    }
    if (!allMapped || !sids.length) continue;
    for (let pos = 1; pos <= sids.length; pos++) {
      const phrase = sids.slice(0, pos).map((id) => ({ kind: 'sense', id }));
      const truth = pos < sids.length ? sids[pos] : null; // null = ended
      const { ranked, shown, ending } = bar(phrase);
      moments++;
      if (ending === null) { skippedCtx++; continue; }
      // (a) every candidate at the chosen ending is a trial: did THIS
      // word really come next? Share bands, truth = actual next id.
      for (const c of ranked) {
        if (c.src !== 'kids' || c.share === null) continue;
        bandTot[bandOf(c.share)]++;
        if (c.id === truth) bandHit[bandOf(c.share)]++;
      }
      // (b) re-derive shown under each cutoff from the stored ranked
      // rows — same rule, different floor. Her rows don't exist (empty
      // db); mask is always 0.
      for (let ci = 0; ci < CUTOFFS.length; ci++) {
        const tiles = ranked
          .filter((c) => !c.mask && (c.share === null || c.share >= CUTOFFS[ci]))
          .slice(0, 4)
          .map((c) => c.id);
        m[ci].tiles += tiles.length;
        if (!tiles.length) m[ci].empty++;
        if (tiles.includes(truth)) {
          m[ci].onBar++;
          m[ci].right++;
        }
      }
    }
  }
}

console.log(`${moments} moments (${skippedCtx} with no ending data), held-out split`);
console.log('\n(a) candidate share band -> was actually the next word');
for (let b = 0; b < BANDS.length; b++) {
  const pct = bandTot[b] ? (bandHit[b] / bandTot[b] * 100).toFixed(1) : '-';
  console.log(`  ${BANDS[b][1].padEnd(7)} ${pct}%   (n=${bandTot[b]})`);
}
console.log('\n(b) cutoff sweep');
console.log('  cutoff  avg tiles  bar empty  next word on bar  shown tile right');
for (let ci = 0; ci < CUTOFFS.length; ci++) {
  const r = m[ci];
  const avg = (r.tiles / moments).toFixed(1);
  const empty = (r.empty / moments * 100).toFixed(0);
  const onBar = (r.onBar / moments * 100).toFixed(1);
  const right = r.tiles ? (r.right / r.tiles * 100).toFixed(1) : '-';
  console.log(`  ${(CUTOFFS[ci] * 100).toFixed(0).padStart(3)}%      ${avg.padStart(4)}      ${empty.padStart(3)}%          ${onBar.padStart(5)}%          ${right}%`);
}
