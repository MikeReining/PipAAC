/**
 * Closeout wall — `npm run check`. Reports every failure in one pass.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GATES = [
  { name: "test", cmd: "npm", args: ["test"] },
  { name: "lint:phase-freshness", cmd: "npm", args: ["run", "lint:phase-freshness"] },
  { name: "lint:lockfile-sync", cmd: "npm", args: ["run", "lint:lockfile-sync"] },
  { name: "regression_law_meta_gate", cmd: process.execPath, args: ["scripts/regression_law_meta_gate.mjs"] },
  { name: "churn_report", cmd: process.execPath, args: ["scripts/churn_report.mjs"] },
];

const results = [];
const overallStart = performance.now();

for (const gate of GATES) {
  const start = performance.now();
  const result = spawnSync(gate.cmd, gate.args, { cwd: repoRoot, encoding: "utf8" });
  const elapsedMs = performance.now() - start;
  results.push({ ...gate, elapsedMs, ok: result.status === 0, result });
}

const totalMs = performance.now() - overallStart;

console.log("");
for (const r of results) {
  const status = r.ok ? "PASS" : "FAIL";
  console.log(`${status}  ${r.name}  (${formatElapsed(r.elapsedMs)})`);
}
console.log("");
console.log(`Total: ${formatElapsed(totalMs)}`);

const failures = results.filter((r) => !r.ok);
if (failures.length > 0) {
  console.log("");
  console.log(`check FAILED — ${failures.length} of ${GATES.length} gate(s):`);
  for (const f of failures) {
    console.log("");
    console.log(`--- ${f.name} ---`);
    const output = `${f.result.stdout ?? ""}${f.result.stderr ?? ""}`.trim();
    console.log(output || `(exit code ${f.result.status}, no output)`);
  }
  process.exit(1);
}

console.log("");
console.log("check: all gates passed.");

function formatElapsed(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
