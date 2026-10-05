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

/** A family that picked a device voice keeps it — their choice, never
 *  our fallback (028 § 5.1: tts survives only for source='device_tts'). */
const isDeviceTts = (db, voiceId) =>
  one(db, "SELECT source FROM voice WHERE id = ?", [voiceId])?.source === "device_tts";

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

/** Back to the board voice — the ready override retires; bytes stay. */
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
 *  which voice the Voice row marks chosen. */
export function overrideFor(db, itemKind, itemId) {
  const col = itemKind === "entity" ? "entity_id" : "utterance_id";
  return one(db,
    `SELECT id, key, recorded_text FROM clip_override
     WHERE ${col} = ? AND status = 'ready'`, [itemId]) ?? null;
}

/** The family's newest recording for an item, ready or not — the card
 *  keeps "Your voice" offered after a switch back to the app's voice.
 *  Only a recording of `text` counts: a renamed word's old take says
 *  the old name. */
export function latestRecording(db, itemKind, itemId, text) {
  const col = itemKind === "entity" ? "entity_id" : "utterance_id";
  return one(db,
    `SELECT id, key, recorded_text, status FROM clip_override
     WHERE ${col} = ? AND recorded_text = ? ORDER BY rowid DESC LIMIT 1`,
    [itemId, text]) ?? null;
}

/**
 * § 7.2 — a sense resolves through the locale's lemma label to its
 * utterance: a ready override wins; else the resolved voice's ready
 * clip whose recorded_text equals spoken_text; a device_tts voice
 * synthesizes; a bundled voice without a clip is silence.
 *
 * § 7.3 — an entity's override wins; else the name resolves to the tile
 * voice library (028): { type: 'tileclip', voice, locale, text } played
 * through voice_tile.mjs. Device TTS answers only when the resolved
 * voice is a device_tts voice — a family's choice, never the fallback
 * for a bundled voice.
 *
 * item: { kind: 'sense'|'entity'|'typed', id }. Returns
 * { type: 'clip'|'tts'|'tileclip'|'silence', ... }.
 */
export function resolveSlot(db, item, locale, voiceId) {
  if (item.kind === "sense") {
    // 021: the item's chosen label wins — a form tap (wants, him) speaks
    // its own utterance; items logged without a label resolve the lemma.
    const label = item.labelId
      ? one(db,
          `SELECT l.utterance_id, u.spoken_text FROM label l
           JOIN utterance u ON u.id = l.utterance_id
           WHERE l.id = ?`,
          [item.labelId])
      : one(db,
          `SELECT l.utterance_id, u.spoken_text FROM label l
           JOIN utterance u ON u.id = l.utterance_id
           WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved'
             AND l.locale = ?`,
          [item.id, locale]);
    if (!label) return { type: "silence" };
    const ovr = one(db,
      "SELECT key FROM clip_override WHERE utterance_id = ? AND status = 'ready'",
      [label.utterance_id]);
    // `text` rides along so a clip the element refuses to play (autoplay
    // policy, a dead file) still speaks through the device voice.
    if (ovr) return { type: "clip", key: ovr.key, text: label.spoken_text };
    const clip = one(db,
      `SELECT key FROM clip
       WHERE utterance_id = ? AND voice_id = ? AND status = 'ready'
         AND recorded_text = ?`,
      [label.utterance_id, voiceId, label.spoken_text]);
    if (clip) return { type: "clip", key: clip.key, text: label.spoken_text };
    const source = one(db, "SELECT source FROM voice WHERE id = ?", [voiceId])?.source;
    return source === "device_tts"
      ? { type: "tts", text: label.spoken_text }
      : { type: "silence" };
  }
  if (item.kind === "typed") {
    // 028: keyboard text that resolved to no sense or entity plays its
    // minted tile clip; silence on any failure, never a TTS fallback.
    if (!item.text) return { type: "silence" };
    return isDeviceTts(db, voiceId)
      ? { type: "tts", text: item.text }
      : { type: "tileclip", voice: voiceId, locale, text: item.text };
  }
  const ent = one(db,
    "SELECT spoken_name FROM personal_entity WHERE id = ?", [item.id]);
  if (!ent) return { type: "silence" };
  const ovr = one(db,
    "SELECT key FROM clip_override WHERE entity_id = ? AND status = 'ready'",
    [item.id]);
  if (ovr) return { type: "clip", key: ovr.key, text: ent.spoken_name };
  // 028: personal names resolve to the tile library clip (minted at
  // add/rename) — device TTS only when the family chose a device voice.
  return isDeviceTts(db, voiceId)
    ? { type: "tts", text: ent.spoken_name }
    : { type: "tileclip", voice: voiceId, locale, text: ent.spoken_name };
}
