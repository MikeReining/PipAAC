/**
 * Catalog import over a minimal db interface: { exec(sql), prepare(sql) ->
 * { run(...params) } }. Implemented by node:sqlite in tests and by the
 * sqlite-wasm oo1 adapter in the browser — one body of logic, both drivers.
 * Insert order follows schema doc §6.
 *
 * All inserts are OR IGNORE with deterministic ids, so the import is also
 * the reconcile: a persisted DB from an older catalog (pre-fringe,
 * pre-audio) converges on re-run without a destructive reset.
 *
 * Order matters at the end (027 § 4): catalog tables and seeded families,
 * then the sync rebase baseline, then the group seed — installed once, as
 * an op, so the baseline holds no groups and replicas converge on the
 * first install the relay confirms. A reimport never touches installed
 * groups.
 */
import { installSeedGroups } from "./groups.mjs";
import { ensureBaseline } from "./ops.mjs";

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
      `INSERT INTO sense (id, fitzgerald_role, art_archetype, tier, category, default_image_id, negation)
       VALUES (?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         fitzgerald_role = excluded.fitzgerald_role,
         art_archetype = excluded.art_archetype,
         tier = excluded.tier,
         category = excluded.category,
         negation = excluded.negation`,
    );
    for (const s of senses) {
      insSense.run(s.id, s.fitzgerald_role, s.art_archetype, s.tier, s.category, s.negation ?? 0);
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
         normalizer_version, kind, part_of_speech, features, default_for_text, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const l of labels) {
      insLabel.run(
        l.id, l.sense_id, l.utterance_id, l.locale, l.text, l.normalized_text,
        l.normalizer_version, l.kind, l.part_of_speech, l.features ?? null, l.default_for_text, l.status,
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

    // The shipped coordinate map. Adult placements live in core_override
    // and are not touched. INSERT OR IGNORE cannot move a slot an older
    // map already holds, and a sense whose stored tier is still fringe
    // aborts the whole import (core_cell_root_only) — a device saved
    // before that word joined the core board never opens.
    const layouts = [...new Set(cells.map((c) => c.layout))];
    const clearLayout = db.prepare("DELETE FROM core_cell WHERE layout = ?");
    for (const layout of layouts) clearLayout.run(layout);
    const insCell = db.prepare(
      "INSERT INTO core_cell (id, layout, sense_id, slot_index) VALUES (?, ?, ?, ?)",
    );
    for (const c of cells) insCell.run(c.id, c.layout, c.sense_id, c.slot_index);

    // Group geometry and metadata (027 § 3.2): each size's shape and frame
    // cells, which sizes and settings a built-in group answers to, and the
    // authored seed positions — catalog tables, replaced wholesale.
    db.exec("DELETE FROM layout_shape");
    const insShape = db.prepare("INSERT INTO layout_shape (layout, cols, rows, frame) VALUES (?, ?, ?, ?)");
    for (const [name, l] of Object.entries(catalog.layouts ?? {})) {
      insShape.run(name, l.cols, l.rows, JSON.stringify(l.frame ?? []));
    }
    db.exec("DELETE FROM group_meta");
    const insMeta = db.prepare("INSERT INTO group_meta (group_id, layouts, occasion) VALUES (?, ?, ?)");
    for (const g of catalog.groups ?? []) {
      insMeta.run(g.id, g.layouts ? JSON.stringify(g.layouts) : null, g.occasion ? 1 : 0);
    }
    db.exec("DELETE FROM group_seed_cell");
    const insSeedCell = db.prepare(
      `INSERT INTO group_seed_cell (group_id, layout, item_kind, item_id, page, slot_index)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const c of catalog.groupCells ?? []) {
      insSeedCell.run(c.group_id, c.layout, c.item_kind, c.item_id, c.page, c.slot_index);
    }
    // Catalog-owned group names, replaced on every import — a caregiver's
    // rename lives in board_group.name and always wins.
    const insGroupLabel = db.prepare(
      "INSERT OR REPLACE INTO group_label (group_id, locale, text) VALUES (?, ?, ?)",
    );
    for (const gl of catalog.groupLabels ?? []) insGroupLabel.run(gl.group_id, gl.locale, gl.text);

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

  // Smart bar families (014 § 5): the family row reconciles like sense
  // rows — a family's contents land once below, and the adult's
  // reorder/remove owns those item rows; the face itself
  // (name/glyph/speaks) has no adult edit path, so a shipped rename
  // reaches existing installs.
  for (const f of catalog.families ?? []) {
    db.prepare(
      `INSERT INTO bar_family (id, name, glyph, speaks, builtin) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         glyph = excluded.glyph,
         speaks = excluded.speaks`,
    ).run(f.id, f.name, f.glyph ?? null, f.speaks ?? null);
  }
  const seededFamilies = new Set();
  for (const it of catalog.familyItems ?? []) {
    // Position is caregiver-owned once any row exists — seeding only an
    // empty family is what keeps a regen from re-appending moved words.
    if (!seededFamilies.has(it.family_id)) {
      const has = db.prepare(
        "SELECT 1 AS x FROM bar_family_item WHERE family_id = ? LIMIT 1",
      ).all(it.family_id)[0];
      if (has) continue;
      seededFamilies.add(it.family_id);
    }
    db.prepare(
      "INSERT OR IGNORE INTO bar_family_item (family_id, position, item_kind, item_id) VALUES (?, ?, ?, ?)",
    ).run(it.family_id, it.position, it.item_kind, it.item_id);
  }

  ensureBaseline(db);
  installSeedGroups(db, catalog);
}
