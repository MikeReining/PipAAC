#!/usr/bin/env node
/**
 * Locale-literal gate (phase 003b slice 2). No English literal may drive a
 * label query or voice lookup in the app runtime — the profile's locale
 * and resolved voice are bound instead. Fails on `locale = 'en'`,
 * `locale='en'`, or `voi_default_en` anywhere under public/ except
 * public/vendor/ (vendored sqlite-wasm is untouchable).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = join(repoRoot, "public");
const SKIP = new Set(["vendor"]);
// Generated data payloads (catalog + prediction tables) legitimately
// contain voice/locale ids as data — the gate scans code, not cargo.
const SKIP_FILES = new Set([
  "catalog.json", "phrase_table.en.json", "form_table.en.json.gz",
  "feeling_voice.json", "sw-audio.json", "fresh_db.sqlite",
]);

const PATTERNS = [/locale\s*=\s*['"]en['"]/, /voi_default_en/];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || SKIP_FILES.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const hits = [];
for (const file of walk(PUBLIC)) {
  const rel = relative(repoRoot, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const re of PATTERNS) {
      if (re.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim()}`);
    }
  });
}

if (hits.length) {
  console.error(`locale literals found — bind the profile locale/voice instead:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("locale literals: clean");
