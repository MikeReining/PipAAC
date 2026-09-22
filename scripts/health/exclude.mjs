import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_EXCLUDE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".venv",
  ".vercel",
  ".wmd",
  ".wmd-eval",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "experiments",
  "fixtures",
  "node_modules",
  "target",
  "vendor",
]);

export const DEFAULT_EXCLUDE_SUFFIXES = [
  ".lock",
  ".log",
  ".map",
  ".min.css",
  ".min.js",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
];

export const DEFAULT_EXCLUDE_FILES = new Set([
  "_ds_bundle.js",
  "build-report.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

export const DEFAULT_EXCLUDE_PATHS = new Set([
  "packages/curated-backgrounds/catalog/backgrounds.json",
  "packages/service-registry/data/p1-candidates.generated.json",
  "packages/service-registry/data/registry.json",
  "packages/service-registry/service-icons/v1/manifest.json",
]);

export const DEFAULT_EXCLUDE_PREFIXES = [
  "packages/curated-backgrounds/catalog/rounds/",
];

export const TEXT_SUFFIXES = new Set([
  ".c",
  ".cc",
  ".css",
  ".go",
  ".h",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".py",
  ".rs",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

export function repoPath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

export function isExcludedPath(relativePath) {
  const normalized = relativePath.replace(/^\.\//, "");
  if (DEFAULT_EXCLUDE_PATHS.has(normalized)) return true;
  if (DEFAULT_EXCLUDE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  const parts = normalized.split("/");
  if (parts.some((part) => DEFAULT_EXCLUDE_DIRS.has(part))) return true;
  const name = parts.at(-1) ?? "";
  if (DEFAULT_EXCLUDE_FILES.has(name)) return true;
  if (name.includes(".generated.")) return true;
  return DEFAULT_EXCLUDE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

export function isTextCandidate(relativePath) {
  return !isExcludedPath(relativePath) && TEXT_SUFFIXES.has(path.extname(relativePath));
}

export async function collectTextFiles(repoRoot, inputs) {
  const files = [];
  const roots = inputs.length ? inputs : ["."];

  async function visit(rawPath) {
    const absolutePath = path.resolve(repoRoot, rawPath);
    let entries;
    try {
      entries = await readdir(absolutePath, { withFileTypes: true });
    } catch {
      const relativePath = repoPath(repoRoot, absolutePath);
      if (isTextCandidate(relativePath)) files.push(absolutePath);
      return;
    }

    for (const entry of entries) {
      const child = path.join(absolutePath, entry.name);
      const relativePath = repoPath(repoRoot, child);
      if (entry.isDirectory()) {
        if (!DEFAULT_EXCLUDE_DIRS.has(entry.name) && !isExcludedPath(relativePath)) {
          await visit(child);
        }
      } else if (isTextCandidate(relativePath)) {
        files.push(child);
      }
    }
  }

  for (const root of roots) {
    await visit(root);
  }
  return files.sort();
}

export async function loadDynamicRules(repoRoot, rulesPath) {
  const absolutePath = path.resolve(repoRoot, rulesPath);
  try {
    const data = JSON.parse(await readFile(absolutePath, "utf8"));
    return Array.isArray(data.suppressions) ? data.suppressions : [];
  } catch {
    return [];
  }
}

export function isSignalSuppressed(suppressions, relativePath, signal) {
  return suppressions.some((rule) => {
    if (!rule || typeof rule.path !== "string" || typeof rule.signal !== "string") return false;
    if (rule.signal !== signal && rule.signal !== "*") return false;
    if (rule.path.includes("*")) return globToRegExp(rule.path).test(relativePath);
    return rule.path === relativePath;
  });
}
