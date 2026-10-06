// Source-map collector — seed loading, playbook drift check, expansion dedupe/cap.
// The playbook stays the list a person reads; buyer-questions.json mirrors it and
// --check-seeds fails on drift either way.

import { readFileSync } from "node:fs";

export const MAX_EXTRA_PHRASES = 18;
export const MAX_CITATION_PHRASES = 25;

export function loadSeeds(jsonPath) {
  const data = JSON.parse(readFileSync(jsonPath, "utf8"));
  if (!Array.isArray(data) || data.some((s) => typeof s !== "string" || !s.trim())) {
    throw new Error(`${jsonPath}: expected a JSON array of non-empty strings`);
  }
  return data.map((s) => s.trim());
}

// Pull the bullet list out of "## 2. Buyer questions" — the numbered heading is
// part of the playbook, so match on the title text, not the number.
export function playbookSeeds(markdown) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^##\s+\d*\.?\s*Buyer questions/i.test(l));
  if (start === -1) return [];
  const seeds = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const m = line.match(/^- (.+?)\s*$/);
    if (m) seeds.push(m[1]);
  }
  return seeds;
}

export function checkSeeds(jsonSeeds, playbookList) {
  const inJson = new Set(jsonSeeds.map((s) => s.toLowerCase()));
  const inDoc = new Set(playbookList.map((s) => s.toLowerCase()));
  return {
    ok: jsonSeeds.length === playbookList.length && [...inJson].every((s) => inDoc.has(s)),
    missingFromJson: playbookList.filter((s) => !inJson.has(s.toLowerCase())),
    missingFromPlaybook: jsonSeeds.filter((s) => !inDoc.has(s.toLowerCase())),
  };
}

// One level of expansion: keep every seed, dedupe extras case-insensitively,
// cap extras at MAX_EXTRA_PHRASES. With more extras than the cap, keep the ones
// seen under the most seeds, then the ones Google listed earliest.
export function expandPhrases(seeds, extrasPerSeed) {
  const seedSet = new Set(seeds.map((s) => s.toLowerCase()));
  const stats = new Map(); // lower -> {phrase, count, firstSeen}
  let order = 0;
  for (const extras of extrasPerSeed) {
    const seenThisSeed = new Set();
    for (const raw of extras) {
      const phrase = String(raw).trim();
      const key = phrase.toLowerCase();
      if (!phrase || seedSet.has(key) || seenThisSeed.has(key)) continue;
      seenThisSeed.add(key);
      const entry = stats.get(key);
      if (entry) {
        entry.count += 1;
      } else {
        stats.set(key, { phrase, count: 1, firstSeen: order++ });
      }
    }
  }
  const ranked = [...stats.values()].sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen);
  const kept = ranked.slice(0, MAX_EXTRA_PHRASES).map((e) => e.phrase);
  const dropped = ranked.slice(MAX_EXTRA_PHRASES).map((e) => e.phrase);
  return {
    phrases: [...seeds, ...kept].slice(0, MAX_CITATION_PHRASES),
    extras: kept,
    dropped,
  };
}
