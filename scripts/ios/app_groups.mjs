/**
 * The iOS group-management facade (phase 044 slice E4; inventory LW-14,
 * LW-15, ST-7, BS-21): the adult gestures of editor-ui.js groupMenu /
 * renameInline / "New group", group-shows.js (Settings → Words → Show
 * groups) and group-icon-picker.js as render models SwiftUI draws.
 * Exported from core_entry.mjs as PIPCORE.groupsEdit.
 *
 * Every write is ONE call into the shared owner the web calls —
 * groups.createGroup / renameGroup / deleteGroupUndoable / setGroupHidden /
 * setGroupGlyph / setSetting('occasions_visible') and
 * groups_ops.moveGroupBlock — so the table change and its sync_op row
 * happen together and sync replays them later. Nothing here writes SQL for
 * a synced table. The icon library is shared/group-icon-library.mjs; the
 * default faces are board/group-glyph.js GROUP_ICONS (the same table the
 * web's doors read). The web's extra online icons (group-icons/library.json)
 * need a network fetch and are not offered here.
 *
 * Every function answers the whole groups state — `{ groups, shows,
 * mealsOn, toast }` — so Swift renders and never re-derives. `toast.undo`
 * is a token for `undo` (the web's one-toast Undo button).
 */
import { appSession } from "./app.mjs";
import { editPaint, editToastWith } from "./app_edit.mjs";
import { GROUP_ICONS } from "../../public/board/group-glyph.js";

const PIP = () => globalThis.PIPCORE;
const one = (d, sql, p = []) => d.prepare(sql).all(...p)[0];
const allRows = (d, sql, p = []) => d.prepare(sql).all(...p);

/* ---------------- the face (group-glyph.js groupGlyph, as data) ---------------- */

const stripSlash = (p) => p.replace(/^\//, "");

/** An ink icon's bundled path (the chrome rasters ship under icons/). */
const iconPath = (name) => `icons/groups/${name}.svg`;

const isOccasion = (d, id) =>
  (one(d, "SELECT occasion FROM group_meta WHERE group_id = ?", [id])?.occasion ?? 0) === 1;

/** What a group looks like: a pinned picture, an ink icon (its own or the
 *  built-in default), a family group's first word picture, or its initial /
 *  seed emoji. Exactly one of icon / picture / emoji / initial is set. */
export function groupFace(d, row, locale) {
  const initial = row.name?.trim()?.[0]?.toUpperCase() ?? "•";
  if (row.glyph?.startsWith("picture:")) return { picture: row.glyph.slice(8), initial };
  if (row.glyph?.startsWith("icon:")) {
    const n = row.glyph.slice(5);
    return n.startsWith("extra_") ? { initial } : { icon: iconPath(n), iconName: n, initial };
  }
  const dflt = GROUP_ICONS[row.id];
  if (dflt) return { icon: stripSlash(dflt), iconName: dflt.split("/").at(-1).replace(".svg", ""), initial };
  if (row.glyph) return { emoji: row.glyph, initial };
  if (row.kind === "custom") {
    let first = null;
    try {
      first = PIP().groups.groupPage(d, row.id, 0, locale).find((r) => r.photo_key || r.art) ?? null;
    } catch { /* no layout yet */ }
    const key = row.photo_key ?? first?.photo_key ?? first?.art ?? null;
    return key ? { picture: key, initial } : { initial };
  }
  return { emoji: "🗂️", initial };
}

/* ---------------- render model ---------------- */

const nameOf = (s, row) => PIP().groups.groupDisplayName(s.d, row, s.locale)
  || row.glyph || "Group";

function groupsState(s, extra = {}) {
  const d = s.d;
  const counts = new Map(allRows(d,
    "SELECT group_id AS g, count(*) AS n FROM group_membership GROUP BY group_id")
    .map((r) => [r.g, r.n]));
  const rows = PIP().groups_shared.groupIndex(d);
  const groups = rows.map((g) => ({
    id: g.id,
    name: nameOf(s, g),
    kind: g.kind,
    hidden: !!g.hidden,
    occasion: isOccasion(d, g.id),
    canDelete: g.kind === "custom",
    canPictures: g.kind === "custom",
    words: counts.get(g.id) ?? 0,
    glyph: g.glyph ?? null,
    face: groupFace(d, g, s.locale),
  }));
  /* group-shows.js rows(): one row per group in index order; the meal
   * groups fold into one row at the first meal group's place. */
  const mealsOn = (one(d, "SELECT occasions_visible AS o FROM learner_profile WHERE id = 'prf_local'")?.o ?? 1) === 1;
  const shows = [];
  let meals = null;
  for (const g of groups) {
    if (g.occasion) {
      if (!meals) {
        meals = { ids: [], names: [], meals: true, on: mealsOn, face: g.face };
        shows.push(meals);
      }
      meals.ids.push(g.id);
      meals.names.push(g.name);
    } else {
      shows.push({ ids: [g.id], names: [g.name], meals: false, on: !g.hidden, face: g.face });
    }
  }
  for (const r of shows) {
    r.label = r.meals ? `Meals: ${r.names.join(" · ")}` : r.names[0];
    r.moveLabel = `Move ${r.meals ? "Meals" : r.names[0]}`;
    r.switchLabel = r.meals ? "Show meal groups" : `Show ${r.names[0]}`;
  }
  return { groups, shows, mealsOn, toast: null, ...extra };
}

const state = (appId, extra) => groupsState(appSession(appId), extra);

const groupName = (s, id) => {
  const row = one(s.d, "SELECT id, name, glyph FROM board_group WHERE id = ?", [id]);
  return row ? nameOf(s, row) : "";
};

const row = (s, id) => one(s.d, "SELECT * FROM board_group WHERE id = ?", [id]);

/* ---------------- reads ---------------- */

export function groupsEditState(appId) { return state(appId); }

/* ---------------- LW-14: create, rename, hide, delete, reorder ---------------- */

/** editor-ui.js "New group": createGroup; the toast names where its door is. */
export function createGroupNamed(appId, { name }) {
  const s = appSession(appId);
  const v = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!v) return state(appId);
  const { id } = PIP().groups.createGroup(s.d, { name: v });
  return groupsState(s, {
    createdId: id,
    toast: editToastWith(s, `New group “${v}” — its door is in Groups`),
  });
}

/** editor-ui.js renameInline: a blank or unchanged name is a no-op. */
export function renameGroupTo(appId, { id, name }) {
  const s = appSession(appId);
  const g = row(s, id);
  if (!g) return state(appId);
  const was = nameOf(s, g);
  const v = String(name ?? "").trim();
  if (!v || v === was) return state(appId);
  PIP().groups.renameGroup(s.d, id, v);
  return groupsState(s, {
    toast: editToastWith(s, `Renamed to ${v}`, () => {
      PIP().groups.renameGroup(s.d, id, was);
      return groupsState(s);
    }),
  });
}

/** editor-ui.js groupMenu Hide/Show, and group-shows.js's per-row switch. */
export function setGroupShown(appId, { id, shown, toast = true }) {
  const s = appSession(appId);
  const g = row(s, id);
  if (!g) return state(appId);
  const wasHidden = !!g.hidden;
  PIP().groups.setGroupHidden(s.d, id, !shown);
  const label = groupName(s, id);
  return groupsState(s, {
    toast: toast ? editToastWith(s, shown ? `Showing ${label}` : `Hid ${label}`, () => {
      PIP().groups.setGroupHidden(s.d, id, wasHidden);
      return groupsState(s);
    }) : null,
  });
}

/** group-shows.js Meals row: the one switch bound to occasions_visible. */
export function setMealsShown(appId, { on }) {
  const s = appSession(appId);
  PIP().groups.setSetting(s.d, "occasions_visible", on ? 1 : 0);
  return groupsState(s);
}

/** editor-ui.js groupMenu Delete — a family's own group only; the words
 *  stay in All words. */
export function removeGroup(appId, { id }) {
  const s = appSession(appId);
  const g = row(s, id);
  if (!g || g.kind !== "custom") return state(appId);
  const label = groupName(s, id);
  const undo = PIP().groups.deleteGroupUndoable(s.d, id);
  return groupsState(s, {
    toast: editToastWith(s, `Deleted ${label} — its words stay in All words`, () => {
      undo.undo();
      return groupsState(s);
    }),
  });
}

/** group-shows.js moveRow: the `ids` block lands just before `beforeId`
 *  (null = last) — moveGroupBlock, one synced reorder op, Undo toast. */
export function moveGroups(appId, { ids, beforeId = null, name = "" }) {
  const s = appSession(appId);
  const { undo } = PIP().groupsOps.moveGroupBlock(s.d, ids, beforeId);
  const label = name || groupName(s, ids[0]);
  return groupsState(s, {
    toast: editToastWith(s, `Moved ${label}`, () => { undo(); return groupsState(s); }),
  });
}

export function undoGroups(appId, { token }) {
  const s = appSession(appId);
  const run = s.editUndo?.get(token);
  if (!run) return state(appId);
  s.editUndo.delete(token);
  return run();
}

/* ---------------- LW-15: the icon picker ---------------- */

/** group-icon-picker.js render(): the library by category, each icon
 *  saying which other groups already use it; plus a family group's own
 *  pictures. Search is the web's `matches` over label / category / tags. */
export function iconChoices(appId, { id, query = "" }) {
  const s = appSession(appId);
  const g = row(s, id);
  if (!g) return null;
  const face = groupFace(s.d, g, s.locale);
  const uses = new Map();
  for (const other of PIP().groups_shared.groupIndex(s.d)) {
    if (other.id === id) continue;
    const f = groupFace(s.d, other, s.locale);
    if (!f.iconName) continue;
    (uses.get(f.iconName) ?? uses.set(f.iconName, []).get(f.iconName))
      .push(`${nameOf(s, other)}${other.hidden ? " (hidden)" : ""}`);
  }
  const fold = (t) => t.toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const terms = fold(query).trim().split(/\s+/).filter(Boolean);
  const icons = PIP().groupIcons.BASE_GROUP_ICONS
    .filter((i) => {
      const text = fold([i.label, i.category, ...i.tags].join(" "));
      return terms.every((t) => text.includes(t));
    })
    .map((i) => ({
      name: i.name, label: i.label, category: i.category, path: iconPath(i.name),
      current: face.iconName === i.name,
      usedBy: (uses.get(i.name) ?? []).join(", "),
    }));
  const categories = [...new Set(icons.map((i) => i.category))];
  const pictures = g.kind === "custom"
    ? PIP().groups.groupPictureChoices(s.d, id, s.locale).map((p) => ({
      key: p.key, label: p.label, current: g.glyph === `picture:${p.key}`,
    }))
    : [];
  return {
    id, name: nameOf(s, g), face,
    canPictures: g.kind === "custom",
    hasCustom: /^(icon:|picture:)/.test(g.glyph ?? ""),
    categories, icons, pictures,
  };
}

/** group-icon-picker.js apply(): setGroupGlyph; null restores the default. */
export function setIcon(appId, { id, glyph = null, usedBy = "" }) {
  const s = appSession(appId);
  const g = row(s, id);
  if (!g) return state(appId);
  const before = /^(icon:|picture:)/.test(g.glyph ?? "") ? g.glyph : null;
  if ((glyph ?? null) === before) return state(appId);
  PIP().groups.setGroupGlyph(s.d, id, glyph);
  const label = groupName(s, id);
  return groupsState(s, {
    toast: editToastWith(s,
      usedBy ? `${label} now looks like ${usedBy}` : `New icon for ${label}`, () => {
        if (!row(s, id)) return groupsState(s);
        PIP().groups.setGroupGlyph(s.d, id, before);
        return groupsState(s);
      }),
  });
}

/* ---------------- BS-21: the counts badge ---------------- */

/** board.js #edit-counts: 📊 puts the child's own 30-day taps on every
 *  home-board tile, in Edit mode only (it leaves with Edit mode). The
 *  numbers are shared/usecounts.mjs useCounts over learner_event_log —
 *  app_edit.mjs paint() reads them; this only flips the flag. */
export function countsSet(appId, { on }) {
  const s = appSession(appId);
  s.countsOn = !!on && !!s.editing;
  return editPaint(appId);
}
