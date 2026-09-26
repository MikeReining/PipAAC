/**
 * 025 — expressive voice: the feeling data and the "I + feeling word"
 * suggestion rule.
 *
 * Data ships two ways until the Ara catalog rebuild lands:
 * catalog.feelingVoice (embedded by build_catalog — the destination,
 * § 3) and GET /feeling_voice.json on the Worker — the board takes
 * whichever answers.
 */

export const FEELINGS = ["happy", "sad", "angry"];

export async function loadFeelingData(catalog) {
  if (catalog?.feelingVoice?.feelings) return catalog.feelingVoice;
  const data = await fetch("/feeling_voice.json")
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return data?.feelings ? data : null;
}

/** § 3: the LAST feeling word lights its face when the nearest people
 *  word before it is I or me. Computed from ids, never spelling —
 *  *I'm happy*, *I am so sad*, *me mad* light; *he is happy*,
 *  *I think he is sad*, *happy* alone don't. isPronoun/entityCategory
 *  are lookups the board supplies (pronoun = lemma part_of_speech
 *  'Pronoun'; a people/pets entity or an unclassified one counts —
 *  her names are people by default). */
export function suggestedFeeling(sentence, data, isPronoun, entityCategory) {
  let at = -1;
  let feeling = null;
  for (let i = sentence.length - 1; i >= 0; i--) {
    const it = sentence[i];
    const f = it.kind === "sense" && it.id ? data.feelings[it.id] : null;
    if (f) { at = i; feeling = f; break; }
  }
  if (at < 0) return null;
  for (let i = at - 1; i >= 0; i--) {
    const it = sentence[i];
    if (it.kind === "entity" && it.id) {
      const cat = entityCategory(it.id);
      if (cat === null || data.peopleEntityCategories.includes(cat)) return null;
      continue;
    }
    if (it.kind !== "sense" || !it.id) continue;
    if (isPronoun(it.id)) return data.self.includes(it.id) ? feeling : null;
  }
  return null;
}

/** § 6: "Expressive voice" — on by default, synced like grammar_help.
 *  The column is additive until the Ara catalog ships it; a db that
 *  predates it answers the doc's default. */
export function expressiveOn(db) {
  try {
    const v = db.prepare(
      "SELECT expressive_voice AS v FROM learner_profile WHERE id = 'prf_local'",
    ).all()[0]?.v;
    return (v ?? 1) === 1;
  } catch {
    return true;
  }
}
