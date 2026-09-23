/**
 * 014 slice 7 — Smart bar families (Motor_Grid § 2.1, Expand mode).
 * A family tile on the board opens its family in the bar: fixed order,
 * one-column tiles, never ranked, never trimmed by context. position is
 * the whole truth; only an adult's edit changes it, through
 * `setFamilyItems`, and the change syncs like any other caregiver edit.
 * An item may name another family (`item_kind = 'family'`) — one level
 * of chaining; the renderer owns the depth cap.
 *
 * Truth owner for a family's CONTENTS: bar_family_item rows. The seed
 * lands once (import OR IGNORE); after that the rows are the family's
 * own. A catalog regen never rewrites them.
 */

import { recordOp } from "./ops.mjs";

/** Every family, alpha-stable — the editor lists them; the board's
 *  family anchors carry the id. */
export function families(db) {
  return db.prepare("SELECT * FROM bar_family ORDER BY id").all();
}

export function family(db, id) {
  return db.prepare("SELECT * FROM bar_family WHERE id = ?").all(id)[0] ?? null;
}

/** A family's tiles in fixed order, resolved to display rows:
 *  { position, kind, id, label, glyph, speaks, nextFamily }.
 *  Masked senses are dropped — a hidden word never appears in the bar
 *  (Predict law applies to Expand too). */
export function familyItems(db, familyId, locale = "en", masked = new Set()) {
  const rows = db.prepare(
    `SELECT position, item_kind, item_id FROM bar_family_item
     WHERE family_id = ? ORDER BY position`,
  ).all(familyId);
  const out = [];
  for (const r of rows) {
    if (r.item_kind === "sense") {
      if (masked.has(r.item_id)) continue;
      const w = db.prepare(
        `SELECT l.text AS label, s.fitzgerald_role AS role FROM sense s
         JOIN label l ON l.sense_id = s.id
           AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
         WHERE s.id = ?`,
      ).all(locale, r.item_id)[0];
      if (!w) continue;
      out.push({ position: r.position, kind: "sense", id: r.item_id, label: w.label, role: w.role });
    } else if (r.item_kind === "entity") {
      const e = db.prepare(
        "SELECT spoken_name AS label FROM personal_entity WHERE id = ? AND status = 'active'",
      ).all(r.item_id)[0];
      if (!e) continue;
      out.push({ position: r.position, kind: "entity", id: r.item_id, label: e.label });
    } else {
      const f = family(db, r.item_id);
      if (!f) continue;
      out.push({
        position: r.position, kind: "family", id: r.item_id,
        label: f.name, glyph: f.glyph, speaks: f.speaks, nextFamily: f.id,
      });
    }
  }
  return out;
}

/** The adult edit: replace a family's ordered tiles. One op carries the
 *  whole new order — position is intent, and replicas converge by
 *  applying the same list. items: [{kind, id}] in display order. */
export function setFamilyItems(db, familyId, items) {
  if (!family(db, familyId)) throw new Error(`setFamilyItems: no family ${familyId}`);
  db.prepare("DELETE FROM bar_family_item WHERE family_id = ?").run(familyId);
  const ins = db.prepare(
    "INSERT INTO bar_family_item (family_id, position, item_kind, item_id) VALUES (?, ?, ?, ?)",
  );
  items.forEach((it, i) => ins.run(familyId, i, it.kind, it.id));
  recordOp(db, "set_family_items", { familyId, items });
}

/** A new family (Parent Corner → Smart bar). The tile's spoken label is
 *  optional — `?` opens silently; `Pain` speaks "I'm in pain". */
export function createFamily(db, { id, name, glyph = null, speaks = null }) {
  if (!id?.startsWith("bf_")) throw new Error("createFamily: id must be bf_*");
  if (!name) throw new Error("createFamily: name required");
  db.prepare(
    "INSERT INTO bar_family (id, name, glyph, speaks, builtin) VALUES (?, ?, ?, ?, 0)",
  ).run(id, name, glyph, speaks);
  recordOp(db, "create_family", { id, name, glyph, speaks });
  return id;
}
