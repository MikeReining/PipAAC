/** Slice 0 (041): the shell cache must use indexed lookups.
 *  `cache.match(req, { ignoreSearch: true })` scans every entry — 463 ms
 *  per file on a 7,879-entry cache (measured 2026-10-03). This test is
 *  the ratchet: ignoreSearch never comes back. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoRoot } from "../catalog/paths.mjs";

const sw = readFileSync(`${repoRoot}/public/sw.js`, "utf8");

test("sw.js uses no unindexed cache lookups", () => {
  assert.equal(sw.includes("ignoreSearch"), false,
    "sw.js reintroduced ignoreSearch — cache.match must take the exact "
    + "URL (origin + pathname), never a scan-every-entry option");
  assert.equal(sw.includes("ignoreVary"), false);
  assert.equal(sw.includes("ignoreMethod"), false);
});
