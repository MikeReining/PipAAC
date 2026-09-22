/**
 * Slice 3 strip — the local candidate funnel
 * (docs/strategy/Dual_Engine_Predictive_Intelligence.md §5.2).
 *
 * On-device inputs only: sentence position, recency, routine/time-of-day.
 * Strip candidates are personal entities plus fringe senses with usage
 * evidence. Core continuations are never strip tiles — they are haloed on
 * the grid. Read-only against core_cell; ranking never writes the map.
 */

const RECENT_WINDOW_MS = 15 * 60 * 1000;
export const STRIP_CAP = 4;

export function logSelection(db, kind, id, at = Date.now()) {
  db.prepare(
    "INSERT INTO learner_event_log (item_kind, item_id, selected_at) VALUES (?, ?, ?)",
  ).run(kind, id, at);
}

/** Tail item's part of speech and text; entities are nominal. */
function tailInfo(db, sentence) {
  if (sentence.length === 0) return { pos: null, prevPos: null };
  const tail = sentence[sentence.length - 1];
  const prev = sentence.length > 1 ? sentence[sentence.length - 2] : null;
  const posOf = (item) => {
    if (!item) return null;
    if (item.kind === "entity") return "Noun";
    return (
      db
        .prepare(
          `SELECT l.part_of_speech AS pos FROM label l
           WHERE l.sense_id = ? AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = 'en'`,
        )
        .all(item.id)[0]?.pos ?? null
    );
  };
  return { pos: posOf(tail), prevPos: posOf(prev) };
}

/**
 * Rank strip candidates. Sentence position decides what the tail invites:
 * a Verb or Preposition tail invites noun-ish candidates (entities +
 * fringe nouns); a Pronoun tail or an infinitival "to" after a verb
 * invites fringe verbs.
 *
 * Eligibility differs by kind: personal entities surface on invitation or
 * recency alone (few, high-value — a fresh add must be reachable);
 * fringe senses additionally need evidence (ever selected or recent), so
 * the strip doesn't fill with arbitrary unused words.
 *
 * @returns {Array<{kind:'sense'|'entity', id:string}>} capped at STRIP_CAP.
 */
export function stripCandidates(db, sentence, now = Date.now()) {
  const { pos, prevPos } = tailInfo(db, sentence);
  const tail = sentence[sentence.length - 1];
  const tailText = tail?.kind === "sense" ? tailTextOf(db, tail.id) : null;
  const invitesNoun = pos === "Verb" || pos === "Preposition";
  const invitesVerb =
    pos === "Pronoun" || (pos === "Preposition" && tailText === "to" && prevPos === "Verb");
  const recentCutoff = now - RECENT_WINDOW_MS;
  const hour = new Date(now).getHours();

  const entityRows = db
    .prepare(
      `SELECT e.id,
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
    .filter((r) => invitesNoun || r.recent === 1)
    .map((r) => ({ kind: "entity", id: r.id, ...scoreRow(r, invitesNoun, now) }));

  const fringeRows = db
    .prepare(
      `SELECT s.id, lb.part_of_speech AS pos,
         MAX(CASE WHEN l.selected_at > ? THEN 1 ELSE 0 END) AS recent,
         SUM(CASE WHEN CAST(strftime('%H', l.selected_at / 1000, 'unixepoch') AS INTEGER) = ?
              THEN 1 ELSE 0 END) AS same_hour,
         COUNT(l.id) AS freq,
         MAX(l.selected_at) AS last_selected
       FROM sense s
       JOIN label lb ON lb.sense_id = s.id
         AND lb.kind = 'lemma' AND lb.status = 'approved' AND lb.locale = 'en'
       LEFT JOIN learner_event_log l
         ON l.item_kind = 'sense' AND l.item_id = s.id
       WHERE s.tier = 'primary_fringe'
       GROUP BY s.id`,
    )
    .all(recentCutoff, hour)
    .filter(
      (r) =>
        (r.freq > 0 || r.recent === 1) &&
        ((invitesNoun && r.pos === "Noun") || (invitesVerb && r.pos === "Verb")),
    )
    .map((r) => ({ kind: "sense", id: r.id, ...scoreRow(r, invitesNoun || invitesVerb, now) }));

  return [...entityRows, ...fringeRows]
    .sort((a, b) => b.score - a.score || b.last - a.last || a.id.localeCompare(b.id))
    .slice(0, STRIP_CAP)
    .map((r) => ({ kind: r.kind, id: r.id }));
}

function tailTextOf(db, senseId) {
  return db
    .prepare(
      `SELECT text FROM label WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = 'en'`,
    )
    .all(senseId)[0]?.text ?? null;
}

function scoreRow(r, invited, now) {
  return {
    last: r.last_selected ?? 0,
    score:
      (invited ? 100 : 0) + (r.recent ? 20 : 0) + (r.same_hour ?? 0) * 5 +
      (r.freq ?? 0) * 2 +
      (r.last_selected ? Math.max(0, 10 - (now - r.last_selected) / 60000) : 0),
  };
}
