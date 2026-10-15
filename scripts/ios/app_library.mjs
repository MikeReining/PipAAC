/**
 * The iOS add-a-word + Library facade (phase 044 slice E2): the adult
 * gestures of board/add-flow.js (029 § 3), board/library-ui.js,
 * board/place-ui.js and groups-ui.js openAddToBoards as render models
 * SwiftUI draws. Exported from core_entry.mjs as PIPCORE.lib
 * (`library` is already public/shared/library.mjs).
 *
 * Every write is ONE call into the shared owner the web calls —
 * groups.createEntity / createGroup, groupsOps.placeItem / addToGroups,
 * coremove.placeOnBoard — so the table change and its sync op happen
 * together and sync replays them later. Reads are the web's own:
 * groups.entityMatches / catalogMatches / groupIndex, library.*,
 * usecounts.offBoardItems. Swift passes the typed text each call and
 * draws the answer; nothing here keeps a draft.
 *
 * Voice: a new word has no recording. It stays silent (resolveSlot says
 * so); the on-demand clip mint (web: tile.ensure) needs transport and is
 * a later slice. Nothing here speaks through the device voice.
 */
import { appGeom, appSession } from "./app.mjs";
import {
  editCardModel, editInvalidate, editPaint, editToastWith,
} from "./app_edit.mjs";

const PIP = () => globalThis.PIPCORE;
const one = (d, sql, p = []) => d.prepare(sql).all(...p)[0];

/* ---------------- shared bits ---------------- */

const fold = (s) => PIP().normalize.normalizeV1(s).replace(/[\s\-‐-―]+/g, "");

/** 015 slice 6: licensed boards add without limit; free boards stop at
 *  OWN_WORDS_FREE live own words. iOS has no license yet (accounts are a
 *  later slice) — `s.licensed` is the seam, false like the web's default. */
const ownLeft = (s) => (s.licensed ? Infinity
  : Math.max(0, PIP().groups.OWN_WORDS_FREE - PIP().groups.liveOwnWords(s.d)));

function groupName(s, id, fallback = "") {
  const row = one(s.d, "SELECT id, name FROM board_group WHERE id = ?", [id]);
  return row ? PIP().groups.groupDisplayName(s.d, row, s.locale) : fallback;
}

/** add-flow.js noteRecent — the web keeps three in localStorage; the
 *  session keeps them here. */
const noteRecent = (s, id) => {
  s.addRecent = [id, ...(s.addRecent ?? []).filter((x) => x !== id)].slice(0, 3);
};

const seedCategory = (s, groupId) =>
  s.catalog.groups?.find((g) => g.id === groupId)?.category ?? null;

/* ---------------- the add form (LW-2, LW-3) ---------------- */

function matchRows(s, groupId, text) {
  const d = s.d;
  const seed = seedCategory(s, groupId);
  const want = fold(text);
  const here = new Set(
    d.prepare("SELECT item_kind || ':' || item_id AS k FROM group_membership WHERE group_id = ?")
      .all(groupId).map((r) => r.k));
  const destName = groupName(s, groupId, "My Words");
  const rows = [];
  let exact = -1;

  // The family's own words — everywhere, so "already here" can show.
  for (const m of PIP().groups.entityMatches(d, text, "__any__", s.locale, seed)) {
    const isHere = here.has(`entity:${m.id}`);
    rows.push({
      key: `entity:${m.id}`, kind: "entity", id: m.id, label: m.name,
      role: m.fitzgerald_role ?? "None", art: null, photoKey: m.photo_key ?? null,
      sub: isHere ? `Already in ${destName}`
        : m.groups.length ? `In ${m.groups.join(", ")}` : "Your word",
      action: isHere ? "Open" : "Add", here: isHere,
    });
    if (exact < 0 && fold(m.name) === want) exact = rows.length - 1;
  }

  // Ours — the typed text, plus its spacing-folded form ("apple sauce").
  const seen = new Set();
  const cat = [...PIP().groups.catalogMatches(d, text, "__any__", s.locale, seed)];
  if (want !== PIP().normalize.normalizeV1(text)) {
    cat.push(...PIP().groups.catalogMatches(d, want, "__any__", s.locale, seed));
  }
  for (const m of cat) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const isHere = here.has(`sense:${m.id}`);
    rows.push({
      key: `sense:${m.id}`, kind: "sense", id: m.id, label: m.label,
      role: m.fitzgerald_role ?? "None", art: m.art ?? null, photoKey: null,
      sub: isHere ? `Already in ${destName}` : "Our picture and voice",
      action: isHere ? "Open" : "Add", here: isHere,
    });
    if (exact < 0 && fold(m.label) === want) exact = rows.length - 1;
  }

  // Make — always last; the default unless the typed word already exists.
  const capped = ownLeft(s) <= 0;
  rows.push({
    key: "make", kind: "make", id: null, label: `“${text}”`,
    role: "None", art: null, photoKey: null,
    sub: capped ? `Your ${PIP().groups.OWN_WORDS_FREE} free words are used`
      : "New word — picture and voice made for you",
    action: capped ? "See Pip Lifetime" : "Make", here: false, capped,
  });
  const hi = exact >= 0 ? exact : rows.length - 1;
  return rows.map((r, i) => ({ ...r, highlighted: i === hi }));
}

function countLine(s) {
  const n = PIP().groups.liveOwnWords(s.d);
  const cap = PIP().groups.OWN_WORDS_FREE;
  return {
    hidden: !!s.licensed,
    text: n >= cap ? `All ${cap} free words used — Pip Lifetime adds unlimited.`
      : `${n} of ${cap} free words`,
  };
}

/** The group picker (029 § 3.1): Recent, then every shown group in the
 *  board's own order, then "New group" (named from the search when
 *  nothing is called anything like it). */
function groupPicker(s, target, q) {
  const norm = PIP().normalize.normalizeV1(q ?? "");
  const groups = PIP().groups_shared.groupIndex(s.d).filter((g) => !g.hidden)
    .map((g) => ({
      id: g.id, name: PIP().groups.groupDisplayName(s.d, g, s.locale),
      glyph: g.glyph ?? null, selected: g.id === target,
    }));
  const recent = norm ? [] : (s.addRecent ?? [])
    .map((id) => groups.find((g) => g.id === id)).filter(Boolean);
  const all = groups.filter((g) => !norm || PIP().normalize.normalizeV1(g.name).includes(norm));
  const typed = String(q ?? "").trim();
  const canMake = !!norm && all.length === 0;
  return {
    recent, all,
    make: { canMake, label: canMake ? `Make a group called “${typed}”` : "New group", name: typed },
  };
}

/** The whole add form for the current typed text / destination. `picker`
 *  is the group-picker query (null when the picker is closed). */
export function addState(appId, { groupId = null, cell = null, text = "", picker = null }) {
  const s = appSession(appId);
  const target = groupId ?? "grp_my_words";
  const t = String(text ?? "").trim();
  return {
    title: "Add a word",
    target: { id: target, name: groupName(s, target, "My Words") },
    cell,
    count: countLine(s),
    matches: t ? matchRows(s, target, t) : [],
    picker: picker === null ? null : groupPicker(s, target, picker),
  };
}

/** § 3.1 "Make a group called …": a custom group, selected at once. */
export function addMakeGroup(appId, { name }) {
  const s = appSession(appId);
  const clean = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return { groupId: null };
  const { id } = PIP().groups.createGroup(s.d, { name: clean });
  editInvalidate(s);
  return { groupId: id, toast: { text: `New group “${clean}” — its door is in Groups` } };
}

/** Place an existing word (add-flow.js placeWord). A stale occupied cell
 *  refuses (the owner throws) — nothing changes. Offers "Add to other
 *  groups" as the web's toast action. */
export function addPlace(appId, { groupId, cell = null, kind, id, label }) {
  const s = appSession(appId);
  try {
    PIP().groupsOps.placeItem(s.d, groupId, kind, id, cell);
  } catch (e) {
    return editPaint(appId, { toast: { text: "That cell is taken — pick another" } });
  }
  noteRecent(s, groupId);
  editInvalidate(s);
  return editPaint(appId, {
    toast: { text: `Added ${label}`, actionLabel: "Add to other groups",
      other: { kind, id, label } },
  });
}

/** § 4 — Make saves at once: name only, offline-first; the word card
 *  opens as step two ("✓ Added to …"). No clip mint (transport). */
export function addMake(appId, { groupId, cell = null, text }) {
  const s = appSession(appId);
  const name = String(text ?? "").trim();
  if (!name) return editPaint(appId);
  if (ownLeft(s) <= 0) {
    return editPaint(appId, {
      toast: { text: `That's your ${PIP().groups.OWN_WORDS_FREE} free words — Pip Lifetime adds unlimited.` },
    });
  }
  const id = `ent_${crypto.randomUUID().replaceAll("-", "")}`;
  PIP().groups.createEntity(s.d, { id, name, category: seedCategory(s, groupId) });
  try {
    PIP().groupsOps.placeItem(s.d, groupId, "entity", id, cell);
  } catch {
    PIP().groupsOps.placeItem(s.d, groupId, "entity", id, null); // stale cell: the rule picks
  }
  noteRecent(s, groupId);
  editInvalidate(s);
  const card = editCardModel(s, "entity", id);
  return editPaint(appId, {
    card: card ? { ...card, justAdded: { groupName: groupName(s, groupId, "My Words") } } : null,
  });
}

/* ---------------- Also in: add to other groups (LW-12) ---------------- */

/** groups-ui.js openAddToBoards: shown groups that do not hold the word,
 *  none preselected. */
export function otherGroups(appId, { kind, id, label }) {
  const s = appSession(appId);
  const layout = PIP().groups_shared.activeLayout(s.d);
  const holds = new Set(
    s.d.prepare("SELECT group_id FROM group_membership WHERE item_kind = ? AND item_id = ?")
      .all(kind, id).map((r) => r.group_id));
  return {
    kind, id, label,
    title: `Add ${label} to other groups`,
    groups: PIP().groups_shared.groupIndex(s.d)
      .filter((g) => !holds.has(g.id) && PIP().groups_shared.shownOn(s.d, g.id, layout))
      .map((g) => ({ id: g.id, name: PIP().groups.groupDisplayName(s.d, g, s.locale) })),
  };
}

/** One transaction, one op; Undo removes only what this added. */
export function otherGroupsSave(appId, { kind, id, label, groupIds }) {
  const s = appSession(appId);
  if (!groupIds?.length) return editPaint(appId);
  const { added, undo } = PIP().groupsOps.addToGroups(s.d, kind, id, groupIds);
  editInvalidate(s);
  if (!added.length) return editPaint(appId);
  const names = added.map((g) => groupName(s, g)).join(", ");
  return editPaint(appId, {
    toast: editToastWith(s, `Added ${label} to ${names}`, () => {
      undo();
      editInvalidate(s);
      return editPaint(appId);
    }),
  });
}

/* ---------------- the Library (LW-16) ---------------- */

/** library-ui.js renderLibrary: tabs Added | Suggested | All, one search
 *  field that searches everything when non-empty; each row says where it
 *  sits ("in …"). Read-only; a row opens the word card via edit.cardOpen. */
export function libraryState(appId, { tab = "added", q = "" }) {
  const s = appSession(appId);
  const L = PIP().library;
  const text = String(q ?? "").trim();
  const rows = text ? L.librarySearch(s.d, text, s.locale, PIP().normalize.normalizeV1)
    : tab === "added" ? L.libraryAdded(s.d, s.locale)
    : tab === "all" ? L.libraryAll(s.d, s.locale)
    : L.librarySuggested(s.d, s.locale);
  return {
    tab, q: text,
    tabs: [
      { id: "added", label: "Added" },
      { id: "suggested", label: "Suggested" },
      { id: "all", label: "All" },
    ],
    empty: rows.length ? null
      : text ? "No matches."
      : tab === "suggested"
        ? "Nothing here yet — words the device hears appear once the child does not have them yet."
        : "Nothing here yet.",
    rows: rows.map((r) => {
      const homes = L.libraryHomes(s.d, r.kind, r.id, s.locale);
      return {
        key: `${r.kind}:${r.id}`, kind: r.kind, id: r.id, label: r.label,
        role: r.role ?? "None", art: r.art ?? null, photoKey: r.photo_key ?? null,
        sub: homes.length ? `in ${homes.join(", ")}` : null,
      };
    }),
    total: rows.length,
  };
}

/* ---------------- placing on an empty board cell (LW-18) ---------------- */

/** board.js kidsUni: the answer table's unigram prior, as b36 ids. */
function kidsUni(s) {
  if (s.kidsUniCache) return s.kidsUniCache;
  const uni = {};
  const ph = s.phrases;
  if (ph?.uni) {
    for (const [k, n] of Object.entries(ph.uni)) {
      uni[`sns_${String(parseInt(k, 36)).padStart(4, "0")}`] = n;
    }
  } else {
    for (const row of Object.values(ph?.contexts ?? {})) {
      for (const [id, n] of Object.entries(row)) uni[id] = (uni[id] ?? 0) + n;
    }
  }
  return (s.kidsUniCache = uni);
}

export { kidsUni as placeUniFor };

/** place-ui.js paint on the home board: every word with no home cell,
 *  most-tapped first, filtered by the search field (first 30). */
export function placeList(appId, { q = "" }) {
  const s = appSession(appId);
  const rows = PIP().usecounts.offBoardItems(s.d, appGeom(s).name, s.locale, {
    counts: PIP().usecounts.useCounts(s.d), uni: kidsUni(s), q,
  });
  return {
    title: "What goes here?",
    empty: rows.length ? null : "Nothing matches.",
    rows: rows.slice(0, 30).map((r) => ({
      key: `${r.kind}:${r.id}`, kind: r.kind, id: r.id, label: r.label,
      role: r.role ?? "None", count: r.count,
    })),
  };
}

/** board.js placeUi.onPick: placeOnBoard with the anchors refused, an
 *  Undo toast that puts it back. */
export function placePick(appId, { slot, kind, id, label }) {
  const s = appSession(appId);
  const geom = appGeom(s);
  const mv = PIP().coremove.placeOnBoard(s.d, geom.name, kind, id, slot, {
    anchors: new Set(geom.anchors.keys()),
  });
  if (!mv) return editPaint(appId);
  editInvalidate(s);
  return editPaint(appId, {
    toast: editToastWith(s, `Placed ${label}`, () => {
      PIP().coremove.placeOnBoard(s.d, geom.name, kind, id, mv.from);
      editInvalidate(s);
      return editPaint(appId);
    }),
  });
}
