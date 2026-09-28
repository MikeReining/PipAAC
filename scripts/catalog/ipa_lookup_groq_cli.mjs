#!/usr/bin/env node
/**
 * Quick IPA lookup for founder QA (v4 lab uses the same Groq helper).
 *   set -a && source .env && set +a
 *   node scripts/catalog/ipa_lookup_groq_cli.mjs bathroom "all done"
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { lookupIpaGroq } from "./ipa_lookup_groq.mjs";
import { repoRoot } from "./paths.mjs";

function loadEnv() {
  try {
    for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
      const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // optional
  }
}

const words = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (!words.length) {
  console.log("usage: node scripts/catalog/ipa_lookup_groq_cli.mjs <word> ...");
  process.exit(1);
}

loadEnv();

for (const w of words) {
  const r = await lookupIpaGroq({ text: w });
  console.log(`${w}\t${r.ipa}\t${r.gloss || ""}`);
}
