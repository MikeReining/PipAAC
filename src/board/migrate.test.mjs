/**
 * A persisted board keeps its rows when the shipped schema gains a
 * column. The lie-prone layer is migrateSchema: renaming a rebuilt
 * table recompiles triggers that still name the dropped table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { migrateSchema, ensureAdditiveColumns, ADDITIVE_COLUMNS }
  from "../../public/shared/migrate.mjs";

const schemaSql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8",
);

function facade(db) {
  return {
    exec: (s) => db.exec(s),
    all: (s, p = []) => db.prepare(s).all(...p),
    prepare: (s) => db.prepare(s),
  };
}

/** What bootDb does: migrate, then reapply the shipped schema. */
function boot(db) {
  migrateSchema(facade(db), schemaSql);
  db.exec(schemaSql);
}

test("rebuilding entity_enrichment leaves the supersede trigger working", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schemaSql);
  db.exec("DROP TABLE entity_enrichment");
  db.exec(`CREATE TABLE entity_enrichment (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    description TEXT,
    category_suggestion TEXT,
    associations TEXT,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL
  )`);
  db.prepare("INSERT INTO personal_entity (id, spoken_name) VALUES ('ent_ada', 'Ada')").run();
  db.prepare(
    `INSERT INTO entity_enrichment (id, entity_id, model, prompt_version, status)
     VALUES ('enr_ada', 'ent_ada', 'm', 'p', 'ready')`,
  ).run();

  boot(db);

  const cols = new Set(db.prepare("PRAGMA table_info(entity_enrichment)").all().map((c) => c.name));
  assert.ok(cols.has("sense_suggestion"));
  db.prepare("UPDATE personal_entity SET spoken_name = 'Ada B' WHERE id = 'ent_ada'").run();
  assert.equal(
    db.prepare("SELECT status FROM entity_enrichment WHERE id = 'enr_ada'").get().status,
    "superseded",
  );
});

test("a profile written before share_research gains the column and its default", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(schemaSql);
  const stored = db.prepare(
    "SELECT sql FROM sqlite_master WHERE name = 'learner_profile'",
  ).get().sql;
  assert.match(stored, /share_research/);
  db.exec("DROP TABLE learner_profile");
  db.exec(stored.replace(
    /\n\s*share_research INTEGER NOT NULL DEFAULT 1 CHECK \(share_research IN \(0, 1\)\),/,
    "",
  ));
  db.prepare(
    "INSERT INTO learner_profile (id, locale, preferred_voice_id) VALUES ('prf_local', 'en', 'voi_x')",
  ).run();

  boot(db);

  assert.equal(
    db.prepare("SELECT share_research FROM learner_profile WHERE id = 'prf_local'").get().share_research,
    1,
  );
});

test("a pre-spotlit event log keeps its taps and defaults the new column", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schemaSql);
  db.exec("DROP TABLE learner_event_log");
  db.exec(`CREATE TABLE learner_event_log (
    id INTEGER PRIMARY KEY,
    item_kind TEXT NOT NULL,
    item_id TEXT NOT NULL,
    selected_at INTEGER NOT NULL,
    sentence_id INTEGER,
    position INTEGER,
    source TEXT,
    tz_offset_min INTEGER
  )`);
  db.prepare(
    `INSERT INTO learner_event_log (item_kind, item_id, selected_at, source, tz_offset_min)
     VALUES ('sense', 'sns_0001', 1, 'grid', 0)`,
  ).run();

  boot(db);

  const row = db.prepare("SELECT item_id, spotlit FROM learner_event_log").get();
  assert.equal(row.item_id, "sns_0001");
  assert.equal(row.spotlit, 0);
});

/* --- 025: ensureAdditiveColumns bridges devices until the Ara
 * catalog ships the columns in schemaSql. --- */

test("a pre-025 device gains spoken_feeling and expressive_voice additively", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  // The shipped-shape tables the catalog currently embeds (pre-025).
  db.exec(`CREATE TABLE sentence (
    id INTEGER PRIMARY KEY,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    end_kind TEXT,
    tz_offset_min INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE learner_profile (
    id TEXT PRIMARY KEY,
    locale TEXT NOT NULL,
    preferred_voice_id TEXT NOT NULL
  )`);
  db.prepare(
    "INSERT INTO learner_profile (id, locale, preferred_voice_id) VALUES ('prf_local', 'en', 'voi_x')",
  ).run();

  ensureAdditiveColumns(facade(db));

  assert.equal(
    db.prepare("SELECT expressive_voice FROM learner_profile WHERE id = 'prf_local'")
      .get().expressive_voice, 1,
  );
  const sCols = db.prepare("PRAGMA table_info(sentence)").all().map((c) => c.name);
  assert.ok(sCols.includes("spoken_feeling"));
  ensureAdditiveColumns(facade(db)); // idempotent
});

test("the additive defs are verbatim schema.sql — no drift", () => {
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  for (const [table, def] of Object.entries(ADDITIVE_COLUMNS)) {
    const name = def.split(" ")[0];
    const t = schemaSql.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`);
    const i = schemaSql.indexOf(name, t);
    let e = i, depth = 0;
    for (; e < schemaSql.length; e++) {
      const c = schemaSql[e];
      if (c === "(") depth++;
      else if (c === ")") { if (depth === 0) break; depth--; }
      else if (c === "," && depth === 0) break;
    }
    assert.equal(norm(def), norm(schemaSql.slice(i, e)), `${table}.${name}`);
  }
});
