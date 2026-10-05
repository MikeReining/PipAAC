/**
 * Groups board mode (027; Motor_Grid § Groups). The one owner of what a
 * group page and the index show. Both render into #groupgrid — the same
 * physical space and cell size as the core grid. On every group page the
 * reserved cells belong to the page: the top row (when "Top row on every
 * group" is on) and the frame show the home board's own tiles, and the
 * last cell is Next, shown only when the group pages. Home sits in the
 * corner and Add beside Groups (board.js wires both). Writes go through
 * shared/groups.mjs.
 */
import { glowsHere, spotlight, spotlightGroups } from "../shared/spotlight.mjs";
import {
  addToGroups, createGroup, deleteGroup, geometryOf, groupDisplayName, groupIndex,
  groupPage, indexSlotAt, indexVisual, maskedSenseIds, moveGroup, moveItem, pageCount,
  removeItemUndoable, setGroupHidden, shownOn, swapGroups, swapItems,
} from "../shared/groups.mjs";

import { groupGlyph } from "./group-glyph.js";

const $ = (id) => document.getElementById(id);

export function mountGroups({
  db, locale, all, boardGeom, getEditing, getModelGlow, getLikelyGroups, isSupporter = () => false,
  setView, open, close, toast, wordTile, layerMark, fitLabels, tap, shownLabel,
  navCell, editPointer, xBadge, openAddForm, openWordCard, homeCells, homeTile, rerenderView,
  loadPhotoURL, savePhoto, syncUploadBlob,
}) {
  let indexPageNo = 0;
  let groupKey = null;
  let groupPageNo = 0;

  const profileFlag = (col) =>
    (all(db, `SELECT ${col} AS v FROM learner_profile WHERE id = 'prf_local'`)[0]?.v ?? 1) === 1;
  const isOccasion = (id) =>
    (all(db, "SELECT occasion FROM group_meta WHERE group_id = ?", [id])[0]?.occasion ?? 0) === 1;
  const nameOf = (id) => {
    const row = groupIndex(db).find((g) => g.id === id);
    return row ? groupDisplayName(db, row, locale) : "";
  };

  /** A group shows in the index on this size unless hidden — by its own
   *  switch, or with the occasions when those are off (027 B8). */
  function hiddenBy(row) {
    if (row.hidden) return "group";
    if (isOccasion(row.id) && !profileFlag("occasions_visible")) return "occasions";
    return null;
  }

  function groupIndexCell(row, vslot, spot = null) {
    const editing = getEditing();
    const el = document.createElement("button");
    // 018 D5: a group tile is a door — neutral gray with a folder tab.
    el.className = "gcell door";
    if (spot) el.classList.add(spot);
    el.dataset.slot = vslot;
    el.dataset.group = row.id;
    const g = groupGlyph(row, { db, locale, loadPhotoURL });
    const lb = document.createElement("span");
    lb.className = "glabel";
    lb.textContent = groupDisplayName(db, row, locale);
    el.appendChild(g);
    el.appendChild(lb);
    if (!editing) {
      el.addEventListener("click", () => openGroup(row.id));
      return el;
    }
    const why = hiddenBy(row);
    if (why) el.classList.add("hidden-door");
    if (row.kind === "custom") {
      el.appendChild(xBadge(() => askDeleteGroup(row)));
    }
    if (why === "occasions") {
      el.title = "Meal groups are off in Settings";
    } else {
      // A built-in group is hidden, never deleted; it keeps its slot.
      const hb = document.createElement("button");
      hb.className = "hbadge";
      hb.textContent = row.hidden ? "Show" : "Hide";
      hb.addEventListener("pointerdown", (e) => e.stopPropagation());
      hb.addEventListener("click", (e) => {
        e.stopPropagation();
        setGroupHidden(db, row.id, !row.hidden);
        renderGroupIndex();
      });
      el.appendChild(hb);
    }
    editPointer(el, {
      onTap: () => openGroup(row.id),
      onDrop: (slot) => {
        const indexSlot = indexSlotAt(indexPageNo, slot, boardGeom().cells);
        if (indexSlot < 10) return;
        const other = groupIndex(db).find((gr) => gr.index_slot === indexSlot);
        if (other) swapGroups(db, row.id, other.id);
        else moveGroup(db, row.id, indexSlot);
        renderGroupIndex();
      },
    });
    return el;
  }

  function askDeleteGroup(row) {
    $("del-title").textContent = `Delete ${groupDisplayName(db, row, locale)}?`;
    $("del-yes").onclick = () => {
      deleteGroup(db, row.id);
      close("delform");
      renderGroupIndex();
    };
    open("delform");
  }

  function pagerCell(pageNo, pages, onNext) {
    if (pages <= 1) {
      const blank = document.createElement("div");
      blank.className = "gcell empty reserved";
      return blank;
    }
    const el = navCell("Next ›", onNext);
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `${pageNo + 1}/${pages}`;
    el.appendChild(badge);
    return el;
  }

  function renderGroupIndex() {
    const zg = $("groupgrid");
    zg.innerHTML = "";
    const { cols, rows: nRows, cells, name: layout } = boardGeom();
    zg.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    zg.style.gridTemplateRows = `repeat(${nRows}, minmax(0, 1fr))`;
    const editing = getEditing();
    // Row 0 is reserved on the index too (doors start at canonical slot
    // 10): it shows the home board's tiles under the same rule as a group
    // page — frame cells always, the rest when the top-row setting is on.
    const geom = geometryOf(db, layout);
    const topRowOn = profileFlag("group_top_row");
    const home = new Map(homeCells().map((c) => [c.slot_index, c]));
    const placed = new Map();
    let indexPages = 1;
    for (const g of groupIndex(db)) {
      if (!shownOn(db, g.id, layout)) continue;
      if (!editing && hiddenBy(g)) continue; // hidden keeps its slot: nothing compacts
      const v = indexVisual(g.index_slot, cells);
      indexPages = Math.max(indexPages, v.page + 1);
      if (v.page === indexPageNo) placed.set(v.slot, g);
    }
    const spotGroups = glowsHere(spotlight(), isSupporter())
      ? spotlightGroups(db, spotlight().targets) : null;
    const modelGlow = getModelGlow();
    const modelGroups = !spotGroups && modelGlow.size
      ? spotlightGroups(db, new Set(modelGlow.keys())) : null;
    // 018 D9: no spotlight or modeling glow — the likely group glows
    // instead (sentence so far, time of day, this child's history). A
    // glow never opens, moves, or hides a door (027 B8).
    const likely = !spotGroups && !modelGroups ? getLikelyGroups() : null;
    if (indexPageNo >= indexPages) indexPageNo = indexPages - 1;
    for (let slot = 0; slot < cells; slot++) {
      if (slot === cells - 1) {
        zg.appendChild(pagerCell(indexPageNo, indexPages, () => {
          indexPageNo = (indexPageNo + 1) % indexPages;
          renderGroupIndex();
        }));
        continue;
      }
      const row = placed.get(slot);
      if (row) {
        zg.appendChild(groupIndexCell(
          row, slot, spotGroups ? (spotGroups.has(row.id) ? "glow" : "dimmed")
            : ((modelGroups?.has(row.id) || likely?.has(row.id)) ? "glow" : null)));
        continue;
      }
      if (slot < cols) {
        const showHome = geom.frame.includes(slot) || topRowOn;
        zg.appendChild(reservedCell(showHome ? home.get(slot) : null, editing));
        continue;
      }
      const empty = document.createElement("button");
      empty.className = "gcell empty";
      if (slot >= 2) empty.dataset.slot = slot; // a legal drop target in Edit mode
      empty.disabled = true;
      zg.appendChild(empty);
    }
  }

  function openGroupIndex() {
    setView("groupIndex");
  }

  async function openGroup(groupId) {
    groupKey = groupId;
    groupPageNo = 0;
    setView("group");
  }

  function senseCell(w, onTap) {
    const el = wordTile({ label: w.label, role: w.fitzgerald_role, art: w.art ?? null });
    el.addEventListener("click", onTap);
    return el;
  }

  async function entityCell(e, onTap) {
    const el = wordTile({ label: e.spoken_name, role: e.fitzgerald_role ?? "None" });
    const url = await loadPhotoURL(e.photo_key);
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      el.querySelector(".tart").appendChild(img);
      el.classList.add("photo");
    }
    el.addEventListener("click", onTap);
    return el;
  }

  /** A group word. In Edit mode: drag moves (to an empty content cell) or
   *  swaps (onto a word) at this size only, tap opens the word card, ×
   *  removes this placement with Undo — in any group (027 B9). */
  async function itemCell(item, ctx) {
    const { gestures, group, page, layout, onChange } = ctx;
    const onSpeak = gestures
      ? () => {}
      : () => tap(item.label, item.item_kind, item.item_id, { source: "group" });
    if (item.item_kind === "sense" && maskedSenseIds(db).has(item.item_id)) {
      // Masking § 2: the child sees a blank cell — the seat stays taken,
      // nothing shows or taps. Only the editor's ghost reveals it.
      if (!gestures) {
        const blank = document.createElement("div");
        blank.className = "gcell empty";
        return blank;
      }
      const ghost = senseCell(
        { fitzgerald_role: item.fitzgerald_role, label: item.label, art: item.art },
        () => openWordCard(item),
      );
      ghost.classList.add("masked");
      ghost.style.pointerEvents = "auto";
      ghost.dataset.item = `sense:${item.item_id}`;
      return ghost;
    }
    const el = item.item_kind === "sense"
      ? senseCell(
          { fitzgerald_role: item.fitzgerald_role,
            label: shownLabel?.(item.item_id, item.label) ?? item.label,
            art: item.art },
          onSpeak,
        )
      : await entityCell(
          { spoken_name: item.label, photo_key: item.photo_key,
            fitzgerald_role: item.fitzgerald_role },
          onSpeak,
        );
    layerMark(el, `${item.item_kind}:${item.item_id}`);
    el.dataset.slot = item.slot_index;
    el.dataset.item = `${item.item_kind}:${item.item_id}`;
    if (!gestures) return el;

    const x = xBadge(() => {
      const undo = removeItemUndoable(db, group, item.item_kind, item.item_id);
      onChange();
      toast(`Removed from ${nameOf(group)}`, () => {
        const { moved } = undo.undo();
        onChange();
        if (moved) toast(`${item.label} is back — its cell was taken, so it moved`);
      });
    });
    x.title = `Remove from ${nameOf(group)}`;
    el.appendChild(x);
    editPointer(el, {
      onTap: () => openWordCard(item),
      onDrop: (slot) => {
        const target = groupPage(db, group, page, locale, layout)
          .find((r) => r.slot_index === slot);
        if (target) {
          swapItems(db, group, item, { item_kind: target.item_kind, item_id: target.item_id }, layout);
        } else if (geometryOf(db, layout).content.includes(slot)) {
          moveItem(db, group, item.item_kind, item.item_id, page, slot, layout);
        }
        onChange();
      },
    });
    return el;
  }

  /** A reserved cell: the home board's own tile there (027 B3) — spoken
   *  like on the home board, never group content, never a drop target.
   *  Top-row cells stay empty (still reserved) when the setting is off. */
  function reservedCell(c, gestures) {
    // A hidden home word shows blank to the child; in the editor the
    // ghost stays tappable so it can be unhidden where it sits.
    const ghosted = c && c.kind === "sense" && maskedSenseIds(db).has(c.sense_id);
    if (!c || (ghosted && !gestures)) {
      const blank = document.createElement("div");
      blank.className = "gcell empty reserved";
      return blank;
    }
    const { el, say } = homeTile(c);
    el.classList.add("reserved");
    if (gestures) {
      if (ghosted) {
        el.disabled = false;
        el.style.pointerEvents = "auto";
        el.addEventListener("click", () =>
          openWordCard({ item_kind: "sense", item_id: c.sense_id, label: c.label }));
      } else {
        el.disabled = true;
        el.title = "Always here — from the main board";
      }
    } else if (say) {
      el.addEventListener("click", () => tap(say, c.kind, c.kind === "entity" ? c.entity_id : c.sense_id,
        { source: "group" }));
    }
    layerMark(el, c.kind === "entity" ? `entity:${c.entity_id}` : `sense:${c.sense_id}`);
    return el;
  }

  /**
   * Paint one page of a group into `zg` — the board's group view and the
   * web editor share this painter, so a group page has one renderer.
   * Returns the page count.
   */
  async function paintGroupPage(zg, { group, page, gestures, onChange, onNext }) {
    // Tiles resolve asynchronously; two paints in flight (a picture
    // landing while the page rerenders) must not interleave their cells.
    // Build off-screen and swap once — a superseded paint never lands.
    const gen = (zg._paintGen = (zg._paintGen ?? 0) + 1);
    const out = [];
    const { cols, rows, cells, name: layout } = boardGeom();
    const geom = geometryOf(db, layout);
    const items = new Map(groupPage(db, group, page, locale, layout).map((r) => [r.slot_index, r]));
    const pages = pageCount(db, group, layout);
    const topRowOn = profileFlag("group_top_row");
    const home = new Map(homeCells().map((c) => [c.slot_index, c]));
    const ctx = { gestures, group, page, layout, onChange };
    for (let slot = 0; slot < cells; slot++) {
      if (slot === geom.next) {
        out.push(pagerCell(page, pages, onNext));
        continue;
      }
      if (geom.frame.includes(slot) || geom.topRow.includes(slot)) {
        const showHome = geom.frame.includes(slot) || topRowOn;
        out.push(reservedCell(showHome ? home.get(slot) : null, gestures));
        continue;
      }
      const item = items.get(slot);
      if (item) {
        out.push(await itemCell(item, ctx));
        continue;
      }
      const empty = document.createElement("div");
      empty.className = "gcell empty";
      if (gestures) {
        empty.dataset.slot = slot; // a drop target, and tap-to-add here
        empty.addEventListener("click", () => openAddForm(group, { page, slot_index: slot }));
      }
      out.push(empty);
    }
    if (zg._paintGen !== gen) return pages;
    zg.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    zg.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
    zg.replaceChildren(...out);
    fitLabels(zg);
    return pages;
  }

  /** Every word the open group page shows — its own words plus the home
   *  tiles in its reserved cells. The empty-sentence bar never repeats
   *  one of them (027 § 5). */
  function visibleKeys() {
    const { name: layout } = boardGeom();
    const geom = geometryOf(db, layout);
    const keys = new Set(groupPage(db, groupKey, groupPageNo, locale, layout)
      .map((r) => `${r.item_kind}:${r.item_id}`));
    const topRowOn = profileFlag("group_top_row");
    for (const c of homeCells()) {
      if (geom.frame.includes(c.slot_index) || (topRowOn && geom.topRow.includes(c.slot_index))) {
        keys.add(c.kind === "entity" ? `entity:${c.entity_id}` : `sense:${c.sense_id}`);
      }
    }
    return keys;
  }

  async function renderGroupPage() {
    await paintGroupPage($("groupgrid"), {
      group: groupKey,
      page: groupPageNo,
      gestures: getEditing(),
      onChange: renderGroupPage,
      onNext: () => {
        groupPageNo = (groupPageNo + 1) % pageCount(db, groupKey);
        renderGroupPage();
      },
    });
  }

  /* --- Add to other boards (027 B9) --- */

  let boardsItem = null;
  let boardsPicked = new Set();

  /** Named destinations shown on this size, none preselected; groups that
   *  already hold the word are left out (never moved). */
  function openAddToBoards(item) {
    boardsItem = item;
    boardsPicked = new Set();
    const { name: layout } = boardGeom();
    const holds = new Set(all(db,
      "SELECT group_id FROM group_membership WHERE item_kind = ? AND item_id = ?",
      [item.item_kind, item.item_id]).map((r) => r.group_id));
    $("boards-title").textContent = `Add ${item.label} to other groups`;
    const list = $("boards-list");
    list.innerHTML = "";
    for (const g of groupIndex(db)) {
      if (holds.has(g.id) || !shownOn(db, g.id, layout)) continue;
      const chip = document.createElement("button");
      chip.className = "wchip";
      chip.textContent = groupDisplayName(db, g, locale);
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => {
        if (boardsPicked.has(g.id)) boardsPicked.delete(g.id);
        else boardsPicked.add(g.id);
        chip.setAttribute("aria-pressed", String(boardsPicked.has(g.id)));
        $("boards-save").disabled = boardsPicked.size === 0;
      });
      list.appendChild(chip);
    }
    $("boards-save").disabled = true;
    open("boardsform");
  }

  $("boards-save").addEventListener("click", () => {
    if (!boardsItem || !boardsPicked.size) return;
    const item = boardsItem;
    const { added, undo } = addToGroups(db, item.item_kind, item.item_id, [...boardsPicked]);
    close("boardsform");
    rerenderView();
    if (added.length) {
      toast(`Added ${item.label} to ${added.map(nameOf).join(", ")}`, () => { undo(); rerenderView(); });
    }
  });

  $("group-save").addEventListener("click", async () => {
    const name = $("group-name").value.trim();
    if (!name) return;
    const file = $("group-photo").files[0];
    const photo = file ? await savePhoto(file) : null;
    if (photo) syncUploadBlob(photo.bytes).catch(() => {});
    createGroup(db, { name, photoKey: photo?.key ?? null });
    $("group-name").value = "";
    $("group-photo").value = "";
    close("groupform");
    renderGroupIndex();
  });

  return {
    renderGroupIndex,
    renderGroupPage,
    openGroupIndex,
    openGroup,
    openAddToBoards,
    visibleKeys,
    getGroupKey: () => groupKey,
    setGroup(id, page) {
      groupKey = id;
      groupPageNo = page;
    },
    // The web editor paints group pages through the same painter.
    paintGroupPage,
  };
}
