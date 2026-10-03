/**
 * Voices a family can pick (founder 2026-10-03: four named voices).
 *
 * Truth: data/catalog/tile_voices.json links each voice_key to its
 * ElevenLabs voice id; the catalog `voice` table says which voices are
 * active for the profile locale; learner_profile.preferred_voice_id says
 * which one this board uses (a synced setting). A voice is a full word
 * clip library plus its matching sentence voice — never two speakers in
 * one voice (Language_And_Voice_Schema § 5.5, § 7) — so each new voice
 * is a content project that ships as a catalog row.
 *
 * Voices are named people described by how they sound, never "girl" or
 * "boy" — ElevenLabs makes no child voices. A voice never changes the
 * words: it says "fries" if the tile says fries.
 *
 * VOICE_LINEUP is the founder-approved plan, shown as "Coming soon"
 * until the catalog voice with that `key` is active. It never makes a
 * voice selectable on its own.
 */

export const VOICE_LINEUP = [
  { key: "voi_default_en", name: "Pip", note: "Pip's own voice" },
  { key: "voi_eve_en", name: "Eve", note: "Younger, female" },
  { key: "voi_leo_en", name: "Leo", note: "Grown-up, male" },
  { key: "voi_sam_en", name: "Sam", note: "Younger, male" },
];

/** Available (active, this locale) and coming-soon voices. */
export function voiceChoices(db, locale) {
  const available = db.prepare(
    `SELECT id, display_name AS name, is_default FROM voice
     WHERE locale = ? AND status = 'active' ORDER BY is_default DESC, display_name`,
  ).all(locale);
  const shipped = new Set(available.map((v) => v.id));
  return {
    available: available.map((v) => ({
      ...v,
      note: VOICE_LINEUP.find((l) => l.key === v.id)?.note ?? "",
    })),
    coming: VOICE_LINEUP.filter((v) => !shipped.has(v.key)),
  };
}

/** The display name a board's voice shows in Settings. */
export function voiceName(db, voiceId) {
  if (!voiceId) return "No voice";
  const v = db.prepare("SELECT display_name AS n, is_default AS d FROM voice WHERE id = ?").all(voiceId)[0];
  if (!v) return "No voice";
  return v.d && v.n === "Default" ? "Pip's voice" : v.n;
}
