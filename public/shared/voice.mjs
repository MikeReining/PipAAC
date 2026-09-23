/**
 * Voice overrides and slot resolution (Language_And_Voice_Schema
 * §§ 6.3, 7.2–7.4).
 *
 * An override is a caregiver recording of one utterance or one personal
 * name — it wins over every catalog voice for that item until "Use the
 * voice again". Re-recording supersedes the previous row; the bytes
 * stay. The op log carries the intent so replicas land identically.
 *
 * resolveSlot answers the only question the player cares about: what
 * does this tapped item play? — a clip key, a TTS text, or silence.
 */
import { recordOp } from "./ops.mjs";

const newId = (p) => `${p}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
const one = (db, sql, p = []) => db.prepare(sql).all(...p)[0];

/** Record or re-record an override. `id` is part of the op so replicas
 *  write the same row; re-applying the same op is a no-op. */
export function setOverride(db, { id = newId("ovr"), itemKind, itemId, key, recordedText }) {
  const col = itemKind === "entity" ? "entity_id" : "utterance_id";
  db.prepare(
    `UPDATE clip_override SET status = 'superseded'
     WHERE ${col} = ? AND status = 'ready' AND id != ?`,
  ).run(itemId, id);
  db.prepare(
    `INSERT OR IGNORE INTO clip_override
       (id, utterance_id, entity_id, recorded_text, key, status)
     VALUES (?, ?, ?, ?, ?, 'ready')`,
  ).run(id, itemKind === "entity" ? null : itemId,
    itemKind === "entity" ? itemId : null, recordedText, key);
  recordOp(db, "set_override", { id, itemKind, itemId, key, recordedText });
}

/** "Use the voice again" — the ready override retires; bytes stay. */
export function clearOverride(db, itemKind, itemId) {
  const col = itemKind === "entity" ? "entity_id" : "utterance_id";
  const had = one(db,
    `SELECT id FROM clip_override WHERE ${col} = ? AND status = 'ready'`, [itemId]);
  if (!had) return;
  db.prepare(
    `UPDATE clip_override SET status = 'superseded'
     WHERE ${col} = ? AND status = 'ready'`,
  ).run(itemId);
  recordOp(db, "clear_override", { itemKind, itemId });
}

/** The ready override for an item, if any — the card needs it to show
 *  "Use the voice again" and to re-record. */
export function overrideFor(db, itemKind, itemId) {
  const col = itemKind === "entity" ? "entity_id" : "utterance_id";
  return one(db,
    `SELECT id, key, recorded_text FROM clip_override
     WHERE ${col} = ? AND status = 'ready'`, [itemId]) ?? null;
}

/**
 * § 7.2 — a sense resolves through the locale's lemma label to its
 * utterance: a ready override wins; else the resolved voice's ready
 * clip whose recorded_text equals spoken_text; a device_tts voice
 * synthesizes; a bundled voice without a clip is silence.
 *
 * § 7.3 — an entity's override wins; else the name synthesizes (the
 * bundled library cannot contain Cooper — entities have always spoken
 * through the device voice, so TTS is the fallback regardless of the
 * resolved voice's source).
 *
 * item: { kind: 'sense'|'entity', id }. Returns
 * { type: 'clip', key } | { type: 'tts', text } | { type: 'silence' }.
 */
export function resolveSlot(db, item, locale, voiceId) {
  if (item.kind === "sense") {
    const label = one(db,
      `SELECT l.utterance_id, u.spoken_text FROM label l
       JOIN utterance u ON u.id = l.utterance_id
       WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved'
         AND l.locale = ?`,
      [item.id, locale]);
    if (!label) return { type: "silence" };
    const ovr = one(db,
      "SELECT key FROM clip_override WHERE utterance_id = ? AND status = 'ready'",
      [label.utterance_id]);
    if (ovr) return { type: "clip", key: ovr.key };
    const clip = one(db,
      `SELECT key FROM clip
       WHERE utterance_id = ? AND voice_id = ? AND status = 'ready'
         AND recorded_text = ?`,
      [label.utterance_id, voiceId, label.spoken_text]);
    if (clip) return { type: "clip", key: clip.key };
    const source = one(db, "SELECT source FROM voice WHERE id = ?", [voiceId])?.source;
    return source === "device_tts"
      ? { type: "tts", text: label.spoken_text }
      : { type: "silence" };
  }
  if (item.kind === "typed") {
    // Keyboard text that resolved to no sense or entity — speak what
    // was typed, exactly as written.
    return item.text ? { type: "tts", text: item.text } : { type: "silence" };
  }
  const ent = one(db,
    "SELECT spoken_name FROM personal_entity WHERE id = ?", [item.id]);
  if (!ent) return { type: "silence" };
  const ovr = one(db,
    "SELECT key FROM clip_override WHERE entity_id = ? AND status = 'ready'",
    [item.id]);
  if (ovr) return { type: "clip", key: ovr.key };
  return { type: "tts", text: ent.spoken_name };
}
