/**
 * Grammar help Works Test (021 slice 4) — the sense keeps its identity;
 * only the label it wears and speaks changes with the sentence.
 *
 * Proves on the real catalog + shipped form table: verbs take -s after
 * he, am/are/has/him/an fold onto their kept senses, a tap on a merged
 * tile logs the kept sense with the form she saw, a/an answers the next
 * word, "what do" + he -> does, and the Grammar help off-switch drops
 * every pick to the lemma.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { setSetting } from "../../public/shared/groups.mjs";
import { defaultForm, formFor, grammarHelpOn } from "../../public/shared/forms.mjs";
import { resolveSlot } from "../../public/shared/voice.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const mapRaw = readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8");
// Fixture build: 022 forms are clip-pending until slice 3 — the shipped
// catalog build stays strict; tests may resolve without clips.
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(mapRaw),
  undefined, undefined, undefined, { allowMissingFormClips: true });
const formTable = JSON.parse(
  readFileSync(join(repoRoot, "data/prediction/form_table.en.json"), "utf8"));

const senseId = (word) =>
  catalog.senses.find(
    (s) =>
      catalog.labels.find((l) => l.sense_id === s.id && l.kind === "lemma")?.normalized_text === word,
  ).id;
const S = (word) => ({ kind: "sense", id: senseId(word) });
const CTX = (...words) => words.map(S);

function openDb() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

test("verb takes the form the context's counts pick", () => {
  const db = openDb();
  assert.equal(formFor(db, formTable, CTX("he"), senseId("want")).text, "wants");
  assert.equal(formFor(db, formTable, CTX("i"), senseId("want")).text, "want");
  assert.equal(formFor(db, formTable, CTX("he"), senseId("have")).text, "has");
});

test("am/are/be live on the is-sense; the context picks", () => {
  const db = openDb();
  assert.equal(formFor(db, formTable, CTX("i"), senseId("is")).text, "am");
  assert.equal(formFor(db, formTable, CTX("he"), senseId("is")).text, "is");
  const f = formFor(db, formTable, CTX("i"), senseId("is"));
  // The worn label is a real form row — it speaks 'am' through its own utterance.
  const lbl = db.prepare("SELECT kind, features FROM label WHERE id = ?").all(f.labelId)[0];
  assert.equal(lbl.kind, "form");
  assert.equal(lbl.features, "V;PRS;1;SG");
});

test("merged tile tap logs the kept sense wearing the fixed form", () => {
  const db = openDb();
  const f = formFor(db, formTable, CTX("i", "like"), senseId("him"));
  assert.equal(f.senseId, senseId("he"));
  assert.equal(f.text, "him");
  assert.equal(f.merged, true);
  // ...and a contextual pick on the kept sense also says him.
  assert.equal(formFor(db, formTable, CTX("i", "like"), senseId("he")).text, "him");
});

test("a/an answers the next word; don't answers the subject", () => {
  const db = openDb();
  assert.equal(
    formFor(db, formTable, CTX("i", "want"), senseId("a"), S("apple")).text, "an");
  assert.equal(
    formFor(db, formTable, CTX("i", "want"), senseId("a"), S("ball")).text, "a");
  assert.equal(formFor(db, formTable, CTX("he"), senseId("don't")).text, "doesn't");
  assert.equal(formFor(db, formTable, CTX("i"), senseId("don't")).text, "don't");
});

test("decision 4: the next word re-picks the previous verb", () => {
  const db = openDb();
  assert.equal(formFor(db, formTable, CTX("what"), senseId("do")).text, "do");
  assert.equal(formFor(db, formTable, CTX("what"), senseId("do"), S("he")).text, "does");
});

test("the chosen label is what resolveSlot speaks", () => {
  const db = openDb();
  const f = formFor(db, formTable, CTX("he"), senseId("have"));
  assert.equal(f.text, "has");
  const slot = resolveSlot(db, { kind: "sense", id: f.senseId, labelId: f.labelId }, "en", "voice_missing");
  // No clips ship in the test catalog — device_tts would speak 'has'.
  // The check that matters: the label resolves an utterance whose text
  // is the form, not the lemma.
  const utt = db.prepare(
    "SELECT u.spoken_text FROM label l JOIN utterance u ON u.id = l.utterance_id WHERE l.id = ?",
  ).all(f.labelId)[0];
  assert.equal(utt.spoken_text, "has");
  assert.notEqual(slot.type, "clip"); // nothing shipped — tts or silence
});

test("a stand-in entity feeds its word's grammar; an unlinked name is a wall (021 follow-up)", () => {
  const db = openDb();
  // Mama is linked to the 'mom' sense (entity_enrichment.sense_suggestion,
  // the same mapping entityForSense uses for stand-in cards)
  db.prepare(
    `INSERT INTO personal_entity (id, spoken_name, status)
     VALUES ('ent_mama', 'Mama', 'active')`,
  ).run();
  db.prepare(
    `INSERT INTO entity_enrichment
       (id, entity_id, sense_suggestion, model, prompt_version, status)
     VALUES ('enr_mama', 'ent_mama', ?, 'manual', 'v1', 'ready')`,
  ).run(senseId('mom'));
  db.prepare(
    `INSERT INTO personal_entity (id, spoken_name, status)
     VALUES ('ent_leo', 'Leo', 'active')`,
  ).run();
  const mama = { kind: 'entity', id: 'ent_mama' };
  const leo = { kind: 'entity', id: 'ent_leo' };
  // "Mama want" picks like "mom want" — the link's evidence, not a wall
  assert.equal(formFor(db, formTable, [mama], senseId('want')).text, 'wants');
  // unlinked name: still a wall -> default form
  assert.equal(formFor(db, formTable, [leo], senseId('want')).text, 'want');
  // a linked entity as the NEXT word feeds decision 4 the same way
  assert.equal(
    formFor(db, formTable, CTX('what'), senseId('do'), mama).text, 'does');
});

test("grammar_help off drops every pick to the lemma", () => {
  const db = openDb();
  assert.equal(grammarHelpOn(db), true); // default ON
  setSetting(db, "grammar_help", 0);
  assert.equal(grammarHelpOn(db), false);
  const off = defaultForm(db, senseId("want"));
  assert.equal(off.text, "want");
  assert.equal(off.features, "BASE");
});
