/**
 * 028 slice 2 — resolveSlot's new contract (phase doc § 5.1):
 *  - entity: override wins; bundled voice → tileclip; device_tts → tts
 *  - typed: bundled voice → tileclip; device_tts → tts
 *  - sense: unchanged (clip / device_tts tts / bundled silence)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { createEntity } from "../../public/shared/groups.mjs";
import { resolveSlot, setOverride } from "../../public/shared/voice.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon,
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

const openDb = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  db.prepare(
    `INSERT INTO voice (id, locale, display_name, source, engine_id, is_default, status)
     VALUES ('voi_dev_en', 'en', 'Device', 'device_tts', 'com.device', 0, 'active')`,
  ).run();
  return db;
};

test("entity resolves to tileclip in a bundled voice; override still wins", () => {
  const db = openDb();
  createEntity(db, { id: "ent_cooper", name: "Cooper" });

  let slot = resolveSlot(db, { kind: "entity", id: "ent_cooper" }, "en", "voi_default_en");
  assert.deepEqual(slot, {
    type: "tileclip", voice: "voi_default_en", locale: "en", text: "Cooper",
  });

  // The family's own recording always wins — never the shared clip.
  setOverride(db, { itemKind: "entity", itemId: "ent_cooper",
    key: "blob:" + "c".repeat(64), recordedText: "Cooper" });
  slot = resolveSlot(db, { kind: "entity", id: "ent_cooper" }, "en", "voi_default_en");
  assert.equal(slot.type, "clip");
  assert.equal(slot.key, "blob:" + "c".repeat(64));
});

test("a device_tts voice keeps its tts slot — the family's own choice", () => {
  const db = openDb();
  createEntity(db, { id: "ent_cooper", name: "Cooper" });
  assert.deepEqual(
    resolveSlot(db, { kind: "entity", id: "ent_cooper" }, "en", "voi_dev_en"),
    { type: "tts", text: "Cooper" });
  assert.deepEqual(
    resolveSlot(db, { kind: "typed", text: "grumble" }, "en", "voi_dev_en"),
    { type: "tts", text: "grumble" });
});

test("typed words resolve to tileclip; empty typed is silence", () => {
  const db = openDb();
  assert.deepEqual(
    resolveSlot(db, { kind: "typed", text: "grumble" }, "en", "voi_default_en"),
    { type: "tileclip", voice: "voi_default_en", locale: "en", text: "grumble" });
  assert.deepEqual(
    resolveSlot(db, { kind: "typed", text: "" }, "en", "voi_default_en"),
    { type: "silence" });
});

test("sense resolution is untouched: clip, device tts, bundled silence", () => {
  const db = openDb();
  const want = db.prepare(
    `SELECT sense_id AS id FROM label WHERE text = 'want'
       AND kind = 'lemma' AND status = 'approved' AND locale = 'en'`,
  ).all()[0]?.id;
  assert.ok(want);
  // default bundled voice ships the clip
  assert.equal(
    resolveSlot(db, { kind: "sense", id: want }, "en", "voi_default_en").type, "clip");
  // a bundled voice with no clip is silence (catalog_lazy is slice 8)
  db.prepare(
    `INSERT INTO voice (id, locale, display_name, source, is_default, status)
     VALUES ('voi_second_en', 'en', 'Second', 'bundled', 0, 'active')`,
  ).run();
  assert.deepEqual(
    resolveSlot(db, { kind: "sense", id: want }, "en", "voi_second_en"),
    { type: "silence" });
  // device tts still synthesizes the label
  assert.equal(
    resolveSlot(db, { kind: "sense", id: want }, "en", "voi_dev_en").type, "tts");
});
