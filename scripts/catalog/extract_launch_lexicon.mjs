#!/usr/bin/env node
/**
 * Regenerate data/launch_lexicon.json from docs/product/Initial_Vocabulary_600.md
 *
 *   node scripts/catalog/extract_launch_lexicon.mjs
 *   node scripts/catalog/extract_launch_lexicon.mjs --check
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_LEXICON_PATH, repoRoot } from "./paths.mjs";

const LEXICON_MD = join(repoRoot, "docs/product/Initial_Vocabulary_600.md");
const ROW_RE = /^\|\s*(\d+)\s*\|\s*\*\*([^*]+)\*\*\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/;
const CATEGORY_RE = /^### 3\.\d+ (.+?) \(\d+ words\)/;
const NEGATION_RE = /^\*\*Negation flag\*\*.*?:\s*(.+?)\.?\s*$/;

/** @returns {{ schemaVersion: number, source: string, entries: object[] }} */
export function parseLaunchLexiconMarkdown(raw) {
  let tier = 0;
  let category = null;
  /** @type {Map<number, object>} */
  const bySlot = new Map();
  const zoneNames = new Set();
  /** @type {Map<number, string>} slot -> cross-listed zone for Tier 1 rows */
  const crossListed = new Map();
  /** @type {Set<string>} the doc's negation-flag words (sense.negation) */
  const negWords = new Set();

  for (const line of raw.split("\n")) {
    const neg = NEGATION_RE.exec(line);
    if (neg) {
      for (const w of neg[1].split(",")) negWords.add(w.trim());
      continue;
    }
    if (line.startsWith("## 2. Tier 1")) tier = 1;
    else if (line.startsWith("## 3. Tier 2")) tier = 2;
    else if (line.startsWith("## 4.")) tier = 0;

    if (tier === 0) continue;
    const cat = CATEGORY_RE.exec(line);
    if (cat) {
      category = cat[1].trim();
      zoneNames.add(category);
      continue;
    }
    const m = ROW_RE.exec(line);
    if (!m) continue;
    const slot = Number(m[1]);
    let entryCategory = tier === 2 ? category : null;
    if (tier === 1) {
      // Tier 1 Sub-Category: "Core X" or "Core X → Zone Name" (zone cross-listing)
      const sub = m[6].trim();
      const arrow = sub.indexOf("→");
      if (arrow >= 0) {
        entryCategory = sub.slice(arrow + 1).trim();
        crossListed.set(slot, entryCategory);
      }
    }
    bySlot.set(slot, {
      slot,
      tier,
      spokenText: m[2].trim(),
      partOfSpeech: m[3].trim(),
      fitzgeraldColor: m[4].trim(),
      visualStyle: m[5].trim(),
      category: entryCategory,
      negation: negWords.has(m[2].trim()) || undefined,
    });
  }

  for (const [slot, zone] of crossListed) {
    if (!zoneNames.has(zone)) {
      throw new Error(`slot ${slot} cross-lists into unknown zone "${zone}"`);
    }
  }
  for (const w of negWords) {
    if (![...bySlot.values()].some((e) => e.spokenText === w)) {
      throw new Error(`negation-flag word "${w}" matches no lexicon row`);
    }
  }

  const entries = [...bySlot.values()].sort((a, b) => a.slot - b.slot);
  return {
    schemaVersion: 2,
    source: "docs/product/Initial_Vocabulary_600.md",
    entries,
  };
}

function main() {
  const check = process.argv.includes("--check");
  const raw = readFileSync(LEXICON_MD, "utf8");
  const parsed = parseLaunchLexiconMarkdown(raw);
  if (parsed.entries.length !== 695) {
    throw new Error(`expected 695 lexicon rows, got ${parsed.entries.length}`);
  }

  if (check) {
    const existing = JSON.parse(readFileSync(DEFAULT_LEXICON_PATH, "utf8"));
    const same =
      JSON.stringify(existing.entries) === JSON.stringify(parsed.entries) &&
      existing.schemaVersion === parsed.schemaVersion;
    if (!same) {
      console.error("launch_lexicon.json is stale — run extract_launch_lexicon.mjs");
      process.exit(1);
    }
    console.log("launch_lexicon.json OK (695 entries)");
    return;
  }

  writeFileSync(DEFAULT_LEXICON_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  console.log(`Wrote ${DEFAULT_LEXICON_PATH} (${parsed.entries.length} entries)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
