#!/usr/bin/env node
// Grammar help — founder-reviewed examples (021 slice 5). For each row:
// a fresh in-memory db + the real shipped catalog and form table; the
// sentence is built through the same calls the board's tap path makes
// (formFor on tap, then decision 4 re-picks the previous word), and the
// bar rows run the real stripRanked + formFor. Expected forms are the
// doc's founder table — a DIFF shows the counts behind the answer.
//
//   node scripts/prediction/form_examples.mjs   (exit 1 on any DIFF)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDatabase, importCatalog } from '../../src/board/catalog.mjs';
import { stripRanked } from '../../public/shared/funnel.mjs';
import { formFor } from '../../public/shared/forms.mjs';
import catalog from '../../data/catalog/catalog.json' with { type: 'json' };

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.join(HERE, '../..');
const formTable = JSON.parse(
  readFileSync(path.join(REPO, 'data/prediction/form_table.en.json'), 'utf8'));
const kids = JSON.parse(
  readFileSync(path.join(REPO, 'data/prediction/phrase_table.en.json'), 'utf8'));
const rows = JSON.parse(readFileSync(path.join(HERE, 'form_examples.json'), 'utf8'));

// A word resolves like the keyboard does: lemma first, then alias, then
// a form label ('wants', 'does', 'him' all land on their sense).
const anySense = new Map();
for (const l of catalog.labels) {
  if (l.status !== 'approved' || l.locale !== 'en') continue;
  const rank = { lemma: 0, alias: 1, form: 2 }[l.kind] ?? 3;
  const cur = anySense.get(l.normalized_text);
  if (!cur || rank < cur.rank) anySense.set(l.normalized_text, { id: l.sense_id, rank });
}
const S = (w) => {
  const hit = anySense.get(w);
  if (!hit) throw new Error(`no catalog label for "${w}"`);
  return { kind: 'sense', id: hit.id };
};

const NOW = Date.parse('2026-09-24T08:20:00');

/** The tap path, reduced to its grammar rule: append the form's item,
 *  then let the newest word re-pick the one before it (decision 4). */
function tapWord(db, sentence, item) {
  const f = formFor(db, formTable, sentence, item.id);
  sentence.push({ kind: item.kind, id: f.senseId, text: f.text,
    labelId: f.labelId, fixed: f.merged });
  const at = sentence.length - 1;
  if (at < 1) return;
  const prev = sentence[at - 1];
  if (prev.kind !== 'sense' || !prev.id || prev.fixed) return;
  const re = formFor(db, formTable, sentence.slice(0, at - 1), prev.id, sentence[at]);
  if (re.text !== prev.text) { prev.text = re.text; prev.labelId = re.labelId; }
}

function resolveItem(db, spec) {
  if (typeof spec === 'string') return S(spec);
  if (spec.entity) {
    db.prepare(
      `INSERT INTO personal_entity (id, spoken_name, status)
       VALUES ('ent_leo', ?, 'active')`,
    ).run(spec.entity);
    return { kind: 'entity', id: 'ent_leo' };
  }
  throw new Error(`bad row item ${JSON.stringify(spec)}`);
}

let diffs = 0;
console.log(`${'before'.padEnd(22)} ${'tap'.padEnd(9)} ${'expected'.padEnd(28)} ${'actual'.padEnd(28)} verdict`);
for (const row of rows) {
  const db = createDatabase(':memory:');
  importCatalog(db, catalog);
  const sentence = [];

  if (row.bar) {
    for (const w of row.bar) tapWord(db, sentence, S(w));
    const { shown } = stripRanked(
      db, sentence.map((s) => ({ kind: s.kind, id: s.id })), NOW, 'en', kids);
    const actual = shown.map((c) =>
      formFor(db, formTable, sentence, c.id).text ?? c.id);
    const ok = JSON.stringify(actual) === JSON.stringify(row.expected);
    if (!ok) diffs++;
    console.log(
      `${('bar after ' + row.bar.join(' ')).padEnd(22)} ${'—'.padEnd(9)} ` +
      `${row.expected.join(', ').padEnd(28)} ${actual.join(', ').padEnd(28)} ${ok ? 'OK' : 'DIFF'}`);
    continue;
  }

  const taps = row.taps ?? [...row.before, row.tap];
  for (const spec of taps) tapWord(db, sentence, resolveItem(db, spec));

  if (row.expectedSentence) {
    const actual = sentence.map((s) => s.text).join(' ');
    const ok = actual === row.expectedSentence;
    if (!ok) diffs++;
    console.log(
      `${row.taps.join(' ').padEnd(22)} ${'—'.padEnd(9)} ` +
      `${row.expectedSentence.padEnd(28)} ${actual.padEnd(28)} ${ok ? 'OK' : 'DIFF'}`);
    continue;
  }

  const actual = sentence[sentence.length - 1].text;
  const ok = actual === row.expected;
  if (!ok) diffs++;
  let note = ok ? 'OK' : 'DIFF';
  if (!ok) {
    // Show the counts the pick came from — longest matching ending.
    const ctxIds = sentence.slice(0, -1).map((s) => s.id);
    const key = `${ctxIds.join(' ')}|${sentence[sentence.length - 1].id}`;
    const counts = formTable.contexts[key] ?? {};
    note = `DIFF ${JSON.stringify(counts)}`;
  }
  console.log(
    `${(row.before?.map((b) => b.entity ?? b).join(' ') ?? '').padEnd(22)} ` +
    `${(row.tap ?? '').padEnd(9)} ${row.expected.padEnd(28)} ${actual.padEnd(28)} ${note}`);
}

console.log(`\n${rows.length - diffs}/${rows.length} OK`);
process.exit(diffs ? 1 : 0);
