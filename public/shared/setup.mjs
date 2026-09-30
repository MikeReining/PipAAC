/**
 * 009 slice 11 — first-run setup, "Tell us about their world"
 * (Word_Library § 5.6). Four short steps, each skippable; every step
 * files into the matching built-in group through the same owners as a
 * single add — createEntity + placeItem — so a setup word is an ordinary
 * op like any other edit and syncs identically.
 *
 * Favorite foods file into Snack: 026/027 retired the Food door and
 * spread food across the meal boards — Snack is the anytime board the
 * child requests from between meals, and "Add to other boards" can put
 * a favorite on a meal page later (027 B9).
 */
import { createEntity, placeItem, renameEntity, setEntityPhoto } from "./groups.mjs";
import { seatSetupPeople } from "./coremove.mjs";

/** Step key → the built-in group it files into. The single truth for
 *  the wizard UI and the offline Works Test. */
export const SETUP_STEPS = [
  { key: "people", groupId: "grp_people" },
  { key: "pets", groupId: "grp_animals" },
  { key: "foods", groupId: "grp_snack" },
  { key: "places", groupId: "grp_going_out" },
];

export const stepGroup = (key) =>
  SETUP_STEPS.find((s) => s.key === key)?.groupId;

/** Step 1 — who is already in People, oldest first: the wizard opens
 *  on these rows, so a second pass edits the family instead of
 *  re-adding it. */
export function setupPeople(db) {
  return db.prepare(
    `SELECT e.id, e.spoken_name AS name, e.photo_key AS photoKey
     FROM group_membership gm
     JOIN personal_entity e ON e.id = gm.item_id
     WHERE gm.group_id = 'grp_people' AND gm.item_kind = 'entity'
       AND e.status = 'active'
     ORDER BY gm.added_at, e.id`,
  ).all();
}

/** Step 1 — People. Each row is a face and a name. A row with an `id`
 *  is someone already here: a new name renames them, a new photo
 *  replaces their face, a blank name changes nothing (the wizard never
 *  removes anyone). A row without an `id` and with a name is a new
 *  person: they join the People group and take a free mom/dad seat on
 *  every layout that has one (018 D1). */
export function applySetupPeople(db, { people = [], locale, category = null }) {
  let updated = 0;
  const added = [];
  for (const p of people) {
    const name = p.name?.trim() ?? "";
    if (!name) continue;
    if (p.id) {
      const cur = db.prepare(
        "SELECT spoken_name AS name, photo_key AS photoKey FROM personal_entity WHERE id = ?",
      ).all(p.id)[0];
      if (!cur) continue;
      let changed = false;
      if (cur.name !== name) { renameEntity(db, p.id, name); changed = true; }
      if (p.photoKey && p.photoKey !== cur.photoKey) {
        setEntityPhoto(db, p.id, p.photoKey);
        changed = true;
      }
      if (changed) updated++;
      continue;
    }
    const { id } = createEntity(db, { name, photoKey: p.photoKey ?? null, category });
    placeItem(db, "grp_people", "entity", id);
    added.push(id);
  }
  const seated = seatSetupPeople(db, added, locale);
  return { added: added.length, updated, seated };
}
