/**
 * A person's avatar (2026-10-03): their photo when one is set
 * (learner_profile.person_photo, mirrored on the people list as
 * `u.photo`), else the first letter of their name. One painter for the
 * Settings header, the switcher, the launch list and the people list.
 */
// The photo loader (db.js loadPhotoURL), handed in at boot so this module
// stays free of the sqlite-backed graph — the launch list paints first.
let loadPhoto = async () => null;
export function setPhotoLoader(fn) { loadPhoto = fn; }

export const initialOf = (name) => (name?.trim()?.[0] ?? "").toUpperCase();

/** Paint `el` (a .set-avatar) for a person { name, photo }. The initial
 *  shows at once; a photo replaces it when its bytes load. */
export function paintAvatar(el, { name, photo } = {}) {
  el.textContent = initialOf(name);
  el.classList.remove("has-photo");
  el.dataset.photo = photo ?? "";
  if (!photo) return;
  const want = photo;
  loadPhoto(photo).then((url) => {
    if (!url || el.dataset.photo !== want) return; // a newer paint won
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    el.replaceChildren(img);
    el.classList.add("has-photo");
  });
}
