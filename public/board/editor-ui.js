/**
 * The board editor (031): the board is the editor. Top bar — who, the one
 * Add-or-find field, an honest save status, Preview. Left — the main board,
 * the groups in door order, All words. Center — the real main board or
 * group, painted by the board's own painters with adult gestures. Right —
 * the word card, docked, only while a word is selected.
 *
 * Every write goes through the shared owners (groups.mjs, coremove.mjs,
 * bulk.mjs), so each edit is an op and syncs. UI only: nothing here owns
 * data.
 */
import {
  activeLayout, createEntity, createGroup, deleteGroupUndoable, groupDisplayName,
  groupIndex, pageCount, placeItem, removeItemUndoable, renameGroup,
  setGroupGlyph, setGroupHidden, swapGroups,
} from "../shared/groups.mjs";
import { placeOnBoard } from "../shared/coremove.mjs";
import { nameFromFile } from "../shared/bulk.mjs";
import {
  libraryAdded, libraryAll, libraryHomes, librarySearch, librarySuggested,
} from "../shared/library.mjs";
import { normalizeV1 } from "../shared/normalize.mjs";
import { listUsers } from "../shared/users.mjs";
import { overrideFor } from "../shared/voice.mjs";
import { ICON_SET, groupGlyph, iconUrl } from "./group-glyph.js";
import { editorStatus, findSections, isList } from "./editor-find.js";

const $ = (id) => document.getElementById(id);
const HELLO_KEY = "pip-ed-hello-done";
const PLACE_KEY = "pip-ed-place";
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
/* Where the adult is in the editor, for this tab: survives Preview and a
   reload; Done (leaving the editor) forgets it. */
const tabPlace = {
  get: () => { try { return JSON.parse(sessionStorage.getItem(PLACE_KEY) ?? "null"); } catch { return null; } },
  set: (v) => { try { sessionStorage.setItem(PLACE_KEY, JSON.stringify(v)); } catch { /* private mode */ } },
  clear: () => { try { sessionStorage.removeItem(PLACE_KEY); } catch { /* private mode */ } },
};

export function mountEditor({
  db, locale, all, catalog, me, userStore, flushDb,
  paintGroupPage, renderMainBoard, homeCells, boardGeom,
  addFlow, openWordCard, closeCard,
  setView, openGroupView, toast, undoLast, syncState,
  renderLibrary, invalidateIndex, renderStrip,
  savePhoto, syncUploadBlob, tile, loadPhotoURL, artInto, flashCell,
}) {
  /* where: { kind: "main" } | { kind: "group", id, page } | { kind: "words" } */
  let where = { kind: "main" };
  let selected = new Map(); // "kind:id" → { item_kind, item_id, label }
  let lastPointerAdds = false; // shift/⌘ held on the last press — multi-select
  let previewing = false; // Preview is up: the place is frozen, not cleared
  let restoreCard = false; // reopen the selected word's card on the next paint
  const gridHome = { parent: null, next: null };

  const name = () => me?.name?.trim() || "this person";
  const Name = () => me?.name?.trim() || "This person";
  const groupRow = (id) => all(db, "SELECT * FROM board_group WHERE id = ?", [id])[0] ?? null;
  const groupName = (id) => { const r = groupRow(id); return r ? groupDisplayName(db, r, locale) : ""; };
  const addTarget = () => (where.kind === "group" ? where.id : "grp_my_words");
  const homeKeys = () => new Set((homeCells?.() ?? [])
    .map((c) => (c.kind === "entity" ? `entity:${c.entity_id}` : `sense:${c.sense_id}`)));

  /* ------------------------------ top bar ------------------------------ */

  async function renderPerson() {
    const btn = $("ed-person");
    const people = await listUsers(userStore).catch(() => []);
    btn.textContent = Name();
    if (people.length > 1) {
      const caret = document.createElement("span");
      caret.className = "caret";
      caret.textContent = " ▾";
      btn.appendChild(caret);
    }
    btn.disabled = people.length < 2;
    btn.onclick = () => {
      const pop = $("ed-people");
      if (!pop.hidden) { pop.hidden = true; return; }
      pop.replaceChildren();
      for (const u of people) {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.textContent = u.name?.trim() || "Unnamed";
        if (u.id === me.id) b.classList.add("on");
        b.addEventListener("click", async () => {
          pop.hidden = true;
          if (u.id === me.id) return;
          sessionStorage.setItem("pip_active_user", u.id);
          await flushDb();
          location.reload();
        });
        pop.appendChild(b);
      }
      pop.hidden = false;
    };
  }

  function renderStatus() {
    const el = $("ed-status");
    if (!el) { clearInterval(statusTimer); return; } // page torn down
    const st = editorStatus(syncState());
    el.textContent = st.text;
    el.dataset.tone = st.tone;
  }

  /* ----------------------------- groups list --------------------------- */

  function memberCounts() {
    return new Map(all(db,
      "SELECT group_id AS g, COUNT(*) AS n FROM group_membership GROUP BY group_id")
      .map((r) => [r.g, r.n]));
  }

  function navRow({ id, label, glyph, count, on, onClick }) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ed-grow" + (on ? " on" : "");
    if (id) b.dataset.group = id;
    b.append(glyph);
    const n = document.createElement("span");
    n.className = "ed-gname";
    n.textContent = label;
    b.appendChild(n);
    if (count != null) {
      const c = document.createElement("span");
      c.className = "ed-gcount";
      c.textContent = String(count);
      b.appendChild(c);
    }
    b.addEventListener("click", onClick);
    return b;
  }

  const plainGlyph = (text, cls = "") => {
    const g = document.createElement("span");
    g.className = `glyph ${cls}`.trim();
    g.textContent = text;
    return g;
  };

  function groupItem(g, counts) {
    const wrap = document.createElement("div");
    wrap.className = "ed-gitem";
    const row = navRow({
      id: g.id, label: groupDisplayName(db, g, locale),
      glyph: groupGlyph(g, { db, locale, loadPhotoURL }),
      count: counts.get(g.id) ?? 0,
      on: where.kind === "group" && where.id === g.id,
      onClick: () => go({ kind: "group", id: g.id, page: 0 }),
    });
    // Drag a row onto another = swap their doors (031 § 7).
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/pip-group", g.id);
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", (e) => {
      if ([...e.dataTransfer.types].includes("text/pip-group")) {
        e.preventDefault();
        row.classList.add("drop");
      }
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop"));
    row.addEventListener("drop", (e) => {
      const from = e.dataTransfer.getData("text/pip-group");
      row.classList.remove("drop");
      if (!from || from === g.id) return;
      e.preventDefault();
      e.stopPropagation();
      swapGroups(db, from, g.id);
      changed();
      toast(`Moved ${groupName(from)}`, () => { swapGroups(db, from, g.id); changed(); });
    });
    const more = document.createElement("button");
    more.type = "button";
    more.className = "ed-gmore";
    more.setAttribute("aria-label", `More for ${groupDisplayName(db, g, locale)}`);
    more.textContent = "…";
    more.addEventListener("click", (e) => { e.stopPropagation(); groupMenu(g, wrap); });
    wrap.append(row, more);
    return wrap;
  }

  /** Row "…": Rename, Change icon, Hide/Show, Delete (a family's own). */
  function groupMenu(g, wrap) {
    closeMenus();
    const menu = document.createElement("div");
    menu.className = "ed-gmenu";
    menu.setAttribute("role", "menu");
    const item = (text, fn, cls = "") => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.className = cls;
      b.textContent = text;
      b.addEventListener("click", (e) => { e.stopPropagation(); menu.remove(); fn(); });
      menu.appendChild(b);
    };
    item("Rename", () => renameInline(g, wrap));
    item("Change icon", () => iconPicker(g, wrap));
    item(g.hidden ? "Show" : "Hide", () => {
      setGroupHidden(db, g.id, !g.hidden);
      changed();
      toast(g.hidden ? `Showing ${groupName(g.id)}` : `Hid ${groupName(g.id)}`, () => {
        setGroupHidden(db, g.id, !!g.hidden);
        changed();
      });
    });
    if (g.kind === "custom") {
      item("Delete", () => {
        const label = groupName(g.id);
        const undo = deleteGroupUndoable(db, g.id);
        if (where.kind === "group" && where.id === g.id) where = { kind: "main" };
        changed();
        toast(`Deleted ${label} — its words stay in All words`, () => { undo.undo(); changed(); });
      }, "danger");
    }
    wrap.appendChild(menu);
  }

  function renameInline(g, wrap) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "ed-rename";
    const was = groupDisplayName(db, g, locale);
    input.value = was;
    let finished = false;
    const done = (save) => {
      if (finished) return;
      finished = true;
      const v = input.value.trim();
      if (save && v && v !== was) {
        renameGroup(db, g.id, v);
        changed();
        toast(`Renamed to ${v}`, () => { renameGroup(db, g.id, was); changed(); });
      } else {
        renderGroups();
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(true);
      if (e.key === "Escape") { e.stopPropagation(); done(false); }
    });
    input.addEventListener("blur", () => done(true));
    wrap.replaceChildren(input);
    input.focus();
    input.select?.();
  }

  function iconPicker(g, wrap) {
    const pick = document.createElement("div");
    pick.className = "ed-icons";
    for (const nm of ICON_SET) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", nm.replaceAll("_", " "));
      const img = document.createElement("img");
      img.src = iconUrl(nm);
      img.alt = "";
      b.appendChild(img);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const before = g.glyph?.startsWith("icon:") ? g.glyph : null;
        setGroupGlyph(db, g.id, `icon:${nm}`);
        changed();
        toast(`New icon for ${groupName(g.id)}`, () => { setGroupGlyph(db, g.id, before); changed(); });
      });
      pick.appendChild(b);
    }
    wrap.appendChild(pick);
  }

  function closeMenus() {
    for (const m of document.querySelectorAll(".ed-gmenu, .ed-icons")) m.remove();
  }

  function renderGroups() {
    const box = $("ed-groups");
    box.replaceChildren();
    const counts = memberCounts();
    box.appendChild(navRow({
      label: "Main board", glyph: plainGlyph("▦", "main"),
      on: where.kind === "main", onClick: () => go({ kind: "main" }),
    }));
    const groups = groupIndex(db);
    // One order everywhere: every shown group — the meal groups too — in
    // index_slot order, the same order as the board and Settings.
    const regular = groups.filter((g) => !g.hidden);
    const hidden = groups.filter((g) => g.hidden);
    for (const g of regular) box.appendChild(groupItem(g, counts));
    const section = (title, list, key) => {
      if (!list.length) return;
      const d = document.createElement("details");
      d.className = "ed-gsec";
      d.open = store.get(key) === "1" || list.some((g) => where.kind === "group" && where.id === g.id);
      d.addEventListener("toggle", () => store.set(key, d.open ? "1" : "0"));
      const s = document.createElement("summary");
      s.textContent = `${title} (${list.length})`;
      d.appendChild(s);
      for (const g of list) d.appendChild(groupItem(g, counts));
      box.appendChild(d);
    };
    section("Hidden", hidden, "pip-ed-hid");

    // + New group: an inline name field; Return creates and opens it.
    const add = document.createElement("button");
    add.type = "button";
    add.className = "ed-grow ed-newgroup";
    add.append(plainGlyph("+"));
    const lb = document.createElement("span");
    lb.className = "ed-gname";
    lb.textContent = "New group";
    add.appendChild(lb);
    add.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "ed-rename";
      input.placeholder = "Name the new group";
      let finished = false;
      const finish = (save) => {
        if (finished) return;
        finished = true;
        const v = input.value.trim();
        if (save && v) {
          const { id } = createGroup(db, { name: v });
          toast(`New group “${v}” — its door is in Groups`);
          go({ kind: "group", id, page: 0 });
        } else {
          renderGroups();
        }
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") { e.stopPropagation(); finish(false); }
      });
      input.addEventListener("blur", () => finish(!!input.value.trim()));
      add.replaceWith(input);
      input.focus();
    });
    box.appendChild(add);

    box.appendChild(document.createElement("hr"));
    box.appendChild(navRow({
      label: "All words", glyph: plainGlyph("≡", "main"),
      on: where.kind === "words", onClick: () => go({ kind: "words" }),
    }));
  }

  /* ------------------------------- stage ------------------------------- */

  /** The real main-board grid (#grid) lives in the stage while the
   *  editor shows the main board, and goes home otherwise — one painter,
   *  one set of cells (031 § 5, WT 11). */
  function placeGrid(inStage) {
    const grid = $("grid");
    if (!grid) return;
    if (!gridHome.parent && grid.parentElement !== $("ed-stage")) {
      gridHome.parent = grid.parentElement;
      gridHome.next = grid.nextSibling;
    }
    if (inStage && grid.parentElement !== $("ed-stage")) {
      $("ed-stage").prepend(grid);
    } else if (!inStage && grid.parentElement === $("ed-stage") && gridHome.parent) {
      gridHome.parent.insertBefore(grid, gridHome.next);
    }
  }

  async function renderStage() {
    const main = where.kind === "main";
    const words = where.kind === "words";
    placeGrid(main);
    $("ed-grid").hidden = where.kind !== "group";
    $("ed-words").hidden = !words;
    $("ed-pager").hidden = true;
    const crumb = $("ed-crumb");
    crumb.replaceChildren();
    const part = (text, onClick) => {
      const el = document.createElement(onClick ? "button" : "span");
      el.textContent = text;
      if (onClick) { el.type = "button"; el.className = "linkbtn"; el.addEventListener("click", onClick); }
      crumb.appendChild(el);
    };
    if (main) {
      part("Main board");
      renderMainBoard();
    } else if (words) {
      part("All words");
      renderWords();
    } else {
      if (!groupRow(where.id)) { where = { kind: "main" }; return renderStage(); }
      part("Main board", () => go({ kind: "main" }));
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "›";
      crumb.appendChild(sep);
      part(groupName(where.id));
      const pages = pageCount(db, where.id);
      if (where.page >= pages) where.page = pages - 1;
      await paintGroupPage($("ed-grid"), {
        group: where.id,
        page: where.page,
        gestures: true,
        onChange: () => renderStage(),
        onNext: () => { where.page = (where.page + 1) % pageCount(db, where.id); renderStage(); },
      });
      if (pages > 1) {
        $("ed-pager").hidden = false;
        $("ed-pageno").textContent = `page ${where.page + 1} of ${pages}`;
      }
    }
    markSelection();
  }

  $("ed-prev").addEventListener("click", () => {
    if (where.kind !== "group") return;
    const n = pageCount(db, where.id);
    where.page = (where.page - 1 + n) % n;
    renderStage();
  });
  $("ed-next").addEventListener("click", () => {
    if (where.kind !== "group") return;
    where.page = (where.page + 1) % pageCount(db, where.id);
    renderStage();
  });

  function stageGrid() {
    return where.kind === "main" ? $("grid") : where.kind === "group" ? $("ed-grid") : null;
  }

  /* ------------------------------ selection ---------------------------- */

  const keyOf = (it) => `${it.item_kind}:${it.item_id}`;

  /** Remember the place — group, page, selection, card — for this tab. */
  function savePlace() {
    if (previewing) return;
    tabPlace.set({
      where,
      items: [...selected.values()].map(({ item_kind, item_id, label }) => ({ item_kind, item_id, label })),
      card: !!$("wordcard")?.classList.contains("open"),
    });
  }

  /** A remembered place is only used if it still exists. */
  function placeFrom(saved) {
    const w = saved?.where;
    if (!w || !["main", "group", "words"].includes(w.kind)) return null;
    if (w.kind === "group" && !groupRow(w.id)) return null;
    const alive = (it) => (it.item_kind === "entity"
      ? all(db, "SELECT 1 AS x FROM personal_entity WHERE id = ? AND status = 'active'", [it.item_id])[0]
      : all(db, "SELECT 1 AS x FROM sense WHERE id = ?", [it.item_id])[0]);
    const items = (saved.items ?? []).filter((it) => it?.item_kind && it?.item_id && alive(it));
    return { where: w.kind === "group" ? { kind: "group", id: w.id, page: w.page ?? 0 } : { kind: w.kind }, items, card: !!saved.card };
  }

  function markSelection() {
    const grid = stageGrid();
    for (const g of [$("grid"), $("ed-grid")]) {
      for (const el of g?.querySelectorAll?.(".sel") ?? []) el.classList.remove("sel");
    }
    if (grid) {
      for (const k of selected.keys()) grid.querySelector(`[data-item="${k}"]`)?.classList.add("sel");
    }
    if (restoreCard) {
      restoreCard = false;
      const only = selected.size === 1 ? [...selected.values()][0] : null;
      if (only) openWordCard(only);
      grid?.querySelector(`[data-item="${[...selected.keys()][0]}"]`)?.scrollIntoView?.({ block: "nearest" });
      $("ed-groups").querySelector?.(".ed-grow.on")?.scrollIntoView?.({ block: "nearest" });
    }
    savePlace();
    const many = selected.size > 1 && where.kind === "group";
    $("ed-selbar").hidden = !many;
    if (many) {
      $("ed-selcount").textContent = `${selected.size} words`;
      const to = $("ed-selto");
      to.replaceChildren();
      const first = document.createElement("option");
      first.value = "";
      first.textContent = "a group…";
      to.appendChild(first);
      for (const g of groupIndex(db)) {
        if (g.id === where.id) continue;
        const o = document.createElement("option");
        o.value = g.id;
        o.textContent = groupDisplayName(db, g, locale);
        to.appendChild(o);
      }
    }
  }

  /** A tile was clicked (or keyed to) in the editor. Plain = select it
   *  and open its card; shift/⌘ = add to (or drop from) the selection. */
  function select(item, { additive = lastPointerAdds } = {}) {
    const k = keyOf(item);
    if (additive && where.kind === "group") {
      if (selected.has(k)) selected.delete(k); else selected.set(k, item);
      if (selected.size === 1) openWordCard([...selected.values()][0]);
      else closeCard();
    } else {
      selected = new Map([[k, item]]);
      openWordCard(item);
    }
    markSelection();
  }

  function clearSelection() {
    selected = new Map();
    markSelection();
  }

  $("ed-selclear").addEventListener("click", () => clearSelection());
  $("ed-selremove").addEventListener("click", () => removeSelected());
  $("ed-selto").addEventListener("change", () => {
    const to = $("ed-selto").value;
    if (!to || where.kind !== "group") return;
    const from = where.id;
    const items = [...selected.values()];
    const moved = [];
    for (const it of items) {
      try { placeItem(db, to, it.item_kind, it.item_id); } catch { continue; }
      moved.push({ it, undo: removeItemUndoable(db, from, it.item_kind, it.item_id) });
    }
    clearSelection();
    changed();
    toast(`Moved ${moved.length} to ${groupName(to)}`, () => {
      for (const m of moved.reverse()) {
        try { removeItemUndoable(db, to, m.it.item_kind, m.it.item_id); } catch { /* not there */ }
        m.undo.undo();
      }
      changed();
    });
  });

  /** Delete / Remove from this group — this placement only, with Undo. */
  function removeSelected() {
    if (where.kind !== "group" || !selected.size) return;
    const items = [...selected.values()];
    const undos = [];
    for (const it of items) {
      try { undos.push(removeItemUndoable(db, where.id, it.item_kind, it.item_id)); } catch { /* gone */ }
    }
    closeCard();
    clearSelection();
    changed();
    const label = items.length === 1 ? items[0].label : `${items.length} words`;
    toast(`Removed ${label} from ${groupName(where.id)}`, () => {
      for (const u of undos.reverse()) u.undo();
      changed();
    });
  }

  /** Arrow keys walk the words on screen in reading order (← →) and by
   *  row (↑ ↓); each step selects and shows that word's card. */
  function moveSelection(key) {
    const grid = stageGrid();
    if (!grid) return;
    const cells = [...grid.children];
    const cols = boardGeom().cols;
    const cur = [...selected.keys()][0];
    let i = cur ? cells.findIndex((c) => c.dataset.item === cur) : -1;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[key];
    for (let n = 0; n < cells.length; n++) {
      i = i < 0 ? 0 : i + step;
      if (i < 0 || i >= cells.length) return;
      const item = cells[i].dataset.item;
      if (!item) continue;
      const [kind, ...rest] = item.split(":");
      const label = cells[i].querySelector(".tlabel")?.textContent ?? "";
      select({ item_kind: kind, item_id: rest.join(":"), label }, { additive: false });
      cells[i].scrollIntoView?.({ block: "nearest" });
      return;
    }
  }

  /* ----------------------------- navigation ---------------------------- */

  function go(next) {
    where = next;
    selected = new Map();
    closeCard();
    closeDrawer();
    renderGroups();
    return renderStage();
  }

  /** Go to it (§ 4): the group it lives in (this one first), the page it
   *  is on, and select it. A main-board-only word goes to the main board. */
  async function goTo(kind, id, label, groups) {
    const item = { item_kind: kind, item_id: id, label };
    const g = groups.find((x) => where.kind === "group" && x.id === where.id) ?? groups[0];
    if (g) {
      const cell = all(db,
        "SELECT page FROM group_cell WHERE group_id = ? AND layout = ? AND item_kind = ? AND item_id = ?",
        [g.id, activeLayout(db), kind, id])[0];
      await go({ kind: "group", id: g.id, page: cell?.page ?? 0 });
    } else if (homeKeys().has(`${kind}:${id}`)) {
      await go({ kind: "main" });
    } else {
      await go({ kind: "words" });
    }
    select(item, { additive: false });
    stageGrid()?.querySelector(`[data-item="${kind}:${id}"]`)?.scrollIntoView?.({ block: "nearest" });
  }

  const groupsOf = (kind, id) => all(db,
    `SELECT g.id FROM group_membership gm JOIN board_group g ON g.id = gm.group_id
     WHERE gm.item_kind = ? AND gm.item_id = ? ORDER BY g.index_slot`, [kind, id]);

  /* ------------------------------ the field ---------------------------- */

  let rows = []; // [{ el, go }]
  let hi = -1;

  function setHi(i) {
    hi = rows.length ? Math.max(0, Math.min(i, rows.length - 1)) : -1;
    rows.forEach((r, k) => {
      r.el.classList.toggle("hi", k === hi);
      r.el.setAttribute("aria-selected", String(k === hi));
    });
  }

  function thumb(r) {
    const p = document.createElement("span");
    p.className = `pic r-${r.role ?? "Yellow"}`;
    if (r.photo_key) {
      loadPhotoURL(r.photo_key).then((url) => {
        if (!url) return;
        const img = document.createElement("img");
        img.src = url; img.alt = "";
        p.replaceChildren(img);
        p.classList.add("photo");
      });
    } else if (r.art) {
      const img = document.createElement("img");
      img.alt = "";
      if (artInto(img, r.art)) p.classList.add("photo");
      p.appendChild(img);
    } else {
      p.textContent = r.plus ? "+" : (r.label?.[0]?.toUpperCase() ?? "");
    }
    return p;
  }

  function dropRow(r, actions) {
    const row = document.createElement("div");
    row.className = "ed-drow";
    row.setAttribute("role", "option");
    const txt = document.createElement("span");
    txt.className = "txt";
    const lb = document.createElement("span");
    lb.className = "lb";
    lb.textContent = r.label;
    txt.appendChild(lb);
    if (r.sub) {
      const sb = document.createElement("span");
      sb.className = "sub";
      sb.textContent = r.sub;
      txt.appendChild(sb);
    }
    row.append(thumb(r), txt);
    actions.forEach((a, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = i === 0 ? "ed-act primary" : "ed-act";
      b.textContent = a.label;
      b.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the field
      b.addEventListener("click", (e) => { e.stopPropagation(); a.run(); });
      row.appendChild(b);
    });
    row.addEventListener("mousedown", (e) => e.preventDefault());
    row.addEventListener("click", () => actions[0]?.run());
    rows.push({ el: row, go: () => actions[0]?.run() });
    return row;
  }

  function head(box, text) {
    const h = document.createElement("p");
    h.className = "ed-dhead";
    h.textContent = text;
    box.appendChild(h);
  }

  const hereName = () => (where.kind === "group" ? groupName(where.id) : "My Words");

  /** Add here: an existing word into the group on screen (My Words from
   *  the main board or All words), then show it selected. */
  async function addHere(kind, id, label) {
    closeDrop();
    const gid = addTarget();
    addFlow.placeWord(kind, id, label, { groupId: gid, cell: null });
    await go({ kind: "group", id: gid, page: pageOf(gid, kind, id) });
    select({ item_kind: kind, item_id: id, label }, { additive: false });
  }

  /** Make: a new word saved at once into the group on screen; its card
   *  opens in the "just added" state (029 § 4). */
  async function makeHere(text) {
    closeDrop();
    const gid = addTarget();
    const id = addFlow.makeWord(text, { groupId: gid, cell: null });
    if (!id) return;
    where = { kind: "group", id: gid, page: pageOf(gid, "entity", id) };
    renderGroups();
    await renderStage();
    selected = new Map([[`entity:${id}`, { item_kind: "entity", item_id: id, label: text.trim() }]]);
    markSelection();
  }

  const pageOf = (gid, kind, id) => all(db,
    "SELECT page FROM group_cell WHERE group_id = ? AND layout = ? AND item_kind = ? AND item_id = ?",
    [gid, activeLayout(db), kind, id])[0]?.page ?? 0;

  function renderDrop() {
    const box = $("ed-drop");
    box.replaceChildren();
    rows = [];
    const text = $("ed-q").value.trim();
    if (!text) {
      // Empty and focused: what next — suggested words and recent adds.
      const sug = librarySuggested(db, locale).slice(0, 5);
      const rec = libraryAdded(db, locale).slice(0, 5);
      if (sug.length) {
        head(box, `Suggested for ${Name()}`);
        for (const r of sug) {
          box.appendChild(dropRow({ ...r, sub: "Not on the board yet" }, [
            { label: `Add to ${hereName()}`, run: () => addHere(r.kind, r.id, r.label) },
          ]));
        }
      }
      if (rec.length) {
        head(box, "Recently added");
        for (const r of rec) {
          const homes = libraryHomes(db, r.kind, r.id, locale);
          box.appendChild(dropRow({ ...r, sub: homes.length ? `In ${homes.join(", ")}` : "In All words" }, [
            { label: "Go to it", run: () => { closeDrop(); goTo(r.kind, r.id, r.label, groupsOf(r.kind, r.id)); } },
          ]));
        }
      }
      if (!rows.length) {
        const p = document.createElement("p");
        p.className = "ed-dempty";
        p.textContent = `Type a word to add it to ${hereName()}, or to find it on ${name()}'s board.`;
        box.appendChild(p);
      }
      box.hidden = false;
      setHi(-1);
      return;
    }
    const { onBoard, library, exact } = findSections(db, text, {
      locale, groupId: where.kind === "group" ? where.id : null, homeKeys: homeKeys(),
    });
    let exactRow = -1;
    if (onBoard.length) {
      head(box, `On ${Name()}'s board`);
      onBoard.forEach((r, i) => {
        const acts = [{ label: "Go to it", run: () => { closeDrop(); goTo(r.kind, r.id, r.label, r.groups); } }];
        if (!r.here) acts.push({ label: `Add to ${hereName()}`, run: () => addHere(r.kind, r.id, r.label) });
        if (exact?.section === "onBoard" && exact.index === i) exactRow = rows.length;
        box.appendChild(dropRow({ ...r, sub: `In ${r.where.join(" · ")}` }, acts));
      });
    }
    if (library.length) {
      head(box, "From our library");
      library.forEach((r, i) => {
        if (exact?.section === "library" && exact.index === i) exactRow = rows.length;
        box.appendChild(dropRow({ ...r, sub: "Our picture and voice" }, [
          { label: `Add to ${hereName()}`, run: () => addHere(r.kind, r.id, r.label) },
        ]));
      });
    }
    head(box, "New");
    box.appendChild(dropRow(
      { label: `“${text}”`, sub: `New word in ${hereName()} — picture and voice made for you`, plus: true, role: "None" },
      [{ label: "Make", run: () => makeHere(text) }],
    ));
    box.hidden = false;
    setHi(exactRow >= 0 ? exactRow : rows.length - 1);
  }

  function closeDrop() {
    $("ed-drop").hidden = true;
    $("ed-q").setAttribute("aria-expanded", "false");
    $("ed-q").value = "";
    rows = [];
  }

  /** A pasted list (§ 4): the list preview from 029 § 5, one button. */
  function handOffList(text) {
    closeDrop();
    $("ed-q").blur?.();
    addFlow.openBulkForm(addTarget(), text);
  }

  $("ed-q").addEventListener("focus", () => { $("ed-q").setAttribute("aria-expanded", "true"); renderDrop(); });
  $("ed-q").addEventListener("input", () => {
    if (isList($("ed-q").value)) { handOffList($("ed-q").value); return; }
    renderDrop();
  });
  $("ed-q").addEventListener("paste", (e) => {
    const t = e.clipboardData?.getData("text") ?? "";
    if (!isList(t)) return;
    e.preventDefault();
    handOffList(t);
  });
  $("ed-q").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(hi + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(hi - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (hi >= 0) rows[hi].go(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeDrop(); $("ed-q").blur?.(); }
  });
  $("ed-q").addEventListener("blur", () => setTimeout(() => {
    if (document.activeElement !== $("ed-q")) {
      $("ed-drop").hidden = true;
      $("ed-q").setAttribute("aria-expanded", "false");
    }
  }, 120));

  /* ------------------------------ all words ---------------------------- */

  let wordsTab = "added";
  function renderWords() {
    const list = $("ed-wlist");
    list.replaceChildren();
    const q = $("ed-wq").value.trim();
    const rs = q ? librarySearch(db, q, locale, normalizeV1)
      : wordsTab === "added" ? libraryAdded(db, locale)
      : wordsTab === "all" ? libraryAll(db, locale)
      : librarySuggested(db, locale);
    if (!rs.length) {
      const p = document.createElement("p");
      p.className = "ed-dempty";
      p.textContent = q ? "No matches."
        : wordsTab === "suggested" ? "No suggestions yet."
        : "Nothing here yet — type above to add a word.";
      list.appendChild(p);
      return;
    }
    for (const r of rs.slice(0, 300)) {
      const homes = libraryHomes(db, r.kind, r.id, locale);
      const row = document.createElement("div");
      row.className = "ed-wrow";
      row.dataset.item = `${r.kind}:${r.id}`;
      const lb = document.createElement("span");
      lb.className = "lb";
      lb.textContent = r.label;
      const inw = document.createElement("span");
      inw.className = "sub";
      inw.textContent = homes.length ? homes.join(", ") : "Not on the board";
      const voice = document.createElement("span");
      voice.className = "ed-voice";
      voice.textContent = voiceState(r);
      const gob = document.createElement("button");
      gob.type = "button";
      gob.className = "linkbtn";
      gob.textContent = homes.length ? "Go to it" : "Add to My Words";
      gob.addEventListener("click", (e) => {
        e.stopPropagation();
        if (homes.length) goTo(r.kind, r.id, r.label, groupsOf(r.kind, r.id));
        else {
          addFlow.placeWord(r.kind, r.id, r.label, { groupId: "grp_my_words", cell: null });
          renderWords();
          renderGroups();
        }
      });
      row.append(thumb(r), lb, inw, voice, gob);
      row.addEventListener("click", () => {
        selected = new Map([[row.dataset.item, { item_kind: r.kind, item_id: r.id, label: r.label }]]);
        for (const el of list.querySelectorAll(".sel")) el.classList.remove("sel");
        row.classList.add("sel");
        openWordCard({ item_kind: r.kind, item_id: r.id, label: r.label, photo_key: r.photo_key });
      });
      list.appendChild(row);
    }
  }

  /** The word's voice in plain words (028 states; a recording wins). */
  function voiceState(r) {
    if (r.kind !== "entity") return "Our voice";
    if (overrideFor(db, "entity", r.id)) return "Recorded";
    const s = tile?.status?.(r.label);
    return s === "minting" ? "Making voice…" : s && s !== "ready" ? "Voice pending" : "Ready";
  }

  $("ed-wq").addEventListener("input", renderWords);
  $("ed-wtabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-t]");
    if (!b) return;
    wordsTab = b.dataset.t;
    for (const t of $("ed-wtabs").querySelectorAll("button")) t.classList.toggle("on", t === b);
    renderWords();
  });

  /* ------------------------------- drops ------------------------------- */

  /** Photos dropped on the board (§ 5): one word per photo, named from
   *  the file. Onto an empty cell: the first lands there, the rest on the
   *  next free cells. On the main board only an empty cell takes one; the
   *  rest file into My Words. */
  async function dropPhotos(files, slotEl) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const slot = slotEl?.dataset.slot != null && slotEl.classList.contains("empty")
      ? Number(slotEl.dataset.slot) : null;
    const gid = where.kind === "group" ? where.id : "grp_my_words";
    const category = catalog.groups.find((g) => g.id === gid)?.category ?? null;
    const layout = boardGeom().name;
    let n = 0;
    let onMain = 0;
    for (const f of imgs) {
      const label = nameFromFile(f.name);
      if (!label) continue;
      const photo = await savePhoto(f);
      if (photo) syncUploadBlob(photo.bytes).catch(() => {});
      const { id } = createEntity(db, { name: label, photoKey: photo?.key ?? null, category });
      if (where.kind === "main" && slot != null && n === 0) {
        const mv = placeOnBoard(db, layout, "entity", id, slot, {
          anchors: new Set(boardGeom().anchors.keys()),
        });
        if (mv) onMain++; else placeItem(db, gid, "entity", id);
      } else {
        const cell = where.kind === "group" && slot != null && n === 0
          ? { page: where.page, slot_index: slot } : null;
        try { placeItem(db, gid, "entity", id, cell); } catch { placeItem(db, gid, "entity", id); }
      }
      tile?.ensure(label, { source: "user_typed" }).catch(() => {});
      n++;
    }
    if (!n) return;
    invalidateIndex();
    changed();
    const rest = n - onMain;
    toast(onMain && rest ? `Added ${n} photos — 1 on the main board, ${rest} to ${groupName(gid)}`
      : onMain ? "Added 1 photo to the main board"
      : `Added ${n} photo${n === 1 ? "" : "s"} to ${groupName(gid)}`);
  }

  $("editor").addEventListener("dragover", (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    document.body.classList.add("dragover");
  });
  $("editor").addEventListener("dragleave", (e) => {
    if (e.target === $("editor")) document.body.classList.remove("dragover");
  });
  $("editor").addEventListener("drop", (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    document.body.classList.remove("dragover");
    const slotEl = e.target.closest?.("[data-slot]") ?? null;
    dropPhotos([...e.dataTransfer.files], slotEl).catch((err) => console.warn("photo drop failed", err));
  });

  /* --------------------------- preview & done -------------------------- */

  /** Preview: the board as Maya sees it. The place freezes (the card
   *  closing must not clear the selection) and the word being worked on
   *  flashes once so the adult can find it — then it is exactly her view.
   *  The flash is local; nothing is synced. */
  $("ed-preview").addEventListener("click", () => {
    savePlace(); // the card is still open here — the place remembers it
    previewing = true;
    $("ed-previewname").textContent = Name();
    closeCard();
    if (where.kind === "group") openGroupView(where.id, where.page);
    else setView("board");
    $("ed-previewbar").hidden = false;
    const key = [...selected.keys()][0];
    if (key) {
      setTimeout(() => {
        const host = where.kind === "group" ? $("groupgrid") : $("grid");
        flashCell?.(host?.querySelector(`[data-item="${key}"]`));
      }, 250);
    }
  });
  /** Back to editing (or Esc): the same group, page, word and card.
   *  Done leaves the editor and forgets the place. */
  const endPreview = (back) => {
    $("ed-previewbar").hidden = true;
    if (!back) {
      previewing = false;
      where = { kind: "main" };
      selected = new Map();
      tabPlace.clear();
      return;
    }
    const saved = placeFrom(tabPlace.get());
    previewing = false;
    if (saved) {
      where = saved.where;
      selected = new Map(saved.items.map((it) => [keyOf(it), it]));
      restoreCard = saved.card;
    }
    setView("editor");
  };
  $("ed-back").addEventListener("click", () => endPreview(true));
  $("ed-done").addEventListener("click", () => endPreview(false));
  /** Done in the top bar: the same finish as Preview's Done, from the
   *  editor itself — Maya's main board, place forgotten. */
  $("ed-exit").addEventListener("click", () => {
    closeCard();
    endPreview(false);
    setView("board");
  });

  /* ---------------------------- first open ----------------------------- */

  function renderHello() {
    $("ed-hello").hidden = store.get(HELLO_KEY) === "1";
    $("ed-hello-text").textContent = me?.name?.trim()
      ? `This is ${Name()}'s board. Click any word to change it, or type above to add one.`
      : "This is the board. Click any word to change it, or type above to add one.";
  }
  $("ed-hello-x").addEventListener("click", () => { store.set(HELLO_KEY, "1"); renderHello(); });

  /* --------------------------- narrow screens -------------------------- */

  function closeDrawer() {
    document.body.classList.remove("ed-drawer");
    $("ed-scrim").hidden = true;
  }
  $("ed-navbtn").addEventListener("click", () => {
    const on = !document.body.classList.contains("ed-drawer");
    document.body.classList.toggle("ed-drawer", on);
    $("ed-scrim").hidden = !on;
  });
  $("ed-scrim").addEventListener("click", closeDrawer);

  /* ----------------------------- keyboard ------------------------------ */

  const typing = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"
      || a.tagName === "SELECT" || a.isContentEditable);
  };
  document.addEventListener("pointerdown", (e) => {
    lastPointerAdds = e.shiftKey || e.metaKey || e.ctrlKey;
  }, true);
  document.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("editor")) {
      if (e.key === "Escape" && !$("ed-previewbar").hidden) { e.preventDefault(); endPreview(true); }
      return;
    }
    const cmd = e.metaKey || e.ctrlKey;
    if ((e.key === "/" && !typing()) || (cmd && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      $("ed-q").focus();
      return;
    }
    if (typing() || document.querySelector(".overlay.open:not(#wordcard)")) return;
    if (cmd && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undoLast(); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
      e.preventDefault();
      removeSelected();
      return;
    }
    if (e.key.startsWith("Arrow") && where.kind !== "words") { e.preventDefault(); moveSelection(e.key); }
  });

  // Clicking empty stage space closes the card and clears the selection.
  $("ed-stage").addEventListener("click", (e) => {
    if (e.target === $("ed-stage") || e.target === stageGrid()) { closeCard(); clearSelection(); }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest?.(".ed-gitem")) closeMenus();
    if (!e.target.closest?.(".ed-who")) $("ed-people").hidden = true;
  });
  // The card closing (Done, Esc) ends a single selection too.
  if ($("wordcard") && typeof MutationObserver === "function") {
    new MutationObserver(() => {
      if (previewing) return;
      if (!$("wordcard").classList.contains("open") && selected.size === 1) clearSelection();
      else savePlace();
    }).observe($("wordcard"), { attributes: true, attributeFilter: ["class"] });
  }

  let statusTimer = null;

  // A reload lands where the adult was (this tab only).
  {
    const saved = placeFrom(tabPlace.get());
    if (saved) {
      where = saved.where;
      selected = new Map(saved.items.map((it) => [keyOf(it), it]));
      restoreCard = saved.card;
    }
  }

  /** Repaint after any write made here. */
  function changed() {
    renderGroups();
    renderStage();
    renderStatus();
    renderStrip?.();
    renderLibrary?.();
  }

  function renderEditor() {
    renderPerson();
    renderGroups();
    renderStage();
    renderStatus();
    renderHello();
    clearInterval(statusTimer);
    statusTimer = setInterval(renderStatus, 1000);
    statusTimer?.unref?.(); // never keeps a test process alive
  }

  /** Leaving the editor view: the main-board grid goes home. */
  function leave() {
    placeGrid(false);
    clearInterval(statusTimer);
    closeDrawer();
    closeDrop();
  }

  return {
    renderEditor, leave, select,
    showing: () => where,
    openGroup: (id) => go({ kind: "group", id, page: 0 }),
  };
}
