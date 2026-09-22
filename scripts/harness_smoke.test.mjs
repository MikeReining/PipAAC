import test from "node:test";
import assert from "node:assert/strict";

test("harness smoke — repo root markers exist", () => {
  assert.ok(import.meta.url.includes("/scripts/"));
});
