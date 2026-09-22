/**
 * `npm run check:fast` — cheap harness gates in one pass.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GATES = [
  { name: "lint:archive-links", cmd: process.execPath, args: ["scripts/check_archive_links.mjs"] },
  { name: "lint:phase-freshness", cmd: process.execPath, args: ["scripts/check_phase_doc_freshness.mjs"] },
  { name: "lint:lockfile-sync", cmd: process.execPath, args: ["scripts/check_lockfile_sync.mjs"] },
  { name: "lint:doc-citations", cmd: process.execPath, args: ["scripts/check_doc_citations.mjs"] },
  { name: "lint:locale-literals", cmd: process.execPath, args: ["scripts/check_locale_literals.mjs"] },
  { name: "regression_law_meta_gate", cmd: process.execPath, args: ["scripts/regression_law_meta_gate.mjs"] },
  { name: "guard-liveness", cmd: "bash", args: ["scripts/check-test-guard-liveness.sh"] },
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
  console.log(`${status}  ${r.name}  (${r.elapsedMs.toFixed(0)}ms)`);
}
console.log("");
console.log(`Total: ${totalMs.toFixed(0)}ms`);

const failures = results.filter((r) => !r.ok);
if (failures.length > 0) {
  console.log("");
  console.log(`check:fast FAILED — ${failures.length} of ${GATES.length} gate(s):`);
  for (const f of failures) {
    console.log("");
    console.log(`--- ${f.name} ---`);
    const output = `${f.result.stdout ?? ""}${f.result.stderr ?? ""}`.trim();
    console.log(output || `(exit code ${f.result.status}, no output)`);
  }
  process.exit(1);
}

console.log("");
console.log("check:fast: all gates passed.");
