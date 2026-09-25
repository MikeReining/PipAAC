// The form table (021 slice 3): for every form-bearing word, what
// surface did speakers actually pick after these words before. Keys are
// sense ids (like the phrase table); contexts are 1-4 preceding sense
// ids, with '<s>' marking a context that reached line start and a wall
// wherever a token isn't a catalog word. Past-tense surfaces never take
// part — tense is her meaning, not ours to pick.
//
// Tables:
//   wordCtx["ctx|sense"]   -> { features: n }   per-word form counts
//   verbFree["ctx"]        -> { features: n }   all verbs pooled, for a
//                                              verb with thin data
//   nextVerb["ctx|verb|next"] -> { features: n }  decision-4: the word
//                                              after may flip the verb
//                                              ("what do" + he -> does)
//   aAn["nextSense"]       -> { features: n }   caregivers only —
//                                              children say "a apple"
//
// No <name> token: the parquet mirror carries no morphology tier, so
// proper nouns can't be recognized (doc item 5's stop condition — noted
// in the phase report; entities then hit walls and fall to shorter
// endings, i.e. "Leo want" stays a known gap).
//
//   node scripts/prediction/childes/build_form_table.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from './common.mjs';

const MIN_COUNT = 2;
const OUT = path.join(C.REPO, 'data/prediction/form_table.en.json');
const FORMS = JSON.parse(readFileSync(path.join(C.REPO, 'data/forms/en.json'), 'utf8'));
const CATALOG = JSON.parse(readFileSync(path.join(C.REPO, 'data/catalog/catalog.json'), 'utf8'));

// lemma text -> sense id, via the catalog's lemma labels
const senseOf = new Map();
for (const l of CATALOG.labels) {
  if (l.kind === 'lemma') senseOf.set(l.normalized_text, l.sense_id);
}

// "lemma|surfaceHead" -> feature tag. A lemma's own surface is BASE;
// every forms row pins its surface. Two-word verbs key on the head
// word: "wakes" is V;PRS;3;SG of "wake up".
const firstWord = (s) => s.split(' ')[0];
const classOf = new Map();
const formLemmas = new Set(FORMS.forms.map((f) => f.lemma));
for (const lem of formLemmas) classOf.set(`${lem}|${firstWord(lem)}`, 'BASE');
for (const f of FORMS.forms) classOf.set(`${f.lemma}|${firstWord(f.text)}`, f.features);
// a merged lemma's own surface still counts when it can't be a form
// ("has" merges into "have" and is its 3SG surface)

// verb lemmas for the pooled table: every emitted V;* lemma
const verbSense = new Set();
for (const f of FORMS.forms) {
  if (f.features.startsWith('V;')) verbSense.add(senseOf.get(f.lemma));
}
// is/don't carry V; tags but are spec'd "own counts only" — still fine
// in verbFree? No: slice 3 item 2 — they have plenty of data; pooling
// them would let aux evidence answer for lexical verbs.
verbSense.delete(senseOf.get('is'));
verbSense.delete(senseOf.get("don't"));

const wordCtx = new Map();   // `${ctx}|${sense}` -> Map feat -> n
const verbFree = new Map();  // ctx -> Map feat -> n
const nextVerb = new Map();  // `${ctx}|${verb}|${next}` -> Map feat -> n
const aAn = new Map();       // next sense -> Map feat -> n
const put = (map, key, feat) => {
  if (!map.has(key)) map.set(key, new Map());
  const m = map.get(key);
  m.set(feat, (m.get(feat) ?? 0) + 1);
};

/** Context keys for position i: every non-walled suffix of the words
 *  before it (len 1..4), plus a '<s>'-anchored key when the suffix
 *  reaches line start. */
function ctxKeys(ids, i) {
  const out = [];
  for (let len = 1; len <= 4 && i - len >= 0; len++) {
    if (ids[i - len] === null) break;
    out.push(ids.slice(i - len, i).join(' '));
  }
  if (i > 0 && i <= 4) out.push('<s> ' + ids.slice(0, i).join(' '));
  else if (i === 0) out.push('<s>');
  return out;
}

const trs = C.loadTranscripts();
const { train } = C.splitIdx(trs.length, 20260923);

/** "does not" / "doesn't" IS the don't tile — the don't sense means
 *  do+not, so a do-lemma immediately followed by not collapses into it
 *  here (the phrase table keeps do/not apart; this is only the form
 *  counts). The do-part's surface carries the shape: does -> doesn't
 *  (3SG), do -> don't (BASE). */
function collapseDoNot(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].lemma === 'do' && toks[i + 1]?.lemma === 'not') {
      out.push({ lemma: "don't", surf: toks[i].surf === 'does' ? "doesn't" : "don't" });
      i++;
    } else {
      out.push(toks[i]);
    }
  }
  return out;
}

let moments = 0;
for (const ti of train) {
  for (const [spk, words] of trs[ti]) {
    const child = C.CHILD_TAGS.has(spk);
    const toks = collapseDoNot(C.analyzeLine(words));
    const ids = toks.map((t) => (t.lemma === null ? null : senseOf.get(t.lemma) ?? null));
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.lemma === null || !formLemmas.has(t.lemma)) continue;
      const feat = classOf.get(`${t.lemma}|${firstWord(t.surf)}`);
      if (!feat) continue; // past forms and other surfaces don't take part
      const sense = ids[i];
      moments++;
      const ctxs = ctxKeys(ids, i);
      for (const ctx of ctxs) put(wordCtx, `${ctx}|${sense}`, feat);
      const next = i + 1 < ids.length ? ids[i + 1] : null;
      if (verbSense.has(sense)) {
        for (const ctx of ctxs) {
          put(verbFree, ctx, feat);
          if (next) put(nextVerb, `${ctx}|${sense}|${next}`, feat);
        }
      }
      if (t.lemma === 'a' && !child && next) put(aAn, next, feat);
    }
  }
}

const drop = (m) => new Map([...m].filter(([, n]) => n >= MIN_COUNT));
const pack = (map, flatKey) => {
  const out = {};
  for (const [k, m] of map) {
    const kept = drop(m);
    if (kept.size) out[flatKey ? k : k] = Object.fromEntries(kept);
  }
  return out;
};

writeFileSync(OUT, JSON.stringify({
  version: 'form-table.2026-09-25.1',
  locale: 'en',
  aSense: senseOf.get('a'),
  verbSenses: [...verbSense].sort(),
  contexts: pack(wordCtx),
  verbFree: pack(verbFree),
  nextVerb: pack(nextVerb),
  aAn: pack(aAn),
}));

console.log(`${trs.length} transcripts -> ${Object.keys(pack(wordCtx)).length} word ctxs, ` +
  `${verbFree.size} pooled ctxs, ${nextVerb.size} next-word rows, ${aAn.size} a/an rows ` +
  `(${moments} counted positions) -> ${path.relative(C.REPO, OUT)}`);
