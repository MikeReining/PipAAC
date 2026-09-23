/**
 * 017 step 12 — eval users stay unseen:
 *   - fit/tune loaders throw on eval ids (81–100)
 *   - every loaded file is re-hashed against the manifest
 *   - --final requires the flag AND a clean git tree
 *   - fit_defaults --users=<eval id> exits nonzero
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import {
  loadSynthUsers, parseUserSpec, requireFinal, splitFor, userToFixture,
} from "./splits.mjs";

const repoRoot = join(import.meta.dirname, "../../..");

test("the split seals eval users 81–100 from fit and tune", () => {
  assert.equal(splitFor(1), "fit");
  assert.equal(splitFor(60), "fit");
  assert.equal(splitFor(61), "tune");
  assert.equal(splitFor(80), "tune");
  assert.equal(splitFor(81), "eval");
  assert.equal(splitFor(100), "eval");
  for (const purpose of ["fit", "tune"]) {
    assert.throws(() => loadSynthUsers([81], { purpose }), /eval/);
    assert.throws(() => loadSynthUsers([1, 100], { purpose }), /eval/);
  }
  assert.throws(() => loadSynthUsers([61], { purpose: "fit" }), /tune/);
});

test("loading a fit user returns 30 days against the manifest", () => {
  const [u] = loadSynthUsers([1], { purpose: "fit" });
  assert.equal(u.id, "u001");
  assert.equal(u.days.length, 30);
});

test("a drifted user file fails the manifest hash", () => {
  const dir = mkdtempSync(join(tmpdir(), "synth-"));
  const real = readFileSync(join(repoRoot, "out/prediction/synth/u001.json"), "utf8");
  writeFileSync(join(dir, "u001.json"), real.replace('"seed"', '"tampered":1,"seed"'));
  const manifest = join(dir, "manifest.json");
  writeFileSync(manifest, JSON.stringify({ users: { u001: "0".repeat(64) } }));
  assert.throws(
    () => loadSynthUsers([1], { purpose: "fit", dir, manifest }),
    /manifest hash/);
});

test("--final requires the flag and a clean tree", () => {
  assert.throws(() => requireFinal([], { statusRunner: () => "" }), /--final/);
  assert.throws(
    () => requireFinal(["--final"], { statusRunner: () => " M public/board.js\n" }),
    /clean git tree/);
  assert.doesNotThrow(
    () => requireFinal(["--final"], { statusRunner: () => "" }));
});

test("parseUserSpec expands ranges and singletons", () => {
  assert.deepEqual(parseUserSpec("1-3,7,60-61"), [1, 2, 3, 7, 60, 61]);
  assert.throws(() => parseUserSpec("abc"), /bad --users/);
});

test("fit_defaults refuses an eval user id", () => {
  const r = spawnSync("node", [
    join(repoRoot, "scripts/prediction/fit_defaults.mjs"), "--users=81",
  ], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /eval/);
});

test("userToFixture carries days, messages, and lowercase entities", () => {
  const [u] = loadSynthUsers([1], { purpose: "fit" });
  const fx = userToFixture(u);
  assert.equal(fx.days.length, 30);
  assert.ok(fx.entities.every((e) => e.name === e.name.toLowerCase()));
  const day1 = fx.unscripted[1];
  assert.ok(day1.length > 0 && day1.every((s) => s.at && s.words.length));
});
