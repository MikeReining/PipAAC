/**
 * Slice 3 strip — the local candidate funnel
 * (docs/strategy/Dual_Engine_Predictive_Intelligence.md §5.2).
 *
 * On-device inputs only: sentence position, recency, routine/time-of-day.
 * Strip candidates are personal entities (fringe senses are not on-device
 * yet). Core continuations are never strip tiles — they are haloed on the
 * grid. Read-only against core_cell; ranking never writes the map.
 */

const RECENT_WINDOW_MS = 15 * 60 * 1000;
export const STRIP_CAP = 4;

export function logSelection(db, kind, id, at = Date.now()) {
  db.prepare(
    "INSERT INTO learner_event_log (item_kind, item_id, selected_at) VALUES (?, ?, ?)",
  ).run(kind, id, at);
}

/** Part of speech of the sentence's tail item; entities are nominal. */
function tailPos(db, sentence) {
  if (sentence.length === 0) return null;
  const tail = sentence[sentence.length - 1];
  if (tail.kind === "entity") return "Noun";
  const row = db
    .prepare(
      `SELECT l.part_of_speech AS pos FROM label l
       WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'`,
    )
    .all(tail.id)[0];
  return row?.pos ?? null;
}

/**
 * Rank personal entities for the strip.
 * @param {Array<{kind:'sense'|'entity', id:string}>} sentence the open sentence
 * @returns entity ids, highest score first, capped at STRIP_CAP.
 *
 * Eligibility: the sentence tail invites a noun (last item is a Verb or
 * Preposition) or the entity was recently selected. Score orders invited
 * candidates ahead of recency-only ones, then by same-hour frequency and
 * recency. Low-signal state returns [] — the strip shows nothing.
 */
export function stripCandidates(db, sentence, now = Date.now()) {
  const pos = tailPos(db, sentence);
  const invitesEntity = pos === "Verb" || pos === "Preposition";
  const recentCutoff = now - RECENT_WINDOW_MS;
  const hour = new Date(now).getHours();

  return db
    .prepare(
      `SELECT e.id, e.spoken_name,
         MAX(CASE WHEN l.selected_at > ? THEN 1 ELSE 0 END) AS recent,
         SUM(CASE WHEN CAST(strftime('%H', l.selected_at / 1000, 'unixepoch') AS INTEGER) = ?
              THEN 1 ELSE 0 END) AS same_hour,
         COUNT(l.id) AS freq,
         MAX(l.selected_at) AS last_selected
       FROM personal_entity e
       LEFT JOIN learner_event_log l
         ON l.item_kind = 'entity' AND l.item_id = e.id
       GROUP BY e.id`,
    )
    .all(recentCutoff, hour)
    .filter((r) => invitesEntity || r.recent === 1)
    .map((r) => ({
      id: r.id,
      last: r.last_selected ?? 0,
      score:
        (invitesEntity ? 100 : 0) + (r.recent ? 20 : 0) + (r.same_hour ?? 0) * 5 +
        (r.freq ?? 0) * 2 +
        (r.last_selected ? Math.max(0, 10 - (now - r.last_selected) / 60000) : 0),
    }))
    .sort((a, b) => b.score - a.score || b.last - a.last || a.id.localeCompare(b.id))
    .slice(0, STRIP_CAP)
    .map((r) => r.id);
}
