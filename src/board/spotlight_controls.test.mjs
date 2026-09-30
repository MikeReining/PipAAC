/**
 * 032 E — a Spotlight list can light the ✨ and ❓ buttons, not only words.
 * Measured on the stored rows and on a second database fed the op log:
 * the buttons ride the list row (never spotlight_item, which is words),
 * survive replay, never trigger the groups route walk, and an unknown
 * button name is dropped rather than glowing nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { applyOp, listOps } from "../../public/shared/ops.mjs";
import {
  CONTROLS, endSpotlight, listTargets, needsRouteWalk, saveSpotList, spotLists,
  spotlight, startSpotlight, tipFor,
} from "../../public/shared/spotlight.mjs";
import {
  SHOWCASE, STARTER_LISTS, showcaseLit, starterTargets,
} from "../../public/shared/spotlight_starters.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const fresh = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

test("a list keeps its ✨ on the list row, words in items, and replays", () => {
  const a = fresh();
  saveSpotList(a, "spl_s", "Make it a sentence", ["sense:sns_0055", "sense:sns_0027", "control:fix"]);
  assert.deepEqual(
    a.prepare("SELECT kind, item_id FROM spotlight_item WHERE list_id = 'spl_s' ORDER BY item_id").all()
      .map((r) => `${r.kind}:${r.item_id}`),
    ["sense:sns_0027", "sense:sns_0055"], "items hold words only");
  assert.equal(a.prepare("SELECT controls FROM spotlight_list WHERE id = 'spl_s'").all()[0].controls, '["fix"]');
  const [l] = spotLists(a);
  assert.equal(l.n, 2);
  assert.deepEqual(l.controls, ["fix"]);
  assert.ok(listTargets(a, "spl_s").has("control:fix"));

  const b = fresh();
  for (const op of listOps(a)) applyOp(b, op);
  assert.ok(listTargets(b, "spl_s").has("control:fix"), "the button synced");
  assert.equal(listTargets(b, "spl_s").size, 3);
});

test("re-saving without the button clears it", () => {
  const db = fresh();
  saveSpotList(db, "spl_q", "Q", ["sense:sns_0015", "control:question"]);
  saveSpotList(db, "spl_q", "Q", ["sense:sns_0015"]);
  assert.equal(listTargets(db, "spl_q").has("control:question"), false);
});

test("the layer lights a button, drops an unknown one, and never walks groups for it", () => {
  const db = fresh();
  const { skipped } = startSpotlight(db, ["sense:sns_0015", "control:question", "control:rocket"]);
  assert.deepEqual(skipped, ["control:rocket"]);
  assert.ok(spotlight().targets.has("control:question"));
  assert.equal(needsRouteWalk(spotlight().targets, new Set(["sns_0015"])), false);
  endSpotlight();
});

test("a partner's coach line for a button is its own tip", () => {
  const db = fresh();
  assert.equal(tipFor(db, catalog, "control", "fix"), CONTROLS.fix.tip);
});

test("the moves lists carry their buttons through a save", () => {
  const db = fresh();
  const sentence = STARTER_LISTS.find((x) => x.id === "sentence");
  const ask = STARTER_LISTS.find((x) => x.id === "question");
  saveSpotList(db, "spl_m", sentence.name, starterTargets(sentence));
  saveSpotList(db, "spl_n", ask.name, starterTargets(ask));
  assert.ok(listTargets(db, "spl_m").has("control:fix"));
  assert.ok(listTargets(db, "spl_n").has("control:question"));
  // Every starter word is a real core sense on the 60-button board.
  const core = new Set(db.prepare("SELECT sense_id FROM core_cell WHERE layout = 'grid60'").all().map((r) => r.sense_id));
  for (const x of STARTER_LISTS) {
    for (const id of x.senses) assert.ok(core.has(id), `${x.name}: ${id} is not on the home board`);
  }
});

// The worked example must hold together (founder, 2026-09-30): the word
// the picture taps and card 2 asks for is dimmed and is part of the pair
// cards 3–4 light; some tiles glow and some dim; and every move pair is
// one the sentence-lab battery has proven (not a guess about the model).
const PROVEN = new Set(["we play", "it good", "mom play"]); // battery v5, all modes clean
test("the showcase tells one story, on a proven pair", () => {
  assert.ok(SHOWCASE.tiles.includes(SHOWCASE.tap));
  assert.equal(showcaseLit(SHOWCASE.tap), false, "the tapped word is dimmed");
  // What card 2 asks for sits in the board's top half — never under the card.
  const slot = catalog.coreCells.find((c) => c.layout === "grid60" && c.sense_id === SHOWCASE.tap)?.slot_index;
  assert.ok(slot != null && slot < 30, `the tap word sits at slot ${slot}`);
  const dimmed = SHOWCASE.tiles.filter((id) => !showcaseLit(id));
  for (const id of SHOWCASE.move) assert.ok(dimmed.includes(id), "every dimmed tile shown is used next");
  const lit = SHOWCASE.tiles.filter(showcaseLit).length;
  assert.ok(lit > 0 && lit < SHOWCASE.tiles.length, "some glow, some dim");
  const label = (id) => catalog.labels.find((l) => l.sense_id === id && l.kind === "lemma" && l.locale === "en").text;
  assert.ok(PROVEN.has(SHOWCASE.move.map(label).join(" ")));
  for (const x of STARTER_LISTS.filter((l) => l.controls)) {
    const pair = x.move.filter((k) => k.startsWith("sense:")).map((k) => label(k.slice(6))).join(" ");
    assert.ok(PROVEN.has(pair), `${x.name}: "${pair}" is not a proven pair`);
  }
});
