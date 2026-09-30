/**
 * Voices a family can pick (founder 2026-09-29: "a very important and
 * highly requested feature … man, woman, girl, boy").
 *
 * Truth: the `voice` table (catalog) says which voices exist and are
 * active for the profile locale; learner_profile.preferred_voice_id says
 * which one this board uses (a synced setting). A voice is a full word
 * clip library plus its matching sentence voice — never two speakers in
 * one voice (Language_And_Voice_Schema § 5.5, § 7) — so each new voice
 * is a content project that ships as a catalog row.
 *
 * VOICE_LINEUP is the founder-approved plan, shown as "Coming soon"
 * until a catalog voice with the same display name — or one of the
 * slot's `keys` (named voices like Leo fill "Man") — is active. It
 * never makes a voice selectable on its own.
 */

export const VOICE_FILTERS = [
  ["all", "All"], ["girl", "Girl"], ["boy", "Boy"], ["woman", "Woman"], ["man", "Man"],
];

export const VOICE_LINEUP = [
  { name: "Girl", group: "girl", note: "A young girl" },
  { name: "Boy", group: "boy", note: "A young boy" },
  { name: "Teen girl", group: "girl", note: "A teenage girl" },
  { name: "Teen boy", group: "boy", note: "A teenage boy" },
  { name: "Woman", group: "woman", note: "An adult woman" },
  // Named voices fill a slot by `keys` — Leo and Sam are the adult men.
  { name: "Man", group: "man", note: "An adult man", keys: ["voi_leo_en", "voi_sam_en"] },
];

/** Available (active, this locale) and coming-soon voices. */
export function voiceChoices(db, locale) {
  const available = db.prepare(
    `SELECT id, display_name AS name, is_default FROM voice
     WHERE locale = ? AND status = 'active' ORDER BY is_default DESC, display_name`,
  ).all(locale);
  const shipped = new Set(available.map((v) => v.name.toLowerCase()));
  const shippedIds = new Set(available.map((v) => v.id));
  const covers = (v) =>
    shipped.has(v.name.toLowerCase()) || (v.keys ?? []).some((k) => shippedIds.has(k));
  const coming = VOICE_LINEUP.filter((v) => !covers(v));
  const lineupOf = (v) =>
    VOICE_LINEUP.find((l) => (l.keys ?? []).includes(v.id)) ??
    VOICE_LINEUP.find((l) => l.name.toLowerCase() === v.name.toLowerCase());
  return {
    available: available.map((v) => ({
      ...v,
      group: lineupOf(v)?.group ?? null,
      note: lineupOf(v)?.note ?? (v.is_default ? "The voice Pip ships with" : ""),
    })),
    coming,
  };
}

/** The display name a board's voice shows in Settings. */
export function voiceName(db, voiceId) {
  if (!voiceId) return "No voice";
  const v = db.prepare("SELECT display_name AS n, is_default AS d FROM voice WHERE id = ?").all(voiceId)[0];
  if (!v) return "No voice";
  return v.d && v.n === "Default" ? "Pip's voice" : v.n;
}
