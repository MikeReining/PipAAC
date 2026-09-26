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
//   possNext["sense|cls"]  -> { features: n }   whose (022): cls is N
//                                              (next token a noun),
//                                              EOS (line end — Speak),
//                                              or X (anything else)
//   possNext["sense|x|next"] -> { features: n } per-word X rows —
//                                              "your turn" though turn
//                                              is a Verb on paper
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

// Whose (022): senses whose forms include a possessive — pronouns
// (PRO;POSS/PRO;POSS;ABS) and measured 's nouns (N;POSS). The
// possessive decision keys on the NEXT word's class: noun-next pulls
// the attributive form (his dog, mommy's knee), end-of-line pulls the
// absolute form (it's mine), anything else stays base.
const possSense = new Set();
for (const f of FORMS.forms) {
  if (f.features === 'N;POSS' || f.features.startsWith('PRO;POSS')) possSense.add(senseOf.get(f.lemma));
}
// Whether a plural is USED is a grown-up question too (022 ruling —
// same as the spellings): child fragments like "two baby" can't vote
// down "two babies". ctx rows for N;PL senses count caregiver lines
// only; everything else keeps all speakers.
const plSense = new Set();
for (const f of FORMS.forms) {
  if (f.features === 'N;PL') plSense.add(senseOf.get(f.lemma));
}
const lex = JSON.parse(readFileSync(path.join(C.REPO, 'data/launch_lexicon.json'), 'utf8'));
const nounLemmas = new Set(lex.entries.filter((e) => e.partOfSpeech === 'Noun').map((e) => e.spokenText.toLowerCase()));
const nounSenses = new Set([...nounLemmas].map((l) => senseOf.get(l)).filter(Boolean));

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
// ...but decision 4 is per-sense keyed — "where are you" must still
// re-pick is -> are when 'you' lands. Pool exclusion, not evidence exclusion.
const nextSense = new Set([...verbSense, senseOf.get('is'), senseOf.get("don't")]);

// The pooled plural row is only consulted when the tapped phrase
// itself carries a quantifier ("two", "some", ...) — the question
// "plural or not" doesn't exist without one, and merged "their"
// ctxs would otherwise pull every noun after 'they' plural.
const quantSenses = new Set();
for (const w of C.QUANT) {
  const id = senseOf.get(C.toLemma(w));
  if (id) quantSenses.add(id);
}

const wordCtx = new Map();   // `${ctx}|${sense}` -> Map feat -> n
const verbFree = new Map();  // ctx -> Map feat -> n
const plFree = new Map();    // ctx -> Map feat -> n — plural nouns
                             // pooled ("two" pulls N;PL even for a
                             // noun with no own row — two moms)
const nextVerb = new Map();  // `${ctx}|${verb}|${next}` -> Map feat -> n
const aAn = new Map();       // next sense -> Map feat -> n
const possNext = new Map();  // `${sense}|${N|EOS|X}` -> Map feat -> n
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
    const caregiver = C.isCaregiver(spk);
    const toks = collapseDoNot(C.analyzeLine(words));
    const ids = toks.map((t) => (t.lemma === null ? null : senseOf.get(t.lemma) ?? null));
    // A multiword tile that embeds a possessive head still carries the
    // evidence — "your turn" is one tile, but it shows 'your' standing
    // before 'turn' (the only way that pairing exists in the corpus).
    for (const t of toks) {
      if (!t.lemma?.includes(' ')) continue;
      const parts = t.lemma.split(' ');
      const hl = C.MERGES[parts[0]] ?? parts[0];
      const tl = C.MERGES[parts[parts.length - 1]] ?? parts[parts.length - 1];
      const hs = senseOf.get(hl);
      const hfeat = classOf.get(`${hl}|${t.surf.split(' ')[0]}`);
      if (!hs || !possSense.has(hs) || !hfeat) continue;
      const cls = nounLemmas.has(tl) ? 'N' : 'X';
      put(possNext, `${hs}|${cls}`, hfeat);
      if (cls === 'X' && senseOf.get(tl)) put(possNext, `${hs}|x|${senseOf.get(tl)}`, hfeat);
    }
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.lemma === null || !formLemmas.has(t.lemma)) continue;
      // a 's-possessive surface counts as N;POSS whatever its spelling
      // (mommy's counts under "mom's") — only on a sense that carries
      // the row; other surfaces go through classOf
      const feat = t.poss && possSense.has(ids[i]) ? 'N;POSS'
        : classOf.get(`${t.lemma}|${firstWord(t.surf)}`);
      if (!feat) continue; // past forms and other surfaces don't take part
      const sense = ids[i];
      moments++;
      const ctxs = ctxKeys(ids, i);
      // Plural use is a grown-up question asked at a real choice point:
      // child lines and attributive positions ("two baby dolls"
      // quantifies dolls) don't count for N;PL senses.
      const attributive = i + 1 < toks.length && toks[i + 1].lemma !== null
        && !toks[i + 1].poss && nounLemmas.has(toks[i + 1].lemma);
      const plCounted = plSense.has(sense) && caregiver && !attributive;
      if (!plSense.has(sense) || plCounted)
        for (const ctx of ctxs) put(wordCtx, `${ctx}|${sense}`, feat);
      // The pooled plural row only exists where a quantity word asked
      // the question (a quant within the last 3 tokens, unbroken by a
      // singular marker) — otherwise "their hands/feet" possessive
      // plurals would pull every noun after 'they' to plural.
      if (plCounted) {
        let quant = false;
        for (let j = i - 1; j >= Math.max(0, i - 3) && !quant; j--) {
          const sw = toks[j].surf ?? toks[j].lemma;
          if (C.SING.has(sw)) break;
          quant = C.QUANT.has(sw);
        }
        if (quant) for (const ctx of ctxs) put(plFree, ctx, feat);
      }
      const next = i + 1 < ids.length ? ids[i + 1] : null;
      if (possSense.has(sense)) {
        const nl = i + 1 < toks.length ? toks[i + 1].lemma : null;
        const cls = i + 1 === toks.length ? 'EOS' : (nl !== null && nounLemmas.has(nl) ? 'N' : 'X');
        put(possNext, `${sense}|${cls}`, feat);
        // the X class holds verbs/adjectives/adverbs — mostly base
        // evidence, but specific words pull possessive ("your turn",
        // where turn is cataloged a Verb). Per-sense rows decide those;
        // the class row is the fallback for thin ones.
        if (cls === 'X' && next) put(possNext, `${sense}|x|${next}`, feat);
      }
      // Pooled tables are "the right form" evidence — caregiver lines
      // only, same doctrine as spellings: "mommy want" fragments can't
      // vote BASE over "mommy wants".
      if (verbSense.has(sense) && caregiver) {
        for (const ctx of ctxs) put(verbFree, ctx, feat);
      }
      if (nextSense.has(sense) && next) {
        for (const ctx of ctxs) put(nextVerb, `${ctx}|${sense}|${next}`, feat);
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
  version: 'form-table.2026-09-25.2',
  locale: 'en',
  aSense: senseOf.get('a'),
  verbSenses: [...verbSense].sort(),
  nounSenses: [...nounSenses].sort(),
  plSenses: [...plSense].sort(),
  quantSenses: [...quantSenses].sort(),
  contexts: pack(wordCtx),
  verbFree: pack(verbFree),
  plFree: pack(plFree),
  nextVerb: pack(nextVerb),
  aAn: pack(aAn),
  possNext: pack(possNext),
}));

console.log(`${trs.length} transcripts -> ${Object.keys(pack(wordCtx)).length} word ctxs, ` +
  `${verbFree.size} pooled verb ctxs, ${plFree.size} pooled plural ctxs, ` +
  `${nextVerb.size} next-word rows, ${aAn.size} a/an rows, ` +
  `${possNext.size} possessive rows (${moments} counted positions) -> ${path.relative(C.REPO, OUT)}`);
