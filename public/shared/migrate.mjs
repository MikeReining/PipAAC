/**
 * 027 § 4 — the clean break. A saved database older than this schema
 * version predates per-size group storage and is discarded whole: its
 * group rows, sync baseline and op log all carry the old shapes, and there
 * are no users to keep. Read from the SQLite header (user_version is the
 * big-endian u32 at byte 60), so the check needs no open database; bytes
 * too short to be a database count as old.
 */
export const CLEAN_BREAK_VERSION = 20;
export function beforeCleanBreak(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 64) return true;
  return ((b[60] << 24) | (b[61] << 16) | (b[62] << 8) | b[63]) >>> 0 < CLEAN_BREAK_VERSION;
}

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
    "board_group", "group_membership", "group_cell", "group_seed_install",
    "layout_shape", "group_meta", "group_seed_cell", "group_label", "sync_op", "sync_baseline", "sentence", "phrase_count",
    "strip_impression", "spotlight_list", "spotlight_item",
    "spotlight_session", "coach_event", "core_override", "move_mark",
    "bar_family", "bar_family_item", "stats_day",
  ];
  const canon = (s) =>
    s.replace(/\s+/g, " ").replace(/;$/, "").replace("IF NOT EXISTS ", "").trim();
  // A semicolon inside a `--` comment (learner_profile's book-band note)
  // must not end the statement. Stopping there hides every later column,
  // so an old database never grows them and the board dies on boot.
  const ddlFor = (t) => {
    const marker = `CREATE TABLE IF NOT EXISTS ${t}`;
    const start = schemaSql.indexOf(marker);
    if (start < 0) return undefined;
    let i = schemaSql.indexOf("(", start);
    if (i < 0) return undefined;
    let depth = 0;
    let mode = "code";
    for (; i < schemaSql.length; i++) {
      const c = schemaSql[i];
      if (mode === "line") {
        if (c === "\n") mode = "code";
        continue;
      }
      if (mode === "str") {
        if (c === "'" && schemaSql[i + 1] === "'") { i++; continue; }
        if (c === "'") mode = "code";
        continue;
      }
      if (c === "-" && schemaSql[i + 1] === "-") { mode = "line"; i++; continue; }
      if (c === "'") { mode = "str"; continue; }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          const end = schemaSql.indexOf(";", i);
          return end < 0 ? undefined : schemaSql.slice(start, end + 1);
        }
      }
    }
    return undefined;
  };
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
    // A trigger on another table that names a table we are about to drop
    // is recompiled by ALTER RENAME and fails while that name is missing
    // (entity_input_change_supersedes_enrichment → entity_enrichment).
    // The shipped schema exec right after this recreates every trigger.
    const triggers = d.all(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL",
    );
    for (const tr of triggers) {
      if (!stale.some((t) => new RegExp(`\\b${t}\\b`).test(tr.sql))) continue;
      d.exec(`DROP TRIGGER IF EXISTS "${String(tr.name).replaceAll('"', '""')}"`);
    }
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

/** 025: additive columns the shipped catalog doesn't carry yet — the
 *  strict catalog rebuild is gated on the Ara clip re-mint, so devices
 *  add them here rather than wait. The definitions are verbatim
 *  schema.sql (asserted in migrate.test.mjs). When the catalog ships
 *  them, the ALTER-shaped stored DDL still differs in text from the
 *  shipped CREATE TABLE, so migrateSchema rebuilds the table — rows
 *  preserved, canonical DDL restored. */
export const ADDITIVE_COLUMNS = {
  sentence:
    "spoken_feeling TEXT CHECK (spoken_feeling IS NULL\n"
    + "    OR spoken_feeling IN ('happy', 'sad', 'angry'))",
  learner_profile:
    "expressive_voice INTEGER NOT NULL DEFAULT 1 CHECK (expressive_voice IN (0, 1))",
};
export function ensureAdditiveColumns(d) {
  for (const [table, def] of Object.entries(ADDITIVE_COLUMNS)) {
    const name = def.split(" ")[0];
    const has = d.all(`PRAGMA table_info(${table})`)
      .some((c) => c.name === name);
    if (!has) d.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
  }
}
