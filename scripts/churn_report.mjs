#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const THRESHOLD = 3;
const WINDOW_DAYS = 30;

function parseArgs(argv) {
  const args = { hotspots: false, days: WINDOW_DAYS, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--hotspots") {
      args.hotspots = true;
      if (args.days === WINDOW_DAYS) args.days = 90;
    } else if (arg === "--days") {
      args.days = Number(argv[++index]);
    } else if (arg === "--json") {
      args.json = true;
    }
  }
  return args;
}

async function churnCounts(days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", `--since=${since}`, "--name-only", "--pretty=format:__COMMIT__"],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    return parseChurnStdout(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not have any commits yet")) {
      return new Map();
    }
    throw error;
  }
}

function parseChurnStdout(stdout) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const line of stdout.split("\n")) {
    if (!line || line === "__COMMIT__") continue;
    const file = line.trim();
    if (!file.endsWith(".jsx") && !file.endsWith(".css") && !file.endsWith(".mjs")) continue;
    counts.set(file, (counts.get(file) ?? 0) + 1);
  }
  return counts;
}

async function runDefault() {
  const counts = await churnCounts(WINDOW_DAYS);

  const hot = [...counts.entries()]
    .filter(([, count]) => count > THRESHOLD)
    .sort((a, b) => b[1] - a[1]);

  if (hot.length) {
    console.warn(
      JSON.stringify({
        ok: true,
        warning: "high-churn files (fix-commits in 30d)",
        files: hot.map(([file, count]) => ({ file, count })),
      }),
    );
  } else {
    console.log(JSON.stringify({ ok: true, warning: "none" }));
  }
}

async function lineCount(file) {
  try {
    return (await readFile(file, "utf8")).split("\n").length;
  } catch {
    return 0;
  }
}

async function runHotspots(args) {
  const counts = await churnCounts(args.days);
  const rows = [];
  for (const [file, count] of counts.entries()) {
    const lines = await lineCount(file);
    if (!lines) continue;
    rows.push({
      file,
      count,
      lines,
      score: Number((count * Math.log(lines + 1)).toFixed(3)),
    });
  }
  rows.sort((a, b) => b.score - a.score || b.count - a.count || a.file.localeCompare(b.file));
  const top = rows.slice(0, 15);
  if (args.json) {
    console.log(JSON.stringify({ ok: true, days: args.days, hotspots: top }, null, 2));
    return;
  }
  if (!top.length) {
    console.log("No churn hotspots found.");
    return;
  }
  console.log(`score   count  lines  file`);
  console.log(`------  -----  -----  ${"-".repeat(40)}`);
  for (const row of top) {
    const score = String(row.score).padStart(6);
    const count = String(row.count).padStart(5);
    const lines = String(row.lines).padStart(5);
    console.log(`${score}  ${count}  ${lines}  ${row.file}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.hotspots) {
    await runHotspots(args);
  } else {
    await runDefault();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
