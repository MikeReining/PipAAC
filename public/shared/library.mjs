/**
 * The Word Library's read side (docs/product/Word_Library.md § 3).
 * Every function is a SELECT — the Library cannot write; edits happen on
 * the word card. Runs against a query_only connection unchanged.
 *
 * Row shape: { kind: 'sense'|'entity', id, label, role, photo_key, art }
 * — enough to draw a picture row and to open the word card.
 */

import { SENSE_ART_SQL } from "./images.mjs";

const all = (db, sql, params = []) => db.prepare(sql).all(...params);

const LEMMA = "l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?";

/**
 * Added — everything the family added or changed, newest first:
 * active entities (by creation), catalog senses placed in a custom group
 * or My Words (by earliest such placement), senses with a recording
 * override, and senses with a picture override (by override row order).
 * `added_at` may be null on rows from before the column; rowid order
 * stands in for them.
 */
export function libraryAdded(db, locale) {
  return all(
    db,
    `SELECT * FROM (
       SELECT 'entity' AS kind, e.id, e.spoken_name AS label, COALESCE(e.fitzgerald_role, 'Yellow') AS role,
              e.photo_key, NULL AS art,
              COALESCE(e.added_at, e.rowid) AS ord
       FROM personal_entity e
       WHERE e.status = 'active'
       UNION ALL
       SELECT 'sense', s.id, l.text, s.fitzgerald_role, NULL,
              ${SENSE_ART_SQL},
              MIN(COALESCE(gm.added_at, gm.rowid))
       FROM group_membership gm
       JOIN board_group g ON g.id = gm.group_id AND g.kind IN ('custom', 'my_words')
       JOIN sense s ON s.id = gm.item_id AND gm.item_kind = 'sense'
       JOIN label l ON l.sense_id = s.id AND ${LEMMA}
       GROUP BY s.id
       UNION ALL
       SELECT 'sense', s.id, l.text, s.fitzgerald_role, NULL,
              ${SENSE_ART_SQL},
              MIN(o.rowid)
       FROM clip_override o
       JOIN label l ON l.utterance_id = o.utterance_id AND ${LEMMA}
       JOIN sense s ON s.id = l.sense_id
       GROUP BY s.id
       UNION ALL
       SELECT 'sense', s.id, l.text, s.fitzgerald_role, NULL,
              ${SENSE_ART_SQL},
              MIN(o.rowid)
       FROM image_override o
       JOIN sense s ON s.id = o.sense_id
       JOIN label l ON l.sense_id = s.id AND ${LEMMA}
       GROUP BY s.id
     )
     ORDER BY ord DESC`,
    [locale, locale, locale],
  );
}

/**
 * All — every catalog sense (approved lemma label) and every active
 * entity, alphabetical. Retired entities are absent; a hidden/masked
 * sense still lists here (masking is a board state, not a deletion).
 */
export function libraryAll(db, locale) {
  return all(
    db,
    `SELECT * FROM (
       SELECT 'entity' AS kind, e.id, e.spoken_name AS label, COALESCE(e.fitzgerald_role, 'Yellow') AS role,
              e.photo_key, NULL AS art
       FROM personal_entity e
       WHERE e.status = 'active'
       UNION ALL
       SELECT 'sense', s.id, l.text, s.fitzgerald_role, NULL,
              ${SENSE_ART_SQL}
       FROM sense s
       JOIN label l ON l.sense_id = s.id AND ${LEMMA}
     )
     ORDER BY label COLLATE NOCASE`,
    [locale],
  );
}

/**
 * Suggested — words the device heard that the child does not have yet.
 * Empty until partner listening lands (009 slice 10 / phase 008).
 */
export function librarySuggested(db, locale) {
  return [];
}

/**
 * Search across everything — labels and spoken names in the profile
 * locale, prefix matches before substring matches (§ 3). The field is
 * shared by the tabs; a non-empty query searches the whole library.
 */
export function librarySearch(db, text, locale, normalize) {
  const q = normalize(text);
  if (!q) return [];
  return all(
    db,
    `SELECT * FROM (
       SELECT 'entity' AS kind, e.id, e.spoken_name AS label, COALESCE(e.fitzgerald_role, 'Yellow') AS role,
              e.photo_key, NULL AS art, e.spoken_name AS hay
       FROM personal_entity e
       WHERE e.status = 'active'
       UNION ALL
       SELECT 'sense', s.id, l.text, s.fitzgerald_role, NULL,
              ${SENSE_ART_SQL},
              l.normalized_text
       FROM sense s
       JOIN label l ON l.sense_id = s.id AND l.status = 'approved' AND l.locale = ?
     )
     WHERE hay LIKE '%' || ? || '%'
     ORDER BY (hay LIKE ? || '%') DESC, hay`,
    [locale, q, q],
  );
}

/** The group names a row sits in — the list's "in …" subtitle. */
export function libraryHomes(db, kind, id, locale) {
  return all(
    db,
    `SELECT COALESCE(g.name, gl.text) AS name
     FROM group_membership gm
     JOIN board_group g ON g.id = gm.group_id
     LEFT JOIN group_label gl ON gl.group_id = g.id AND gl.locale = ?
     WHERE gm.item_kind = ? AND gm.item_id = ?
     ORDER BY g.index_slot`,
    [locale, kind, id],
  ).map((r) => r.name);
}
