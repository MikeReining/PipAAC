/**
 * Use counts and the placement sheet's candidate list (018 D10).
 *
 * A count is the child's own taps in the last 30 days —
 * learner_event_log rows. Partner modeling taps are never logged
 * (the modeling path writes no event), so every counted row is the
 * child's. The 📊 badge and the placement sheet's sort read the same
 * map; the sheet never invents its own numbers.
 */
import { coreCells } from "./coremove.mjs";

const all = (db, sql, params = []) => db.prepare(sql).all(...params);

const DAY_MS = 86400000;

/** `${kind}:${id}` → taps in the window. */
export function useCounts(db, { days = 30, now = Date.now() } = {}) {
  const rows = all(
    db,
    `SELECT item_kind, item_id, COUNT(*) AS n
     FROM learner_event_log
     WHERE selected_at >= ?
     GROUP BY item_kind, item_id`,
    [now - days * DAY_MS],
  );
  return new Map(rows.map((r) => [`${r.item_kind}:${r.item_id}`, r.n]));
}

/** Everything placeable that has no home cell on `layout`, most-tapped
 *  first. A word with no history orders by the opening book's unigram
 *  (D10: day one still ranks by what children say); labels break ties.
 *  `q` filters the list to a prefix-or-substring match on the label. */
export function offBoardItems(
  db, layout, locale,
  { counts = new Map(), uni = {}, q = "" } = {},
) {
  const onBoard = new Set(
    coreCells(db, layout, locale).map((c) =>
      `${c.kind}:${c.kind === "sense" ? c.sense_id : c.entity_id}`),
  );
  const senses = all(
    db,
    `SELECT 'sense' AS kind, s.id, l.text AS label, s.fitzgerald_role AS role
     FROM sense s
     JOIN label l ON l.sense_id = s.id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?`,
    [locale],
  );
  const entities = all(
    db,
    `SELECT 'entity' AS kind, e.id, e.spoken_name AS label,
            COALESCE(e.fitzgerald_role, 'Yellow') AS role
     FROM personal_entity e WHERE e.status = 'active'`,
  );
  const needle = q.trim().toLowerCase();
  return [...senses, ...entities]
    .filter((r) => !onBoard.has(`${r.kind}:${r.id}`))
    .map((r) => ({
      ...r,
      count: counts.get(`${r.kind}:${r.id}`) ?? 0,
      uni: uni[r.id] ?? 0,
    }))
    .filter((r) => !needle || r.label.toLowerCase().includes(needle))
    .sort((a, b) =>
      b.count - a.count || b.uni - a.uni || a.label.localeCompare(b.label));
}

/** Replace inside a group (031): a word can hold a home cell and group
 *  seats at once, so the candidates are everything but this group's own
 *  members — board words included. A globally hidden word is out of
 *  circulation: offering it would land a ghost. Same ranking as the
 *  placement sheet. */
export function notInGroupItems(
  db, groupId, locale,
  { counts = new Map(), uni = {}, q = "" } = {},
) {
  const members = new Set(
    all(db,
      "SELECT item_kind, item_id FROM group_membership WHERE group_id = ?",
      [groupId]).map((r) => `${r.item_kind}:${r.item_id}`),
  );
  const senses = all(
    db,
    `SELECT 'sense' AS kind, s.id, l.text AS label, s.fitzgerald_role AS role
     FROM sense s
     JOIN label l ON l.sense_id = s.id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     WHERE s.id NOT IN (SELECT sense_id FROM sense_mask WHERE status = 'hidden')`,
    [locale],
  );
  const entities = all(
    db,
    `SELECT 'entity' AS kind, e.id, e.spoken_name AS label,
            COALESCE(e.fitzgerald_role, 'Yellow') AS role
     FROM personal_entity e WHERE e.status = 'active'`,
  );
  const needle = q.trim().toLowerCase();
  return [...senses, ...entities]
    .filter((r) => !members.has(`${r.kind}:${r.id}`))
    .map((r) => ({
      ...r,
      count: counts.get(`${r.kind}:${r.id}`) ?? 0,
      uni: uni[r.id] ?? 0,
    }))
    .filter((r) => !needle || r.label.toLowerCase().includes(needle))
    .sort((a, b) =>
      b.count - a.count || b.uni - a.uni || a.label.localeCompare(b.label));
}
