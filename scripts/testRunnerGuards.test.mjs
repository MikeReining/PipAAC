import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_SH = join(ROOT, "scripts/test.sh");
const MISSING = "src/worker/__definitely_not_here__.test.mjs";

test("missing named test file exits 2 before lock acquisition", () => {
  const result = spawnSync("bash", [TEST_SH, MISSING], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(
    result.status,
    2,
    `expected exit 2, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.match(
    result.stderr,
    /test\.sh: no such test file: src\/worker\/__definitely_not_here__\.test\.mjs/,
  );
  assert.doesNotMatch(result.stderr, /another run is in progress/);
});

test("lock-blocked exit is a named constant distinct from suite failure", () => {
  // Source-level assertion, weaker than an end-to-end one. This file runs
  // inside a test.sh invocation that already holds the single-instance lock.
  // Spawning another test.sh far enough to hit acquire_lock would contend
  // with that holder and flake, so an end-to-end lock-contention test is
  // not safe here. Reading the script text is the proof we can run.
  const source = readFileSync(TEST_SH, "utf8");
  const constMatch = source.match(/^EXIT_LOCKED=(\d+)\s*$/m);
  assert.ok(constMatch, "scripts/test.sh must define EXIT_LOCKED");
  assert.equal(constMatch[1], "75");
  const failLocked = source.match(/fail_locked\(\) \{[\s\S]*?\n\}/);
  assert.ok(failLocked, "scripts/test.sh must define fail_locked()");
  assert.match(failLocked[0], /exit "\$EXIT_LOCKED"/);
  assert.doesNotMatch(failLocked[0], /exit 1\b/);
});
