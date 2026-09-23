/**
 * The Jev request boundary (Dual_Engine § 3.2, 006 slice 5).
 *
 * buildJevRequest is pure and returns exactly the § 3.2 whitelist:
 * the sentence's labels, the shortlist's labels plus `none`, and the
 * partner's words only when listening heard them. A personal entity is
 * its category + enrichment description — never its name or photo. No
 * time, history, counts, weights, or ids leave the device; the TypeSafe
 * key lives only on the Worker (jevRank posts to /jev/rank).
 */
export const JEV_MODEL = "jev-1.13.0";

/** What one item looks like to Jev: a sense is its locale label; an
 *  entity is category + enrichment description, else a generic phrase. */
export function jevTerm(db, item, locale) {
  if (item.kind !== "entity") {
    if (item.label) return item.label;
    return db.prepare(
      `SELECT text FROM label WHERE sense_id = ? AND kind = 'lemma'
        AND status = 'approved' AND locale = ? ORDER BY id LIMIT 1`,
    ).all(item.id, locale)[0]?.text ?? "";
  }
  const row = db.prepare(
    `SELECT e.category, r.description FROM personal_entity e
     LEFT JOIN entity_enrichment r
       ON r.entity_id = e.id AND r.status = 'ready'
     WHERE e.id = ?`,
  ).all(item.id)[0];
  if (!row) return "a personal word";
  const parts = [row.category, row.description].filter(Boolean);
  return parts.length ? parts.join(": ") : "a personal word";
}

/**
 * The request body, or null when nothing may be sent: sharing off, or
 * the sentence is empty with no partner words (§ 3.2 — nothing to
 * judge; the idle strip is local).
 *
 * shortlist/sentence items: { kind, id } for entities, { kind, label }
 * for senses — resolve terms with jevTerm first (the caller owns the
 * db; this builder stays pure over the resolved terms).
 */
export function buildJevRequest(candidates, sentenceTerms, partnerWords = null, { sharing = true } = {}) {
  if (!sharing) return null;
  if (!sentenceTerms.length && !partnerWords) return null;
  if (!candidates.length) return null;
  const criteria = {};
  candidates.forEach((term, i) => { criteria[`c${i + 1}`] = term; });
  criteria.none = "None of these words fits as the next word";
  const state = {
    sentence_so_far: sentenceTerms.join(" "),
    candidates_note:
      "Words a child using a picture-communication app could pick next.",
  };
  if (partnerWords) state.partner_said = partnerWords;
  return {
    model: JEV_MODEL,
    state,
    questions: {
      next_word: {
        type: "choice",
        instructions:
          "Which word is the speaker most likely to choose next to continue the sentence in sentence_so_far?",
        criteria,
      },
    },
  };
}

/** POST the request to the Worker's /jev/rank passthrough. */
export async function jevRank(request, { fetchImpl = globalThis.fetch, origin = "" } = {}) {
  const res = await fetchImpl(`${origin}/jev/rank`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`jev rank HTTP ${res.status}`);
  return res.json();
}

/** The next_word answer's per-criterion probabilities →
 *  { c1: p, …, none: p }, or null when the shape isn't there. */
export function jevProbabilities(response) {
  const p = response?.answers?.next_word?.probabilities;
  return p && typeof p === "object" ? p : null;
}
