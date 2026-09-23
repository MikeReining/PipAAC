/**
 * 017 step 11 — proof for the frozen answer key:
 *   - same seed → byte-identical user files and manifest
 *   - different ids → different users; personas genuinely spread
 *   - every intended word is a catalog lemma, an entity, or typed
 *   - ~3% typed, repairs + partner turns present, 30 days each
 *   - the generator imports no predictor module (independence)
 *   - the committed manifest matches regeneration; drift is rejected
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { generateUser, loadBanks, manifestFor } from "./gen_users.mjs";
import { drawPersona, SEED, USER_COUNT } from "./personas.mjs";

const repoRoot = join(import.meta.dirname, "../../..");
const banks = loadBanks();
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const LEMMAS = new Set(lexicon.entries.map((e) => e.spokenText.toLowerCase()));

test("same seed regenerates byte-identical users and manifest", () => {
  const a = JSON.stringify(generateUser(7, banks));
  const b = JSON.stringify(generateUser(7, banks));
  assert.equal(a, b);
  const m1 = manifestFor(banks, { u007: a });
  const m2 = manifestFor(banks, { u007: b });
  assert.deepEqual(m1, m2);
});

test("different ids produce different users", () => {
  const one = JSON.stringify(generateUser(1, banks));
  const two = JSON.stringify(generateUser(2, banks));
  assert.notEqual(one, two);
});

test("personas spread across the population", () => {
  const ps = [...Array(USER_COUNT)].map((_, i) => drawPersona(i + 1));
  const spread = (k) => {
    const v = ps.map((p) => p[k]);
    return Math.min(...v) < Math.max(...v);
  };
  for (const k of ["vocabSize", "zipf", "repetition", "noveltyPerWeek",
    "jitterMin", "weekendShiftMin", "entityCount", "echoRate",
    "decidingMsMean", "llmShare", "routine"]) {
    assert.ok(spread(k), `${k} has no spread`);
  }
  // Eval-only patterns appear only in users 81–100.
  const special = ps.filter((p) => p.pattern !== "standard");
  assert.equal(special.length, 20);
  assert.ok(special.every((p) => p.id > 80));
});

test("answer key: 30 days, resolvable words, repairs, partner, typed", () => {
  let typed = 0, words = 0, repairs = 0, partner = 0, llm = 0, msgs = 0;
  for (const id of [3, 42, 77, 90]) {
    const u = generateUser(id, banks);
    assert.equal(u.days.length, 30);
    const ents = new Set(u.entities.map((e) => e.name.toLowerCase()));
    for (const d of u.days) {
      for (const m of d.messages) {
        msgs++;
        assert.ok(m.decidingMs >= 300, "deciding pause present");
        assert.ok(["template", "llm"].includes(m.bank));
        if (m.bank === "llm") llm++;
        if (m.partner) { partner++; assert.ok(Array.isArray(m.partner)); }
        if (m.repair) {
          repairs++;
          assert.ok(m.repair.position < m.words.length);
          assert.ok(typeof m.repair.wrong === "string");
        }
        for (const w of m.words) {
          words++;
          if (m.typed?.includes(w)) { typed++; continue; }
          assert.ok(LEMMAS.has(w) || ents.has(w), `unresolved word "${w}"`);
        }
      }
    }
  }
  assert.ok(repairs > 0 && partner > 0 && llm > 0);
  const rate = typed / words;
  assert.ok(rate > 0.01 && rate < 0.08, `typed rate ${rate} outside ~3%`);
});

test("the generator imports no predictor module", () => {
  for (const f of ["gen_users.mjs", "personas.mjs"]) {
    const src = readFileSync(join(import.meta.dirname, f), "utf8");
    for (const banned of ["shared/funnel", "shared/learn", "shared/jev",
      "sim_replay", "prediction/defaults", "book/", "catalog.json"]) {
      assert.ok(!src.includes(banned), `${f} imports ${banned}`);
    }
  }
});

test("committed manifest matches regeneration (--check)", () => {
  const out = execFileSync("node", [
    join(import.meta.dirname, "gen_users.mjs"), "--check",
  ], { encoding: "utf8" });
  assert.match(out, /manifest OK — 100 users/);
});
