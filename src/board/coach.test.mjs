/**
 * 013 slice 6 Works Test — the coach view's data layer: a list's tips
 *  sync like every other edit, the partner's tally is device-local, and
 *  re-saving a list never wipes its tips.
 *
 * Proves against rows and op replay, not the module's report: tip edits
 * land in spotlight_item and replay onto a second database; coach_event
 * rows survive a drainOps rebuild because the table is not synced; the
 * tally counts distinct words modeled today only. The DOM leg — the
 * coach bar on the partner's mirror and none on the child's device —
 * is scripts/probes/spot_coach_probe.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { applyOp, drainOps, ensureBaseline, listOps } from "../../public/shared/ops.mjs";
import {
  coachTap, coachTally, listItems, saveSpotList, setItemTip, tipFor,
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

test("the tally counts distinct words modeled today — device-local, drains never touch it", () => {
  const db = fresh();
  const juice = senseOf(db, "juice"), milk = senseOf(db, "milk");
  ensureBaseline(db);
  const today = Date.now();
  coachTap(db, "sense", juice, today);
  coachTap(db, "sense", juice, today + 1000); // a repeat models the same word
  coachTap(db, "sense", milk, today);
  coachTap(db, "sense", juice, today - 26 * 3600_000); // yesterday doesn't count
  assert.equal(coachTally(db, today), 2);
  // A sync drain rebuilds the synced tables — the local tally is untouched.
  saveSpotList(db, "spl_t", "Drinks", [`sense:${juice}`]);
  const ops = listOps(db).filter((o) => o.kind === "spot_list_save");
  drainOps(db, ops);
  assert.equal(coachTally(db, today), 2, "coach_event survived the drain");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM coach_event").all()[0].n, 4);
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
