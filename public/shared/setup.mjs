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
import { applyPhotoDrafts } from "./bulk.mjs";
import { createEntity, placeItem } from "./groups.mjs";
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

/** Step 1 — People. Named people (up to three) seat at mom/dad on every
 *  layout that has those cells (018 D1) and also join the People group —
 *  the step files where it says it does. Photo drafts (slice 8) join
 *  People too; a blank-named draft is skipped. */
export function applySetupPeople(db, { names = [], drafts = [], locale, category = null }) {
  const ids = names.map((n) => n.trim()).filter(Boolean).slice(0, 3)
    .map((name) => createEntity(db, { name, category }).id);
  const seated = seatSetupPeople(db, ids, locale);
  for (const id of ids) placeItem(db, "grp_people", "entity", id);
  const photos = applyPhotoDrafts(db, drafts, { groupId: "grp_people", category });
  return { people: ids.length, seated, photos: photos.saved };
}
