/**
 * The iOS family-media facade (phase 044 slice E3): a photo for a word
 * (PP-4), the family's own recording for a word (PP-7, LW-19) and the
 * open person's photo (PP-8). Exported from core_entry.mjs as
 * PIPCORE.media.
 *
 * Bytes never cross the bridge: Swift stores a photo or recording in the
 * blob store (Application Support/…/blobs/<sha256>, the file name the web
 * uses for `blob:<sha256>` in OPFS) and hands the core only the key. The
 * core records the override through the SAME shared owners the web calls
 * (images.setImageOverride / groups.setEntityPhoto / voice.setOverride /
 * person_name.setProfilePhoto), so the table change and the sync op land
 * together and a later sync slice uploads the bytes by that key.
 *
 * Nothing here records or listens: capture is a Swift act behind an
 * explicit press. Playback is resolveSlot — a ready override wins
 * (voice.mjs § 7.2/7.3) — through the card's cardSpeech.
 *
 * The card model carries `media` (mediaFor) so Swift never re-derives
 * which rows show. This module imports nothing from app_edit.mjs (which
 * imports mediaFor); repaints go through PIPCORE.edit at call time.
 */
import { appSession } from "./app.mjs";

const PIP = () => globalThis.PIPCORE;
const one = (d, sql, p = []) => d.prepare(sql).all(...p)[0];
const BLOB_KEY = /^blob:[0-9a-f]{64}$/;

/** word-card-voice.js `target()`: what a recording binds to — an
 *  entity's id + spoken_name, or the locale lemma's utterance +
 *  spoken_text for a catalog word. */
function voiceTarget(s, kind, id) {
  if (kind === "entity") {
    const e = one(s.d, "SELECT spoken_name FROM personal_entity WHERE id = ?", [id]);
    return e ? { itemKind: "entity", itemId: id, text: e.spoken_name } : null;
  }
  const l = one(s.d,
    `SELECT l.utterance_id, u.spoken_text FROM label l
     JOIN utterance u ON u.id = l.utterance_id
     WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?`,
    [id, s.locale]);
  return l ? { itemKind: "utterance", itemId: l.utterance_id, text: l.spoken_text } : null;
}

/** The Picture and Voice rows' state for the card (voice null when the
 *  word has nothing to bind a recording to). */
export function mediaFor(s, kind, id) {
  const t = voiceTarget(s, kind, id);
  const rec = t ? PIP().voice.latestRecording(s.d, t.itemKind, t.itemId, t.text) : null;
  const mine = t ? !!PIP().voice.overrideFor(s.d, t.itemKind, t.itemId) : false;
  const ovr = kind === "sense" ? PIP().images.imageOverrideFor(s.d, id) : null;
  return {
    // "Use our picture": only a catalog word's family photo can retire.
    canUseOurs: !!ovr?.photo_key,
    voice: t ? {
      name: one(s.d, "SELECT display_name AS n FROM voice WHERE id = ?", [s.voiceId])?.n ?? "Pip",
      text: t.text,
      hasRecording: !!rec,
      mineOn: mine,
    } : null,
  };
}

const forget = (s, kind, id) => {
  if (kind === "entity") s.entPhoto.delete(id); else s.meta.delete(id);
  PIP().edit.editInvalidate(s);
};
const repaint = (appId, kind, id, extra = {}) => ({
  ...PIP().edit.cardOpen(appId, { kind, id }), ...extra,
});

/* ---------------- picture (PP-4) ---------------- */

/** word-card-pictures.js `#wc-photo` change: a personal word's photo is
 *  saved onto the entity, a catalog word's is a picture override. */
export function cardSetPhoto(appId, { kind, id, key }) {
  const s = appSession(appId);
  if (!BLOB_KEY.test(key)) throw new Error("cardSetPhoto: not a blob key");
  if (kind === "entity") PIP().groups.setEntityPhoto(s.d, id, key);
  else PIP().images.setImageOverride(s.d, { senseId: id, photoKey: key });
  PIP().mediasync.queueUpload(key); // the bytes follow the op (SY-6)
  forget(s, kind, id);
  PIP().pics.afterPhoto(appId, { kind, id, key }); // 030 § 6.3: replacing OUR picture sends one reject
  return repaint(appId, kind, id);
}

/** "Use our picture" — the family photo retires; the catalog art returns. */
export function cardUseOurPicture(appId, { id }) {
  const s = appSession(appId);
  PIP().images.clearImageOverride(s.d, id);
  forget(s, "sense", id);
  return repaint(appId, "sense", id);
}

/* ---------------- voice (PP-7, LW-19) ---------------- */

/** A finished take, already in the blob store under `key`: it becomes
 *  the word's voice. The toast's Undo restores the voice before it. */
export function voiceSave(appId, { kind, id, key }) {
  const s = appSession(appId);
  const t = voiceTarget(s, kind, id);
  if (!t) return repaint(appId, kind, id);
  if (!BLOB_KEY.test(key)) throw new Error("voiceSave: not a blob key");
  const before = PIP().voice.overrideFor(s.d, t.itemKind, t.itemId)?.key ?? null;
  PIP().voice.setOverride(s.d, { itemKind: t.itemKind, itemId: t.itemId, key, recordedText: t.text });
  PIP().mediasync.queueUpload(key);
  const toast = PIP().edit.editToastWith(s, `Your voice plays for “${t.text}”`, () => {
    if (before) {
      PIP().voice.setOverride(s.d, {
        itemKind: t.itemKind, itemId: t.itemId, key: before, recordedText: t.text,
      });
    } else {
      PIP().voice.clearOverride(s.d, t.itemKind, t.itemId);
    }
    return PIP().edit.cardOpen(appId, { kind, id });
  });
  return repaint(appId, kind, id, { toast });
}

/** The Voice row's two choices: the board voice (`mine` false) or the
 *  family's newest recording (`mine` true). Switching back keeps the
 *  recording offered. */
export function voiceChoose(appId, { kind, id, mine }) {
  const s = appSession(appId);
  const t = voiceTarget(s, kind, id);
  if (!t) return repaint(appId, kind, id);
  if (!mine) {
    PIP().voice.clearOverride(s.d, t.itemKind, t.itemId);
  } else {
    const r = PIP().voice.latestRecording(s.d, t.itemKind, t.itemId, t.text);
    if (r && !PIP().voice.overrideFor(s.d, t.itemKind, t.itemId)) {
      PIP().voice.setOverride(s.d, {
        itemKind: t.itemKind, itemId: t.itemId, key: r.key, recordedText: t.text,
      });
    }
  }
  return repaint(appId, kind, id);
}

/* ---------------- person photo (PP-8) ---------------- */

/** person-card.js `setPhoto`: the synced profile setting. Swift writes
 *  the registry row (saveUser) beside it. `key` null removes the photo. */
export function personPhotoSet(appId, { key }) {
  const s = appSession(appId);
  if (key !== null && !BLOB_KEY.test(key)) throw new Error("personPhotoSet: not a blob key");
  PIP().personName.setProfilePhoto(s.d, key);
  if (key) PIP().mediasync.queueUpload(key);
  return { photo: PIP().personName.profilePhoto(s.d) };
}

/** The open person's synced photo key (null when none). */
export function personPhoto(appId) {
  return { photo: PIP().personName.profilePhoto(appSession(appId).d) };
}
