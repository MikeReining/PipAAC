// 010 slice 1 Works Test: the extended-list generator rejects a row
// whose label matches a launch word, a row with no category, and a
// duplicate row — and the real catalog file parses clean.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseExtended, build } from "./build_extended_lexicon.mjs";

const launch = new Set(["dog", "go", "more"]);

const fixture = (rows, header = "## Toys\nart: draw\n") =>
  `${header}${rows}\n`;

test("rejects a row whose label repeats a launch word", () => {
  const { errors } = parseExtended(fixture("trampoline, dog, shovel"), launch);
  assert.deepEqual(errors, ['"dog" repeats a launch word']);
});

test("rejects a row with no category", () => {
  const { errors } = parseExtended(fixture("trampoline", "##\nart: draw\n"), launch);
  assert.deepEqual(errors, ['"trampoline" has no category']);
});

test("rejects a duplicate row", () => {
  const { errors } = parseExtended(
    fixture("trampoline, shovel") + "## Games\nart: none\ntrampoline\n", launch);
  assert.deepEqual(errors, ['"trampoline" is a duplicate']);
});

test("rejects rows before a section's art: rule", () => {
  const { errors } = parseExtended("## Toys\ntrampoline\n", launch);
  assert.deepEqual(errors,
    ['"trampoline" in "Toys" comes before its art: rule']);
});

test("parenthesized labels are their own sense, never spoken", () => {
  const { entries, errors } = parseExtended(
    fixture("wrap, wrap (food), Chase (Paw Patrol)"), launch);
  assert.equal(errors.length, 0);
  assert.deepEqual(entries.map((e) => e.spokenText),
    ["wrap", "wrap", "chase"]);
});

test("the real catalog parses clean and keeps its shape", () => {
  const data = build();
  assert.ok(data.entries.length > 3500, `only ${data.entries.length} entries`);
  assert.ok(data.categories.includes("Characters"));
  assert.ok(data.entries.some((e) => e.kind === "phrase"));
  assert.ok(data.entries.every((e) => e.id && e.category));
});
