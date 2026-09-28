// Group starters (027 § 5): in an empty sentence inside a group, which
// word do children say FIRST? For every child turn in a group's context —
// its own words, or the two turns before it (any speaker), touch the
// group — count only the turn's first analyzed token. An unmapped first
// token counts as unmapped; a later word is never promoted into its
// place. One-word replies stay ("more juice?" / "no"). A group is touched
// by its compiled members that are not home-board words (home words are
// in every conversation). Custom groups use the pooled count over every
// child turn.
//
// Reads the compiled catalog (data/catalog/catalog.json) and the local
// CHILDES cache; writes aggregate counts with corpus, tokenizer and seed
// provenance — never a transcript line.
//
//   node scripts/prediction/childes/door_starters.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as C from './common.mjs';

const TOP = 20; // counts kept per group — the Smart bar shows at most four

/**
 * Pure core. `transcripts`: arrays of [speaker, words[]]. `groups`:
 * [{ id, own: Set(sense id) }]. `sensesOf`: lemma -> [sense ids], lowest
 * slot first. Returns { groups: {id: {turns, unmapped, counts}}, pooled }.
 */
export function countFirstWords(transcripts, groups, sensesOf, analyze = C.analyzeLine) {
  const tally = () => ({ turns: 0, unmapped: 0, counts: new Map() });
  const out = { groups: Object.fromEntries(groups.map((g) => [g.id, tally()])), pooled: tally() };
  const add = (t, first) => {
    t.turns++;
    if (first === null) t.unmapped++;
    else t.counts.set(first, (t.counts.get(first) ?? 0) + 1);
  };
  for (const turns of transcripts) {
    const prev = []; // senses of the last two turns, any speaker
    for (const [spk, words] of turns) {
      const tokens = words.length ? analyze(words) : [];
      const senses = tokens.flatMap((x) => (x.lemma && sensesOf.get(x.lemma)) || []);
      const ctx = new Set([...prev.flat(), ...senses]);
      prev.push(senses);
      if (prev.length > 2) prev.shift();
      if (!C.CHILD_TAGS.has(spk) || !tokens.length) continue;
      const firstSenses = (tokens[0].lemma && sensesOf.get(tokens[0].lemma)) || null;
      add(out.pooled, firstSenses ? firstSenses[0] : null);
      for (const g of groups) {
        if (![...ctx].some((s) => g.own.has(s))) continue;
        // A two-meaning first word counts as the meaning the group holds.
        const pick = firstSenses ? (firstSenses.find((s) => g.own.has(s)) ?? firstSenses[0]) : null;
        add(out.groups[g.id], pick);
      }
    }
  }
  return out;
}

/** The shipped shape: top counts per group, highest first. */
export function starterTable(counted, provenance) {
  const ranked = (t) => ({
    turns: t.turns,
    unmapped: t.unmapped,
    first: [...t.counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP).map(([sense, n]) => ({ sense, n })),
  });
  return {
    provenance,
    groups: Object.fromEntries(Object.entries(counted.groups).map(([id, t]) => [id, ranked(t)])),
    pooled: ranked(counted.pooled),
  };
}

function main() {
  const read = (p) => JSON.parse(readFileSync(path.join(C.REPO, p), 'utf8'));
  const CAT = read('data/catalog/catalog.json');
  const OUT = path.join(C.REPO, 'data/prediction/door_starters.en.json');
  const home = new Set(CAT.coreCells.filter((c) => c.layout === 'grid60').map((c) => c.sense_id));
  const lemma = new Map(CAT.labels.filter((l) => l.kind === 'lemma' && l.locale === 'en')
    .map((l) => [l.sense_id, l.text.toLowerCase()]));
  const sensesOf = new Map();
  for (const s of [...CAT.senses].sort((a, b) => a.id.localeCompare(b.id))) {
    const k = lemma.get(s.id);
    if (k) sensesOf.set(k, [...(sensesOf.get(k) ?? []), s.id]);
  }
  const groups = CAT.groups.filter((g) => g.kind === 'builtin').map((g) => ({
    id: g.id,
    own: new Set(CAT.groupMembers.filter((m) => m.group_id === g.id && !home.has(m.item_id)).map((m) => m.item_id)),
  }));
  const counted = countFirstWords(C.loadTranscripts(), groups, sensesOf);
  const table = starterTable(counted, {
    corpus: 'CHILDES (TalkBank) — every transcript in the local cache (data/prediction/childes/transcripts.jsonl); permission: data/prediction/permissions/2026-09-23_TalkBank_CHILDES.md',
    tokenizer: 'scripts/prediction/childes/common.mjs analyzeLine — first analyzed token only',
    seed: `catalog groupSeedVersion ${CAT.groupSeedVersion}`,
    generated: new Date().toISOString().slice(0, 10),
  });
  for (const [id, g] of Object.entries(table.groups)) {
    const top = g.first.slice(0, 6).map((r) => lemma.get(r.sense)).join(', ');
    console.log(`${id.padEnd(22)} ${String(g.turns).padStart(7)} turns · ${g.unmapped} unmapped firsts · ${top}`);
  }
  writeFileSync(OUT, JSON.stringify(table, null, 1) + '\n');
  console.log(path.relative(C.REPO, OUT));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
