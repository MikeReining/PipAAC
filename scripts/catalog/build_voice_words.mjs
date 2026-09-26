#!/usr/bin/env node
/**
 * 024 slice 1 — the shared voice cache's eligibility set.
 *
 * A sentence goes into the shared R2 cache only if every word in it is
 * a Pip catalog word, one of its forms, or a common name (024 § 5).
 * This builds the flat word set the Worker checks: catalog labels
 * (lemma, form, alias), form surfaces from data/forms/en.json
 * (moms, knives, mom's…), the sanctioned child surfaces from
 * IRREG/MERGES (mommy, daddy, went — same sense), and the common
 * names list (empty until slice 7 lands the open-data builder).
 *
 * Usage: node scripts/catalog/build_voice_words.mjs [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const catalog = read("data/catalog/catalog.json");
const forms = read("data/forms/en.json");
const names = read("data/catalog/common_names.en.json").names ?? [];

// IRREG is a code-level constant in the CHILDES normalizer — the
// sanctioned list of child surfaces that mean a catalog word.
const { IRREG } = await import(
  join(root, "scripts/prediction/childes/common.mjs").replaceAll("\\", "/"));

const words = new Set();
const add = (w) => {
  if (typeof w !== "string") return;
  const t = w.trim().toLowerCase();
  if (t) words.add(t);
};

for (const l of catalog.labels) {
  if (l.kind === "lemma" || l.kind === "form" || l.kind === "alias") {
    add(l.normalized_text);
  }
}
// Form surfaces the shipped catalog doesn't carry as labels yet
// (the permissive build's spellings: moms, knives, wants…).
for (const [surface] of Object.values(forms.plurals ?? {})) add(surface);
for (const base of Object.keys(forms.possNouns ?? {})) add(`${base}'s`);
for (const surface of forms.fallbackSpellings ?? []) add(surface);
for (const v of Object.values(forms.verbs ?? {})) {
  for (const surface of Array.isArray(v) ? v : Object.values(v)) {
    add(Array.isArray(surface) ? surface[0] : surface);
  }
}
for (const surface of Object.keys(IRREG)) add(surface);
for (const surface of Object.keys(forms.merges ?? {})) add(surface);
for (const n of names) add(n);

const out = {
  version: `voice-words.${new Date().toISOString().slice(0, 10)}`,
  locale: "en",
  words: [...words].sort(),
};

const dest = join(root, "data/catalog/voice_words.en.json");
if (process.argv.includes("--check")) {
  const cur = JSON.parse(readFileSync(dest, "utf8"));
  const same = JSON.stringify(cur.words) === JSON.stringify(out.words);
  console.log(same ? "up to date" : "STALE — regenerate");
  process.exit(same ? 0 : 1);
}
writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
console.log(`${out.words.length} eligible words -> ${dest}`);
