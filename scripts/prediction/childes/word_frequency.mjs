// Per-lemma child-speech counts from CHILDES — the dominant sort key
// for topic-group member order (026: a door's words fill in band order,
// most-said first). Every token of every CHILD_SPEAKER line goes through
// the shared analyzer, so inflections fold to their lemma ("friends" ->
// "friend") and multiword lemmas count once ("bus driver"). The raw
// transcripts stay in the gitignored cache (R11); only counts ship.
//
//   node scripts/prediction/childes/word_frequency.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from './common.mjs';

const OUT = path.join(C.REPO, 'data/prediction/word_frequency.en.json');

const counts = new Map(C.LEMMAS.map((w) => [w, 0]));
let lines = 0;
for (const tr of C.loadTranscripts()) for (const [spk, words] of tr) {
  if (!C.CHILD_SPEAKER.test(spk)) continue;
  lines++;
  for (const t of C.analyzeLine(words)) {
    if (t.lemma !== null && counts.has(t.lemma)) {
      counts.set(t.lemma, counts.get(t.lemma) + 1);
    }
  }
}

writeFileSync(OUT, JSON.stringify({
  generated: 'word_frequency.mjs — CHILDES child lines, per-lemma counts',
  childLines: lines,
  counts: Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b))),
}, null, 1) + '\n');
console.log(`word_frequency: ${lines} child lines -> ${OUT}`);
