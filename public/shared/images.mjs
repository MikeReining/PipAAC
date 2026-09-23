/**
 * Picture overrides (Language_And_Voice_Schema § 14.1, 009 slice 6).
 *
 * A family photo or another approved library image replaces one catalog
 * sense's art everywhere the sense renders — board cell, group page,
 * strip tile, library row, word card. Render order: a ready override's
 * photo_key (a `blob:` OPFS key), else its approved library image, else
 * `sense.default_image_id`, else label and color.
 *
 * `SENSE_ART_SQL` is the one expression every read site embeds — it
 * assumes the sense row is aliased `s`. Write owners record ops so a
 * replica replays the same rows.
 */
import { recordOp } from "./ops.mjs";

const newId = (p) => `${p}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
const one = (db, sql, p = []) => db.prepare(sql).all(...p)[0];

/** § 14.1 render order as a scalar SQL expression; embeds wherever a
 *  sense row is aliased `s`. Yields the key to draw — a catalog asset
 *  path or a `blob:` OPFS key — or NULL. */
export const SENSE_ART_SQL = `COALESCE(
  (SELECT o.photo_key FROM image_override o
    WHERE o.sense_id = s.id AND o.status = 'ready' AND o.photo_key IS NOT NULL),
  (SELECT i.key FROM image_override o JOIN image i ON i.id = o.image_id
    WHERE o.sense_id = s.id AND o.status = 'ready' AND i.status = 'approved'),
  (SELECT i.key FROM image i
    WHERE i.id = s.default_image_id AND i.status = 'approved')
)`;

/** Set or replace a sense's picture override: a family photo's blob key
 *  or an approved library image's id. The previous ready row supersedes;
 *  re-applying the same op id is a no-op. */
export function setImageOverride(db, { id = newId("imo"), senseId, photoKey = null, imageId = null }) {
  if ((photoKey === null) === (imageId === null)) {
    throw new Error("setImageOverride: exactly one of photoKey / imageId");
  }
  db.prepare(
    "UPDATE image_override SET status = 'superseded' WHERE sense_id = ? AND status = 'ready' AND id != ?",
  ).run(senseId, id);
  db.prepare(
    `INSERT OR IGNORE INTO image_override (id, sense_id, photo_key, image_id, status)
     VALUES (?, ?, ?, ?, 'ready')`,
  ).run(id, senseId, photoKey, imageId);
  recordOp(db, "set_image_override", { id, senseId, photoKey, imageId });
}

/** "Use our picture" — the ready override retires; the row stays. */
export function clearImageOverride(db, senseId) {
  const had = one(db,
    "SELECT id FROM image_override WHERE sense_id = ? AND status = 'ready'", [senseId]);
  if (!had) return;
  db.prepare(
    "UPDATE image_override SET status = 'superseded' WHERE sense_id = ? AND status = 'ready'",
  ).run(senseId);
  recordOp(db, "clear_image_override", { senseId });
}

/** The ready override for a sense, if any — the card needs it to show
 *  "Use our picture". */
export function imageOverrideFor(db, senseId) {
  return one(db,
    `SELECT id, photo_key, image_id FROM image_override
     WHERE sense_id = ? AND status = 'ready'`, [senseId]) ?? null;
}

/** Every approved library image for a sense — the card's "another
 *  library picture" strip. */
export function libraryImagesFor(db, senseId) {
  return db.prepare(
    `SELECT id, key FROM image
     WHERE sense_id = ? AND status = 'approved' ORDER BY key`,
  ).all(senseId);
}
