// The instrument for the form table (021 slice 3 item 6). Held-out
// test split, adult and child lines reported separately, first word of
// each line excluded (its form never changes). For every position where
// a form-bearing word was actually said, the table picks a form the
// same way formFor does — longest ending with counts, pooled verbs,
// default — and we score it against the surface the speaker used.
// "today" = what the board shows now: the default label always.
//
//   node scripts/prediction/childes/measure_forms.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as C from './common.mjs';
import { pickForm, EOS } from '../../../public/shared/forms.mjs';

const TABLE = JSON.parse(readFileSync(path.join(C.REPO, 'data/prediction/form_table.en.json'), 'utf8'));
const FORMS = JSON.parse(readFileSync(path.join(C.REPO, 'data/forms/en.json'), 'utf8'));
const CATALOG = JSON.parse(readFileSync(path.join(C.REPO, 'data/catalog/catalog.json'), 'utf8'));

const senseOf = new Map();
for (const l of CATALOG.labels) {
  if (l.kind === 'lemma') senseOf.set(l.normalized_text, l.sense_id);
}
const firstWord = (s) => s.split(' ')[0];
const classOf = new Map();
const formLemmas = new Set(FORMS.forms.map((f) => f.lemma));
for (const lem of formLemmas) classOf.set(`${lem}|${firstWord(lem)}`, 'BASE');
for (const f of FORMS.forms) classOf.set(`${f.lemma}|${firstWord(f.text)}`, f.features);

function collapseDoNot(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].lemma === 'do' && toks[i + 1]?.lemma === 'not') {
      out.push({ lemma: "don't", surf: toks[i].surf === 'does' ? "doesn't" : "don't" });
      i++;
    } else out.push(toks[i]);
  }
  return out;
}

const VERBS = new Set(TABLE.verbSenses);
const IS_SENSE = senseOf.get('is');
const DONT_SENSE = senseOf.get("don't");
const PRO_SENSES = new Set(['he', 'she', 'we', 'they'].map((w) => senseOf.get(w)));
const A_SENSE = TABLE.aSense;
const BY_USE = new Set(Object.keys(FORMS.verbUse).map((w) => senseOf.get(w)));
// whose/how-many (022): senses carrying a possessive or plural row.
const POSS_PRO = new Set(['he', 'she', 'we', 'they', 'you'].map((w) => senseOf.get(w)));
const MY_SENSE = senseOf.get('my');
const POSS_NOUN = new Set();
const PL_NOUN = new Set();
for (const f of FORMS.forms) {
  if (f.features === 'N;POSS') POSS_NOUN.add(senseOf.get(f.lemma));
  if (f.features === 'N;PL') PL_NOUN.add(senseOf.get(f.lemma));
}

const pct = (n, d) => (d ? `${(100 * n / d).toFixed(1)}%` : '  -');
const block = (name, right, today, n) =>
  console.log(`  ${name.padEnd(46)} today ${pct(today, n).padStart(6)}   data ${pct(right, n).padStart(6)}   (n=${n})`);

// aggregate buckets
const stats = () => ({ n: 0, right: 0, today: 0 });
const acc = (b, right, todayRight) => { b.n++; if (right) b.right++; if (todayRight) b.today++; };

const groups = {
  verbsAdult: stats(), verbsChild: stats(),
  beAdult: stats(), beChild: stats(),
  proAdult: stats(), proChild: stats(),
  aAdult: stats(), aChild: stats(),
  byUseAdult: stats(), byUseChild: stats(),
  dontAdult: stats(), dontChild: stats(),
  whoseProAdult: stats(), whoseProChild: stats(),
  whoseNounAdult: stats(), whoseNounChild: stats(),
  whoseEosAdult: stats(), whoseEosChild: stats(),
  myEosAdult: stats(), myEosChild: stats(),
  plAdult: stats(), plChild: stats(),
};
const verbsByForm = new Map();   // actual feat -> bucket
const verbsByCtxLen = new Map(); // ctx words 1..6+ -> bucket
const beSurfaces = new Map();    // is-sense actual feat -> bucket
const nextRule = { n: 0, right: 0, flippedTo: 0 }; // positions where nextVerb answered

const trs = C.loadTranscripts();
const { test } = C.splitIdx(trs.length, 20260923);
for (const ti of test) {
  for (const [spk, words] of trs[ti]) {
    const child = C.CHILD_TAGS.has(spk);
    const toks = collapseDoNot(C.analyzeLine(words));
    const ids = toks.map((t) => (t.lemma === null ? null : senseOf.get(t.lemma) ?? null));
    for (let i = 1; i < toks.length; i++) {
      const t = toks[i];
      if (t.lemma === null || !formLemmas.has(t.lemma)) continue;
      // 's surfaces attest N;POSS whatever the spelling (mommy's) —
      // only on a sense that carries the row
      const feat = t.poss && POSS_NOUN.has(ids[i]) ? 'N;POSS'
        : classOf.get(`${t.lemma}|${firstWord(t.surf)}`);
      if (!feat) continue; // past forms don't take part
      const sense = ids[i];
      if (!sense) continue;
      // ctx = up to 4 preceding sense ids; nulls are walls — the
      // lookup only sees ids; endings that touch a wall can only match
      // keys they legitimately hold, same as the build.
      const ctx = [];
      for (let k = i - 1; k >= 0 && ctx.length < 4; k--) {
        if (ids[k] === null) break;
        ctx.unshift(ids[k]);
      }
      // line-final positions get the Speak sentinel — the app re-picks
      // the last word with it ("it is not my" + Speak -> mine)
      const atEnd = i + 1 === ids.length;
      const next = atEnd ? EOS : ids[i + 1];
      // The worn surface competes at EOS ("her" holds ACC 16.7k > ABS
      // 201) — elsewhere it is only evidence, same as the tap pick.
      const pick = pickForm(TABLE, ctx, sense, next, feat);
      const right = pick === feat;
      const todayRight = feat === 'BASE';

      if (VERBS.has(sense)) {
        acc(child ? groups.verbsChild : groups.verbsAdult, right, todayRight);
        const bf = verbsByForm.get(feat) ?? stats(); acc(bf, right, todayRight); verbsByForm.set(feat, bf);
        const bl = verbsByCtxLen.get(Math.min(6, i)) ?? stats(); acc(bl, right, todayRight); verbsByCtxLen.set(Math.min(6, i), bl);
        if (BY_USE.has(sense)) acc(child ? groups.byUseChild : groups.byUseAdult, right, todayRight);
      }
      if (sense === IS_SENSE) {
        acc(child ? groups.beChild : groups.beAdult, right, todayRight);
        const bb = beSurfaces.get(feat) ?? stats(); acc(bb, right, todayRight); beSurfaces.set(feat, bb);
      }
      if (sense === DONT_SENSE) acc(child ? groups.dontChild : groups.dontAdult, right, todayRight);
      if (PRO_SENSES.has(sense)) acc(child ? groups.proChild : groups.proAdult, right, todayRight);
      if (sense === A_SENSE) acc(child ? groups.aChild : groups.aAdult, right, todayRight);
      // whose (022): pronoun/'s-noun forms decided by what follows —
      // a noun pulls the attributive, the line end pulls the absolute.
      const nextIsNoun = !atEnd && toks[i + 1].lemma !== null
        && TABLE.nounSenses.includes(ids[i + 1]);
      if (nextIsNoun && POSS_PRO.has(sense)) {
        acc(child ? groups.whoseProChild : groups.whoseProAdult, right, todayRight);
      }
      if (nextIsNoun && POSS_NOUN.has(sense)) {
        acc(child ? groups.whoseNounChild : groups.whoseNounAdult, right, todayRight);
      }
      if (atEnd && POSS_PRO.has(sense)) {
        acc(child ? groups.whoseEosChild : groups.whoseEosAdult, right, todayRight);
      }
      if (atEnd && sense === MY_SENSE) {
        acc(child ? groups.myEosChild : groups.myEosAdult, right, todayRight);
      }
      // how many (022): any position where a plural-bearing noun was said
      if (PL_NOUN.has(sense)) {
        acc(child ? groups.plChild : groups.plAdult, right, todayRight);
      }
      // decision-4 accounting: when the next-word table is what answered
      if (next && VERBS.has(sense)) {
        const without = pickForm(TABLE, ctx, sense, null);
        const nvKeys = [];
        for (let len = Math.min(4, ctx.length); len >= 1; len--) nvKeys.push(ctx.slice(-len).join(' '));
        const hit = nvKeys.map((k) => TABLE.nextVerb[`${k}|${sense}|${next}`]).find(Boolean);
        if (hit) {
          nextRule.n++;
          const np = Object.entries(hit).sort((a, b) => b[1] - a[1])[0][0];
          if (np === feat) nextRule.right++;
          if (np !== without) nextRule.flippedTo++;
        }
      }
    }
  }
}

console.log(`form table ${TABLE.version} — held-out split (test), first word of each line excluded`);
console.log('\n(a) blocks — today (always the default label) vs data picks');
for (const [name, g] of [
  ['verbs, adults', groups.verbsAdult],
  ['verbs, children', groups.verbsChild],
  ['am/is/are/be (is-sense), adults', groups.beAdult],
  ['am/is/are/be (is-sense), children', groups.beChild],
  ['he/she/we/they vs him/her/us/them, adults', groups.proAdult],
  ['he/she/we/they vs him/her/us/them, children', groups.proChild],
  ["a vs an (next word), adults", groups.aAdult],
  ['a vs an (next word), children', groups.aChild],
  ["don't/doesn't, adults", groups.dontAdult],
  ["don't/doesn't, children", groups.dontChild],
  ['whose: pronoun + noun (his/her/our/their/your), adults', groups.whoseProAdult],
  ['whose: pronoun + noun, children', groups.whoseProChild],
  ["whose: name/people noun + noun (X's), adults", groups.whoseNounAdult],
  ["whose: name/people noun + noun, children", groups.whoseNounChild],
  ['whose at EOS: he/she/we/they/you, adults', groups.whoseEosAdult],
  ['whose at EOS: he/she/we/they/you, children', groups.whoseEosChild],
  ['whose at EOS: my (mine), adults', groups.myEosAdult],
  ['whose at EOS: my (mine), children', groups.myEosChild],
  ['how many: plural-bearing nouns, adults', groups.plAdult],
  ['how many: plural-bearing nouns, children', groups.plChild],
]) block(name, g.right, g.today, g.n);

console.log('\n(b) verbs by actual form');
for (const [f, g] of [...verbsByForm].sort()) block(`said ${f}`, g.right, g.today, g.n);
console.log('\n(c) verbs by words before (position in line, 6 = 6+)');
for (const [l, g] of [...verbsByCtxLen].sort((a, b) => a[0] - b[0])) block(`${l} word(s) before`, g.right, g.today, g.n);
console.log('\n(d) verbs by use (non-Verb catalog words that earned forms)');
for (const [name, g] of [
  ['hurt/rain, adults', groups.byUseAdult],
  ['hurt/rain, children', groups.byUseChild],
]) block(name, g.right, g.today, g.n);
console.log('\n(e) the is-sense by the surface actually said');
for (const [f, g] of [...beSurfaces].sort()) block(`said ${f}`, g.right, g.today, g.n);
console.log('\n(f) decision 4 — next-word table on verbs it answered');
console.log(`  answered on ${nextRule.n} positions, right ${pct(nextRule.right, nextRule.n)}, ` +
  `picked a different form than no-next-word on ${nextRule.flippedTo}`);
console.log('\n(g) <name>: not measured — the parquet mirror carries no morphology tier (doc item 5 stop condition)');
