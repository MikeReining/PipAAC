/**
 * 014 slice 7 Works Test — Smart bar families. The spec's own test:
 * "tap `?` — the bar shows why · when · where · who in that order in
 * slots 1–4, on every launch, whatever the prediction state." Measured
 * on the real rows the bar reads: seeded contents, fixed order under
 * replay, masking exclusion, and the adult's reorder owning the rows.
 * The bar leg is `scripts/probes/family_probe.mjs`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { applyOp } from "../../public/shared/ops.mjs";
import { setMask } from "../../public/shared/groups.mjs";
import {
  families, familyItems, setFamilyItems, createFamily,
} from "../../public/shared/families.mjs";
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
const labelsOf = (db, id) => familyItems(db, id, "en").map((i) => i.label);

test("the ? family seeds why · when · where · who in fixed order", () => {
  const db = fresh();
  const fams = families(db);
  const q = fams.find((f) => f.id === "bf_q");
  assert.ok(q);
  assert.equal(q.glyph, "?");
  assert.deepEqual(labelsOf(db, "bf_q"), ["why", "when", "where", "who"]);
});

test("grid15 slot 13 is the ? family tile in the catalog anchors", () => {
  const a = catalog.layouts.grid15.anchors.find((x) => x.slot === 13);
  assert.deepEqual(a, { slot: 13, kind: "family", family: "bf_q" });
});

test("an adult's reorder owns the rows — regen never rewrites them", () => {
  const db = fresh();
  const items = familyItems(db, "bf_q", "en");
  // Move `who` to the front, drop `when`.
  setFamilyItems(db, "bf_q", [
    { kind: "sense", id: items[3].id },
    { kind: "sense", id: items[0].id },
    { kind: "sense", id: items[2].id },
  ]);
  assert.deepEqual(labelsOf(db, "bf_q"), ["who", "why", "where"]);
  // Re-importing the catalog is a no-op over caregiver-edited rows.
  importCatalog(db, catalog);
  assert.deepEqual(labelsOf(db, "bf_q"), ["who", "why", "where"]);
});

test("a masked word never appears in the bar — Expand obeys Predict law", () => {
  const db = fresh();
  const why = familyItems(db, "bf_q", "en").find((i) => i.label === "why");
  setMask(db, why.id, true);
  const masked = new Set(
    db.prepare("SELECT sense_id FROM sense_mask WHERE status = 'hidden'").all()
      .map((r) => r.sense_id),
  );
  assert.deepEqual(
    familyItems(db, "bf_q", "en", masked).map((i) => i.label),
    ["when", "where", "who"],
  );
});

test("set_family_items + create_family replay — replicas land identical", () => {
  const A = fresh(), B = fresh();
  createFamily(B, { id: "bf_test", name: "Pain", glyph: "🩹", speaks: "I'm in pain" });
  const items = familyItems(B, "bf_q", "en").map((i) => ({ kind: i.kind, id: i.id }));
  setFamilyItems(B, "bf_q", [...items].reverse());
  const ops = B.prepare(
    "SELECT * FROM sync_op WHERE kind IN ('create_family', 'set_family_items')",
  ).all();
  assert.equal(ops.length, 2);
  for (const op of ops) applyOp(A, op);
  assert.deepEqual(
    A.prepare("SELECT * FROM bar_family ORDER BY id").all(),
    B.prepare("SELECT * FROM bar_family ORDER BY id").all());
  assert.deepEqual(
    A.prepare("SELECT * FROM bar_family_item ORDER BY family_id, position").all(),
    B.prepare("SELECT * FROM bar_family_item ORDER BY family_id, position").all());
  assert.deepEqual(labelsOf(A, "bf_q"), ["who", "where", "when", "why"]);
});

test("a family item may chain one family deeper", () => {
  const db = fresh();
  createFamily(db, { id: "bf_inner", name: "where", speaks: null });
  const items = familyItems(db, "bf_q", "en");
  setFamilyItems(db, "bf_q", [
    ...items.map((i) => ({ kind: i.kind, id: i.id })),
    { kind: "family", id: "bf_inner" },
  ]);
  const last = familyItems(db, "bf_q", "en").at(-1);
  assert.equal(last.kind, "family");
  assert.equal(last.nextFamily, "bf_inner");
});
