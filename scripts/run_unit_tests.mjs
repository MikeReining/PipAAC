#!/usr/bin/env node
/**
 * Collect and run *.test.mjs under scripts/ and src/.
 */
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["scripts", "scripts/health", "src"];

async function collectTestFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      files.push(...(await collectTestFiles(full)));
    } else if (entry.name.endsWith(".test.mjs") && !entry.name.endsWith(".heavy.test.mjs")) {
      files.push(full);
    }
  }
  return files;
}

const testFiles = [];
for (const root of roots) {
  const abs = path.join(repoRoot, root);
  try {
    testFiles.push(...(await collectTestFiles(abs)));
  } catch {
    // root may not exist yet
  }
}
testFiles.sort();

if (testFiles.length === 0) {
  console.log("run_unit_tests: no test files found — ok");
  process.exit(0);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: repoRoot,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
