#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  collectTextFiles,
  isSignalSuppressed,
  loadDynamicRules,
  repoPath,
} from "./exclude.mjs";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_RULES_PATH = "docs/operations/code-maintainer/DYNAMIC_RULES.json";
const CODE_EXTENSIONS = new Set([".mjs", ".js", ".jsx"]);
const NEXT_CONVENTION_FILES = new Set([
  "instrumentation.js",
  "page.jsx",
  "layout.jsx",
  "route.js",
  "middleware.js",
  "error.jsx",
  "loading.jsx",
]);

export function parseArgs(argv) {
  const args = { json: false, rules: DEFAULT_RULES_PATH, roots: [], top: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") args.json = true;
    else if (arg === "--rules") args.rules = argv[++index];
    else if (arg === "--top") args.top = Number(argv[++index]);
    else args.roots.push(arg);
  }
  if (args.top !== null && (!Number.isInteger(args.top) || args.top < 1)) {
    throw new Error("--top must be an integer >= 1");
  }
  if (!args.roots.length) args.roots = ["packages", "apps"];
  return args;
}

async function fileExists(absolutePath) {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveFile(specifier, fromFile, repoRoot, packagesByName) {
  if (specifier.startsWith(".")) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    for (const candidate of [
      base,
      `${base}.mjs`,
      `${base}.js`,
      `${base}.jsx`,
      path.join(base, "index.mjs"),
      path.join(base, "index.js"),
    ]) {
      if (await fileExists(candidate)) return repoPath(repoRoot, candidate);
    }
    return null;
  }
  const [scope, name, ...rest] = specifier.split("/");
  const packageName = specifier.startsWith("@") ? `${scope}/${name}` : scope;
  const packageDir = packagesByName.get(packageName);
  if (!packageDir) return null;
  const packageJsonPath = path.join(packageDir, "package.json");
  let packageJson = {};
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch {
    return null;
  }
  const subpath = specifier.startsWith("@") ? rest.join("/") : [name, ...rest].join("/");
  const exportKey = subpath ? `./${subpath}` : ".";
  const exportTarget = typeof packageJson.exports === "string"
    ? packageJson.exports
    : packageJson.exports?.[exportKey] ?? packageJson.main;
  if (typeof exportTarget !== "string") return null;
  return repoPath(repoRoot, path.join(packageDir, exportTarget));
}

async function workspacePackages(repoRoot) {
  const packages = new Map();
  for (const root of ["packages", "apps"]) {
    let entries = [];
    try {
      entries = await readdir(path.join(repoRoot, root), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packageDir = path.join(repoRoot, root, entry.name);
      try {
        const packageJson = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
        if (packageJson.name) packages.set(packageJson.name, packageDir);
      } catch {
        // Apps without package.json are not workspace packages.
      }
    }
  }
  return packages;
}

async function packageEntryFiles(repoRoot) {
  const entries = new Set();
  for (const root of ["packages", "apps"]) {
    let packages = [];
    try {
      packages = await readdir(path.join(repoRoot, root), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of packages) {
      if (!entry.isDirectory()) continue;
      const packageDir = path.join(repoRoot, root, entry.name);
      let packageJson;
      try {
        packageJson = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
      } catch {
        continue;
      }
      const targets = [];
      if (typeof packageJson.main === "string") targets.push(packageJson.main);
      if (typeof packageJson.exports === "string") targets.push(packageJson.exports);
      else if (packageJson.exports && typeof packageJson.exports === "object") {
        for (const value of Object.values(packageJson.exports)) {
          if (typeof value === "string") targets.push(value);
        }
      }
      for (const target of targets) entries.add(repoPath(repoRoot, path.join(packageDir, target)));
    }
  }
  return entries;
}

function exportedNames(source) {
  const names = [];
  const declarationPattern =
    /^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(declarationPattern)) {
    names.push({ name: match[1], line: source.slice(0, match.index).split("\n").length });
  }
  for (const match of source.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    const line = source.slice(0, match.index).split("\n").length;
    for (const rawPart of match[1].split(",")) {
      const part = rawPart.trim();
      if (!part) continue;
      const alias = part.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
      names.push({ name: alias?.[1] ?? part.split(/\s+/)[0], line });
    }
  }
  return names;
}

function importedNames(source) {
  const imports = [];
  for (const match of source.matchAll(/import\s+([^'";]+?)\s+from\s+["']([^"']+)["']/gs)) {
    const clause = match[1].trim();
    const specifier = match[2];
    const names = new Set();
    if (clause.startsWith("* as ")) names.add("*");
    else {
      const named = clause.match(/\{([^}]+)\}/s);
      if (named) {
        for (const rawPart of named[1].split(",")) {
          const part = rawPart.trim();
          if (!part) continue;
          names.add(part.split(/\s+as\s+/)[0].trim());
        }
      }
      const beforeNamed = clause.replace(/\{[^}]+\}/s, "").replace(/,$/, "").trim();
      if (beforeNamed && !beforeNamed.startsWith("{")) names.add("default");
    }
    imports.push({ specifier, names });
  }
  for (const match of source.matchAll(/export\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/gs)) {
    const names = new Set();
    for (const rawPart of match[1].split(",")) {
      const part = rawPart.trim();
      if (!part) continue;
      names.add(part.split(/\s+as\s+/)[0].trim());
    }
    imports.push({ specifier: match[2], names });
  }
  return imports;
}

function isNextConvention(relativePath) {
  return NEXT_CONVENTION_FILES.has(path.basename(relativePath));
}

export async function scanDeadExports({
  repoRoot = defaultRepoRoot,
  roots = ["packages", "apps"],
  rules = DEFAULT_RULES_PATH,
} = {}) {
  const suppressions = await loadDynamicRules(repoRoot, rules);
  const packagesByName = await workspacePackages(repoRoot);
  const entryFiles = await packageEntryFiles(repoRoot);
  const files = (await collectTextFiles(repoRoot, roots))
    .filter((file) => CODE_EXTENSIONS.has(path.extname(file)))
  const exportFiles = files.filter((file) => !file.endsWith(".test.mjs"));
  const exportsByFile = new Map();
  const usedByFile = new Map();

  for (const file of files) {
    const relativePath = repoPath(repoRoot, file);
    if (isSignalSuppressed(suppressions, relativePath, "dead_export")) continue;
    const source = await readFile(file, "utf8");
    if (exportFiles.includes(file)) exportsByFile.set(relativePath, exportedNames(source));
    for (const imported of importedNames(source)) {
      const target = await resolveFile(imported.specifier, file, repoRoot, packagesByName);
      if (!target) continue;
      if (!usedByFile.has(target)) usedByFile.set(target, new Set());
      const used = usedByFile.get(target);
      for (const name of imported.names) used.add(name);
    }
  }

  const findings = [];
  for (const [relativePath, names] of exportsByFile.entries()) {
    if (entryFiles.has(relativePath) || isNextConvention(relativePath)) continue;
    const used = usedByFile.get(relativePath) ?? new Set();
    if (used.has("*")) continue;
    for (const exported of names) {
      if (!used.has(exported.name)) {
        findings.push({ path: relativePath, line: exported.line, export: exported.name });
      }
    }
  }
  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

function printHuman(findings) {
  if (!findings.length) {
    console.log("No dead export findings.");
    return;
  }
  for (const finding of findings) {
    console.log(`${finding.path}:${finding.line} exported ${finding.export} has no detected import`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const findings = await scanDeadExports({ roots: args.roots, rules: args.rules });
  const limited = args.top === null ? findings : findings.slice(0, args.top);
  if (args.json) console.log(JSON.stringify(limited, null, 2));
  else printHuman(limited);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
