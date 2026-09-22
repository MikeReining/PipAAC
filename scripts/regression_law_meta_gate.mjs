#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const WALL_COMMANDS = new Set([
  "npm test",
  "npm run test",
  "npm run check",
  "npm run check:full",
  "npm run eval:renderer-shapes",
  "npm run eval:phase-35",
  "npm run test:hosting",
  "npm run test:project-store",
]);

const UNIT_TEST_RE = /^node --test\b/;
const NPM_EVAL_RE = /^npm run eval:[\w:-]+/;

/**
 * @param {string} proofLine
 */
function proofCommandsFromLine(proofLine) {
  const commands = [];
  const trimmed = proofLine.replace(/^Proof:\s*/i, "").trim();
  if (!trimmed || /deferred/i.test(trimmed)) return commands;
  for (const segment of trimmed.split(";")) {
    const command = segment.trim();
    if (!command) continue;
    if (UNIT_TEST_RE.test(command) || NPM_EVAL_RE.test(command) || WALL_COMMANDS.has(command)) {
      commands.push(command);
    }
  }
  return commands;
}

/**
 * @param {string} command
 */
function isWallReachable(command) {
  if (WALL_COMMANDS.has(command)) return true;
  if (UNIT_TEST_RE.test(command)) return true;
  if (NPM_EVAL_RE.test(command)) {
    const script = command.replace(/^npm run\s+/, "");
    return [
      "renderer-shapes",
      "phase-35",
    ].some((member) => script === member || script.startsWith(`${member} `));
  }
  return false;
}

/**
 * @param {string} markdown
 */
function parseBacklogExpirations(markdown) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const line of markdown.split("\n")) {
    const match = line.match(/^-\s+(.+?):\s+expiry\s+(\d{4}-\d{2}-\d{2})/i);
    if (match) map.set(match[1].trim(), match[2]);
  }
  return map;
}

async function main() {
  const failures = [];
  const selfCheckOnly = process.argv.includes("--self-check-only");

  const backlogPath = path.join(repoRoot, "docs/operations/debugger/REGRESSION_LAW_BACKLOG.md");
  const backlog = await readFile(backlogPath, "utf8").catch(() => "");
  const backlogExpirations = parseBacklogExpirations(backlog);
  const today = new Date().toISOString().slice(0, 10);

  const quarantinePath = path.join(repoRoot, "docs/operations/debugger/QUARANTINE.md");
  const quarantine = await readFile(quarantinePath, "utf8").catch(() => "");
  for (const line of quarantine.split("\n")) {
    const match = line.match(/expiry\s+(\d{4}-\d{2}-\d{2})/i);
    if (match && match[1] < today && !line.startsWith("<!--")) {
      failures.push(`quarantine expired: ${line.trim()}`);
    }
  }

  const patternsPath = path.join(repoRoot, "docs/operations/debugger/BUG_PATTERNS.json");
  const patternsDoc = JSON.parse(await readFile(patternsPath, "utf8"));
  for (const pattern of patternsDoc.patterns ?? []) {
    if (!pattern.wallCommand) {
      failures.push(`BUG_PATTERNS missing wallCommand: ${pattern.fingerprint ?? pattern.id ?? "?"}`);
      continue;
    }
    if (!isWallReachable(pattern.wallCommand)) {
      failures.push(`BUG_PATTERNS unreachable wallCommand: ${pattern.wallCommand}`);
    }
  }

  if (!selfCheckOnly) {
    const debugLog = await readFile(path.join(repoRoot, "docs/operations/debugger/DEBUGLOG.md"), "utf8");
    const sections = debugLog.split(/^## /m).slice(1);
    for (const section of sections) {
      const title = section.split("\n", 1)[0]?.trim() ?? "";
      if (title.includes("YYYY-MM-DD") || title.includes("<fingerprint>")) continue;
      const date = title.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (date < "2026-06-12") {
        if (!backlogExpirations.has(title) && /^(T2|T3)/m.test(section)) {
          // Grandfathered until backlog names an owner + expiry.
          if (/Pattern candidate:/.test(section) && !backlog.includes(title)) {
            failures.push(`DEBUGLOG entry needs backlog owner+expiry: ${title}`);
          }
        }
        continue;
      }
      const proofMatch = section.match(/^Proof:\s*(.+)$/m);
      if (!proofMatch) continue;
      const commands = proofCommandsFromLine(proofMatch[0]);
      if (commands.length === 0) {
        failures.push(`DEBUGLOG proof not wall-reachable: ${title}`);
        continue;
      }
      for (const command of commands) {
        if (!isWallReachable(command)) {
          failures.push(`DEBUGLOG proof not in wall: ${title} → ${command}`);
        }
      }
    }
  }

  if (failures.length) {
    console.error(JSON.stringify({ ok: false, failures }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, checked: "regression-law-meta-gate" }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
