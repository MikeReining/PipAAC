// Extended vocabulary list (010 slice 1): parse
// docs/product/Extended_Vocabulary_Catalog.md into
// data/extended_lexicon.json — the markdown stays the source, the JSON
// is regenerated. Data only: no pictures, no audio.
//
// Validation (the slice-1 Works Test):
//   - a row whose label repeats a launch word is rejected
//   - a row outside a ## category (or before its art: rule) is rejected
//   - a duplicate label is rejected
// A parenthesized label is its own sense — "wrap (food)" is not the
// "wrap" action and "Bear (Masha)" is not the animal — so identity and
// the launch check key on the full label, never the spoken part.
//
//   node scripts/catalog/build_extended_lexicon.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '../..');
const SRC = path.join(REPO, 'docs/product/Extended_Vocabulary_Catalog.md');
const OUT = path.join(REPO, 'data/extended_lexicon.json');
const LAUNCH = JSON.parse(
  readFileSync(path.join(REPO, 'data/launch_lexicon.json'), 'utf8'));

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');
const MARKUP = /^[#>*`!\[-]|^\s*-/;

/** Parse the catalog markdown into entries + errors. Exported so the
 *  Works Test can feed fixture text. Text before the first `##` is
 *  front matter and ignored; inside a section, an `art:` rule must
 *  come before its items. */
export function parseExtended(mdText, launchWords) {
  const entries = [];
  const errors = [];
  let category;           // undefined = front matter; null = unnamed ##
  let art = null;
  const seen = new Set();
  for (const line of mdText.split('\n')) {
    const h = line.match(/^##\s*(.*)/);
    if (h) { category = h[1].trim() || null; art = null; continue; }
    if (category === undefined) continue;
    if (line.startsWith('#')) continue;
    const a = line.match(/^art:\s*(draw|none)\s*$/);
    if (a) { art = a[1]; continue; }
    const t = line.trim();
    if (!t || MARKUP.test(t)) continue;
    for (const item of t.split(',')) {
      const text = item.trim();
      if (!text) continue;
      const key = text.toLowerCase();
      const spoken = text.replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/\s+/g, ' ').trim().toLowerCase();
      if (category === null) {
        errors.push(`"${text}" has no category`); continue;
      }
      if (art === null) {
        errors.push(`"${text}" in "${category}" comes before its art: rule`);
        continue;
      }
      if (launchWords.has(key)) {
        errors.push(`"${text}" repeats a launch word`); continue;
      }
      if (seen.has(key)) {
        errors.push(`"${text}" is a duplicate`); continue;
      }
      seen.add(key);
      const id = slug(text);
      // the id is the art filename — two labels slugging alike would
      // fight over one picture ("Jack in the Box" vs "jack-in-the-box")
      if (entries.some((e) => e.id === id)) {
        errors.push(`"${text}" slug "${id}" collides — disambiguate the label`);
        continue;
      }
      entries.push({
        id,
        text,
        spokenText: spoken,
        category,
        kind: category.startsWith('Phrases') ? 'phrase' : 'word',
        art,
      });
    }
  }
  return { entries, errors };
}

const launchWords = new Set(
  LAUNCH.entries.map((e) => e.spokenText.toLowerCase()));

export function build(mdText = readFileSync(SRC, 'utf8'),
  launch = launchWords) {
  const { entries, errors } = parseExtended(mdText, launch);
  if (errors.length) {
    for (const e of errors) console.error(`reject: ${e}`);
    throw new Error(`${errors.length} invalid rows in ${path.relative(REPO, SRC)}`);
  }
  return {
    schemaVersion: 'extended-lexicon.2026-09-24.1',
    source: path.relative(REPO, SRC),
    categories: [...new Set(entries.map((e) => e.category))],
    entries,
  };
}

if (process.argv[1]?.endsWith('build_extended_lexicon.mjs')) {
  const data = build();
  writeFileSync(OUT, JSON.stringify(data, null, 1));
  const draw = data.entries.filter((e) => e.art === 'draw').length;
  console.log(`${data.entries.length} entries ` +
    `(${draw} draw, ${data.entries.length - draw} words+audio only) ` +
    `across ${data.categories.length} categories -> ` +
    `${path.relative(REPO, OUT)}`);
}
