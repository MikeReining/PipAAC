#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  collectTextFiles,
  isSignalSuppressed,
  loadDynamicRules,
  repoPath,
} from "./exclude.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_RULES_PATH = "docs/operations/code-maintainer/DYNAMIC_RULES.json";

function parseArgs(argv) {
  const args = {
    json: false,
    minLines: 8,
    top: 20,
    rules: DEFAULT_RULES_PATH,
    paths: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--min-lines") {
      args.minLines = Number(argv[++index]);
    } else if (arg === "--top") {
      args.top = Number(argv[++index]);
    } else if (arg === "--rules") {
      args.rules = argv[++index];
    } else {
      args.paths.push(arg);
    }
  }
  if (!Number.isInteger(args.minLines) || args.minLines < 2) {
    throw new Error("--min-lines must be an integer >= 2");
  }
  return args;
}

function normalizeLine(line) {
  return line.trim().replace(/\s+/g, " ");
}

function isCommentOnly(line) {
  return /^(\/\/|#|\/\*|\*|\*\/|<!--|-->|;)/.test(line);
}

function normalizedLogicalLines(source) {
  return source
    .split("\n")
    .map((line, index) => ({ line: index + 1, text: normalizeLine(line) }))
    .filter(({ text }) => text && !isCommentOnly(text));
}

function nonOverlappingSites(sites) {
  for (let left = 0; left < sites.length; left += 1) {
    for (let right = left + 1; right < sites.length; right += 1) {
      const a = sites[left];
      const b = sites[right];
      if (a.path !== b.path) return true;
      if (a.end < b.start || b.end < a.start) return true;
    }
  }
  return false;
}

function rangesOverlap(left, right) {
  return left.path === right.path && left.start <= right.end && right.start <= left.end;
}

function duplicatesSelectedGroup(group, selectedGroups) {
  return selectedGroups.some((selected) =>
    group.sites.every((site) => selected.sites.some((selectedSite) => rangesOverlap(site, selectedSite))),
  );
}

function dedupeOverlappingGroups(groups) {
  const selected = [];
  for (const group of groups) {
    if (!duplicatesSelectedGroup(group, selected)) selected.push(group);
  }
  return selected;
}

export async function scanDuplication({ minLines = 8, paths = [], rules = DEFAULT_RULES_PATH } = {}) {
  const suppressions = await loadDynamicRules(repoRoot, rules);
  const files = await collectTextFiles(repoRoot, paths);
  const windows = new Map();

  for (const file of files) {
    const relativePath = repoPath(repoRoot, file);
    if (isSignalSuppressed(suppressions, relativePath, "duplication")) continue;
    let source;
    try {
      source = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const lines = normalizedLogicalLines(source);
    for (let index = 0; index <= lines.length - minLines; index += 1) {
      const windowLines = lines.slice(index, index + minLines);
      const key = windowLines.map(({ text }) => text).join("\n");
      if (!windows.has(key)) windows.set(key, []);
      windows.get(key).push({
        path: relativePath,
        start: windowLines[0].line,
        end: windowLines.at(-1).line,
      });
    }
  }

  const groups = [...windows.entries()]
    .map(([key, sites]) => ({
      lines: minLines,
      sites,
      snippet: key.split("\n").slice(0, Math.min(3, minLines)),
    }))
    .filter((group) => group.sites.length > 1 && nonOverlappingSites(group.sites))
    .sort((a, b) => {
      const pathCountDelta = new Set(b.sites.map((site) => site.path)).size -
        new Set(a.sites.map((site) => site.path)).size;
      if (pathCountDelta) return pathCountDelta;
      if (b.sites.length !== a.sites.length) return b.sites.length - a.sites.length;
      return a.sites[0].path.localeCompare(b.sites[0].path);
    });
  return dedupeOverlappingGroups(groups);
}

function printHuman(groups, top) {
  if (!groups.length) {
    console.log("No duplication groups found.");
    return;
  }
  for (const [index, group] of groups.slice(0, top).entries()) {
    console.log(`#${index + 1} ${group.lines} duplicated normalized lines across ${group.sites.length} sites`);
    for (const site of group.sites.slice(0, 6)) {
      console.log(`  ${site.path}:${site.start}-${site.end}`);
    }
    if (group.sites.length > 6) console.log(`  ... ${group.sites.length - 6} more sites`);
    console.log(`  ${group.snippet.join(" / ")}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const groups = await scanDuplication(args);
  if (args.json) {
    console.log(JSON.stringify(groups.slice(0, args.top), null, 2));
  } else {
    printHuman(groups, args.top);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
