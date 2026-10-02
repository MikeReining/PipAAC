#!/usr/bin/env node
/**
 * 037 byte gate — measures the shipped files, not the build's report of
 * them. Fails when public/symbols/ as a whole or any single raster file
 * exceeds the budget (2× the measured post-diet values: 7.9 MB total,
 * 43 KB largest file, 2026-10-02).
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(import.meta.url), "../..");
const SYMBOLS_DIR = join(repoRoot, "public/symbols");
const TOTAL_BUDGET = 16 * 1024 * 1024;   // ≤ 16 MB
const FILE_BUDGET = 96 * 1024;           // ≤ 96 KB per shipped file
const RASTER = /\.(webp|png|jpe?g|gif|avif)$/i;

const failures = [];
let total = 0;
let largest = { name: null, size: 0 };
let count = 0;

for (const file of readdirSync(SYMBOLS_DIR)) {
  const { size } = statSync(join(SYMBOLS_DIR, file));
  count++;
  total += size;
  if (size > largest.size) largest = { name: file, size };
  if (RASTER.test(file) && size > FILE_BUDGET) {
    failures.push(`${file} is ${(size / 1024).toFixed(0)} KB (budget ${FILE_BUDGET / 1024} KB)`);
  }
}
if (total > TOTAL_BUDGET) {
  failures.push(`public/symbols is ${(total / 1024 / 1024).toFixed(1)} MB (budget ${TOTAL_BUDGET / 1024 / 1024} MB)`);
}

if (failures.length) {
  for (const f of failures) console.error(`symbols-bytes: ${f}`);
  process.exit(1);
}
console.log(
  `symbols-bytes OK — ${count} files, ${(total / 1024 / 1024).toFixed(1)} MB total,`
  + ` largest ${largest.name} ${(largest.size / 1024).toFixed(0)} KB`,
);
