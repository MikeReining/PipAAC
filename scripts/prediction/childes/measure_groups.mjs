// Topic groups (026): does a sentence's off-board words live behind
// fewer doors with data/group_seed.topics.json than with today's
// data/group_seed.json? Also the build-side checks the proposal must
// pass: one page per group, every word reachable on each layout.
//
// The instrument is what children and adults actually said (CHILDES,
// every transcript — nothing here is fitted, so there is no split). A
// word "needs a door" when no sense of it sits on that layout's home
// board. Doors per line = the fewest groups that hold all of the line's
// door words (exact cover). Reported, not gated.
//
//   node scripts/prediction/childes/measure_groups.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as C from './common.mjs';
import { seedResolver, sid } from '../../catalog/seed_members.mjs';

const ITEMS_PER_PAGE = 57;
const read = (p) => JSON.parse(readFileSync(path.join(C.REPO, p), 'utf8'));
const LEX = read('data/launch_lexicon.json').entries;
const CAT = read('data/catalog/catalog.json');
const SEEDS = { today: read('data/group_seed.json'), topics: read('data/group_seed.topics.json') };
const { members, doorsOn, home } = seedResolver(LEX, CAT);

// groupsOf[seed][layout]: sense -> Set(group key), doors visible on that layout.
const groupsOf = {};
const sizes = {};
for (const [name, seed] of Object.entries(SEEDS)) {
  sizes[name] = seed.groups.map((g) => [g.key, members(g).length]);
  groupsOf[name] = Object.fromEntries(Object.keys(CAT.layouts).map((L) => [L, doorsOn(seed, L)]));
}

// ---------- build-side checks ----------
console.log('\n## Checks (proposal)');
const over = sizes.topics.filter(([, n]) => n > ITEMS_PER_PAGE);
console.log(`  groups over one page (${ITEMS_PER_PAGE}): ${over.length ? over.map(([k, n]) => `${k} ${n}`).join(', ') : 'none'}`);
for (const [name] of Object.entries(SEEDS)) {
  for (const L of ['grid15', 'grid60', 'grid90']) {
    const lost = LEX.filter((e) => !home[L].has(sid(e.slot)) && !groupsOf[name][L].has(sid(e.slot)));
    console.log(`  ${name.padEnd(9)} ${L}: ${lost.length} words reachable by no home cell or door${lost.length ? ` — ${lost.map((e) => e.spokenText).join(', ')}` : ''}`);
  }
}
const g60 = groupsOf.topics.grid60;
const dup = [...g60].filter(([, ks]) => ks.size > 1);
console.log(`  words in more than one door (grid60): ${dup.length}`);
console.log(`    ${dup.map(([s, ks]) => `${CAT.labels.find((l) => l.sense_id === s && l.kind === 'lemma').text} (${[...ks].join('/')})`).join(', ')}`);
const t60 = groupsOf.today.grid60;
const moved = LEX.filter((e) => {
  const a = [...(t60.get(sid(e.slot)) ?? [])].sort().join();
  const b = [...(g60.get(sid(e.slot)) ?? [])].sort().join();
  return a !== b;
});
console.log(`  words whose doors change (grid60): ${moved.length} of ${LEX.length}`);
console.log('  sizes: ' + sizes.topics.map(([k, n]) => `${k} ${n}`).join(', '));

// ---------- CHILDES ----------
// lemma -> sense ids (orange/light/bathroom carry two)
const sensesOf = new Map();
for (const e of LEX) {
  const k = e.spokenText.toLowerCase();
  sensesOf.set(k, [...(sensesOf.get(k) ?? []), sid(e.slot)]);
}
function minCover(sets) {
  const cand = [...new Set(sets.flatMap((s) => [...s]))];
  if (cand.length > 16) return null;
  for (let k = 1; k <= sets.length; k++) {
    const pick = (start, chosen) => {
      if (chosen.length === k) return sets.every((s) => chosen.some((c) => s.has(c)));
      for (let i = start; i < cand.length; i++) if (pick(i + 1, [...chosen, cand[i]])) return true;
      return false;
    };
    if (pick(0, [])) return k;
  }
  return sets.length;
}

const trs = C.loadTranscripts();
// Like for like: a word counts only if both seeds put it behind a door
// (today's 18 unreachable words would otherwise inflate the new side).
// "content" also drops the little words — no topic can hold "the".
const little = new Set(Object.values(SEEDS).flatMap((seed) =>
  members(seed.groups.find((g) => g.key === 'little_words'))));
for (const L of ['grid60', 'grid15']) {
  console.log(`\n## CHILDES — ${L} home board, all ${trs.length} transcripts`);
  for (const who of ['child', 'adult']) {
    const tags = who === 'child' ? C.CHILD_TAGS : C.ADULT_TAGS;
    const r = {};
    for (const mode of ['all', 'content']) for (const name of Object.keys(SEEDS)) {
      r[`${mode}|${name}`] = { lines1: 0, doors1: 0, lines2: 0, doors2: 0, one2: 0, pairs: 0, samePair: 0, share: new Map() };
    }
    for (const t of trs) {
      for (const [spk, words] of t) {
        if (!tags.has(spk) || !words.length) continue;
        const lemmas = C.analyzeLine(words).map((x) => x.lemma).filter((l) => l && sensesOf.has(l));
        const doors = {};
        for (const name of Object.keys(SEEDS)) {
          const G = groupsOf[name][L];
          doors[name] = lemmas.map((lem) => {
            const ss = sensesOf.get(lem);
            if (ss.some((s) => home[L].has(s))) return 'home';
            const ks = new Set(ss.flatMap((s) => [...(G.get(s) ?? [])]));
            return ks.size ? ks : null;
          });
        }
        const names = Object.keys(SEEDS);
        const keep = lemmas.map((_, i) => names.every((n) => doors[n][i] && doors[n][i] !== 'home'));
        const isLittle = lemmas.map((lem) => sensesOf.get(lem).some((s) => little.has(s)));
        for (const mode of ['all', 'content']) {
          const use = keep.map((k, i) => k && !(mode === 'content' && isLittle[i]));
          for (const name of names) {
            const R = r[`${mode}|${name}`];
            const D = doors[name];
            const seen = new Set();
            const need = [];
            lemmas.forEach((lem, i) => { if (use[i] && !seen.has(lem)) { seen.add(lem); need.push(D[i]); } });
            if (need.length) {
              const k = minCover(need);
              if (k !== null) {
                R.lines1++; R.doors1 += k;
                if (need.length >= 2) { R.lines2++; R.doors2 += k; if (k === 1) R.one2++; }
              }
            }
            lemmas.forEach((_, i) => { if (use[i]) for (const k of D[i]) R.share.set(k, (R.share.get(k) ?? 0) + 1 / D[i].size); });
            for (let i = 0; i + 1 < lemmas.length; i++) {
              if (!use[i] || !use[i + 1]) continue;
              R.pairs++;
              if ([...D[i + 1]].some((k) => D[i].has(k))) R.samePair++;
            }
          }
        }
      }
    }
    const pct = (n, d) => (d ? `${(100 * n / d).toFixed(1)}%` : '-');
    console.log(`  ${who}:`);
    for (const [key, R] of Object.entries(r)) {
      console.log(`    ${key.padEnd(18)} doors/line ${(R.doors1 / R.lines1).toFixed(3)} (n=${R.lines1})` +
        ` | 2+ door words: one door ${pct(R.one2, R.lines2)}, doors/line ${(R.doors2 / R.lines2).toFixed(2)} (n=${R.lines2})` +
        ` | next door word behind same door ${pct(R.samePair, R.pairs)} (n=${R.pairs})`);
    }
    if (who === 'child' && L === 'grid60') {
      const sh = r['all|topics'].share;
      const tot = [...sh.values()].reduce((a, b) => a + b, 0);
      console.log('    topics: share of child door-word tokens by door: ' +
        [...sh].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(1)}%`).join(', '));
    }
  }
}
