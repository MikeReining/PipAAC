/**
 * The word-card and editor rows that came after E1 (phase 044 slice E8):
 * Swap (LW-8), Colour (LW-13) and the editor's save status (LW-22).
 * Exported from core_entry.mjs as PIPCORE.card. ("Sounds wrong", LW-20,
 * is app_say.mjs flagTile - it shares the voice client's identity.)
 *
 * Each write is the web's own owner, called the way the web calls it:
 *  - Swap on the main board: placeUi.onPick -> coremove.placeOnBoard
 *    (board.js ~L1295); in a group: placeUi.onGroupPick ->
 *    groups_ops.replaceGroupItem (board.js ~L1319). The lists are
 *    usecounts.offBoardItems / notInGroupItems, the same two functions
 *    place-ui.js paint() calls, ranked by the child's own counts.
 *  - Colour: word-card.js paintKind -> groups.setEntityRole, then the
 *    role cache drops (dropEntityRole).
 *  - Save status: board/editor-find.js editorStatus over the same inputs
 *    editor-ui.js syncState() reads: sync_op rows the relay has not
 *    accepted, syncHealth(), and the connection.
 */
import { appGeom, appSession } from "./app.mjs";
import {
  editCardModel, editInvalidate, editPaint, editToastWith,
} from "./app_edit.mjs";
import { placePick, placeUniFor } from "./app_library.mjs";
import { syncHealth } from "./app_sync.mjs";
import { editorStatus } from "../../public/board/editor-find.js";

const PIP = () => globalThis.PIPCORE;
const one = (d, sql, p = []) => d.prepare(sql).all(...p)[0];

/* ---------------- Swap (LW-8) ---------------- */

/** place-ui.js open() + paint(): the head row (the tapped tile and its
 *  30-day count) and the list — most-tapped first, filtered by `q`, the
 *  first 30. A group seat lists words not in that group. */
export function swapList(appId, { kind, id, groupId = null, q = "" }) {
  const s = appSession(appId);
  const counts = PIP().usecounts.useCounts(s.d);
  const uni = placeUniFor(s);
  const rows = groupId
    ? PIP().usecounts.notInGroupItems(s.d, groupId, s.locale, { counts, uni, q })
    : PIP().usecounts.offBoardItems(s.d, appGeom(s).name, s.locale, { counts, uni, q });
  const card = editCardModel(s, kind, id);
  return {
    head: card ? {
      kind, id, label: card.label, role: card.role ?? "None",
      count: counts.get(`${kind}:${id}`) ?? 0,
    } : null,
    empty: rows.length ? null : "Nothing matches.",
    rows: rows.slice(0, 30).map((r) => ({
      key: `${r.kind}:${r.id}`, kind: r.kind, id: r.id, label: r.label,
      role: r.role ?? "None", count: r.count,
    })),
  };
}

/** The pick. Main board: the web's onPick (placeOnBoard, "Placed X").
 *  Group: the web's onGroupPick (replaceGroupItem, "Replaced X with Y");
 *  a refused cell changes nothing. `slot` / `page` come from the card's
 *  swap context; Undo puts the old word back. */
export function swapPick(appId, {
  kind, id, label, groupId = null, page = 0, slot, pickKind, pickId, pickLabel,
}) {
  const s = appSession(appId);
  if (!groupId) {
    return placePick(appId, { slot, kind: pickKind, id: pickId, label: pickLabel });
  }
  let rep;
  try {
    rep = PIP().groupsOps.replaceGroupItem(s.d, groupId, { kind, id },
      { kind: pickKind, id: pickId }, { page, slot_index: slot });
  } catch {
    return editPaint(appId); // the cell refused — nothing changed
  }
  editInvalidate(s);
  return editPaint(appId, {
    toast: editToastWith(s, `Replaced ${label} with ${pickLabel}`, () => {
      rep.undo();
      editInvalidate(s);
      return editPaint(appId);
    }),
  });
}

/* ---------------- Colour (LW-13) ---------------- */

/** word-card.js paintKind swatch click: personal words only; the same
 *  role is a no-op. Answers the repainted card. */
export function cardSetKind(appId, { id, role }) {
  const s = appSession(appId);
  const card = editCardModel(s, "entity", id);
  if (!card || !card.canColour || role === card.role) return editPaint(appId, { card });
  PIP().groups.setEntityRole(s.d, id, role);
  s.entRole.delete(id);
  editInvalidate(s);
  return editPaint(appId, { card: editCardModel(s, "entity", id) });
}

/* ---------------- editor save status (LW-22) ---------------- */

/** editor-ui.js renderStatus: editorStatus(syncState()). The connection,
 *  whether a sync loop is linked, and a failed local write come from
 *  Swift (it owns the network monitor and the registry); everything
 *  else is read here. The native database is durable per statement, so
 *  there is no "dirty"/"blocked" state; `saveError` is a core write that
 *  threw. */
export function editorStatusOf(appId, { linked = false, online = true, saveError = false } = {}) {
  const s = appSession(appId);
  const pending = one(s.d, "SELECT COUNT(*) AS n FROM sync_op WHERE relay_seq IS NULL")?.n ?? 0;
  const h = syncHealth();
  return editorStatus({
    linked, pending, online, ...h,
    saveBlocked: false, saveError, dirty: false,
  });
}
