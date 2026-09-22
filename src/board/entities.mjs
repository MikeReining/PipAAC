/**
 * Personal entities (docs/product/Personal_Entities.md).
 * The record is name + photo + optional hint. No type, no edges — filing
 * comes from the group the add started in (a group_cell row); category is
 * the record's home category, a classifier input only. The save never
 * touches the network.
 */

export const MY_WORDS = null; // category null = no home category recorded

export function addPersonalEntity(db, { spokenName, photoKey = null, category = null, hint = null }) {
  const id = `ent_${crypto.randomUUID().replaceAll("-", "")}`;
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES (?, ?, ?, ?, ?)",
  ).run(id, spokenName, photoKey, category, hint);
  return { id, spokenName, photoKey, category, hint };
}

/** Entities recorded with one home category. `category === null` lists
 *  entities with none (the My Words default). */
export function listEntities(db, category) {
  if (category === null) {
    return db
      .prepare(
        "SELECT id, spoken_name, photo_key, category, hint FROM personal_entity WHERE category IS NULL ORDER BY spoken_name",
      )
      .all()
      .map((r) => ({ ...r }));
  }
  return db
    .prepare(
      "SELECT id, spoken_name, photo_key, category, hint FROM personal_entity WHERE category = ? ORDER BY spoken_name",
    )
    .all(category)
    .map((r) => ({ ...r }));
}
