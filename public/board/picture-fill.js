/**
 * 029 § 4.1 / § 5 — one path that gives a personal word its picture.
 * The word card and Paste a list both call `autoFill`; it asks the
 * Picture Finder (030), applies a close picture (free), draws when the
 * rule says so, and sets the inferred kind — never overwriting anything
 * the adult already chose. Offline or a finder outage parks the word in
 * a small pending list that drains on reconnect and at boot.
 *
 * A picture is saved onto the entity like a photo (bytes → blob store →
 * set_entity_photo op), so it works offline and syncs.
 */
import { setEntityPhoto, setEntityRole } from "../shared/groups.mjs";
import { pictureAction, roleForKind } from "../shared/pictures.mjs";

const PENDING_KEY = "pip-pic-pending";
const TRANSIENT = new Set(["offline", "unavailable", "fair_use"]);

export function mountPictureFill({
  db, all, locale, client, creds, savePhoto, syncUploadBlob, onChanged,
  storage = globalThis.localStorage,
}) {
  const entity = (id) => all(db,
    "SELECT id, spoken_name, hint, photo_key, fitzgerald_role, status FROM personal_entity WHERE id = ?",
    [id])[0] ?? null;

  const readPending = () => {
    try { return new Set(JSON.parse(storage?.getItem(PENDING_KEY) ?? "[]")); } catch { return new Set(); }
  };
  const writePending = (set) => {
    try { storage?.setItem(PENDING_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
  };
  const park = (id) => { const s = readPending(); s.add(id); writePending(s); };
  const unpark = (id) => { const s = readPending(); if (s.delete(id)) writePending(s); };

  /** Save picture bytes as the entity's picture. `force` is the adult's
   *  own choice; an automatic fill never replaces an existing picture. */
  async function applyBlob(entityId, blob, { force = false } = {}) {
    const e = entity(entityId);
    if (!e || e.status !== "active" || !blob) return false;
    if (e.photo_key && !force) return false;
    const photo = await savePhoto(blob);
    if (!photo) return false;
    syncUploadBlob(photo.bytes).catch(() => {});
    if (!force && entity(entityId)?.photo_key) return false; // the adult got there first
    setEntityPhoto(db, entityId, photo.key);
    onChanged?.(entityId);
    return true;
  }

  /** Set Jev's kind only while the adult has never chosen one. */
  function inferKind(entityId, kind) {
    const role = roleForKind(kind);
    const e = entity(entityId);
    if (!role || !e || e.fitzgerald_role != null) return false;
    setEntityRole(db, entityId, role);
    onChanged?.(entityId);
    return true;
  }

  /** Find → kind → apply | draw | leave the choice to the adult.
   *  Returns { found, act, applied?, drawn?, error? } for the card to
   *  paint; `onState` reports "finding" / "drawing" as they start. */
  async function autoFill(entityId, { onState, found: given = null } = {}) {
    const e = entity(entityId);
    if (!e || e.status !== "active") return { error: "gone" };
    const { userId, license } = await creds();
    onState?.("finding");
    const found = given ?? await client.find({
      userId, license, text: e.spoken_name, description: e.hint, locale,
    });
    if (found.error) {
      if (TRANSIENT.has(found.error)) park(entityId);
      return { error: found.error };
    }
    unpark(entityId);
    inferKind(entityId, found.kind);
    const act = pictureAction(found);
    if (entity(entityId)?.photo_key) return { found, act };

    if (act.kind === "apply") {
      const blob = await client.imageBlob({ userId, license, asset: act.picture.asset });
      if (!blob) {
        // The finder answered, so we're online: that one picture is
        // missing. Let the adult choose instead of retrying forever.
        return { found, act: { kind: "choose", others: act.others } };
      }
      const ok = await applyBlob(entityId, blob);
      return { found, act, applied: ok ? { imageId: act.picture.image_id, how: "auto" } : null };
    }
    if (act.kind === "draw") {
      onState?.("drawing");
      const r = await client.draw({ userId, license, text: e.spoken_name, description: e.hint, locale });
      if (!r.ok) {
        if (TRANSIENT.has(r.reason)) park(entityId);
        return { found, act, error: r.reason, left: r.left ?? null };
      }
      const ok = await applyBlob(entityId, r.blob);
      return {
        found, act,
        applied: ok ? { imageId: r.imageId, how: "draw" } : null,
        drawn: { cache: r.cache, left: r.left },
      };
    }
    return { found, act };
  }

  /** Reconnect/boot: retry parked words, one at a time. */
  async function drainPending() {
    for (const id of readPending()) {
      const r = await autoFill(id).catch(() => ({ error: "offline" }));
      if (r.error && TRANSIENT.has(r.error)) break; // still offline — keep the rest
      if (r.error) unpark(id); // gone, unsafe, no allowance: nothing to retry
    }
  }

  return { autoFill, applyBlob, inferKind, drainPending, park, pending: readPending };
}
