/**
 * Bulk entry and photo-drop drafts — the web editor's write side
 * (Word_Library § 5.4, Sync_And_Web_Editing § 7). Every write goes
 * through the same owners as a single add — createEntity + placeItem —
 * so a pasted row is an op like any other edit and syncs identically.
 *
 * Auto-resolution is exact only: a pasted line resolves to the family's
 * entity or a catalog sense when its normalized text equals the line's.
 * A fuzzy near-miss must never silently place the wrong word — "orange
 * juice" is a new word, not a misplaced "juice". Anything else is a
 * draft the adult corrects.
 */
import { normalizeV1 } from "./normalize.mjs";
import { createEntity, placeItem } from "./groups.mjs";

const all = (db, sql, params = []) => db.prepare(sql).all(...params);

/** 'mom at the beach.JPEG' → 'mom at the beach'. The file name is the
 *  draft's working name; the adult corrects it on the card. */
export function nameFromFile(name) {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a pasted list: one word or short phrase per row. Empty rows
 * drop; duplicate rows collapse to one (same normalized text). Returns
 * { text, kind: 'entity'|'sense'|'new', id, label, already, needsPicture }
 * — `already` marks a record that is already in the target group (placing
 * it again would violate one-record-per-group), `needsPicture` marks a
 * draft with no art yet.
 */
export function resolvePasteRows(db, text, { groupId, locale }) {
  const inGroup = new Set(
    all(db, "SELECT item_kind, item_id FROM group_cell WHERE group_id = ?", [groupId])
      .map((r) => `${r.item_kind}:${r.item_id}`),
  );
  const entByNorm = new Map(
    all(db, "SELECT id, spoken_name FROM personal_entity WHERE status = 'active'")
      .map((e) => [normalizeV1(e.spoken_name), e]),
  );
  const senByNorm = new Map(
    all(
      db,
      `SELECT s.id, l.text AS label FROM label l JOIN sense s ON s.id = l.sense_id
       WHERE l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?`,
      [locale],
    ).map((r) => [normalizeV1(r.label), r]),
  );

  const seen = new Set();
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const key = normalizeV1(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const ent = entByNorm.get(key);
    const sen = ent ? null : senByNorm.get(key);
    const kind = ent ? "entity" : sen ? "sense" : "new";
    const id = ent?.id ?? sen?.id ?? null;
    rows.push({
      text: line,
      kind,
      id,
      label: ent?.spoken_name ?? sen?.label ?? line,
      already: id !== null && inGroup.has(`${kind}:${id}`),
      needsPicture: kind === "new",
    });
  }
  return rows;
}

/** Add all: each resolved row lands in the target group through the real
 *  write owners. New words become entities carrying the group's seed
 *  category (a classifier input, never displayed) so enrichment and
 *  ranking treat them like a hand-added word. Rows already placed skip. */
export function applyPasteRows(db, rows, { groupId, category = null }) {
  let placed = 0, created = 0, skipped = 0;
  for (const r of rows) {
    if (r.already) { skipped++; continue; }
    if (r.kind === "new") {
      const { id } = createEntity(db, { name: r.text, category });
      placeItem(db, groupId, "entity", id);
      created++;
    } else {
      placeItem(db, groupId, r.kind, r.id);
    }
    placed++;
  }
  return { placed, created, skipped };
}

/** Photo-drop drafts (§ 5.3): one entity per named draft — photo bytes
 *  are already stored by the caller (`photoKey`); a blank name means the
 *  adult skipped the row, so it is not saved. No I/O, no network. */
export function applyPhotoDrafts(db, drafts, { groupId, category = null, cell = null }) {
  let saved = 0, blank = 0;
  for (const d of drafts) {
    if (!d.name?.trim()) { blank++; continue; }
    const { id } = createEntity(db, {
      name: d.name.trim(), photoKey: d.photoKey ?? null, category });
    placeItem(db, groupId, "entity", id, cell);
    saved++;
  }
  return { saved, blank };
}
