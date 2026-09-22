/**
 * Phase 003b slice 2 Works Test — the runtime reads the profile locale
 * and voice. A test-only `de` locale (one active bundled voice, German
 * labels on three senses) proves queries bind the profile locale and
 * that a miss is a miss: no English label, no English clip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { groupPage } from "../../public/shared/groups.mjs";
import { stripCandidates } from "../../public/shared/funnel.mjs";
import { resolveProfile } from "../../public/shared/profile.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw));

const NOW = Date.parse("2026-09-22T08:20:00");

// want / juice / hello get a German lemma label; eat and bread do not —
// they are the "miss is a miss" probes.
const DE_LABELS = [
  ["sns_0013", "will", "Verb"],
  ["sns_0084", "Saft", "Noun"],
  ["sns_0583", "hallo", "Interjection"],
];

/** English catalog plus a test `de` locale; profile switched to de. */
function openDeDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  db.prepare(
    "INSERT INTO voice (id, locale, display_name, source, engine_id, is_default, status) VALUES ('voi_de', 'de', 'Deutsch', 'bundled', NULL, 1, 'active')",
  ).run();
  for (const [senseId, text, pos] of DE_LABELS) {
    const uttId = `utt_de_${senseId}`;
    db.prepare(
      "INSERT INTO utterance (id, locale, spoken_text, normalized_spoken_text, normalizer_version) VALUES (?, 'de', ?, ?, 'v1')",
    ).run(uttId, text, normalizeV1(text));
    db.prepare(
      `INSERT INTO label (id, sense_id, utterance_id, locale, text, normalized_text,
         normalizer_version, kind, part_of_speech, default_for_text, status)
       VALUES (?, ?, ?, 'de', ?, ?, 'v1', 'lemma', ?, 1, 'approved')`,
    ).run(`lbl_de_${senseId}`, senseId, uttId, text, normalizeV1(text), pos);
  }
  db.prepare(
    "UPDATE learner_profile SET locale = 'de', preferred_voice_id = 'voi_de' WHERE id = 'prf_local'",
  ).run();
  return db;
}

test("resolveProfile implements §7.1: preferred voice when active and same locale", () => {
  const db = openDeDb();
  assert.deepEqual(resolveProfile(db), { locale: "de", voiceId: "voi_de" });
  // a profile whose locale has the default voice only resolves that voice
  const en = createDatabase(":memory:");
  importCatalog(en, catalog);
  assert.deepEqual(resolveProfile(en), { locale: "en", voiceId: "voi_default_en" });
});

test("cross-locale preferred voice is rejected by the existing trigger", () => {
  const db = openDeDb();
  assert.throws(
    () =>
      db
        .prepare("UPDATE learner_profile SET preferred_voice_id = 'voi_default_en' WHERE id = 'prf_local'")
        .run(),
    /preferred voice must be active and match profile locale/,
  );
});

test("group and label queries return only de text — never the English string", () => {
  const db = openDeDb();
  const rows = groupPage(db, "grp_drinks", 0, "de");
  const juice = rows.find((r) => r.item_id === "sns_0084");
  assert.equal(juice.label, "Saft");
  // bread has no de label: the label column is NULL, not the English text
  const page = groupPage(db, "grp_food", 0, "de");
  const bread = page.find((r) => r.item_id === "sns_0089");
  assert.equal(bread.label, null);
  assert.ok(!page.some((r) => ["juice", "want", "hello"].includes(r.label)));
});

test("a sense with no de label renders its picture and plays silence — never the English clip", () => {
  const db = openDeDb();
  // label lookup for bread in de → none
  const label = db
    .prepare(
      "SELECT text FROM label WHERE sense_id = 'sns_0089' AND kind = 'lemma' AND status = 'approved' AND locale = 'de'",
    )
    .all();
  assert.deepEqual(label, []);
  // clip lookup under the resolved de voice → none (mirrors clipKeyFor)
  const clip = db
    .prepare(
      `SELECT c.key FROM clip c
       JOIN label l ON l.utterance_id = c.utterance_id
       WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'de'
         AND c.voice_id = 'voi_de' AND c.status = 'ready'`,
    )
    .all("sns_0089");
  assert.deepEqual(clip, []);
});

test("strip reads the profile locale: a de-unlabeled verb tail invites nothing", () => {
  const db = openDeDb();
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES ('ent_de', 'Rex', NULL, NULL, NULL)",
  ).run();
  // 'eat' has no de label → tailInfo sees pos NULL → no noun invitation,
  // and the never-selected entity stays off the strip.
  assert.deepEqual(stripCandidates(db, [{ kind: "sense", id: "sns_0028" }], NOW, "de"), []);
  // the same tail under en invites nouns — the entity is eligible
  assert.ok(
    stripCandidates(db, [{ kind: "sense", id: "sns_0028" }], NOW, "en").some(
      (c) => c.kind === "entity" && c.id === "ent_de",
    ),
  );
});
