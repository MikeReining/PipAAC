// The children-in-general phrase table (smart bar v2): ending (suffix)
// contexts -> next-item counts, built from the CHILDES training split
// (child lines only — the device never hears an adult). Items are
// catalog sense ids, so a shipped row drops straight into the bar's
// merge as the third table (her now, her any, children).
//
// R11 scope: aggregate counts over the closed catalog vocabulary — no
// utterances, speaker ids, or transcript text. Contexts are capped at
// CTX_MAX items and next-item counts below MIN_COUNT are dropped, both
// for size and so a stored row can never be one child's lone line.
//
//   node scripts/prediction/childes/build_phrase_table.mjs
//     -> data/prediction/phrase_table.en.json
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from './common.mjs';

const CTX_MAX = 6;
const MIN_COUNT = 2;
const OUT = path.join(C.REPO, 'data/prediction/phrase_table.en.json');

// Lemma -> sense id (approved lemma labels, en). Every lemmatize()
// output is a launch-lexicon lemma, so an unmapped one means the
// catalog drifted — counted and reported, never silently kept.
const cat = JSON.parse(readFileSync(path.join(C.REPO, 'data/catalog/catalog.json'), 'utf8'));
const lemmaSense = new Map();
for (const l of cat.labels) {
  if (l.kind === 'lemma' && l.status === 'approved' && l.locale === 'en' && !lemmaSense.has(l.normalized_text)) {
    lemmaSense.set(l.normalized_text, l.sense_id);
  }
}

const table = new Map(); // ctx key (space-joined sense ids) -> Map(next sense id -> n)
// Backoff contexts are SUFFIXES of an utterance's prefix, capped at
// CTX_MAX; the empty ctx counts utterance-start items only.
function add(items) {
  for (let j = 0; j < items.length; j++) {
    for (let len = j === 0 ? 0 : 1; len <= Math.min(j, CTX_MAX); len++) {
      const ctx = items.slice(j - len, j).join(' ');
      if (!table.has(ctx)) table.set(ctx, new Map());
      const m = table.get(ctx);
      m.set(items[j], (m.get(items[j]) ?? 0) + 1);
    }
  }
}

const trs = C.loadTranscripts();
const { train } = C.splitIdx(trs.length, 20260923);
let unmapped = 0, utts = 0;
for (const i of train) {
  for (const [spk, words] of trs[i]) {
    if (!C.CHILD_TAGS.has(spk)) continue;
    let cur = [];
    for (const lem of C.lemmatize(words)) {
      const sid = lem === null ? null : lemmaSense.get(lem);
      if (sid === undefined) unmapped++;
      if (sid == null) { if (cur.length) { add(cur); utts++; } cur = []; continue; }
      cur.push(sid);
    }
    if (cur.length) { add(cur); utts++; }
  }
}

const contexts = {};
let kept = 0, dropped = 0;
for (const [ctx, m] of table) {
  const row = {};
  for (const [next, n] of m) {
    if (n >= MIN_COUNT) { row[next] = n; kept++; } else dropped++;
  }
  if (Object.keys(row).length) contexts[ctx] = row;
}

writeFileSync(OUT, JSON.stringify({
  version: 'phrase-table.2026-09-24',
  source: 'CHILDES train split (child utterances only), lemmatized to catalog senses',
  ctxMax: CTX_MAX, minCount: MIN_COUNT,
  contexts,
}, null, 1));
const size = (await import('node:fs')).statSync(OUT).size;
console.log(`${utts} utterances -> ${Object.keys(contexts).length} contexts, ${kept} rows kept (${dropped} below ${MIN_COUNT}), ${unmapped} unmapped lemma items, ${(size / 1e6).toFixed(2)} MB -> ${path.relative(C.REPO, OUT)}`);
