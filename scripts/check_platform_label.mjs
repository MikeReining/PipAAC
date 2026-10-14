/**
 * Lint: every docs/phases/NNN_*.md with NNN >= 045 must carry a
 * `**Platforms:**` line in its first 15 lines (044 A, Platforms_iOS_And_Web § 7).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIRST_LINES = 15;
const MIN_PHASE = 45;

export function findMissingPlatformLabels(phasesDir) {
  const missing = [];
  for (const name of fs.readdirSync(phasesDir).sort()) {
    const m = /^(\d{3})_.*\.md$/.exec(name);
    if (!m || Number(m[1]) < MIN_PHASE) continue;
    const head = fs.readFileSync(path.join(phasesDir, name), "utf8").split("\n").slice(0, FIRST_LINES);
    if (!head.some((line) => line.startsWith("**Platforms:**"))) missing.push(name);
  }
  return missing;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const missing = findMissingPlatformLabels(path.join(repoRoot, "docs/phases"));
  if (missing.length) {
    console.error(`Missing "**Platforms:**" line in first ${FIRST_LINES} lines of:`);
    for (const f of missing) console.error(`  docs/phases/${f}`);
    process.exit(1);
  }
  console.log("platform labels ok");
}
