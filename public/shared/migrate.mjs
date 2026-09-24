/**
 * CHECK constraints are baked into CREATE TABLE — a persisted DB keeps the
 * old list forever, and `INSERT OR IGNORE` then silently drops rows that
 * violate it (observed: function-word senses rejected under the pre-2026-09-22
 * part-of-speech list). Rebuild any table whose stored DDL differs from the
 * shipped schema. The documented-safe rebuild order is create-new → copy →
 * drop old → rename new: renaming a table rewrites foreign keys and triggers
 * that reference the old name, so we never rename the live table — the new
 * table takes the original name only after the old one is gone. Triggers and
 * indexes on the dropped table are recreated by the normal schema exec.
 *
 * `d` is the small db facade every layer here speaks:
 * { exec(sql), all(sql, params), prepare(sql).run(...) } — the browser
 * side adapts sqlite-wasm; tests hand it node:sqlite.
 */
export function migrateSchema(d, schemaSql) {
  const tables = [
    "sense", "utterance", "label", "image", "voice", "clip", "core_cell",
    "learner_profile", "personal_entity", "entity_enrichment",
    "learner_event_log", "clip_override", "image_override", "sense_mask",
    "board_group", "group_cell",
    "group_label", "sync_op", "sync_baseline", "sentence",
    "strip_impression", "spotlight_list", "spotlight_item",
    "spotlight_session", "coach_event", "core_override", "move_mark",
    "bar_family", "bar_family_item", "stats_day",
  ];
  const canon = (s) =>
    s.replace(/\s+/g, " ").replace(/;$/, "").replace("IF NOT EXISTS ", "").trim();
  const ddlFor = (t) =>
    schemaSql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`))?.[0];
  const stale = tables.filter((t) => {
    const row = d.all(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      [t],
    )[0];
    const ddl = ddlFor(t);
    return row && ddl && canon(row.sql) !== canon(ddl);
  });
  if (stale.length === 0) return;

  d.exec("PRAGMA foreign_keys = OFF");
  d.exec("BEGIN");
  try {
    for (const t of stale) {
      d.exec(ddlFor(t).replace(`TABLE IF NOT EXISTS ${t}`, `TABLE ${t}_new`));
      const cols = d.all(`PRAGMA table_info(${t}_new)`).map((c) => c.name);
      const oldCols = new Set(d.all(`PRAGMA table_info(${t})`).map((c) => c.name));
      const shared = cols.filter((c) => oldCols.has(c)).join(", ");
      if (t === "core_override" && oldCols.has("sense_id") && !oldCols.has("item_id")) {
        // Pre-polymorphic rows (014 slice 3): sense_id carried the item.
        d.exec(
          `INSERT INTO ${t}_new (layout, item_kind, item_id, slot_index)
           SELECT layout, 'sense', sense_id, slot_index FROM ${t}`,
        );
      } else {
        d.exec(`INSERT INTO ${t}_new (${shared}) SELECT ${shared} FROM ${t}`);
      }
      d.exec(`DROP TABLE ${t}`);
      d.exec(`ALTER TABLE ${t}_new RENAME TO ${t}`);
    }
    // Pre-sentence events get the device's current offset once — best
    // effort, stated as such in schema §6.2c. Their sentence_id stays
    // NULL: they never count as pairs or phrases.
    if (stale.includes("learner_event_log")) {
      d.prepare(
        "UPDATE learner_event_log SET tz_offset_min = ? WHERE tz_offset_min IS NULL",
      ).run(-new Date().getTimezoneOffset());
    }
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  } finally {
    d.exec("PRAGMA foreign_keys = ON");
  }
}
