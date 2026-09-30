/**
 * Voice choice (Settings → Talking → Voice). Measured against the
 * catalog db: the picker offers only active voices of the profile
 * locale; the lineup is "coming soon" until a catalog voice with that
 * name ships; choosing writes the synced preferred_voice_id.
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

function fresh() {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
}

test("today: Eve + Leo in use, the remaining planned voices are coming soon", () => {
  const db = fresh();
  const { available, coming } = voiceChoices(db, "en");
  assert.equal(available.length, 2);
  assert.equal(voiceName(db, available[0].id), "Eve"); // 028: the default tile voice is named
  const leo = available.find((v) => v.id === "voi_leo_en");
  assert.ok(leo, "Leo ships as a selectable voice");
  assert.equal(voiceName(db, leo.id), "Leo");
  assert.equal(leo.group, "man"); // the lineup's Man slot, filled by keys
  assert.ok(!coming.some((v) => v.name === "Man"), "Man slot is filled — no coming-soon card");
  assert.deepEqual(
    coming.map((v) => v.name),
    VOICE_LINEUP.filter((v) => v.name !== "Man").map((v) => v.name),
  );
});

test("a shipped voice leaves coming soon and can be chosen; the choice is a synced setting", () => {
  const db = fresh();
  db.prepare(
    `INSERT INTO voice (id, locale, display_name, source, engine_id, is_default, status)
     VALUES ('voi_boy_en', 'en', 'Boy', 'bundled', NULL, 0, 'active')`,
  ).run();
  const { available, coming } = voiceChoices(db, "en");
  assert.ok(available.some((v) => v.id === "voi_boy_en" && v.group === "boy"));
  assert.ok(!coming.some((v) => v.name === "Boy"));
  setSetting(db, "preferred_voice_id", "voi_boy_en");
  assert.equal(resolveProfile(db).voiceId, "voi_boy_en");
  const op = db.prepare("SELECT args FROM sync_op WHERE kind = 'set_setting' ORDER BY rowid DESC LIMIT 1").all()[0];
  assert.match(op.args, /preferred_voice_id/);
});
