/**
 * The person's name syncs (learner_profile.person_name, 2026-10-02): a
 * name set or changed on a device records the synced setting, and the
 * device's people list follows the profile at boot and after each sync —
 * so a card restore or a newly linked device knows who this is. A rename
 * made for a person who wasn't open (Team & devices) waits in the people
 * list as nameDirty and lands on their next open.
 *
 * The photo follows the same way (learner_profile.person_photo,
 * 2026-10-03): a blob:<sha> key set while the person is open; the people
 * list keeps a copy for the switcher and the launch list.
 */
import { setSetting } from "./groups.mjs";

const MAX = 80;

export const profileName = (db) =>
  db.prepare("SELECT person_name AS n FROM learner_profile WHERE id = 'prf_local'").all()[0]?.n
    ?? null;

/** A saveUser patch carrying a name → the synced setting, once. */
export function nameToProfile(db, patch) {
  const name = patch?.name?.trim().slice(0, MAX);
  if (name && name !== profileName(db)) setSetting(db, "person_name", name);
}

export const profilePhoto = (db) =>
  db.prepare("SELECT person_photo AS p FROM learner_profile WHERE id = 'prf_local'").all()[0]?.p
    ?? null;

/** Set or clear (null) the open person's photo — the synced setting. */
export function setProfilePhoto(db, key) {
  if ((key ?? null) !== profilePhoto(db)) setSetting(db, "person_photo", key ?? null);
}

/** Reconcile the people list (`me`) with the synced profile. */
export async function followProfileName(db, me, saveUser) {
  const synced = profileName(db);
  if (me.nameDirty || (!synced && me.name)) {
    if (me.name) nameToProfile(db, { name: me.name });
    if (me.nameDirty) await saveUser({ nameDirty: false });
  } else if (synced && synced !== me.name) {
    await saveUser({ name: synced });
  }
  const photo = profilePhoto(db);
  if (photo !== (me.photo ?? null)) await saveUser({ photo });
}
