/**
 * Voice choice (Settings → Talking → Voice). Measured against the
 * catalog db: the picker offers only active voices of the profile
 * locale; the lineup is "coming soon" until the catalog voice with that
 * key ships; choosing writes the synced preferred_voice_id.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { VOICE_LINEUP, voiceChoices, voiceName } from "../../public/shared/voices.mjs";
import { setSetting } from "../../public/shared/groups.mjs";
import { resolveProfile } from "../../public/shared/profile.mjs";

const catalog = JSON.parse(readFileSync(join(import.meta.dirname, "../../data/catalog/catalog.json"), "utf8"));
const tileVoices = JSON.parse(readFileSync(join(import.meta.dirname, "../../data/catalog/tile_voices.json"), "utf8"));

function fresh() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

test("today: Pip, Leo, Mia, Sam, Tom, Zoe in use; Rey, Joy are coming soon", () => {
  const db = fresh();
  const { available, coming } = voiceChoices(db, "en");
  assert.deepEqual(available.map((v) => voiceName(db, v.id)), ["Pip", "Leo", "Mia", "Sam", "Tom", "Zoe"]); // default first, then alphabetical
  assert.equal(available[0].id, "voi_default_en");
  assert.equal(available.find((v) => v.id === "voi_leo_en").note, "Grown-up, male");
  assert.equal(available.find((v) => v.id === "voi_eve_en").note, "Younger, female");
  assert.equal(available.find((v) => v.id === "voi_sam_en").note, "Younger, male");
  assert.equal(available.find((v) => v.id === "voi_zoe_en").note, "Southern, female");
  assert.equal(available.find((v) => v.id === "voi_tom_en").note, "British, male");
  assert.deepEqual(coming.map((v) => v.name), ["Rey", "Joy"]);
});

test("every lineup voice is linked to its ElevenLabs voice id in tile_voices.json", () => {
  const rows = new Map(tileVoices.voices.map((v) => [v.voice_key, v]));
  for (const { key, name, isDefault } of VOICE_LINEUP) {
    if (isDefault) continue; // the default voice is found by is_default, not a key literal (locale gate)
    const row = rows.get(key);
    assert.ok(row, `${key} is in tile_voices.json`);
    assert.equal(row.display_name, name);
    assert.equal(row.provider, "elevenlabs");
    if (row.status === "active") assert.match(row.voice_id, /^[A-Za-z0-9]{20}$/);
  }
  assert.equal(rows.get("voi_default_en").display_name, "Pip");
  assert.equal(rows.get("voi_default_en").voice_id, "WWMMC6k9tdar0BthUenK");
  assert.equal(rows.get("voi_leo_en").voice_id, "4sAJvpuF0iHhO9nptfOD");
  assert.equal(rows.get("voi_eve_en").voice_id, "94pmIckCYkqYPVrgIvUH");
  assert.equal(rows.get("voi_sam_en").voice_id, "M5U4lAuMpwU8AGX0x6l2");
  assert.equal(rows.get("voi_zoe_en").voice_id, "fkNQrdHI0J7vOhlSK5fE");
  assert.equal(rows.get("voi_tom_en").voice_id, "RliWjSXK3mZtypIjNgvO");
  assert.equal(rows.get("voi_rey_en").voice_id, "eb1698hSoNbHSWKDmVLe");
  assert.equal(rows.get("voi_joy_en").voice_id, "hdbWhKwBTlcfklhVvUW0");
});

test("a shipped voice leaves coming soon and can be chosen; the choice is a synced setting", () => {
  const db = fresh();
  // Mia ships in the seed catalog since 2026-10-03 — no insert needed.
  const { available, coming } = voiceChoices(db, "en");
  assert.ok(available.some((v) => v.id === "voi_eve_en" && v.note === "Younger, female"));
  assert.ok(!coming.some((v) => v.name === "Mia"));
  setSetting(db, "preferred_voice_id", "voi_eve_en");
  assert.equal(resolveProfile(db).voiceId, "voi_eve_en");
  const op = db.prepare("SELECT args FROM sync_op WHERE kind = 'set_setting' ORDER BY rowid DESC LIMIT 1").all()[0];
  assert.match(op.args, /preferred_voice_id/);
});

test("a re-import renames a voice an older catalog installed (stale → Pip)", () => {
  const db = fresh();
  db.prepare("UPDATE voice SET display_name = 'Pippy' WHERE id = 'voi_default_en'").run();
  importCatalog(db, catalog);
  assert.equal(voiceName(db, "voi_default_en"), "Pip");
});
