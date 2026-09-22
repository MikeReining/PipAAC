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

import { importCatalog } from "../../public/shared/import.mjs";
import { groupPage } from "../../public/shared/groups.mjs";

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");

export { importCatalog };

export function createDatabase(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  return db;
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
 * Group page open (phase 003): items at their fixed (page, slot) inside
 * one group, via the groups module. Read-only — writes nothing.
 */
export function openGroup(db, groupId, page = 0) {
  return groupPage(db, groupId, page);
}

/** Placeholder suggestion apply — slice 3 implements ranking. Never writes. */
export function applySuggestion(db) {
  return db.prepare("SELECT id FROM personal_entity WHERE 0").all();
}
