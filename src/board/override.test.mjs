/**
 * 009 slice 4 Works Test — record my own (Language_And_Voice_Schema
 * §§ 6.3, 7). The "player" under test is resolveSlot — what it hands
 * the speaker is measured, not what the code claims it stored.
 *
 * tap want → the voice's clip key. Record an override → the override
 * key. Switch the profile voice → still the override. "Use the voice
 * again" → the new voice's clip. `I want juice` — three slots, the
 * middle one the override.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { createEntity } from "../../public/shared/groups.mjs";
import { listOps, replayOps } from "../../public/shared/ops.mjs";
import { clearOverride, overrideFor, resolveSlot, setOverride } from "../../public/shared/voice.mjs";
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
const one = (db, sql, p = []) => db.prepare(sql).all(...p)[0];
const senseOf = (db, text) =>
  one(db, "SELECT sense_id FROM label WHERE text = ? AND locale = 'en' AND kind = 'lemma' AND status = 'approved'",
    [text])?.sense_id;
const lemmaUtt = (db, senseId) => one(db,
  `SELECT l.utterance_id, u.spoken_text FROM label l JOIN utterance u ON u.id = l.utterance_id
   WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'`,
  [senseId]);

test("an override wins every voice; reverting returns to the voice", () => {
  const db = openDb();
  const want = senseOf(db, "want");
  assert.ok(want, "lexicon has want");

  // Tap want → the default voice's clip key.
  let slot = resolveSlot(db, { kind: "sense", id: want }, "en", "voi_default_en");
  assert.equal(slot.type, "clip");
  const voiceKey = slot.key;
  assert.ok(voiceKey.startsWith("audio/"), `expected a catalog clip, got ${voiceKey}`);

  // Record an override for want (fixture audio bytes → blob key).
  const { utterance_id, spoken_text } = lemmaUtt(db, want);
  setOverride(db, { itemKind: "utterance", itemId: utterance_id,
    key: "blob:" + "a".repeat(64), recordedText: spoken_text });
  slot = resolveSlot(db, { kind: "sense", id: want }, "en", "voi_default_en");
  assert.equal(slot.key, "blob:" + "a".repeat(64));

  // Switch the profile voice — a second bundled voice with its own clip.
  db.prepare("INSERT INTO voice (id, locale, display_name, source, is_default, status) VALUES ('voi_second_en', 'en', 'Second', 'bundled', 0, 'active')").run();
  db.prepare("INSERT INTO clip (id, voice_id, utterance_id, recorded_text, key, status, sha256, source) VALUES ('clp_t2', 'voi_second_en', ?, ?, 'audio/second_want.mp3', 'ready', '00', 'test')")
    .run(utterance_id, spoken_text);
  slot = resolveSlot(db, { kind: "sense", id: want }, "en", "voi_second_en");
  assert.equal(slot.key, "blob:" + "a".repeat(64), "override wins every voice");

  // Use the voice again → the new voice's clip.
  clearOverride(db, "utterance", utterance_id);
  slot = resolveSlot(db, { kind: "sense", id: want }, "en", "voi_second_en");
  assert.equal(slot.key, "audio/second_want.mp3");
});

test("a sentence bar speaks three slots; the overridden middle plays the override", () => {
  const db = openDb();
  const [i, want, juice] = ["I", "want", "juice"].map((w) => senseOf(db, w));
  assert.ok(i && want && juice);
  const { utterance_id, spoken_text } = lemmaUtt(db, want);
  setOverride(db, { itemKind: "utterance", itemId: utterance_id,
    key: "blob:" + "b".repeat(64), recordedText: spoken_text });

  const played = [i, want, juice].map((s) =>
    resolveSlot(db, { kind: "sense", id: s }, "en", "voi_default_en"));
  assert.equal(played.length, 3);
  assert.ok(played[0].key.startsWith("audio/"));
  assert.equal(played[1].key, "blob:" + "b".repeat(64));
  assert.ok(played[2].key.startsWith("audio/"));
});

test("an entity override beats TTS; rename supersedes it", () => {
  const db = openDb();
  const { id } = createEntity(db, { name: "Cooper" });
  // No override → the name synthesizes.
  assert.deepEqual(
    resolveSlot(db, { kind: "entity", id }, "en", "voi_default_en"),
    { type: "tts", text: "Cooper" });
  setOverride(db, { itemKind: "entity", itemId: id,
    key: "blob:" + "c".repeat(64), recordedText: "Cooper" });
  assert.equal(resolveSlot(db, { kind: "entity", id }, "en", "voi_default_en").key,
    "blob:" + "c".repeat(64));
  // Renaming the entity retires the recording via the schema trigger.
  db.prepare("UPDATE personal_entity SET spoken_name = 'Coop' WHERE id = ?").run(id);
  assert.equal(overrideFor(db, "entity", id), null);
  assert.deepEqual(
    resolveSlot(db, { kind: "entity", id }, "en", "voi_default_en"),
    { type: "tts", text: "Coop" });
});

test("a typed word that resolves to nothing still speaks as typed", () => {
  const db = openDb();
  assert.deepEqual(
    resolveSlot(db, { kind: "typed", id: null, text: "flurgle" }, "en", "voi_default_en"),
    { type: "tts", text: "flurgle" });
});

test("re-record supersedes; override ops replay byte-identical", () => {
  const db = openDb();
  const want = senseOf(db, "want");
  const { utterance_id, spoken_text } = lemmaUtt(db, want);

  setOverride(db, { id: "ovr_1", itemKind: "utterance", itemId: utterance_id,
    key: "blob:" + "d".repeat(64), recordedText: spoken_text });
  setOverride(db, { id: "ovr_2", itemKind: "utterance", itemId: utterance_id,
    key: "blob:" + "e".repeat(64), recordedText: spoken_text });
  clearOverride(db, "utterance", utterance_id);
  setOverride(db, { id: "ovr_3", itemKind: "utterance", itemId: utterance_id,
    key: "blob:" + "f".repeat(64), recordedText: spoken_text });

  const rows = db.prepare("SELECT * FROM clip_override ORDER BY rowid").all();
  assert.equal(rows.filter((r) => r.status === "ready").length, 1);
  assert.equal(rows.filter((r) => r.status === "superseded").length, 2);
  assert.equal(overrideFor(db, "utterance", utterance_id).id, "ovr_3");

  // Replay the recorded ops into a fresh replica — same rows, same
  // order, including the supersede transitions.
  const db2 = openDb();
  replayOps(db2, listOps(db));
  assert.deepEqual(
    db2.prepare("SELECT * FROM clip_override ORDER BY rowid").all(), rows);

  // Re-applying the same op is a no-op — a dup can't supersede itself.
  const ops = listOps(db);
  replayOps(db2, ops.filter((o) => o.kind === "set_override").slice(-1));
  assert.equal(
    db2.prepare("SELECT COUNT(*) AS n FROM clip_override WHERE status='ready'").get().n, 1);
});
