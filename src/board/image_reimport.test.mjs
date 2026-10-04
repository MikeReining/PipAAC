/**
 * Regression: a persisted device DB holding old image keys (symbols/x.png)
 * must converge to the shipped keys (symbols/x.webp) on re-import, or every
 * tile 404s. Measured on the image rows the board reads (SENSE_ART_SQL).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { SENSE_ART_SQL } from "../../public/shared/images.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);

test("re-import repairs stale image keys on a persisted DB", () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  db.exec("UPDATE image SET key = replace(replace(key, '.webp', '.png'), '.svg', '.png')");
  // The bumped fingerprint reads as a shipped catalog update to the
  // 041 B2 skip gate — an unchanged catalog's re-import correctly skips.
  importCatalog(db, { ...catalog, fingerprint: catalog.fingerprint + "+webp" });
  const art = db.prepare(`SELECT ${SENSE_ART_SQL} AS art FROM sense s WHERE s.default_image_id IS NOT NULL`).all();
  assert.ok(art.length > 0);
  assert.ok(art.every((r) => !r.art?.endsWith(".png")), "no stale .png art keys");
});
