/**
 * 043 G Works Test — the language boundary. The defect: `labelsFor`
 * read every approved label regardless of locale, so a German lemma on
 * a shared sense could surface on an English board (the "Saft" bug).
 *
 * Proof shape mirrors the shipped design: one catalog carries labels
 * in every language on the same language-independent senses; the
 * profile's speaking language decides what the board shows, forms
 * pick, and speech resolves. ~20 German lemmas on real senses, an
 * English profile on the same database untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { defaultForm, formFor } from "../../public/shared/forms.mjs";
import { resolveSlot } from "../../public/shared/voice.mjs";
import { normalizeV1 } from "../../public/shared/normalize.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw),
  undefined, undefined, undefined, { allowMissingFormClips: true });
const formTable = JSON.parse(
  readFileSync(join(repoRoot, "data/prediction/form_table.en.json"), "utf8"));

const senseId = (word) =>
  catalog.senses.find(
    (s) =>
      catalog.labels.find((l) => l.sense_id === s.id && l.kind === "lemma")?.normalized_text === word,
  )?.id;

/* The small German vocabulary — ~20 lemmas on existing senses, exactly
 * the shape a real German package ships (de labels + de utterances +
 * one bundled de voice). */
const DE_WORDS = {
  juice: "Saft", apple: "Apfel", water: "Wasser", bread: "Brot",
  milk: "Milch", cookie: "Keks", banana: "Banane", dog: "Hund",
  cat: "Katze", ball: "Ball", book: "Buch", mom: "Mama",
  dad: "Papa", eat: "essen", drink: "trinken", go: "gehen",
  want: "wollen", more: "mehr", help: "helfen", play: "spielen",
};

const DE_VOICE = "voi_de_default";

function openDb({ german = true } = {}) {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  if (german) {
    let n = 0;
    for (const [en, de] of Object.entries(DE_WORDS)) {
      n += 1;
      const sid = senseId(en);
      const enLabel = catalog.labels.find(
        (l) => l.sense_id === sid && l.kind === "lemma");
      db.prepare(
        `INSERT INTO utterance (id, locale, spoken_text, normalized_spoken_text, normalizer_version)
         VALUES (?, 'de', ?, ?, 'v1')`,
      ).run(`utt_de_${String(n).padStart(3, "0")}`, de, normalizeV1(de));
      db.prepare(
        `INSERT INTO label (id, sense_id, utterance_id, locale, text,
           normalized_text, normalizer_version, kind, part_of_speech,
           features, default_for_text, status)
         VALUES (?, ?, ?, 'de', ?, ?, 'v1', 'lemma', ?, NULL, 1, 'approved')`,
      ).run(`lbl_de_${String(n).padStart(3, "0")}`, sid,
        `utt_de_${String(n).padStart(3, "0")}`, de, normalizeV1(de),
        enLabel.part_of_speech);
    }
    db.prepare(
      `INSERT INTO voice (id, locale, display_name, source, engine_id, is_default, status)
       VALUES (?, 'de', 'Standard', 'bundled', NULL, 1, 'active')`,
    ).run(DE_VOICE);
    // One real clip so the speech path resolves bytes, not silence.
    db.prepare(
      `INSERT INTO clip (id, voice_id, utterance_id, recorded_text, key, status, sha256, source)
       VALUES ('clp_de_001', ?, 'utt_de_001', 'Saft', 'test/saft.mp3', 'ready', 'deadbeef', 'test')`,
    ).run(DE_VOICE);
  }
  return db;
}

const speakGerman = (db) => {
  db.prepare(
    "UPDATE learner_profile SET locale = 'de', preferred_voice_id = ? WHERE id = 'prf_local'",
  ).run(DE_VOICE);
};

test("the Saft defect: a German lemma on a shared sense never reaches the English board", () => {
  const db = openDb();
  // The database now holds BOTH locales on the juice sense — the exact
  // catalog shape that shipped the bug. English must see only English.
  assert.equal(defaultForm(db, senseId("juice")).text, "juice");
  assert.equal(formFor(db, formTable, [], senseId("juice")).text, "juice");
  // And no German text leaks through any sense's worn label.
  for (const en of Object.keys(DE_WORDS)) {
    assert.equal(defaultForm(db, senseId(en)).text, en);
  }
});

test("a German-speaking profile shows the German lemmas end-to-end", () => {
  const db = openDb();
  speakGerman(db);
  for (const [en, de] of Object.entries(DE_WORDS)) {
    assert.equal(defaultForm(db, senseId(en)).text, de, `${en} should read ${de}`);
  }
});

test("forms fall to the lemma for a locale with no form table", () => {
  const db = openDb();
  speakGerman(db);
  // No de form rows and no de answer table: the pick is BASE → lemma.
  const f = formFor(db, formTable, [], senseId("want"));
  assert.equal(f.text, "wollen");
  assert.equal(f.features, "BASE");
});

test("speech resolves the German utterance and clip, never the English one", () => {
  const db = openDb();
  speakGerman(db);
  const f = defaultForm(db, senseId("juice"));
  const slot = resolveSlot(db, { kind: "sense", id: senseId("juice"), labelId: f.labelId }, "de", DE_VOICE);
  assert.equal(slot.type, "clip");
  assert.equal(slot.text, "Saft");
  assert.equal(slot.key, "test/saft.mp3");
});

test("switching back to English restores English — the cache never crosses", () => {
  const db = openDb();
  speakGerman(db);
  assert.equal(defaultForm(db, senseId("juice")).text, "Saft");
  const enVoice = catalog.voices.find((v) => v.is_default === 1 && v.status === "active");
  db.prepare(
    "UPDATE learner_profile SET locale = 'en', preferred_voice_id = ? WHERE id = 'prf_local'",
  ).run(enVoice.id);
  assert.equal(defaultForm(db, senseId("juice")).text, "juice");
});
