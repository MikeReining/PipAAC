/**
 * Device database lifecycle and board reads (schema doc §3, §6).
 * The shipped catalog JSON holds catalog tables only; device tables start
 * empty. Import order is the doc's: sense, image, utterance, label, voice,
 * clip, core cell, then profile.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");

export function createDatabase(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  return db;
}

/**
 * Insert the shipped catalog. `tiers` is the device import filter (schema
 * doc §9): only root-core senses land on-device until the illustrated
 * library phase.
 */
export function importCatalog(db, catalog, { tiers = ["root_core"] } = {}) {
  const keep = new Set(tiers);
  const senses = catalog.senses.filter((s) => keep.has(s.tier));
  const senseIds = new Set(senses.map((s) => s.id));
  const labels = catalog.labels.filter((l) => senseIds.has(l.sense_id));
  const utteranceIds = new Set(labels.map((l) => l.utterance_id));
  const utterances = catalog.utterances.filter((u) => utteranceIds.has(u.id));
  const images = catalog.images.filter((i) => senseIds.has(i.sense_id));
  const utteranceRows = new Set(utterances.map((u) => u.id));
  const clips = catalog.clips.filter((c) => utteranceRows.has(c.utterance_id));
  const cells = catalog.coreCells.filter((c) => senseIds.has(c.sense_id));

  db.exec("BEGIN");
  try {
    const insSense = db.prepare(
      "INSERT INTO sense (id, fitzgerald_role, art_archetype, tier, category, default_image_id) VALUES (?, ?, ?, ?, ?, NULL)",
    );
    for (const s of senses) {
      insSense.run(s.id, s.fitzgerald_role, s.art_archetype, s.tier, s.category);
    }

    const insImage = db.prepare(
      "INSERT INTO image (id, sense_id, key, status, sha256) VALUES (?, ?, ?, ?, ?)",
    );
    for (const i of images) insImage.run(i.id, i.sense_id, i.key, i.status, i.sha256);
    const setDefault = db.prepare("UPDATE sense SET default_image_id = ? WHERE id = ?");
    for (const s of senses) {
      if (s.default_image_id) setDefault.run(s.default_image_id, s.id);
    }

    const insUtt = db.prepare(
      "INSERT INTO utterance (id, locale, spoken_text, normalized_spoken_text, normalizer_version) VALUES (?, ?, ?, ?, ?)",
    );
    for (const u of utterances) {
      insUtt.run(u.id, u.locale, u.spoken_text, u.normalized_spoken_text, u.normalizer_version);
    }

    const insLabel = db.prepare(
      `INSERT INTO label (id, sense_id, utterance_id, locale, text, normalized_text,
         normalizer_version, kind, part_of_speech, default_for_text, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const l of labels) {
      insLabel.run(
        l.id, l.sense_id, l.utterance_id, l.locale, l.text, l.normalized_text,
        l.normalizer_version, l.kind, l.part_of_speech, l.default_for_text, l.status,
      );
    }

    const insVoice = db.prepare(
      "INSERT INTO voice (id, locale, display_name, source, engine_id, is_default, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const v of catalog.voices) {
      insVoice.run(v.id, v.locale, v.display_name, v.source, v.engine_id, v.is_default, v.status);
    }

    const insClip = db.prepare(
      "INSERT INTO clip (id, voice_id, utterance_id, recorded_text, key, status, sha256, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const c of clips) {
      insClip.run(c.id, c.voice_id, c.utterance_id, c.recorded_text, c.key, c.status, c.sha256, c.source);
    }

    const insCell = db.prepare(
      "INSERT INTO core_cell (id, layout, sense_id, slot_index) VALUES (?, ?, ?, ?)",
    );
    for (const c of cells) insCell.run(c.id, c.layout, c.sense_id, c.slot_index);

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const defaultVoice = catalog.voices.find((v) => v.is_default === 1 && v.status === "active");
  if (defaultVoice) {
    db.prepare(
      "INSERT INTO learner_profile (id, locale, preferred_voice_id) VALUES (?, ?, ?)",
    ).run("prf_local", defaultVoice.locale, defaultVoice.id);
  }
}

/** All core_cell rows, ordered — the snapshot the immutability compare uses. */
export function snapshotCoreCells(db) {
  return db
    .prepare("SELECT id, layout, sense_id, slot_index FROM core_cell ORDER BY layout, slot_index")
    .all()
    .map((r) => ({ id: r.id, layout: r.layout, sense_id: r.sense_id, slot_index: r.slot_index }));
}

/**
 * The board surface: cells of one layout joined to their approved English
 * lemma label and Fitzgerald role. The renderer reads only this.
 */
export function loadBoard(db, layout) {
  return db
    .prepare(
      `SELECT cc.slot_index, cc.sense_id, s.fitzgerald_role, l.text AS label
       FROM core_cell cc
       JOIN sense s ON s.id = cc.sense_id
       JOIN label l ON l.sense_id = cc.sense_id
         AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
       WHERE cc.layout = ?
       ORDER BY cc.slot_index`,
    )
    .all(layout);
}

/**
 * Placeholder sub-zone open (slice 1 proves the op cannot move the map;
 * fringe rows are not on-device yet, so this returns an empty zone).
 */
export function openSubZone(db, category) {
  return db
    .prepare(
      `SELECT s.id AS sense_id, l.text AS label
       FROM sense s
       JOIN label l ON l.sense_id = s.id
         AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'
       WHERE s.category = ?
       ORDER BY l.text`,
    )
    .all(category);
}

/** Placeholder suggestion apply — slice 3 implements ranking. Never writes. */
export function applySuggestion(db) {
  return db.prepare("SELECT id FROM personal_entity WHERE 0").all();
}
