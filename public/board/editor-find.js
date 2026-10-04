/**
 * 031 — the editor's pure rules: the honest save status (§ 8) and the
 * one field's sections (§ 4). No DOM here; the editor paints them.
 */
import { catalogMatches, entityMatches, entityGroups, senseGroups } from "../shared/groups.mjs";
import { normalizeV1 } from "../shared/normalize.mjs";

/** § 8 — say only what we know. Pending = ops the relay has not
 *  accepted yet (sync_op.relay_seq IS NULL). Never "on Maya's iPad":
 *  nothing tells us a device received it. 043 A: a board that cannot
 *  persist (blocked or last save failed) outranks the sync states —
 *  losing the local copy is worse than missing the relay. */
export function editorStatus({ linked, pending, online, flushError, saveBlocked, saveError }) {
  if (saveBlocked) return { text: "Not saving — saved board couldn't open", tone: "warn" };
  if (saveError) return { text: "Couldn't save — keep this open", tone: "warn" };
  if (!linked) return { text: "Saved on this device", tone: "ok" };
  if (pending === 0) return { text: "✓ Saved", tone: "ok" };
  if (!online || flushError) return { text: "Offline — will sync", tone: "warn" };
  return { text: "Saving…", tone: "busy" };
}

/** "apple sauce" ⇄ "applesauce": spacing and hyphens aside. */
export const fold = (s) => normalizeV1(s).replace(/[\s\-‐-―]+/g, "");

/** A pasted list: two or more non-blank lines. */
export const isList = (text) =>
  String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).length >= 2;

/**
 * § 4 — what the one field offers for `text`:
 *  - onBoard:  words Maya already has somewhere (a group or the main
 *              board) → Go to it (and Add here when not in this group)
 *  - library:  our words she doesn't have yet → Add here
 *  - exact:    the row Return should take ({section, index}) — a word
 *              that IS the typed text; otherwise Make (null)
 * `homeKeys` is the set of "kind:id" on the main board.
 */
export function findSections(db, text, { locale, groupId, homeKeys = new Set() }) {
  const t = String(text ?? "").trim();
  if (!t) return { onBoard: [], library: [], exact: null };
  const want = fold(t);
  const where = (kind, id) => {
    const groups = kind === "entity" ? entityGroups(db, id, locale) : senseGroups(db, id, locale);
    const names = groups.map((g) => g.name);
    if (homeKeys.has(`${kind}:${id}`)) names.unshift("Main board");
    return { groups, names };
  };
  const onBoard = [];
  const library = [];
  for (const m of entityMatches(db, t, "__any__", locale)) {
    const w = where("entity", m.id);
    onBoard.push({
      kind: "entity", id: m.id, label: m.name, role: m.fitzgerald_role ?? "Yellow",
      photo_key: m.photo_key, where: w.names, groups: w.groups,
      here: w.groups.some((g) => g.id === groupId),
    });
  }
  const seen = new Set();
  const cat = [...catalogMatches(db, t, "__any__", locale)];
  if (want !== normalizeV1(t)) cat.push(...catalogMatches(db, want, "__any__", locale));
  for (const m of cat) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const w = where("sense", m.id);
    const row = {
      kind: "sense", id: m.id, label: m.label, role: m.fitzgerald_role, art: m.art,
      where: w.names, groups: w.groups, here: w.groups.some((g) => g.id === groupId),
    };
    (w.names.length ? onBoard : library).push(row);
  }
  let exact = null;
  const i = onBoard.findIndex((r) => fold(r.label) === want);
  if (i >= 0) exact = { section: "onBoard", index: i };
  else {
    const j = library.findIndex((r) => fold(r.label) === want);
    if (j >= 0) exact = { section: "library", index: j };
  }
  return { onBoard, library, exact };
}
