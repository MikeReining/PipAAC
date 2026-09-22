/**
 * Playback wiring test — the bundled voice's clips resolve per schema §7.2.
 *
 * Proves: every grid60 cell's sense resolves to a ready clip under the
 * default bundled voice whose recorded_text equals the utterance's
 * spoken_text (the trigger's own invariant), and the clip key points at a
 * file the app actually ships (public/audio/<key> exists).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog, loadBoard } from "./catalog.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

function resolveClipKey(db, senseId) {
  return db
    .prepare(
      `SELECT c.key FROM clip c
       JOIN label l ON l.utterance_id = c.utterance_id
       WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
         AND c.voice_id = 'voi_default_en' AND c.status = 'ready'`,
    )
    .all(senseId)[0]?.key ?? null;
}

test("every grid60 cell resolves to a ready clip whose bytes ship in public/audio", () => {
  const db = openDb();
  const board = loadBoard(db, "grid60");
  assert.equal(board.length, 60);
  for (const cell of board) {
    const key = resolveClipKey(db, cell.sense_id);
    assert.ok(key, `no ready clip for "${cell.label}"`);
    assert.ok(existsSync(join(repoRoot, "public", key)), `missing file: ${key}`);
  }
});

test("clip rows carry utterance-matching recorded_text and a real sha256", () => {
  const db = openDb();
  const bad = db
    .prepare(
      `SELECT c.id FROM clip c JOIN utterance u ON u.id = c.utterance_id
       WHERE c.recorded_text != u.spoken_text OR length(c.sha256) != 64`,
    )
    .all();
  assert.deepEqual(bad, []);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM clip").get().n, 75);
});
