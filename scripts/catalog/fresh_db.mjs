/**
 * 041 B1 — the ready-made new-person database. `buildFreshDb` runs the
 * exact sequence public/db.js would run on first boot (schema → additive
 * columns → importCatalog), so a fresh device deserializes the result
 * instead of replaying ~20k inserts. `dumpHash` gives --check a
 * deterministic comparison — the file's bytes carry a change counter
 * and freelist state, so the honest gate is table content, not bytes.
 *
 * sync_op is emptied before sealing: the seed_install op the build just
 * recorded describes a machine that isn't a device — every replica
 * derives built-in groups from its own import, so the op is noise with
 * a fake origin. The shipped file carries the applied state only.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync, unlinkSync, existsSync } from "node:fs";

import { importCatalog } from "../../public/shared/import.mjs";
import { ensureAdditiveColumns } from "../../public/shared/migrate.mjs";

export function buildFreshDb(catalog, file) {
  if (existsSync(file)) unlinkSync(file);
  const raw = new DatabaseSync(file);
  // The shared modules speak the db.js facade ({exec, prepare, all});
  // node:sqlite covers exec+prepare, `all` wraps prepare().all().
  const db = {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => raw.prepare(sql),
    all: (sql, params = []) => raw.prepare(sql).all(...params),
  };
  // Mirror of bootDb's fresh path: foreign keys first (schema.sql sets
  // user_version), canonical DDL, additive columns, then the import.
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(catalog.schemaSql);
  ensureAdditiveColumns(db);
  importCatalog(db, catalog);
  db.exec("DELETE FROM sync_op");
  db.exec("VACUUM");
  raw.close();
}

/** Content hash over every table's ordered rows — what --check compares. */
export function dumpHash(file) {
  const db = new DatabaseSync(file, { readonly: true });
  const h = createHash("sha256");
  const tables = db.prepare(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map((r) => r.name);
  for (const t of tables) {
    h.update(`${t}\0`);
    for (const row of db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all()) {
      h.update(`${JSON.stringify(row)}\0`);
    }
  }
  db.close();
  return h.digest("hex");
}
