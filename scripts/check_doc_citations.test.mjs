/**
 * Falsifiability proof for scripts/check_doc_citations.mjs's extension-boundary
 * handling.
 *
 * EXT is built with no boundary after the alternation (`(?:mjs|js|jsx|ts|tsx|md)`),
 * and the path character class allows dots, so a real `.jsonc` citation
 * (`apps/studio/wrangler.jsonc`) backtracks onto the listed `.js` prefix and the
 * gate reports a phantom `apps/studio/wrangler.js` as missing — a doc that is
 * correct gets blocked by a gate that is wrong. This writes a throwaway fixture
 * doc under docs/ (deleted in `finally`, scoped via `--only` so it never leaks
 * into a real citation scan) and asserts against the real `collectViolations`
 * entrypoint — not a hand-rolled regex probe — so this fails for the actual
 * reason the gate would.
 *
 * Run with: node --test scripts/check_doc_citations.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { collectViolations } from "./check_doc_citations.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FIXTURE_ABS = join(ROOT, "docs/_check_doc_citations_test_fixture.md");
const FIXTURE_REL = relative(ROOT, FIXTURE_ABS);

const FIXTURE_CONTENT = `# check_doc_citations.test.mjs fixture (throwaway — deleted after the test run)

Real jsonc path, no line number: \`config/harness.jsonc\`

Missing js path: \`apps/studio/definitely-missing-file-xyz.js\`

Missing mjs path with line: \`scripts/definitely-missing-file-xyz.mjs:5\`

Bad line number in a real file: \`scripts/check_doc_citations.mjs:999999\`

Unknown commit sha: \`deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\`
`;

function withFixture(fn) {
  writeFileSync(FIXTURE_ABS, FIXTURE_CONTENT);
  try {
    return fn();
  } finally {
    unlinkSync(FIXTURE_ABS);
  }
}

test("a real .jsonc citation is not reported as a missing .js path", () => {
  withFixture(() => {
    const violations = collectViolations({ onlyPath: FIXTURE_REL });
    const wranglerHits = violations.filter((v) => v.includes("harness.jsonc"));
    assert.deepEqual(
      wranglerHits,
      [],
      `config/harness.jsonc exists and must resolve cleanly, got: ${wranglerHits.join("; ")}`,
    );
  });
});

test("a genuinely missing .js path is still reported (gate not weakened into silence)", () => {
  withFixture(() => {
    const violations = collectViolations({ onlyPath: FIXTURE_REL });
    assert.ok(
      violations.some((v) => v.includes("path not found: apps/studio/definitely-missing-file-xyz.js")),
      `expected a path-not-found violation for the missing .js file, got: ${violations.join("; ")}`,
    );
  });
});

test("a genuinely missing .mjs path with a line number is still reported", () => {
  withFixture(() => {
    const violations = collectViolations({ onlyPath: FIXTURE_REL });
    assert.ok(
      violations.some((v) =>
        v.includes("path not found: scripts/definitely-missing-file-xyz.mjs:5"),
      ),
      `expected a path-not-found violation for the missing .mjs file, got: ${violations.join("; ")}`,
    );
  });
});

test("an out-of-range line number against a real file is still reported", () => {
  withFixture(() => {
    const violations = collectViolations({ onlyPath: FIXTURE_REL });
    assert.ok(
      violations.some(
        (v) => v.includes("line 999999 out of range") && v.includes("scripts/check_doc_citations.mjs"),
      ),
      `expected an out-of-range violation, got: ${violations.join("; ")}`,
    );
  });
});

test("an unknown commit sha is still reported", () => {
  withFixture(() => {
    const violations = collectViolations({ onlyPath: FIXTURE_REL });
    assert.ok(
      violations.some((v) =>
        v.includes("commit not in history: deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"),
      ),
      `expected a commit-not-in-history violation, got: ${violations.join("; ")}`,
    );
  });
});

test("exactly the four real defects are reported, nothing extra and nothing silently dropped", () => {
  withFixture(() => {
    const violations = collectViolations({ onlyPath: FIXTURE_REL });
    assert.equal(
      violations.length,
      4,
      `expected exactly 4 violations (missing .js, missing .mjs, bad line, unknown sha), got ${violations.length}:\n${violations.join("\n")}`,
    );
  });
});
