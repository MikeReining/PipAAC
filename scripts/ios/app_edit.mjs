/**
 * The iOS Edit-mode + word-card facade (phase 044 slice E1): the adult
 * gestures of board.js / grid.js / groups-ui.js / word-card.js as render
 * models SwiftUI draws. Exported from core_entry.mjs as PIPCORE.edit.
 *
 * Every write is ONE call into the shared owner the web calls —
 * groups.renameEntity / setMask / retireEntity / restoreEntity,
 * groups_ops.removeItemUndoable / moveItem / swapItems, coremove.moveCore
 * / placeOnBoard — so the table change and its sync_op row happen
 * together and sync replays them later. Nothing here writes SQL for a
 * synced table. Every function returns the whole painted edit state;
 * Swift renders, never re-derives.
 *
 * Edit state: { editing, surface: 'board'|'group', board, groupPage,
 *   card, toast: { text, undo? } }. `undo` is a token for editUndo —
 *   the web's one-toast Undo button (edit-shared.js toast).
 *
 * Not in E1: adding words, pictures, voice rows, colour, "Also in" add,
 * Swap/Replace, group management (later slices; see the inventory).
 */
import {
  appBoard, appGeom, appGroupPage, appMeta, appSession,
} from "./app.mjs";
import { mediaFor } from "./app_media.mjs";

const PIP = () => globalThis.PIPCORE;
const one = (d, sql, p = []) => d.prepare(sql).all(...p)[0];

/* ---------------- render model ---------------- */

function paint(appId, extra = {}) {
  const s = appSession(appId);
  const group = s.view === "group" && s.groupId !== null;
  return {
    editing: !!s.editing,
    surface: group ? "group" : "board",
    board: appBoard(appId),
    groupPage: group ? appGroupPage(appId, s.groupId, s.page) : null,
    card: null,
    toast: null,
    ...extra,
  };
}

/** The word card's model (word-card.js openWordCard): the tile as the
 *  child sees it, then what an adult can change. A catalog word is not
 *  renamed here ("a new copy" is the web's answer); personal words are. */
function cardModel(s, kind, id) {
  const d = s.d;
  const layout = PIP().groups_shared.activeLayout(d);
  let base;
  if (kind === "entity") {
    const e = one(d,
      `SELECT id, spoken_name, fitzgerald_role, photo_key FROM personal_entity
       WHERE id = ? AND status = 'active'`, [id]);
    if (!e) return null;
    base = { label: e.spoken_name, role: e.fitzgerald_role ?? "None",
      art: null, photoKey: e.photo_key };
  } else {
    const row = one(d,
      `SELECT l.text AS label FROM sense s JOIN label l ON l.sense_id = s.id
         AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
       WHERE s.id = ?`, [s.locale, id]);
    if (!row) return null;
    const m = appMeta(s, id);
    base = { label: row.label, role: m.role ?? "None", art: m.art, photoKey: null };
  }
  const isEnt = kind === "entity";
  const homes = isEnt
    ? PIP().groups.entityGroups(d, id, s.locale)
    : PIP().groups.senseGroups(d, id, s.locale);
  return {
    kind, id, ...base,
    media: mediaFor(s, kind, id),
    isEntity: isEnt,
    canRename: isEnt,
    canHide: !isEnt,
    canRemove: isEnt,
    hidden: !isEnt && PIP().groups.maskedSenseIds(d).has(id),
    hint: isEnt ? "Tap the name to change it" : "Tap the word to hear it",
    onMainBoard: PIP().coremove.cellSlot(d, appGeom(s).name, kind, id) !== null,
    groups: homes
      .filter((g) => PIP().groups_shared.shownOn(d, g.id, layout))
      .map((g) => ({ id: g.id, name: g.name })),
  };
}

/* ---------------- undo toasts ---------------- */

/** One pending undo per toast; tokens are session-local (a toast lives
 *  six seconds on screen, never across a relaunch). */
function toastWith(s, text, undo) {
  if (!undo) return { text };
  s.editUndo ??= new Map();
  s.editUndoSeq = (s.editUndoSeq ?? 0) + 1;
  const token = `u${s.editUndoSeq}`;
  s.editUndo.set(token, undo);
  if (s.editUndo.size > 20) s.editUndo.delete(s.editUndo.keys().next().value);
  return { text, undo: token };
}

const invalidate = (s) => { s.kbIndex = null; }; // editor-ui invalidateIndex()

/* ---------------- Edit mode (LW-1) ---------------- */

/** Enter Edit mode. The caller (Swift) has already passed the Settings
 *  PIN gate — the web reaches Edit through Settings → "Edit the board". */
export function editOpen(appId) {
  const s = appSession(appId);
  s.editing = true;
  s.expand = null;
  s.kbOpen = false;
  return paint(appId);
}

/** Leave Edit mode (✓ Done). */
export function editClose(appId) {
  const s = appSession(appId);
  s.editing = false;
  invalidate(s);
  return paint(appId);
}

/** The current edit paint without changing anything (a navigation
 *  re-read: group page flipped, board re-shown). */
export function editState(appId) { return paint(appId); }

/* ---------------- the word card (LW-6) ---------------- */

export function cardOpen(appId, { kind, id }) {
  const s = appSession(appId);
  return paint(appId, { card: cardModel(s, kind, id) });
}

/** The tile speaks when tapped, as it does for the child — through the
 *  same resolveSlot, with no sentence, bar or log involved. */
export function cardSpeech(appId, { kind, id, text }) {
  const s = appSession(appId);
  return { speech: PIP().voice.resolveSlot(s.d, { kind, id, text }, s.locale, s.voiceId) };
}

/* ---------------- rename (LW-7) ---------------- */

/** word-card.js name field `change`: whitespace collapsed, empty or
 *  unchanged restores the field; otherwise renameEntity. The on-demand
 *  clip mint (tile.ensure) needs transport — not here. */
export function cardRename(appId, { kind, id, name }) {
  const s = appSession(appId);
  const card = cardModel(s, kind, id);
  if (!card || !card.canRename) return paint(appId, { card });
  const next = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!next || next === card.label) return paint(appId, { card });
  PIP().groups.renameEntity(s.d, id, next);
  s.entRole.delete(id);
  invalidate(s);
  return paint(appId, { card: cardModel(s, kind, id) });
}

/* ---------------- hide / show (LW-9) ---------------- */

/** #wc-hide: catalog words only; toggles, closes the card, toasts. */
export function cardToggleHidden(appId, { id }) {
  const s = appSession(appId);
  const card = cardModel(s, "sense", id);
  if (!card) return paint(appId);
  const hidden = !PIP().groups.maskedSenseIds(s.d).has(id);
  PIP().groups.setMask(s.d, id, hidden);
  invalidate(s);
  return paint(appId, {
    toast: toastWith(s, hidden ? `Hid ${card.label}` : `Showing ${card.label}`),
  });
}

/* ---------------- remove (LW-10) ---------------- */

/** #wc-remove: retire, never delete; Undo restores. */
export function cardRemove(appId, { id }) {
  const s = appSession(appId);
  const card = cardModel(s, "entity", id);
  if (!card) return paint(appId);
  PIP().groups.retireEntity(s.d, id);
  s.entRole.delete(id);
  invalidate(s);
  return paint(appId, {
    toast: toastWith(s, `Removed ${card.label}`, () => {
      PIP().groups.restoreEntity(s.d, id);
      invalidate(s);
      return paint(appId);
    }),
  });
}

/** The ✕ on a group tile or on the card's "Also in" chip: remove this
 *  placement only (027 B9); the word stays in the Library. */
export function leaveGroup(appId, { kind, id, groupId, label, fromCard = false }) {
  const s = appSession(appId);
  const row = one(s.d, "SELECT * FROM board_group WHERE id = ?", [groupId]);
  const gname = row ? PIP().groups.groupDisplayName(s.d, row, s.locale) : "";
  const undo = PIP().groupsOps.removeItemUndoable(s.d, groupId, kind, id);
  const word = label ?? cardModel(s, kind, id)?.label ?? "";
  return paint(appId, {
    card: fromCard ? cardModel(s, kind, id) : null,
    toast: toastWith(s, `Removed from ${gname}`, () => {
      const { moved } = undo.undo();
      return paint(appId, {
        card: fromCard ? cardModel(s, kind, id) : null,
        toast: moved
          ? toastWith(s, fromCard
            ? `${word} is back in ${gname} — its cell was taken, so it moved`
            : `${word} is back — its cell was taken, so it moved`)
          : null,
      });
    }),
  });
}

/** The toast's Undo button. Runs once; a spent or unknown token is a
 *  plain repaint (edit-shared.js: `used` guard). */
export function editUndo(appId, { token }) {
  const s = appSession(appId);
  const run = s.editUndo?.get(token);
  if (!run) return paint(appId);
  s.editUndo.delete(token);
  return run();
}

/* ---------------- move / swap (LW-11) ---------------- */

/** grid.js onDrop on the home board: a sense moves with moveCore, a
 *  person with placeOnBoard; anchors and reserved cells refuse (no-op).
 *  Dropping on a word swaps the two; on an empty cell it moves. */
export function boardDrop(appId, { kind, id, toSlot, label }) {
  const s = appSession(appId);
  const geom = appGeom(s);
  const opts = { anchors: new Set(geom.anchors.keys()) };
  const back = (to) => (kind === "sense"
    ? PIP().coremove.moveCore(s.d, geom.name, id, to)
    : PIP().coremove.placeOnBoard(s.d, geom.name, "entity", id, to));
  const mv = kind === "sense"
    ? PIP().coremove.moveCore(s.d, geom.name, id, toSlot, opts)
    : PIP().coremove.placeOnBoard(s.d, geom.name, "entity", id, toSlot, opts);
  if (!mv) return paint(appId);
  const word = label ?? cardModel(s, kind, id)?.label ?? "";
  return paint(appId, {
    toast: toastWith(s, `Moved ${word}`, () => {
      back(mv.from);
      return paint(appId);
    }),
  });
}

/** groups-ui.js onDrop on a group page: onto a word swaps just those
 *  two; onto a free content cell moves; anything else is a no-op. */
export function groupDrop(appId, { groupId, kind, id, toSlot }) {
  const s = appSession(appId);
  const layout = PIP().groups_shared.activeLayout(s.d);
  const page = s.page;
  const here = PIP().groups.groupPage(s.d, groupId, page, s.locale, layout);
  const target = here.find((r) => r.slot_index === toSlot);
  if (target) {
    if (target.item_kind === kind && target.item_id === id) return paint(appId);
    PIP().groupsOps.swapItems(s.d, groupId, { item_kind: kind, item_id: id },
      { item_kind: target.item_kind, item_id: target.item_id }, layout);
  } else if (PIP().groups_shared.geometryOf(s.d, layout).content.includes(toSlot)) {
    PIP().groupsOps.moveItem(s.d, groupId, kind, id, page, toSlot, layout);
  }
  return paint(appId);
}

/* ---------------- UI-test seam ---------------- */

/** Seat one personal word on the home board the way onboarding does
 *  (018 slice 3: the first person takes mom's cell). Used only by the
 *  XCUITest launch argument — adding words is a later slice (LW-2..5),
 *  and rename/remove need a personal word to act on. */
export function testSeedPerson(appId, { name }) {
  const s = appSession(appId);
  const { id } = PIP().groups.createEntity(s.d, { name, role: "Yellow" });
  PIP().coremove.seatSetupPeople(s.d, [id], s.locale);
  invalidate(s);
  return { id, ...paint(appId) };
}

/* Shared with the sibling facade app_library.mjs (E2): one paint, one
 * card model, one toast shape — never copied. */
export {
  paint as editPaint, cardModel as editCardModel,
  toastWith as editToastWith, invalidate as editInvalidate,
};
