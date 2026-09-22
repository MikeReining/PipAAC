#!/usr/bin/env node
/**
 * Lockfile drift gate.
 *
 * Fails when any workspace package.json dependency name is missing from (or
 * extra in) the matching package-lock.json workspace entry. Catches the class
 * of bug where package.json is committed without the lockfile update — green
 * locally (node_modules already populated) but broken on clean install.
 *
 * Mechanism: direct name-set comparison per workspace. No npm install, no
 * network, no version-string churn (file: and caret ranges differ cosmetically).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * @param {string} root
 * @param {{ workspaces?: string[] }} rootPkg
 * @returns {string[]} absolute paths to workspace package.json files (root first)
 */
export function collectWorkspacePackageJsonPaths(root, rootPkg) {
  const paths = [join(root, "package.json")];
  for (const pattern of rootPkg.workspaces ?? []) {
    const [parent, _wildcard] = pattern.split("/");
    const base = join(root, parent);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      const pkgJson = join(base, name.name, "package.json");
      if (existsSync(pkgJson)) paths.push(pkgJson);
    }
  }
  return paths;
}

/**
 * @param {string} pkgJsonPath
 * @param {string} root
 * @returns {string} lockfile packages key ("" for repo root)
 */
export function lockKeyForPackageJson(pkgJsonPath, root) {
  const relDir = relative(root, dirname(pkgJsonPath));
  return relDir === "" || relDir === "." ? "" : relDir;
}

/**
 * @param {object} [options]
 * @param {string} [options.repoRoot]
 * @param {object} [options.lock] parsed package-lock.json
 * @param {string[]} [options.packageJsonPaths]
 * @returns {{ workspace: string, field: string, package: string, kind: string }[]}
 */
export function checkLockfileSync({
  repoRoot: root = repoRoot,
  lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")),
  packageJsonPaths = collectWorkspacePackageJsonPaths(
    root,
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")),
  ),
} = {}) {
  const violations = [];

  for (const pkgJsonPath of packageJsonPaths) {
    const workspace = lockKeyForPackageJson(pkgJsonPath, root);
    const displayWorkspace = workspace === "" ? "." : workspace;
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    const lockEntry = lock.packages?.[workspace];

    if (!lockEntry) {
      violations.push({
        workspace: displayWorkspace,
        field: "*",
        package: "*",
        kind: "missing-workspace-entry",
      });
      continue;
    }

    for (const field of DEP_FIELDS) {
      const declared = Object.keys(pkg[field] ?? {}).sort();
      const locked = Object.keys(lockEntry[field] ?? {}).sort();

      for (const name of declared) {
        if (!locked.includes(name)) {
          violations.push({
            workspace: displayWorkspace,
            field,
            package: name,
            kind: "missing-from-lockfile",
          });
        }
      }

      for (const name of locked) {
        if (!declared.includes(name)) {
          violations.push({
            workspace: displayWorkspace,
            field,
            package: name,
            kind: "extra-in-lockfile",
          });
        }
      }
    }
  }

  return violations;
}

function formatViolation(v) {
  if (v.kind === "missing-workspace-entry") {
    return `  ${v.workspace}: no package-lock.json entry for this workspace`;
  }
  if (v.kind === "missing-from-lockfile") {
    return (
      `  ${v.workspace}: ${v.package} is declared in package.json ` +
      `(${v.field}) but missing from package-lock.json`
    );
  }
  return (
    `  ${v.workspace}: ${v.package} is in package-lock.json ` +
    `(${v.field}) but not declared in package.json`
  );
}

function main() {
  const violations = checkLockfileSync();
  if (violations.length === 0) {
    console.log("✓ package.json and package-lock.json are in sync for all workspaces.");
    return;
  }

  console.error(
    `\n✗ package-lock.json drift (${violations.length} issue(s)).\n` +
      `Every workspace dependency must appear in the matching lockfile entry.\n`,
  );
  for (const v of violations) {
    console.error(formatViolation(v));
  }
  console.error(
    `\nFix: from the repo root, run \`npm install\` and commit package-lock.json.\n`,
  );
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
