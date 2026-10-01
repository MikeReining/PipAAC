/**
 * The placement sheet (018 D10): Edit mode, tap any tile or an empty
 * cell — "what goes here". The head row shows the tapped tile, its
 * 30-day count, and a ✎ that opens the word card. One search field,
 * then the list — most-tapped first (the child's own counts — day one
 * orders by the children table).
 *
 * Two inventories (031): a board slot offers every word with no home
 * cell (`offBoardItems`); a group cell offers every word not already in
 * that group (`notInGroupItems`) — a word can sit on the board and in
 * any number of groups at once. Choosing calls back into board.js,
 * which writes the placement — this module only draws the sheet.
 */
import { notInGroupItems, offBoardItems } from "../shared/usecounts.mjs";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function mountPlacePicker({ db, locale, getLayout, getCounts, getUni, onPick, onGroupPick, onEdit }) {
  let slot = null;
  let occupant = null; // { kind, id, label, role } — the tapped tile, if any
  let groupCtx = null; // { groupId, cell } — a Replace inside a group

  function paint() {
    const counts = getCounts();
    const rows = groupCtx
      ? notInGroupItems(db, groupCtx.groupId, locale, {
        counts, uni: getUni(), q: $("place-q").value,
      })
      : offBoardItems(db, getLayout(), locale, {
        counts, uni: getUni(), q: $("place-q").value,
      });
    const list = $("place-list");
    list.replaceChildren();
    if (!rows.length) {
      list.appendChild(el("p", "hint", "Nothing matches."));
      return;
    }
    for (const r of rows.slice(0, 30)) {
      const b = el("button", "place-row");
      b.type = "button";
      b.append(el("span", `prole r-${r.role ?? "None"}`, r.label),
               el("span", "hint", String(r.count)));
      b.addEventListener("click", () => groupCtx
        ? onGroupPick(groupCtx.groupId, groupCtx.cell, occupant, r.kind, r.id, r.label)
        : onPick(slot, r.kind, r.id, r.label));
      list.appendChild(b);
    }
  }

  $("place-q").addEventListener("input", paint);
  $("place-edit").addEventListener("click", () => {
    if (occupant) onEdit(occupant);
  });

  function open() {
    $("place-head").hidden = !occupant;
    if (occupant) {
      const tile = $("place-tile");
      tile.textContent = occupant.label;
      tile.className = `ptile r-${occupant.role ?? "None"}`;
      $("place-count").textContent =
        String(getCounts().get(`${occupant.kind}:${occupant.id}`) ?? 0);
    }
    $("place-q").value = "";
    paint();
    document.getElementById("placeform").classList.add("open");
    $("place-q").focus();
  }

  return {
    openPicker(s, occ = null) {
      slot = s;
      occupant = occ;
      groupCtx = null;
      open();
    },
    openGroupPicker(groupId, cell, occ) {
      slot = null;
      groupCtx = { groupId, cell };
      occupant = occ;
      open();
    },
  };
}
