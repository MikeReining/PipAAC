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
const seen = new Map();  // ctx key -> every time that ending occurred,
                         // whatever followed (a word, a wall, line end)
const addSeen = (ctx) => seen.set(ctx, (seen.get(ctx) ?? 0) + 1);
function put(ctx, next) {
  if (!table.has(ctx)) table.set(ctx, new Map());
  const m = table.get(ctx);
  m.set(next, (m.get(next) ?? 0) + 1);
}
// Emit all ending->next rows for one word following `run` — the words
// since the last wall: every suffix of length 1..CTX_MAX is a stored
// context. `seen` counts the occurrence too, so a candidate's share is
// n / seen — how often the ending truly led to it, line ends included.
function emit(run, next, lineStart) {
  if (lineStart) put('', next); // real first word only
  for (let len = 1; len <= Math.min(run.length, CTX_MAX); len++) {
    const ctx = run.slice(-len).join(' ');
    put(ctx, next);
    addSeen(ctx);
  }
}
// A run ended — wall or end of line. Its endings still occurred; the
// children "said" them and followed with nothing we can map. Without
// this, shares are inflated ("like my mom" -> "and" is not 100%).
function closeRun(run) {
  for (let len = 1; len <= Math.min(run.length, CTX_MAX); len++) {
    addSeen(run.slice(-len).join(' '));
  }
}

const trs = C.loadTranscripts();
const { train } = C.splitIdx(trs.length, 20260923);
let unmapped = 0, utts = 0;
// A word we don't have is a WALL: no context may include it, and the
// word after it is not a sentence start — it gets only the contexts
// that begin after the wall. Splitting the line into fresh utterances
// would mint fake sentence starts in the empty ctx.
for (const i of train) {
  for (const [spk, words] of trs[i]) {
    if (!C.CHILD_TAGS.has(spk)) continue;
    utts++;
    // The empty ending is "said" at EVERY line start — even when the
    // first word is a wall (the child said something we cannot map).
    // Only a catalog first word earns a '' -> word row, but the
    // occurrence still counts, same rule as non-empty endings.
    addSeen('');
    let run = [];        // mapped senses since the last wall
    let lineStart = true; // still at the real first word of the line
    for (const lem of C.lemmatize(words)) {
      const sid = lem === null ? null : lemmaSense.get(lem);
      if (sid === undefined) unmapped++;
      if (sid == null) { closeRun(run); run = []; lineStart = false; continue; }
      emit(run, sid, lineStart);
      run.push(sid);
      lineStart = false;
    }
    closeRun(run);
  }
}

const contexts = {};
const seenOut = {};
let kept = 0, dropped = 0;
for (const [ctx, m] of table) {
  const row = {};
  for (const [next, n] of m) {
    if (n >= MIN_COUNT) { row[next] = n; kept++; } else dropped++;
  }
  // seen ships only for contexts that survive the prune — a stored row
  // is never one child's lone line (R11).
  if (Object.keys(row).length) {
    contexts[ctx] = row;
    seenOut[ctx] = seen.get(ctx) ?? 0;
  }
}

writeFileSync(OUT, JSON.stringify({
  version: 'phrase-table.2026-09-24.2',
  source: 'CHILDES train split (child utterances only), lemmatized to catalog senses',
  ctxMax: CTX_MAX, minCount: MIN_COUNT,
  contexts, seen: seenOut,
}, null, 1));
const size = (await import('node:fs')).statSync(OUT).size;
console.log(`${utts} utterances -> ${Object.keys(contexts).length} contexts, ${kept} rows kept (${dropped} below ${MIN_COUNT}), ${unmapped} unmapped lemma items, ${(size / 1e6).toFixed(2)} MB -> ${path.relative(C.REPO, OUT)}`);
