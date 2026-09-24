/**
 * 014 slice 4 Works Test — the Cells picker's move-cost preview, the
 * transition marks, the layout-change write owner, and op replay.
 * The lie-prone layer is a preview that guesses geometry instead of
 * measuring the real coordinate maps: the classification legs use two
 * synthetic 3-column layouts whose sectors are known by hand, and the
 * write-owner legs measure the actual rows (learner_profile, move_mark,
 * core_override, op_log) — not what the functions claim they did.
 * The browser leg is `scripts/probes/cells_probe.mjs`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { applyOp } from "../../public/shared/ops.mjs";
import { moveCore } from "../../public/shared/coremove.mjs";
import {
  bindLayouts, moveCost, moveMarks, setBoardLayout,
} from "../../public/shared/movecost.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
bindLayouts(catalog.layouts);
const fresh = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  // The write owner reads the profile row; seed one if import didn't.
  db.exec(
    `INSERT OR IGNORE INTO learner_profile (id, locale, preferred_voice_id)
     SELECT 'prf_local', 'en', id FROM voice LIMIT 1`,
  );
  return db;
};
const senseIds = (db) => db.prepare("SELECT id FROM sense ORDER BY id LIMIT 6")
  .all().map((r) => r.id);
let cellSeq = 0;
const putCell = (db) => db.prepare(
  "INSERT INTO core_cell (id, layout, sense_id, slot_index) VALUES (?, ?, ?, ?)");
const put = (db, layout, senseId, slot) =>
  putCell(db).run(`cel_t${cellSeq++}`, layout, senseId, slot);

test("moveCost classifies same / sector / moved / gone exactly", async () => {
  const db = fresh();
  const [s1, s2, s3, s4] = senseIds(db);
  // Two synthetic 3-col layouts — the class boundaries are known by hand.
  // t1: s1@0, s2@4 (sector 1), s3@2
  put(db, "t1", s1, 0); put(db, "t1", s2, 4); put(db, "t1", s3, 2);
  // t2: s1@0 (same), s2@8 (sector 2 → moved), s4@1 (new), s3 absent → gone
  put(db, "t2", s1, 0); put(db, "t2", s2, 8); put(db, "t2", s4, 1);
  bindLayouts({ t1: { cols: 3 }, t2: { cols: 3 } });
  const mc = moveCost(db, "t1", "t2", "en");
  const byId = Object.fromEntries(mc.words.map((w) => [w.sense_id, w]));
  assert.equal(byId[s1].cls, "same");
  assert.equal(byId[s2].cls, "moved");      // sector 1 → sector 2
  assert.equal(byId[s3].cls, "gone");       // leaves the home board
  assert.equal(byId[s4].cls, "new");        // joins the home board
  assert.equal(mc.totals.same + mc.totals.sector + mc.totals.moved
    + mc.totals.gone + mc.totals.new, 4);
  assert.equal(mc.words.length, 4);
});

test("moveCost weights words by real selection history", async () => {
  const db = fresh();
  const [s1, s2] = senseIds(db);
  put(db, "t1", s1, 0); put(db, "t1", s2, 1);
  put(db, "t2", s1, 3); put(db, "t2", s2, 4); // both moved (sector 0 → 1)
  bindLayouts({ t1: { cols: 3 }, t2: { cols: 3 } });
  // s1 spoken twice, s2 once — s1 must outweigh s2 in the preview.
  // (With any history at all, unused words leave the pool entirely.)
  const ins = db.prepare(
    "INSERT INTO learner_event_log (item_kind, item_id, selected_at) VALUES ('sense', ?, ?)");
  ins.run(s1, 1000); ins.run(s1, 2000); ins.run(s2, 3000);
  const mc = moveCost(db, "t1", "t2", "en");
  const byId = Object.fromEntries(mc.words.map((w) => [w.sense_id, w]));
  assert.equal(byId[s1].count, 2);
  assert.equal(byId[s2].count, 1);
  assert.equal(mc.weighted, true);
  assert.equal(mc.totals.moved, 3);  // 2 + 1
});

test("setBoardLayout writes the setting, marks only moved words, keeps overrides", async () => {
  const db = fresh();
  bindLayouts(catalog.layouts);
  const before = moveCost(db, "grid60", "grid90", "en");
  const movedIds = new Set(before.words
    .filter((w) => w.cls === "sector" || w.cls === "moved")
    .map((w) => w.sense_id));
  // An adult override on the CURRENT layout must survive the change.
  const movable = before.words.find((w) => w.cls === "moved" || w.cls === "sector");
  moveCore(db, "grid60", movable.sense_id, 50);
  const r = setBoardLayout(db, "grid90");
  assert.equal(db.prepare("SELECT board_layout AS l FROM learner_profile WHERE id = 'prf_local'")
    .get().l, "grid90");
  assert.equal(r.from, "grid60");
  // Marks were written for exactly the moved/sector/gone set — 'same'
  // and 'new' words carry no highlight (they never changed place).
  const marks = moveMarks(db);
  for (const id of marks) assert.ok(movedIds.has(id));
  assert.ok(marks.has(movable.sense_id));
  assert.equal(marks.size, movedIds.size);
  // The grid60 override row is still there — adult choices don't erase.
  assert.ok(db.prepare(
    "SELECT 1 AS x FROM core_override WHERE layout = 'grid60' AND item_id = ?")
    .get(movable.sense_id));
  // …and the intent is a replayable op.
  assert.ok(db.prepare("SELECT 1 AS x FROM sync_op WHERE kind = 'set_layout'").get());
});

test("moveMarks returns only unexpired marks", async () => {
  const db = fresh();
  const [s1, s2] = senseIds(db);
  db.prepare("INSERT INTO move_mark (sense_id, until) VALUES (?, ?)")
    .run(s1, Date.now() + 60_000);
  db.prepare("INSERT INTO move_mark (sense_id, until) VALUES (?, ?)")
    .run(s2, Date.now() - 60_000);
  assert.deepEqual([...moveMarks(db)], [s1]);
});

test("set_layout op replays — both replicas land identical", async () => {
  const A = fresh(), B = fresh();
  setBoardLayout(B, "grid15");
  const ops = B.prepare("SELECT * FROM sync_op WHERE kind = 'set_layout'").all();
  for (const op of ops) applyOp(A, op);
  assert.equal(A.prepare("SELECT board_layout AS l FROM learner_profile WHERE id = 'prf_local'")
    .get().l, "grid15");
  // `until` is stamped from each replica's own clock — compare the mark
  // SETS (identical) and that both land in the future, not the ticks.
  const ids = (d) => d.prepare(
    "SELECT sense_id FROM move_mark ORDER BY sense_id").all().map((r) => r.sense_id);
  assert.deepEqual(ids(A), ids(B));
  for (const r of A.prepare("SELECT until FROM move_mark").all()) {
    assert.ok(r.until > Date.now());
  }
});

test("real catalog: grid60 → grid90 cost is complete and deterministic", async () => {
  const db = fresh();
  bindLayouts(catalog.layouts);
  const a = moveCost(db, "grid60", "grid90", "en");
  const b = moveCost(db, "grid60", "grid90", "en");
  assert.deepEqual(a, b); // same inputs → byte-identical preview
  const n = a.words.length;
  assert.equal(a.totals.same + a.totals.sector + a.totals.moved
    + a.totals.gone + a.totals.new, n);
  assert.ok(n > 40); // the 60-cell board plus grid90's new words
});

test("014 slice 5: every shared word keeps its sector grid60 → grid90", async () => {
  const db = fresh();
  bindLayouts(catalog.layouts);
  const mc = moveCost(db, "grid60", "grid90", "en");
  // The ruling's promise (map doc § 5): sector membership is preserved —
  // nothing is "moved" across bands and nothing leaves the home board.
  assert.equal(mc.totals.moved, 0);
  assert.equal(mc.totals.gone, 0);
  assert.equal(mc.totals.sector + mc.totals.same, 60); // all of grid60
  assert.equal(mc.totals.new, 23);                     // the dense-only words
});
