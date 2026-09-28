/**
 * Shipped-symbol Works Test — the 2026-09-30 readiness slice. Approved
 * clipart in assets/symbols/ becomes image rows + sense.default_image_id
 * in the catalog, and the bytes are copied into public/symbols/ so
 * `/${key}` serves from the app shell.
 *
 * What is measured: the built catalog's rows point at files that exist
 * under public/, and after importCatalog the shared SENSE_ART_SQL
 * expression — the one the board cell, strip tile, group row, and word
 * card embed — resolves those keys. Coverage is counted on the home
 * board itself, not claimed from the file listing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { SENSE_ART_SQL } from "../../public/shared/images.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon,
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};

test("every shipped image row is consistent and its bytes are in public/", () => {
  assert.ok(catalog.images.length > 0, "symbols wire into image rows");

  const imageById = new Map(catalog.images.map((i) => [i.id, i]));
  assert.equal(imageById.size, catalog.images.length, "image ids are unique");

  for (const img of catalog.images) {
    assert.equal(img.status, "approved");
    assert.match(img.key, /^symbols\//);
    assert.match(img.sha256, /^[0-9a-f]{64}$/);
    // The serving claim: the file the tile will fetch exists in the bundle.
    assert.ok(
      existsSync(join(repoRoot, "public", img.key)),
      `public/${img.key} exists`,
    );
  }

  // Every default link is same-sense (the DB trigger enforces this too)
  // and only covered senses carry one.
  const covered = new Set(catalog.images.map((i) => i.sense_id));
  for (const s of catalog.senses) {
    if (s.default_image_id === null) {
      assert.ok(!covered.has(s.id), `${s.id} has an image but no default`);
      continue;
    }
    const img = imageById.get(s.default_image_id);
    assert.ok(img, `${s.id} default references a shipped image`);
    assert.equal(img.sense_id, s.id);
  }
});

test("SENSE_ART_SQL resolves the symbol on the read path the board uses", () => {
  const db = openDb();
  const artFor = (senseId) =>
    db.prepare(`SELECT ${SENSE_ART_SQL} AS art FROM sense s WHERE s.id = ?`)
      .all(senseId)[0]?.art;
  const senseOf = (text) =>
    db.prepare(
      "SELECT sense_id FROM label WHERE text = ? AND locale = 'en' AND kind = 'lemma' AND status = 'approved'",
    ).all(text)[0]?.sense_id;

  // A covered core word paints its symbol; `in` has both .png and .jpg
  // on disk — the deterministic preference ships the .png.
  assert.equal(artFor(senseOf("want")), "symbols/want.png");
  assert.equal(artFor(senseOf("in")), "symbols/in.png");
  // mom/dad ship default symbols so the board works out of the box —
  // setup or a family photo can still replace them per child.
  assert.equal(artFor(senseOf("mom")), "symbols/mom.png");
  assert.equal(artFor(senseOf("dad")), "symbols/dad.png");

  // The home board itself: every grid60 cell resolves art through the
  // same metaFor query the renderer runs per tile.
  const cells = db.prepare(
    `SELECT cc.sense_id, l.text AS label FROM core_cell cc
     JOIN label l ON l.sense_id = cc.sense_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
     WHERE cc.layout = 'grid60' ORDER BY cc.slot_index`,
  ).all();
  const expected = new Map(catalog.images.map((i) => [i.sense_id, i.key]));
  let painted = 0;
  for (const c of cells) {
    const key = expected.get(c.sense_id);
    if (key) {
      assert.equal(artFor(c.sense_id), key, `cell ${c.label} resolves its symbol`);
      painted += 1;
    } else {
      assert.equal(artFor(c.sense_id), null, `cell ${c.label}`);
    }
  }
  // Every home cell paints a picture — mom/dad included, since the
  // shipped defaults landed (1464e4c).
  const unpainted = cells.filter((c) => !expected.has(c.sense_id)).map((c) => c.label);
  assert.deepEqual(unpainted, []);
  assert.equal(painted, cells.length);
});
