#!/usr/bin/env node
// Archive-link guard.
//
// Rule (docs/WORKING_RULES.md § "Documentation Archive Boundary"):
//   Archived docs are link-sinks. No live doc may link into `docs/archive/`.
//   Allowed exceptions:
//     1. The archive tree itself (`docs/archive/**`)
//     2. `docs/phases/README.md` may link ONLY to the archive index
//        (`docs/archive/phases/README.md`) — never to individual archived docs.
//   The archive table lives ONLY in `docs/archive/phases/README.md`.
//   Do not recreate an "Archived / Superseded" table in the live phases README.
//
// This script fails (exit 1) if any non-allowed live doc contains a Markdown
// link whose target resolves into `docs/archive/`, or if the live phases README
// deep-links into an archived file. Run: `npm run lint:archive-links`.
// Procedure: docs/WORKING_RULES.md § Documentation Archive Boundary +
// docs/operations/Execution-Playbook.md § Phase Archive.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DOCS = join(ROOT, "docs");
const ARCHIVE_INDEX = "docs/archive/phases/README.md";
// Live docs allowed to link to the archive *index only* (never individual
// archived files). These are the queue + closeout authorities.
const INDEX_LINK_ALLOW = new Set([
  "docs/phases/README.md",
  "docs/operations/Execution-Playbook.md",
  "docs/WORKING_RULES.md",
]);

const linkRe = /\]\(([^)]+)\)/g;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

/** Resolve a markdown href relative to the linking file into a repo-relative path. */
function resolveTarget(fromRel, rawTarget) {
  const target = rawTarget.split("#")[0].split(/\s+/)[0].trim();
  if (!target || /^(https?:|mailto:)/i.test(target)) return null;
  if (target.startsWith("/")) return null;
  const fromDir = join(ROOT, fromRel, "..");
  const abs = normalize(resolve(fromDir, target));
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  return rel;
}

const violations = [];
for (const file of walk(DOCS)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (rel.startsWith("docs/archive/")) continue; // archive may cross-reference

  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    linkRe.lastIndex = 0;
    let m;
    while ((m = linkRe.exec(line))) {
      const resolved = resolveTarget(rel, m[1]);
      if (!resolved || !resolved.startsWith("docs/archive/")) continue;

      if (INDEX_LINK_ALLOW.has(rel)) {
        if (resolved === ARCHIVE_INDEX) continue;
        violations.push({
          where: `${rel}:${i + 1}`,
          target: m[1].split("#")[0].trim(),
          note: "may link only to docs/archive/phases/README.md (the archive table)",
        });
        continue;
      }

      violations.push({
        where: `${rel}:${i + 1}`,
        target: m[1].split("#")[0].trim(),
      });
    }
  });
}

if (violations.length) {
  console.error(
    `\n✗ ${violations.length} live→archive link(s) found.\n` +
      `Rule: only docs/archive/phases/README.md holds the archive table; ` +
      `docs/phases/README.md may link to that index only ` +
      `(docs/WORKING_RULES.md § Documentation Archive Boundary).\n`,
  );
  for (const v of violations) {
    const extra = v.note ? ` (${v.note})` : "";
    console.error(`  ${v.where} → ${v.target}${extra}`);
  }
  console.error(
    `\nFix: docs/operations/Execution-Playbook.md § Phase Archive\n`,
  );
  process.exit(1);
}
console.log(
  "✓ No live docs deep-link into docs/archive/ (index-link allowlist → archive README only).",
);
