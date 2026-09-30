/**
 * Isolate memory budget (regression guard, 2026-09-30): every Worker
 * isolate — including each Durable Object — evaluates the whole bundle
 * at cold start. A static import of a multi-MB JSON file is parsed in
 * every one of them; catalog.json + the prediction tables (~57 MB of
 * JSON, hundreds of MB parsed) crash-looped the TileLedger DO over the
 * 128 MB isolate limit — it never booted on prod.
 *
 * The law: nothing under src/worker/ may statically import a JSON file
 * over the budget. Big data ships in public/ as static assets (or R2)
 * and routes serve it without parsing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const BUDGET_BYTES = 2 * 1024 * 1024; // 2 MiB — headroom under the isolate limit
const STATIC_IMPORT = /import\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g;

function* workerFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* workerFiles(p);
    else if (/\.(js|mjs)$/.test(e.name) && !e.name.includes(".test.")) yield p;
  }
}

test("no worker module statically imports a JSON payload over the isolate budget", () => {
  const offenders = [];
  for (const file of workerFiles(WORKER_DIR)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(STATIC_IMPORT)) {
      const spec = m[1];
      if (!spec.endsWith(".json") || !spec.startsWith(".")) continue;
      const resolved = path.resolve(path.dirname(file), spec);
      const size = statSync(resolved).size;
      if (size > BUDGET_BYTES) {
        offenders.push(
          `${path.relative(WORKER_DIR, file)} -> ${spec} (${(size / 1048576).toFixed(1)} MB)`,
        );
      }
    }
  }
  assert.deepEqual(offenders, [],
    `static JSON imports over ${BUDGET_BYTES / 1048576} MiB are parsed by every isolate (DOs included) — serve big data from public/ or R2 instead`);
});
