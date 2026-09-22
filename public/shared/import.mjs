/**
 * Catalog import over a minimal db interface: { exec(sql), prepare(sql) ->
 * { run(...params) } }. Implemented by node:sqlite in tests and by the
 * sqlite-wasm oo1 adapter in the browser — one body of logic, both drivers.
 * Insert order follows schema doc §6.
 *
 * All inserts are OR IGNORE with deterministic ids, so the import is also
 * the reconcile: a persisted DB from an older catalog (pre-fringe,
 * pre-audio) converges on re-run without a destructive reset.
 */
import { seedGroups } from "./groups.mjs";

export function importCatalog(db, catalog, { tiers = ["root_core", "primary_fringe"] } = {}) {
  const keep = new Set(tiers);
  const senses = catalog.senses.filter((s) => keep.has(s.tier));
  const senseIds = new Set(senses.map((s) => s.id));
  const labels = catalog.labels.filter((l) => senseIds.has(l.sense_id));
  const utteranceIds = new Set(labels.map((l) => l.utterance_id));
  const utterances = catalog.utterances.filter((u) => utteranceIds.has(u.id));
  const images = catalog.images.filter((i) => senseIds.has(i.sense_id));
  const clips = catalog.clips.filter((c) => utteranceIds.has(c.utterance_id));
  const cells = catalog.coreCells.filter((c) => senseIds.has(c.sense_id));

  db.exec("BEGIN");
  try {
    const insSense = db.prepare(
      "INSERT OR IGNORE INTO sense (id, fitzgerald_role, art_archetype, tier, category, default_image_id) VALUES (?, ?, ?, ?, ?, NULL)",
    );
    for (const s of senses) {
      insSense.run(s.id, s.fitzgerald_role, s.art_archetype, s.tier, s.category);
    }

    const insImage = db.prepare(
      "INSERT OR IGNORE INTO image (id, sense_id, key, status, sha256) VALUES (?, ?, ?, ?, ?)",
    );
    for (const i of images) insImage.run(i.id, i.sense_id, i.key, i.status, i.sha256);
    const setDefault = db.prepare("UPDATE sense SET default_image_id = ? WHERE id = ?");
    for (const s of senses) {
      if (s.default_image_id) setDefault.run(s.default_image_id, s.id);
    }

    const insUtt = db.prepare(
      "INSERT OR IGNORE INTO utterance (id, locale, spoken_text, normalized_spoken_text, normalizer_version) VALUES (?, ?, ?, ?, ?)",
    );
    for (const u of utterances) {
      insUtt.run(u.id, u.locale, u.spoken_text, u.normalized_spoken_text, u.normalizer_version);
    }

    const insLabel = db.prepare(
      `INSERT OR IGNORE INTO label (id, sense_id, utterance_id, locale, text, normalized_text,
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
      "INSERT OR IGNORE INTO voice (id, locale, display_name, source, engine_id, is_default, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const v of catalog.voices) {
      insVoice.run(v.id, v.locale, v.display_name, v.source, v.engine_id, v.is_default, v.status);
    }

    const insClip = db.prepare(
      "INSERT OR IGNORE INTO clip (id, voice_id, utterance_id, recorded_text, key, status, sha256, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const c of clips) {
      insClip.run(c.id, c.voice_id, c.utterance_id, c.recorded_text, c.key, c.status, c.sha256, c.source);
    }

    const insCell = db.prepare(
      "INSERT OR IGNORE INTO core_cell (id, layout, sense_id, slot_index) VALUES (?, ?, ?, ?)",
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
      "INSERT OR IGNORE INTO learner_profile (id, locale, preferred_voice_id) VALUES (?, ?, ?)",
    ).run("prf_local", defaultVoice.locale, defaultVoice.id);
  }

  // Groups: built-in groups and their seeded cells. The seed is the
  // reconcile — caregiver edits always win, and a seeded item is never
  // dropped (groups.mjs).
  seedGroups(db, catalog);
}
