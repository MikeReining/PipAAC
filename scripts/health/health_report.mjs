#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectTextFiles, loadDynamicRules, repoPath } from "./exclude.mjs";
import { scanDeadExports } from "./dead_exports_scan.mjs";
import { scanDocDrift } from "./doc_drift_scan.mjs";
import { scanDuplication } from "./duplication_scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HEALTH_PATH = "docs/operations/code-maintainer/HEALTH.md";
const LEDGER_PATH = "docs/operations/code-maintainer/LEDGER.md";
const QUEUE_PATH = "docs/operations/code-maintainer/MAINTENANCE-QUEUE.md";
const RULES_PATH = "docs/operations/code-maintainer/DYNAMIC_RULES.json";

function parseArgs(argv) {
  return { append: argv.includes("--append"), json: argv.includes("--json") };
}

async function largeFiles() {
  const files = await collectTextFiles(repoRoot, ["."]);
  const rows = [];
  for (const file of files) {
    const relativePath = repoPath(repoRoot, file);
    let source;
    try {
      source = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const lines = source.split("\n").length;
    if (lines > 500) rows.push({ path: relativePath, lines });
  }
  return rows.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
}

async function todoCount() {
  const files = await collectTextFiles(repoRoot, ["."]);
  let count = 0;
  const markerPattern = new RegExp(`\\b(?:TO${"DO"}|FIX${"ME"})\\b`, "g");
  for (const file of files) {
    try {
      const source = await readFile(file, "utf8");
      count += (source.match(markerPattern) ?? []).length;
    } catch {
      // Ignore unreadable text candidates.
    }
  }
  return count;
}

async function queueStatusCounts() {
  const counts = {};
  const queue = await readFile(path.join(repoRoot, QUEUE_PATH), "utf8").catch(() => "");
  for (const line of queue.split("\n")) {
    if (!line.startsWith("| 20")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const status = cells[6];
    if (status) counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

async function currentBatch() {
  const runlogPath = path.join(repoRoot, "docs/operations/code-maintainer/RUNLOG.md");
  const runlog = await readFile(runlogPath, "utf8").catch(() => "");
  const numbers = [...runlog.matchAll(/\bBatch\s+(\d+)/g)].map((match) => Number(match[1]));
  return numbers.length ? Math.max(...numbers) : 0;
}

async function suppressionMetrics() {
  const suppressions = await loadDynamicRules(repoRoot, RULES_PATH);
  const batch = await currentBatch();
  const expired = suppressions.filter((suppression) => {
    const reviewAfter = Number(suppression.review_after_batch ?? (Number(suppression.added_batch) + 25));
    return Number.isFinite(reviewAfter) && reviewAfter <= batch;
  }).length;
  return { count: suppressions.length, expired };
}

async function staleLedgerBeats() {
  const ledger = await readFile(path.join(repoRoot, LEDGER_PATH), "utf8").catch(() => "");
  const today = new Date();
  let stale = 0;
  for (const line of ledger.split("\n")) {
    if (!line.startsWith("| `") && !line.startsWith("| source") && !line.startsWith("| renderer") &&
      !line.startsWith("| project") && !line.startsWith("| analytics") && !line.startsWith("| bio") &&
      !line.startsWith("| media") && !line.startsWith("| remaining") && !line.startsWith("| scripts") &&
      !line.startsWith("| docs")) {
      continue;
    }
    const cells = line.split("|").map((cell) => cell.trim());
    const last = cells[2];
    if (!last || last === "never") {
      stale += 1;
      continue;
    }
    const date = new Date(last);
    if (Number.isNaN(date.getTime())) continue;
    if ((today - date) / (24 * 60 * 60 * 1000) > 90) stale += 1;
  }
  return stale;
}

export async function computeHealth() {
  const [large, duplication, deadExports, docDrift, todos, queue, suppressions, staleBeats] =
    await Promise.all([
      largeFiles(),
      scanDuplication(),
      scanDeadExports(),
      scanDocDrift(),
      todoCount(),
      queueStatusCounts(),
      suppressionMetrics(),
      staleLedgerBeats(),
    ]);
  return {
    date: new Date().toISOString().slice(0, 10),
    largeFileCount: large.length,
    largeFileTop5: large.slice(0, 5),
    duplicationGroups: duplication.length,
    deadExportFindings: deadExports.length,
    docDriftFindings: docDrift.length,
    todoFixmeCount: todos,
    queueByStatus: queue,
    suppressionCount: suppressions.count,
    suppressionsPastReview: suppressions.expired,
    staleLedgerBeats: staleBeats,
  };
}

function renderSnapshot(metrics) {
  const queueText = Object.entries(metrics.queueByStatus)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ") || "none";
  const largeTop = metrics.largeFileTop5
    .map((entry) => `  - ${entry.path}: ${entry.lines} lines`)
    .join("\n");
  return `## ${metrics.date}

- Hand-owned files > 500 lines: ${metrics.largeFileCount}
${largeTop}
- Duplication groups: ${metrics.duplicationGroups}
- Dead-export findings: ${metrics.deadExportFindings}
- Doc-drift findings: ${metrics.docDriftFindings}
- Open todo/fixme marker count: ${metrics.todoFixmeCount}
- Queue rows by status: ${queueText}
- Suppressions: ${metrics.suppressionCount} (${metrics.suppressionsPastReview} past review batch)
- Ledger beats stale or never deep-read: ${metrics.staleLedgerBeats}

Explained deltas:

- First snapshot after Phase 38 M3; counts establish the baseline. Detector
  counts may rise when detection improves, so future snapshots explain deltas
  instead of minimizing numbers.
`;
}

async function appendHealth(metrics) {
  const absolutePath = path.join(repoRoot, HEALTH_PATH);
  const header = `# Code Maintainer Health

Deltas must be explained, not minimized. A rising count after a new detector
ships can mean better detection rather than worse health; every significant
snapshot delta gets a one-line explanation.

`;
  const existing = await readFile(absolutePath, "utf8").catch(() => header);
  const next = existing.startsWith("# Code Maintainer Health")
    ? `${existing.trimEnd()}\n\n${renderSnapshot(metrics)}`
    : `${header}${renderSnapshot(metrics)}`;
  await writeFile(absolutePath, next);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const metrics = await computeHealth();
  if (args.append) await appendHealth(metrics);
  if (args.json) console.log(JSON.stringify(metrics, null, 2));
  else console.log(renderSnapshot(metrics));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
