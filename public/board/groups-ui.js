/**
 * Groups board mode. The index and each group page render into
 * #groupgrid — the same physical space and cell size as the core grid.
 * Slot 0 is always back; slot 1 is the Edit-mode action. Writes go
 * through shared/groups.mjs.
 */
import { spotlight, spotlightGroups } from "../shared/spotlight.mjs";
import {
  canonCell, createGroup, deleteGroup, groupDisplayName, groupIndex, groupPage,
  indexSlotAt, indexVisual, maskedSenseIds, moveGroup, moveItem, pageCount, pageGeom,
  posAtVisual, removeItemUndoable, swapGroups, swapItems,
} from "../shared/groups.mjs";

const $ = (id) => document.getElementById(id);

export function mountGroups({
  db, locale, all, boardGeom, getEditing, getModelGlow, getLikelyGroups,
  setView, open, close, toast, wordTile, layerMark, fitLabels, tap,
  navCell, editPointer, xBadge, openAddForm, openWordCard,
  loadPhotoURL, savePhoto, syncUploadBlob,
}) {
  let indexPageNo = 0;
  let groupKey = null;
  let groupPageNo = 0;

  function groupIndexCell(row, vslot, spot = null) {
    const editing = getEditing();
    const el = document.createElement("button");
    // 018 D5: a group tile is a door — neutral gray with a folder tab.
    el.className = "gcell door";
    if (spot) el.classList.add(spot);
    el.dataset.slot = vslot;
    el.dataset.group = row.id;
    const g = document.createElement("span");
    g.className = "glyph";
    g.textContent = row.glyph ?? "🗂️";
    if (row.photo_key) {
      loadPhotoURL(row.photo_key).then((url) => {
        if (!url) return;
        const img = document.createElement("img");
        img.src = url;
        g.replaceChildren(img);
      });
    }
    const lb = document.createElement("span");
    lb.className = "glabel";
    lb.textContent = groupDisplayName(db, row, locale);
    el.appendChild(g);
    el.appendChild(lb);
    if (!editing) {
      el.addEventListener("click", () => openGroup(row.id));
      return el;
    }
    if (row.kind === "custom") {
      el.appendChild(xBadge(() => askDeleteGroup(row)));
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

  function editSlotCell(label, onTap) {
    if (label && onTap) return navCell(label, onTap);
    const blank = document.createElement("button");
    blank.className = "gcell empty";
    blank.disabled = true;
    return blank;
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

  function renderGroupIndex() {
    const zg = $("groupgrid");
    zg.innerHTML = "";
    const { cols, rows: nRows, cells } = boardGeom();
    const geom = pageGeom(cells);
    zg.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    zg.style.gridTemplateRows = `repeat(${nRows}, 1fr)`;
    const placed = new Map();
    let indexPages = 1;
    for (const g of groupIndex(db)) {
      const v = indexVisual(g.index_slot, cells);
      indexPages = Math.max(indexPages, v.page + 1);
      if (v.page === indexPageNo) placed.set(v.slot, g);
    }
    const spotGroups = spotlight()
      ? spotlightGroups(db, spotlight().targets) : null;
    const modelGlow = getModelGlow();
    const modelGroups = !spotGroups && modelGlow.size
      ? spotlightGroups(db, new Set(modelGlow.keys())) : null;
    // 018 D9: no spotlight or modeling glow — the likely group glows
    // instead (sentence so far, time of day, this child's history).
    const likely = !spotGroups && !modelGroups ? getLikelyGroups() : null;
    if (indexPageNo >= indexPages) indexPageNo = indexPages - 1;
    for (let slot = 0; slot < cells; slot++) {
      if (slot === 0) {
        zg.appendChild(navCell("← Board", () => setView("board")));
        continue;
      }
      if (slot === 1) {
        zg.appendChild(editSlotCell(getEditing() && "+ Group", () => open("groupform")));
        continue;
      }
      if (slot === geom.next) {
        if (indexPages > 1) {
          const el = navCell("Next ›", () => {
            indexPageNo = (indexPageNo + 1) % indexPages;
            renderGroupIndex();
          });
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = `${indexPageNo + 1}/${indexPages}`;
          el.appendChild(badge);
          zg.appendChild(el);
        } else {
          const blank = document.createElement("div");
          blank.className = "gcell empty";
          zg.appendChild(blank);
        }
        continue;
      }
      const row = placed.get(slot);
      if (row) {
        zg.appendChild(groupIndexCell(
          row, slot, spotGroups ? (spotGroups.has(row.id) ? "glow" : "dimmed")
            : ((modelGroups?.has(row.id) || likely?.has(row.id)) ? "glow" : null)));
        continue;
      }
      const empty = document.createElement("button");
      empty.className = "gcell empty";
      empty.dataset.slot = slot;
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
    const el = wordTile({ label: e.spoken_name, role: "Yellow" });
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

  async function itemCell(item, gKind, ctx = {}) {
    const editing = getEditing();
    const {
      gestures = editing,
      group = groupKey,
      page = groupPageNo,
      cells = boardGeom().cells,
      onChange = renderGroupPage,
    } = ctx;
    const onSpeak = gestures
      ? () => {}
      : () => tap(item.label, item.item_kind, item.item_id, { source: "group" });
    if (item.item_kind === "sense" && maskedSenseIds(db).has(item.item_id)) {
      const ghost = senseCell(
        { fitzgerald_role: item.fitzgerald_role, label: item.label, art: item.art },
        gestures ? () => openWordCard(item) : () => {},
      );
      ghost.classList.add("masked");
      ghost.style.pointerEvents = gestures ? "auto" : "none";
      return ghost;
    }
    const el = item.item_kind === "sense"
      ? senseCell(
          { fitzgerald_role: item.fitzgerald_role, label: item.label, art: item.art },
          onSpeak,
        )
      : await entityCell(
          { spoken_name: item.label, photo_key: item.photo_key },
          onSpeak,
        );
    layerMark(el, `${item.item_kind}:${item.item_id}`);
    el.dataset.slot = item.vslot ?? item.slot_index;
    el.dataset.item = `${item.item_kind}:${item.item_id}`;
    if (!gestures) return el;

    const removable =
      item.item_kind === "entity" ? group !== "grp_my_words" : gKind !== "builtin";
    if (removable) {
      el.appendChild(xBadge(() => {
        const undo = removeItemUndoable(db, group, item.item_kind, item.item_id);
        onChange();
        toast(`Removed ${item.label}`, () => { undo.undo(); onChange(); });
      }));
    }
    editPointer(el, {
      onTap: () => openWordCard(item),
      onDrop: (slot) => {
        const target = groupPage(db, group, page, locale, cells)
          .find((r) => r.vslot === slot);
        if (target) {
          swapItems(db, group, item, { item_kind: target.item_kind, item_id: target.item_id });
        } else {
          const c = canonCell(posAtVisual(page, slot, cells));
          moveItem(db, group, item.item_kind, item.item_id, c.page, c.slot_index);
        }
        onChange();
      },
    });
    return el;
  }

  async function renderGroupPage() {
    const zg = $("groupgrid");
    zg.innerHTML = "";
    const cells = boardGeom().cells;
    const geom = pageGeom(cells);
    zg.style.gridTemplateColumns = `repeat(${boardGeom().cols}, 1fr)`;
    zg.style.gridTemplateRows = `repeat(${boardGeom().rows}, 1fr)`;
    const items = new Map(
      groupPage(db, groupKey, groupPageNo, locale, cells).map((r) => [r.vslot, r]),
    );
    const pages = pageCount(db, groupKey, cells);
    const gKind = all(db, "SELECT kind FROM board_group WHERE id = ?", [groupKey])[0]?.kind;
    const editing = getEditing();

    for (let slot = 0; slot < cells; slot++) {
      if (slot === 0) {
        zg.appendChild(navCell("← Groups", openGroupIndex));
        continue;
      }
      if (slot === 1) {
        zg.appendChild(editSlotCell(editing && "+ Add", () => openAddForm(groupKey)));
        continue;
      }
      if (slot === geom.next) {
        if (pages > 1) {
          const el = navCell("Next ›", () => {
            groupPageNo = (groupPageNo + 1) % pages;
            renderGroupPage();
          });
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = `${groupPageNo + 1}/${pages}`;
          el.appendChild(badge);
          zg.appendChild(el);
        } else {
          const blank = document.createElement("div");
          blank.className = "gcell empty";
          zg.appendChild(blank);
        }
        continue;
      }
      const item = items.get(slot);
      if (!item) {
        const empty = document.createElement("div");
        empty.className = "gcell empty";
        if (editing) {
          empty.dataset.slot = slot;
          empty.addEventListener("click", () => {
            openAddForm(groupKey, canonCell(posAtVisual(groupPageNo, slot, cells)));
          });
        }
        zg.appendChild(empty);
        continue;
      }
      zg.appendChild(await itemCell(item, gKind));
    }
    fitLabels(zg);
  }

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
    getGroupKey: () => groupKey,
    setGroup(id, page) {
      groupKey = id;
      groupPageNo = page;
    },
    // The web editor paints the same cells. It stays in board.js until
    // that surface moves; this is the painter it already called.
    itemCell,
  };
}
