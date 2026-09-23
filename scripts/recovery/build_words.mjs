/**
 * Regenerate public/shared/recovery_words.mjs from
 * data/recovery/words_en.txt (the vendored BIP-0039 English wordlist).
 * Run after editing the txt: node scripts/recovery/build_words.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const words = readFileSync(join(root, "data/recovery/words_en.txt"), "utf8")
  .trim().split("\n");
if (words.length !== 2048 || new Set(words).size !== 2048) {
  throw new Error("wordlist must be 2048 unique words");
}
writeFileSync(join(root, "public/shared/recovery_words.mjs"),
  `/**
 * BIP-0039 English wordlist (2048 words) — generated from
 * data/recovery/words_en.txt by scripts/recovery/build_words.mjs.
 * The recovery sheet encodes the board recovery root as 24 of these.
 */
export const RECOVERY_WORDS = ${JSON.stringify(words)};
`);
console.log(`recovery_words.mjs: ${words.length} words`);
