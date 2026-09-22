/**
 * Personal entities (docs/product/Personal_Entities.md).
 * The record is name + photo + optional hint. No type, no edges — filing
 * comes from the context the add started in (category) or stays null
 * (My Words). The save never touches the network.
 */

const CATEGORIES = [
  "Food & Drink",
  "Body, Health & Hygiene",
  "Feelings, Emotions & Sensory States",
  "Daily Actions & Activity Verbs",
  "People, Family & Roles",
  "Places, Rooms & Community",
  "Toys, Play, Media & Leisure",
  "Home, Household Objects & Daily Tools",
  "Clothing & Accessories",
  "Animals & Nature",
  "Vehicles & Transportation",
  "Descriptors, Adjectives & Opposites",
  "Time, Calendar & Sequencing",
  "Social Etiquette, Pragmatic Interjections & Urgent/Safety",
];

export const MY_WORDS = null; // category null = the personal zone

export function listZones() {
  return CATEGORIES;
}

export function addPersonalEntity(db, { spokenName, photoKey = null, category = null, hint = null }) {
  const id = `ent_${crypto.randomUUID().replaceAll("-", "")}`;
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint) VALUES (?, ?, ?, ?, ?)",
  ).run(id, spokenName, photoKey, category, hint);
  return { id, spokenName, photoKey, category, hint };
}

/** Entities filed in one zone. `category === null` is My Words. */
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
