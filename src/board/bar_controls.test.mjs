/**
 * 038 — Sentence bar settings: `learner_profile.bar_controls` is the
 * truth owner (a JSON list of shown control names; NULL = Everything).
 * Measured on the stored row and on a second database fed the op log —
 * the setting rides sync like every other caregiver edit, and a hidden
 * button is never a Spotlight target, only un-targeted while hidden.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { drainOps, ensureBaseline, listOps } from "../../public/shared/ops.mjs";
import { setSetting } from "../../public/shared/groups.mjs";
import {
  BAR_CONTROLS, BAR_PRESETS, barControls, barLabel, barPreset,
} from "../../public/shared/bar.mjs";
import {
  endSpotlight, listTargets, saveSpotList, spotlight, startSpotlight,
} from "../../public/shared/spotlight.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const device = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  ensureBaseline(db);
  return db;
};

test("an absent or NULL bar_controls is Everything — the pre-038 bar", () => {
  const db = device();
  assert.equal(
    db.prepare("SELECT bar_controls FROM learner_profile WHERE id = 'prf_local'").all()[0].bar_controls,
    null, "a fresh profile stores no list");
  assert.deepEqual([...barControls(db)].sort(), [...BAR_CONTROLS].sort());
  // Stored garbage can never hide a button or crash the read.
  db.prepare("UPDATE learner_profile SET bar_controls = 'not json' WHERE id = 'prf_local'").run();
  assert.deepEqual([...barControls(db)].sort(), [...BAR_CONTROLS].sort());
  db.prepare("UPDATE learner_profile SET bar_controls = '[\"fix\",\"bogus\"]' WHERE id = 'prf_local'").run();
  assert.deepEqual([...barControls(db)], ["fix"], "unknown names are dropped");
});

test("the setting writes a set_setting op and replays on another device", () => {
  const a = device();
  setSetting(a, "bar_controls", JSON.stringify(["question"]));
  assert.deepEqual([...barControls(a)], ["question"]);
  const op = listOps(a).filter((o) => o.kind === "set_setting")
    .map((o) => JSON.parse(o.args)).find((o) => o.key === "bar_controls");
  assert.ok(op, "the change is a synced op");

  const b = device();
  drainOps(b, listOps(a).map((o, i) => ({ ...o, relay_seq: i + 1 })));
  assert.deepEqual([...barControls(b)], ["question"], "the other device's bar matches");
});

test("a hidden control is never a Spotlight target — and returns when shown", () => {
  const db = device();
  saveSpotList(db, "spl_q", "Ask it", ["sense:sns_0015", "control:question"]);
  setSetting(db, "bar_controls", JSON.stringify(["fix"])); // question hidden

  assert.equal(listTargets(db, "spl_q").has("control:question"), false,
    "the list keeps its rows but the hidden button is not a target");
  const { skipped } = startSpotlight(db, ["sense:sns_0015", "control:question"]);
  assert.deepEqual(skipped, ["control:question"]);
  assert.equal(spotlight().targets.has("control:question"), false);
  endSpotlight();

  setSetting(db, "bar_controls", JSON.stringify(["fix", "question"]));
  assert.ok(listTargets(db, "spl_q").has("control:question"),
    "re-shown, the saved list lights it again — the list was never edited");
  const r = startSpotlight(db, ["sense:sns_0015", "control:question"]);
  assert.deepEqual(r.skipped, []);
  assert.ok(spotlight().targets.has("control:question"));
  endSpotlight();
});

test("presets and labels read the shown set", () => {
  const db = device();
  assert.equal(barPreset(barControls(db)).id, "all");
  assert.equal(barLabel(db), "Everything");
  for (const p of BAR_PRESETS) {
    setSetting(db, "bar_controls", JSON.stringify(p.controls));
    assert.equal(barPreset(barControls(db)).id, p.id);
    assert.equal(barLabel(db), p.name);
  }
  setSetting(db, "bar_controls", JSON.stringify(["fix", "future"]));
  assert.equal(barPreset(barControls(db)), null, "a custom mix is no preset");
  assert.equal(barLabel(db), "Play + Fix it + Future");
});
