/**
 * 014 slice 4 — the move cost (§ 4) and the transition highlight.
 * Changing Cells or applying a starter shows the adult what moves
 * BEFORE anything changes: for each word the child has used, old cell
 * vs new cell — same place, moved within its sector, changed sector,
 * or off the home board — weighted by how often the child said it.
 * Accepted moves mark the moved words with a soft highlight for a
 * window (default two weeks), then it fades.
 *
 * Sectors are the column bands each layout documents in the map doc
 * (§ 2 for grid60, § 4 for grid90, § 6 for grid15), named with one
 * canonical vocabulary so "same sector" means the same band across
 * layouts — grid90 was rebuilt on grid60's bands (014 slice 5), so a
 * 60→90 move reports sector holds, not scrambles.
 */

import { recordOp } from "./ops.mjs";
import { coreSlot } from "./coremove.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MARK_DAYS = 14;

/** Canonical sector bands: [firstCol, lastCol, name]. Cols are 0-based. */
const SECTORS = {
  // Map doc § 2: pronouns+questions · verbs · spatial · descriptors · regulators.
  grid60: [[0, 1, "people"], [2, 4, "doing"], [5, 6, "where"], [7, 8, "describing"], [9, 9, "regulate"]],
  // Map doc § 4: the same five bands, nine rows tall (014 slice 5).
  grid90: [[0, 1, "people"], [2, 4, "doing"], [5, 6, "where"], [7, 8, "describing"], [9, 9, "regulate"]],
  // Map doc § 6: people · doing · how much · answer and ask · stop/help/hurt.
  grid15: [[0, 0, "people"], [1, 1, "doing"], [2, 2, "describing"], [3, 3, "answers"], [4, 4, "regulate"]],
};

export function sectorOf(layout, cols, slot) {
  const bands = SECTORS[layout];
  if (!bands) return null;
  const col = slot % cols;
  return bands.find(([a, b]) => col >= a && col <= b)?.[2] ?? null;
}

/** The catalog's layout shapes (cols per layout) bind at boot —
 *  op replay and tests need them without owning the catalog object. */
let CATALOG_LAYOUTS = {};
export function bindLayouts(l) { CATALOG_LAYOUTS = l ?? {}; }
const colsOf = (l) => CATALOG_LAYOUTS[l]?.cols ?? 10;

/** The move-cost preview: per word the child has used (or every word on
 *  the board when there's no history — § 4's unweighted count), the
 *  classification of its landing. Returns words plus bucket totals. */
export function moveCost(db, fromLayout, toLayout, locale) {
  const used = new Map(
    db.prepare(
      `SELECT item_id, COUNT(*) AS n FROM learner_event_log
       WHERE item_kind = 'sense' GROUP BY item_id`,
    ).all().map((r) => [r.item_id, r.n]),
  );
  const senseRows = db.prepare(
    `SELECT DISTINCT cc.layout, cc.sense_id, l.text AS label FROM core_cell cc
     JOIN label l ON l.sense_id = cc.sense_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     WHERE cc.layout IN (?, ?)`,
  ).all(locale, fromLayout, toLayout);
  const inFrom = new Set(senseRows.filter((r) => r.layout === fromLayout).map((r) => r.sense_id));
  // The pool is what the child uses; with no history it's the whole
  // home board. New arrivals are always listed — they're the gain.
  const fromSenses = senseRows.filter((r) => r.layout === fromLayout);
  const newSenses = senseRows.filter((r) => r.layout === toLayout && !inFrom.has(r.sense_id));
  const pool = [
    ...(used.size ? fromSenses.filter((s) => used.has(s.sense_id)) : fromSenses),
    ...newSenses,
  ];
  const fromCols = colsOf(fromLayout);
  const toCols = colsOf(toLayout);
  const words = pool.map((s) => {
    const oldS = s.layout === fromLayout ? coreSlot(db, fromLayout, s.sense_id) : null;
    const newS = coreSlot(db, toLayout, s.sense_id);
    const cls = oldS === null ? "new"
      : newS === null ? "gone"
      : oldS === newS ? "same"
      : sectorOf(fromLayout, fromCols, oldS) !== null
          && sectorOf(fromLayout, fromCols, oldS) === sectorOf(toLayout, toCols, newS)
        ? "sector" : "moved";
    return { sense_id: s.sense_id, label: s.label, count: used.get(s.sense_id) ?? 0, cls, oldS, newS };
  });
  const totals = { same: 0, sector: 0, moved: 0, gone: 0, new: 0 };
  for (const w of words) totals[w.cls] += Math.max(w.count, 1);
  return { words: words.sort((a, b) => b.count - a.count), totals, weighted: used.size > 0 };
}

/** The live transition-highlight marks: moved words glow softly until
 *  `until`. Expired marks prune on read. */
export function moveMarks(db) {
  const now = Date.now();
  db.prepare("DELETE FROM move_mark WHERE until <= ?").run(now);
  return new Set(
    db.prepare("SELECT sense_id FROM move_mark").all().map((r) => r.sense_id),
  );
}

/** Change the board layout: write the profile column and mark the used
 *  words that move (or leave the board) for the transition window.
 *  Marks are computed from THIS device's selection log — the log is
 *  device-local, so each replica marks what its own child used. */
export function setBoardLayout(db, layout, now = Date.now()) {
  const p = db.prepare(
    "SELECT board_layout AS l, locale FROM learner_profile WHERE id = 'prf_local'",
  ).all()[0] ?? {};
  const from = p.l ?? "grid60";
  if (from === layout) return null;
  const { words } = moveCost(db, from, layout, p.locale ?? "en");
  // Highlight only words that changed place on the NEW board — 'gone'
  // cells aren't drawn and 'new' cells never moved.
  const moved = words
    .filter((w) => w.cls === "sector" || w.cls === "moved")
    .map((w) => w.sense_id);
  const until = now + MARK_DAYS * DAY_MS;
  db.prepare("UPDATE learner_profile SET board_layout = ? WHERE id = 'prf_local'").run(layout);
  db.exec("DELETE FROM move_mark");
  for (const sid of moved) {
    db.prepare("INSERT INTO move_mark (sense_id, until) VALUES (?, ?)").run(sid, until);
  }
  recordOp(db, "set_layout", { layout });
  return { from, moved, until };
}
