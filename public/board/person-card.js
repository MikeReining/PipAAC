/**
 * The open person's name and photo, at the top of Settings → Overview
 * (2026-10-03). The name is the synced person_name (saveUser → the
 * profile setting); the photo is the synced person_photo key, its bytes
 * on the sealed blob store like a family photo on a word. Both mirror
 * onto the people list, so the header, switcher and launch list follow.
 */
import { paintAvatar } from "./avatar.js";
import { setProfilePhoto } from "../shared/person_name.mjs";

const $ = (id) => document.getElementById(id);

export function mountPersonCard({ db, me, saveUser, savePhoto, syncUploadBlob, onChange = () => {} }) {
  function render() {
    paintAvatar($("person-avatar"), me);
    if (document.activeElement !== $("person-name")) $("person-name").value = me.name ?? "";
    $("person-photo-btn").firstChild.textContent = me.photo ? "Change photo" : "Add a photo";
    $("person-photo-rm").hidden = !me.photo;
  }

  $("person-name").addEventListener("change", async () => {
    const name = $("person-name").value.trim();
    if (!name || name === me.name) return render(); // a name can't be blank
    await saveUser({ name });
    render();
    onChange();
  });

  async function setPhoto(key) {
    setProfilePhoto(db, key);
    await saveUser({ photo: key });
    render();
    onChange();
  }

  $("person-photo").addEventListener("change", async () => {
    const file = $("person-photo").files[0];
    $("person-photo").value = "";
    if (!file) return;
    const photo = await savePhoto(file);
    if (!photo) return;
    syncUploadBlob(photo.bytes).catch(() => {});
    await setPhoto(photo.key);
  });

  $("person-photo-rm").addEventListener("click", () => setPhoto(null));

  render();
  return { render };
}
