/**
 * 013 slice 6 — coaching tips: a list's tips sync like every other edit,
 *  re-saving a list never wipes them, and the tip a supporter sees after
 *  modeling resolves edit → catalog default → none.
 *
 * Proves against rows and op replay, not the module's report. The DOM
 * leg (the tip in the supporter's bar) is scripts/probes/spot_remote_probe.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { applyOp, listOps } from "../../public/shared/ops.mjs";
import {
  listItems, saveSpotList, setItemTip, tipFor,
} from "../../public/shared/spotlight.mjs";
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
const senseOf = (db, text) =>
  db.prepare("SELECT sense_id FROM label WHERE text = ? AND locale = 'en' AND kind = 'lemma' AND status = 'approved'")
    .all(text)[0]?.sense_id;

test("a list's tips write, read back, and replay onto a second device", () => {
  const a = fresh(), b = fresh();
  const juice = senseOf(a, "juice");
  saveSpotList(a, "spl_t", "Drinks", [`sense:${juice}`]);
  setItemTip(a, "spl_t", "sense", juice, "Offer a sip, wait, then say \"juice\".");
  assert.equal(listItems(a, "spl_t")[0].tip, "Offer a sip, wait, then say \"juice\".");
  for (const op of listOps(a)) applyOp(b, op);
  assert.equal(listItems(b, "spl_t")[0].tip,
    "Offer a sip, wait, then say \"juice\".", "the tip synced through the op log");
});

test("re-saving a list keeps each item's tip", () => {
  const db = fresh();
  const juice = senseOf(db, "juice"), milk = senseOf(db, "milk");
  saveSpotList(db, "spl_t", "Drinks", [`sense:${juice}`]);
  setItemTip(db, "spl_t", "sense", juice, "the SLP's line");
  // Re-save with a second word added — the first item's tip survives.
  saveSpotList(db, "spl_t", "Drinks", [`sense:${juice}`, `sense:${milk}`]);
  const items = listItems(db, "spl_t");
  assert.equal(items.find((i) => i.item_id === juice)?.tip, "the SLP's line");
  assert.equal(items.find((i) => i.item_id === milk)?.tip ?? null, null);
});

test("tip resolution: a list item's edit wins, then the catalog default, then null", () => {
  const db = fresh();
  const juice = senseOf(db, "juice");
  // Shipped default from the catalog.
  assert.equal(tipFor(db, catalog, "sense", juice), catalog.coachTips[juice]);
  assert.ok(tipFor(db, catalog, "sense", juice).length > 0);
  // An SLP edit overrides it.
  saveSpotList(db, "spl_t", "Drinks", [`sense:${juice}`]);
  setItemTip(db, "spl_t", "sense", juice, "their own line");
  assert.equal(tipFor(db, catalog, "sense", juice), "their own line");
  // An unknown entity has neither.
  assert.equal(tipFor(db, catalog, "entity", "ent_none"), null);
});
