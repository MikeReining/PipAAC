// Which home-board words should travel into each door (the "sentence
// starters")? For every child line in a door's context — the line or one
// of the two lines before it (any speaker) mentions one of the door's own
// words — count the home-board words the child said. Context, not just
// the line: "no" and "all done" are mostly one-word replies to an offer
// ("more juice?" / "no"), which a same-line count never sees. The ranking is
// the door's starter list; coverage says how much of that talk it covers.
// Writes an aggregate table only — counts per word, no lines.
//
//   node scripts/prediction/childes/door_starters.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from './common.mjs';
import { seedResolver, sid } from '../../catalog/seed_members.mjs';

const read = (p) => JSON.parse(readFileSync(path.join(C.REPO, p), 'utf8'));
const LEX = read('data/launch_lexicon.json').entries;
const CAT = read('data/catalog/catalog.json');
const TOPICS = read('data/group_seed.topics.json');
const DOORS = read('data/occasions/meal_doors.proposed.json');
const OUT = path.join(C.REPO, 'data/prediction/door_starters.en.json');

const { resolve, members, home } = seedResolver(LEX, CAT);
const HOME = home[DOORS.layout];
const label = new Map(CAT.labels.filter((l) => l.kind === 'lemma' && l.locale === 'en').map((l) => [l.sense_id, l.text]));

const doorMembers = (d) => (d.topic
  ? members(TOPICS.groups.find((g) => g.key === d.topic))
  : d.words.map((w) => resolve(w, d.key)));

const sensesOf = new Map();
for (const e of LEX) {
  const k = e.spokenText.toLowerCase();
  sensesOf.set(k, [...(sensesOf.get(k) ?? []), sid(e.slot)]);
}

const doors = DOORS.doors.map((d) => {
  const ms = doorMembers(d);
  return { key: d.key, own: new Set(ms.filter((s) => !HOME.has(s))), lines: 0, counts: new Map() };
});
const base = { lines: 0, counts: new Map() };

const sensesIn = (words) => C.analyzeLine(words).map((x) => x.lemma)
  .filter((l) => l && sensesOf.has(l)).flatMap((l) => sensesOf.get(l));
for (const t of C.loadTranscripts()) {
  const prev = []; // senses of the last two lines, any speaker
  for (const [spk, words] of t) {
    const ss = words.length ? sensesIn(words) : [];
    const ctx = [...prev.flat(), ...ss];
    prev.push(ss);
    if (prev.length > 2) prev.shift();
    if (!C.CHILD_TAGS.has(spk) || !ss.length) continue;
    const homeWords = new Set(ss.filter((s) => HOME.has(s)));
    base.lines++;
    for (const h of homeWords) base.counts.set(h, (base.counts.get(h) ?? 0) + 1);
    for (const d of doors) {
      if (!ctx.some((s) => d.own.has(s))) continue;
      d.lines++;
      for (const h of homeWords) d.counts.set(h, (d.counts.get(h) ?? 0) + 1);
    }
  }
}

const table = { source: 'CHILDES child lines (CHI) whose line or two lines before mention the door, all transcripts', layout: DOORS.layout, generated: new Date().toISOString().slice(0, 10), doors: {} };
for (const d of doors) {
  const total = [...d.counts.values()].reduce((a, b) => a + b, 0);
  let cum = 0;
  table.doors[d.key] = {
    lines: d.lines,
    ranked: [...d.counts].sort((a, b) => b[1] - a[1]).map(([s, n]) => {
      cum += n;
      const lift = (n / d.lines) / ((base.counts.get(s) ?? 0) / base.lines);
      return { sense: s, word: label.get(s), lines: n, share: +(n / d.lines).toFixed(4), lift: +lift.toFixed(2), cumulative: +(cum / total).toFixed(4) };
    }),
  };
  const top = table.doors[d.key].ranked.slice(0, 12);
  console.log(`${d.key.padEnd(10)} ${d.lines} lines · top 12 cover ${(100 * top.at(-1).cumulative).toFixed(0)}% of home-word uses: ${top.map((r) => r.word).join(', ')}`);
}
writeFileSync(OUT, JSON.stringify(table, null, 1) + '\n');
console.log(path.relative(C.REPO, OUT));
