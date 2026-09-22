#!/usr/bin/env node
// Doc citation guard (ratcheted on scripts/doc-citations-baseline.json).
//
// Fails when a cited repo path does not exist, a cited line is out of range, or a
// cited commit sha is not in git history. Scans docs/** and AGENTS.md.
//
// Known breakage is recorded in the baseline and tolerated; NEW breakage fails.
// After fixing citations, run with --update-baseline to shrink the baseline.
//
// Proof citations are detected mechanically:
//   - any `path/to/file.mjs:line` or `file.mjs:line` (line number required)
//   - backtick-wrapped repo paths with a file extension (optional line)
//   - backtick-wrapped lowercase hex treated as commit shas
//
// Run: node scripts/check_doc_citations.mjs
// Refresh baseline after fixes: node scripts/check_doc_citations.mjs --update-baseline
// Wired into: npm run check (lint:doc-citations)

import { execSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BASELINE_PATH = join(ROOT, "scripts/doc-citations-baseline.json");

const EXT = "(?:mjs|js|jsx|ts|tsx|md|jsonc)";

// Extensions in EXT can be prefixes of one another (js/jsonc, ts/tsx) and the
// path character class above allows dots, so an unlisted longer extension
// (e.g. .jsonc before it was added, or .mdx) would otherwise let the greedy
// match backtrack onto a listed short prefix — "wrangler.jsonc" matching as
// "wrangler.js". This lookahead forbids that: the char right after the
// matched extension must not be another extension character, so alternation
// is forced to either match the real extension in full or fail outright.
const EXT_BOUNDARY = "(?![a-zA-Z0-9])";

/** Repo path with required line number. */
const FULL_FILE_LINE_RE = new RegExp(
  `(?:apps|packages|workers|scripts|benchmarks|experiments|src|assets)/[a-zA-Z0-9_./\\-]+\\.${EXT}${EXT_BOUNDARY}(?::\\d+(?:-\\d+)?)?`,
  "g",
);

/** Short filename with line — resolved via git ls-files when unique. */
const SHORT_FILE_LINE_RE = new RegExp(
  `(?<![/\\w])([a-zA-Z0-9_\\-]+\\.${EXT})${EXT_BOUNDARY}:(\\d+)(?:-(\\d+))?`,
  "g",
);

/** Backtick-wrapped repo file path (extension required). Optional :line. */
const BACKTICK_PATH_RE = new RegExp(
  "`((?:apps|packages|workers|scripts|benchmarks|experiments|src|assets)/[a-zA-Z0-9_./\\-]+\\." +
    EXT +
    EXT_BOUNDARY +
    "(?::\\d+(?:-\\d+)?)?)`",
  "g",
);

/** Backtick-wrapped lowercase hex — verified as git commit. */
const BACKTICK_SHA_RE = /`([a-f0-9]{7,40})`/g;

/** Hex in parens after ship/land/done/commit-style verbs (no backticks). */
const VERB_SHA_RE =
  /(?:commit|shipped|landed|done|repair|deployed|pins it|flags)\s+(?:\(?)?`?([a-f0-9]{7,40})`?(?:\)?)?/gi;

/** Ambiguous short names — skip unless full repo path on the same line. */
const AMBIGUOUS_SHORT = new Set([
  "README.md",
  "WEBSITE.md",
  "AGENTS.md",
  "STUDIO.md",
  "index.js",
  "index.mjs",
  "route.js",
  "store.mjs",
]);

function walkMd(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkMd(p, acc);
    else if (name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

function docFiles() {
  const docs = walkMd(join(ROOT, "docs"));
  const agents = join(ROOT, "AGENTS.md");
  if (statSync(agents).isFile()) docs.push(agents);
  return docs;
}

function gitLsFiles() {
  const out = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

function gitVerifyCommit(sha) {
  try {
    execSync(`git rev-parse --verify --quiet ${sha}^{commit}`, {
      cwd: ROOT,
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

function parsePathCite(raw) {
  const m = raw.match(/^(.+?)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return null;
  return {
    path: m[1],
    line: m[2] ? Number(m[2]) : null,
    lineEnd: m[3] ? Number(m[3]) : m[2] ? Number(m[2]) : null,
  };
}

function resolveShortPath(shortName, allFiles) {
  const matches = allFiles.filter((f) => f.endsWith(shortName));
  if (matches.length === 1) return matches[0];
  return matches.length > 1 ? { ambiguous: matches } : null;
}

function countLines(absPath) {
  const text = readFileSync(absPath, "utf8");
  if (!text) return 0;
  return text.split("\n").length;
}

function addPathCitation(citations, raw, seen) {
  const key = raw;
  if (seen.has(key)) return;
  seen.add(key);
  citations.push({ raw });
}

function extractPathCitations(line) {
  const citations = [];
  const seen = new Set();

  FULL_FILE_LINE_RE.lastIndex = 0;
  let m;
  while ((m = FULL_FILE_LINE_RE.exec(line))) {
    addPathCitation(citations, m[0], seen);
  }

  BACKTICK_PATH_RE.lastIndex = 0;
  while ((m = BACKTICK_PATH_RE.exec(line))) {
    addPathCitation(citations, m[1], seen);
  }

  SHORT_FILE_LINE_RE.lastIndex = 0;
  while ((m = SHORT_FILE_LINE_RE.exec(line))) {
    const shortName = m[1];
    if (AMBIGUOUS_SHORT.has(shortName)) continue;
    const raw = `${shortName}:${m[2]}${m[3] ? `-${m[3]}` : ""}`;
    if (seen.has(raw)) continue;
    // Skip when already covered by a longer full-path citation on this line.
    if (
      citations.some(
        (c) => c.raw.includes(`${shortName}:${m[2]}`) || c.raw.endsWith(raw),
      )
    ) {
      continue;
    }
    addPathCitation(citations, raw, seen);
  }

  return citations;
}

function extractShaCitations(line, pathCitations) {
  /** @type {string[]} */
  const shas = [];
  const seen = new Set();

  // Do not treat backtick hex as commit when it is part of a file:line citation.
  const pathRaw = new Set(pathCitations.map((c) => c.raw));

  BACKTICK_SHA_RE.lastIndex = 0;
  let m;
  while ((m = BACKTICK_SHA_RE.exec(line))) {
    const sha = m[1];
    if (pathRaw.has(sha)) continue;
    if (seen.has(sha)) continue;
    seen.add(sha);
    shas.push(sha);
  }

  VERB_SHA_RE.lastIndex = 0;
  while ((m = VERB_SHA_RE.exec(line))) {
    const sha = m[1];
    if (!sha || seen.has(sha)) continue;
    seen.add(sha);
    shas.push(sha);
  }

  return shas;
}

function validatePathCitation(relDoc, lineNo, raw, allFiles, violations) {
  const parsed = parsePathCite(raw);
  if (!parsed) return;

  let repoPath = parsed.path;
  const hasLine = parsed.line !== null;

  if (!repoPath.includes("/")) {
    if (AMBIGUOUS_SHORT.has(repoPath)) return;
    const resolved = resolveShortPath(repoPath, allFiles);
    if (!resolved) {
      violations.push(`${relDoc}:${lineNo} — path not found: ${raw}`);
      return;
    }
    if (resolved.ambiguous) {
      violations.push(
        `${relDoc}:${lineNo} — ambiguous path ${raw} (${resolved.ambiguous.length} matches)`,
      );
      return;
    }
    repoPath = resolved;
  }

  if (!allFiles.includes(repoPath) && !existsSync(join(ROOT, repoPath))) {
    violations.push(`${relDoc}:${lineNo} — path not found: ${raw} → ${repoPath}`);
    return;
  }

  if (hasLine) {
    const abs = join(ROOT, repoPath);
    const total = countLines(abs);
    if (parsed.line < 1 || parsed.line > total) {
      violations.push(
        `${relDoc}:${lineNo} — line ${parsed.line} out of range in ${repoPath} (${total} lines): ${raw}`,
      );
    } else if (parsed.lineEnd !== null && parsed.lineEnd > total) {
      violations.push(
        `${relDoc}:${lineNo} — line ${parsed.lineEnd} out of range in ${repoPath} (${total} lines): ${raw}`,
      );
    }
  }
}

export function collectViolations({ onlyPath = null } = {}) {
  const allFiles = gitLsFiles();
  /** @type {string[]} */
  const violations = [];

  const files = onlyPath
    ? docFiles().filter((f) => relative(ROOT, f) === onlyPath)
    : docFiles();

  if (onlyPath && files.length === 0) {
    throw new Error(`--only path not in scan set: ${onlyPath}`);
  }

  for (const file of files) {
    const relDoc = relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");

    lines.forEach((line, i) => {
      const lineNo = i + 1;
      const pathCitations = extractPathCitations(line);
      const shas = extractShaCitations(line, pathCitations);

      for (const { raw } of pathCitations) {
        validatePathCitation(relDoc, lineNo, raw, allFiles, violations);
      }

      for (const sha of shas) {
        if (!gitVerifyCommit(sha)) {
          violations.push(`${relDoc}:${lineNo} — commit not in history: ${sha}`);
        }
      }
    });
  }

  return violations.sort();
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return { violations: [] };
  }
  const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  if (!Array.isArray(parsed.violations)) {
    throw new Error(`${BASELINE_PATH} must contain a violations array`);
  }
  return parsed;
}

function writeBaseline(violations) {
  const payload = {
    description:
      "Known-broken doc citations tolerated by the ratchet gate. Shrink only via --update-baseline after fixes.",
    generatedAt: new Date().toISOString(),
    count: violations.length,
    violations: [...violations].sort(),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

function compareWithBaseline(current, baselineViolations) {
  const baselineSet = new Set(baselineViolations);
  const currentSet = new Set(current);

  const newViolations = current.filter((v) => !baselineSet.has(v));
  const resolvedViolations = baselineViolations.filter((v) => !currentSet.has(v));

  return { newViolations, resolvedViolations };
}

function main() {
  const args = process.argv.slice(2);
  const updateBaseline = args.includes("--update-baseline");
  const onlyIdx = args.indexOf("--only");
  const onlyPath =
    onlyIdx >= 0 && args[onlyIdx + 1]
      ? args[onlyIdx + 1].replace(/^\//, "")
      : null;

  let violations;
  try {
    violations = collectViolations({ onlyPath });
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }

  const baseline = loadBaseline();
  const { newViolations, resolvedViolations } = compareWithBaseline(
    violations,
    baseline.violations,
  );

  if (updateBaseline) {
    if (newViolations.length) {
      console.error(
        `\n✗ Refusing to update baseline: ${newViolations.length} new violation(s) must be fixed first.\n`,
      );
      for (const v of newViolations) console.error(`  ${v}`);
      console.error(
        "\nThe baseline may shrink after fixes, never grow. Fix new breakage, then retry.\n",
      );
      process.exit(1);
    }

    const nextCount = violations.length;
    const prevCount = baseline.violations.length;
    writeBaseline(violations);
    console.log(
      `✓ Updated ${relative(ROOT, BASELINE_PATH)}: ${prevCount} → ${nextCount} outstanding violation(s).`,
    );
    if (resolvedViolations.length) {
      console.log(`  Removed ${resolvedViolations.length} resolved citation(s).`);
    }
    return;
  }

  const outstandingCount = violations.length;
  console.log(
    `Doc citations: ${outstandingCount} outstanding broken citation(s) (${baseline.violations.length} baselined, ${newViolations.length} new).`,
  );

  if (resolvedViolations.length) {
    console.log(
      `↘ ${resolvedViolations.length} baselined citation(s) now resolve — run with --update-baseline to shrink the baseline:`,
    );
    for (const v of resolvedViolations) console.log(`  ${v}`);
  }

  if (newViolations.length) {
    console.error(
      `\n✗ ${newViolations.length} new doc citation violation(s) (not in baseline).\n` +
        "Fix stale paths, line numbers, or commit shas — or remove the citation.\n" +
        "See docs/operations/Doc_Claim_Taxonomy.md.\n",
    );
    for (const v of newViolations) console.error(`  ${v}`);
    console.error("");
    process.exit(1);
  }

  if (outstandingCount) {
    console.log(
      "✓ No new doc citation violations (outstanding debt is baselined; shrink with --update-baseline after fixes).",
    );
    return;
  }

  console.log("✓ Doc citations resolve (paths, lines, commit shas).");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
