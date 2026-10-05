/** Read-through metadata caches the renderers share: sense → {role,
 *  art}, transform token → art key, entity → role and photo, sense →
 *  part of speech, and the sense-row lookup. Everything invalidates on
 *  a sync drain — board.js clears the Maps wholesale. */
import { normalizeV1 } from "../shared/normalize.mjs";
import { wordLemmaCandidates } from "../shared/txbar.mjs";
import { SENSE_ART_SQL } from "../shared/images.mjs";
import { loadPhotoURL } from "../db.js";

const ALL = (db, sql, p = []) => db.all(sql, p);

export function mountMetaCache({ db, locale }) {
  /** Cache: sense id → { role, art } — the label-strip color and the
   *  approved symbol key (null while no art is shipped). */
  const senseMeta = new Map();
  function metaFor(senseId) {
    if (!senseMeta.has(senseId)) {
      senseMeta.set(
        senseId,
        ALL(
          db,
          `SELECT s.fitzgerald_role AS role, ${SENSE_ART_SQL} AS art
           FROM sense s WHERE s.id = ?`,
          [senseId],
        )[0] ?? { role: null, art: null },
      );
    }
    return senseMeta.get(senseId);
  }

  /** Cache: normalized transform token → art key | null. A model-supplied
   *  word that resolves to a label ("wanted" lemmas to want) shows that
   *  sense's symbol — the bar stays readable after a transform. The item
   *  stays typed; the art is display only. */
  const wordArt = new Map();
  function artForWord(word) {
    const w = normalizeV1(
      String(word).replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, ""));
    if (!w) return null;
    if (!wordArt.has(w)) {
      let art = null;
      for (const cand of wordLemmaCandidates(w)) {
        const row = ALL(
          db,
          `SELECT l.sense_id FROM label l
           WHERE l.normalized_text = ? AND l.locale = ? AND l.status = 'approved'
           ORDER BY (l.kind = 'lemma') DESC, l.default_for_text DESC LIMIT 1`,
          [cand, locale],
        )[0];
        if (row) { art = metaFor(row.sense_id).art; break; }
      }
      wordArt.set(w, art);
    }
    return wordArt.get(w);
  }

  /** Cache: entity id → fitzgerald_role — the family's kind pick (018 D7),
   *  neutral until classified. */
  const entityRole = new Map();
  function roleForEntity(entityId) {
    if (!entityRole.has(entityId)) {
      entityRole.set(
        entityId,
        ALL(db, "SELECT fitzgerald_role AS r FROM personal_entity WHERE id = ?",
          [entityId])[0]?.r ?? "None",
      );
    }
    return entityRole.get(entityId);
  }

  /** Cache: entity id → photo_key (entities are few; the row rarely changes). */
  const entityPhoto = new Map();
  function photoFor(entityId) {
    if (!entityPhoto.has(entityId)) {
      entityPhoto.set(
        entityId,
        ALL(db, "SELECT photo_key FROM personal_entity WHERE id = ?", [entityId])[0]
          ?.photo_key ?? null,
      );
    }
    return entityPhoto.get(entityId);
  }

  /** Cache: sense id → lemma part_of_speech (noun-test for the whose rule). */
  const sensePos = new Map();
  function posOfSense(senseId) {
    if (!sensePos.has(senseId)) {
      sensePos.set(senseId, ALL(db,
        `SELECT part_of_speech AS p FROM label
         WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = ?`,
        [senseId, locale])[0]?.p ?? null);
    }
    return sensePos.get(senseId);
  }

  const senseById = (senseId) =>
    ALL(
      db,
      `SELECT s.id, l.text AS label, s.fitzgerald_role FROM sense s
       JOIN label l ON l.sense_id = s.id
         AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
       WHERE s.id = ?`,
      [locale, senseId],
    )[0];

  /** A word's picture as an image URL, for surfaces that draw words
   *  off the board (Progress, the color report): the sense's art, or
   *  the family photo for an entity. `photo` means cover-fit. */
  async function artUrlOf(kind, id) {
    const art = kind === "sense" ? metaFor(id).art : kind === "entity" ? photoFor(id) : null;
    if (!art) return null;
    if (!art.startsWith("blob:")) return { url: `/${art}`, photo: false };
    const url = await loadPhotoURL(art);
    return url ? { url, photo: true } : null;
  }

  return {
    senseMeta, wordArt, entityRole, entityPhoto, sensePos,
    metaFor, artForWord, roleForEntity, photoFor, posOfSense, senseById, artUrlOf,
  };
}
