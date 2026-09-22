#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isSignalSuppressed, loadDynamicRules, repoPath } from "./exclude.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_RULES_PATH = "docs/operations/code-maintainer/DYNAMIC_RULES.json";
const BASE_DOCS = [
  "AGENTS.md",
  "STUDIO.md",
  "WEBSITE.md",
  "docs/operations/Contributing.md",
];
const REPO_PATH_RE = /^(apps|packages|scripts|docs|templates|fixtures)\/.+\.[A-Za-z0-9]+$/;

function parseArgs(argv) {
  const args = { all: false, json: false, rules: DEFAULT_RULES_PATH, docs: [], top: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") args.all = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--rules") args.rules = argv[++index];
    else if (arg === "--top") args.top = Number(argv[++index]);
    else args.docs.push(arg);
  }
  if (args.top !== null && (!Number.isInteger(args.top) || args.top < 1)) {
    throw new Error("--top must be an integer >= 1");
  }
  return args;
}

async function exists(relativePath) {
  try {
    await stat(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  const files = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.name.endsWith(".md")) {
        files.push(repoPath(repoRoot, absolutePath));
      }
    }
  }
  await visit(absoluteDir);
  return files;
}

function backtickTokens(line) {
  return [...line.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
}

function cleanDocToken(token) {
  return token.replace(/^\.?\//, "").replace(/[),.;:]+$/, "");
}

function isConcreteRepoPath(token) {
  if (!REPO_PATH_RE.test(token)) return false;
  return !/[<>{}*]/.test(token) && !token.includes("...");
}

function npmRunScripts(markdown) {
  return [...markdown.matchAll(/\bnpm run ([\w:-]+)/g)].map((match) => match[1]);
}

async function packageScripts() {
  const scripts = new Set();
  const packagePaths = ["package.json"];
  for (const workspaceRoot of ["packages", "apps"]) {
    let entries = [];
    try {
      entries = await readdir(path.join(repoRoot, workspaceRoot), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) packagePaths.push(`${workspaceRoot}/${entry.name}/package.json`);
    }
  }
  for (const packagePath of packagePaths) {
    try {
      const data = JSON.parse(await readFile(path.join(repoRoot, packagePath), "utf8"));
      for (const script of Object.keys(data.scripts ?? {})) scripts.add(script);
    } catch {
      // Missing workspace package files are not drift.
    }
  }
  return scripts;
}

async function routeddocsFromAgents() {
  const docs = new Set(BASE_DOCS);
  let agents = "";
  try {
    agents = await readFile(path.join(repoRoot, "AGENTS.md"), "utf8");
  } catch {
    return [...docs];
  }
  for (const line of agents.split("\n")) {
    for (const token of backtickTokens(line).map(cleanDocToken)) {
      if (token.endsWith(".md") && (token === "AGENTS.md" || token.startsWith("docs/"))) {
        docs.add(token);
      }
    }
  }
  return [...docs];
}

export async function scanDocDrift({ docs = [], all = false, rules = DEFAULT_RULES_PATH } = {}) {
  const suppressions = await loadDynamicRules(repoRoot, rules);
  const scripts = await packageScripts();
  const scandocs = docs.length
    ? docs
    : all
      ? await collectMarkdownFiles("docs")
      : await routeddocsFromAgents();
  const findings = [];

  for (const doc of scandocs) {
    const relativeDoc = path.isAbsolute(doc) ? repoPath(repoRoot, doc) : cleanDocToken(doc);
    const absoluteDoc = path.isAbsolute(doc) ? doc : path.join(repoRoot, relativeDoc);
    if (isSignalSuppressed(suppressions, relativeDoc, "doc_drift")) continue;
    let markdown;
    try {
      markdown = await readFile(absoluteDoc, "utf8");
    } catch {
      findings.push({ doc: relativeDoc, line: 1, token: relativeDoc, kind: "missing-path" });
      continue;
    }

    const lines = markdown.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      for (const token of backtickTokens(lines[index]).map(cleanDocToken)) {
        if (isConcreteRepoPath(token) && !(await exists(token))) {
          findings.push({ doc: relativeDoc, line: index + 1, token, kind: "missing-path" });
        }
      }
      for (const script of npmRunScripts(lines[index])) {
        if (!scripts.has(script)) {
          findings.push({
            doc: relativeDoc,
            line: index + 1,
            token: `npm run ${script}`,
            kind: "missing-script",
          });
        }
      }
    }
  }
  return findings;
}

function printHuman(findings) {
  if (!findings.length) {
    console.log("No doc drift findings.");
    return;
  }
  for (const finding of findings) {
    console.log(`${finding.doc}:${finding.line} ${finding.kind} ${finding.token}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const findings = await scanDocDrift(args);
  const limited = args.top === null ? findings : findings.slice(0, args.top);
  if (args.json) console.log(JSON.stringify(limited, null, 2));
  else printHuman(limited);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
