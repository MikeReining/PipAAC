/**
 * Settings → Words → Show groups: one switch per group, in index order —
 * the board's own order (board_group.index_slot), nothing else. The four
 * meal groups are one row ("Meals: Breakfast · Lunch · Dinner · Snack") at
 * the first meal group's place, bound to occasions_visible. A switch is
 * the same setGroupHidden the Edit-mode door uses (027 B8: a hidden group
 * keeps its members, positions and index slot).
 *
 * Drag a row's handle to reorder: the pointer path serves mouse and touch
 * (iPad) alike; ArrowUp/ArrowDown on the focused handle moves one row.
 * The write is moveGroupBlock in groups.mjs — the same index_slot the board
 * and the editor read — with an Undo toast, since a drag shifts the groups
 * in between. The meals row moves as one block.
 */
import {
  groupDisplayName, groupIndex, moveGroupBlock, setGroupHidden, setSetting,
} from "../shared/groups.mjs";

const $ = (id) => document.getElementById(id);

export function mountGroupShows({ db, locale, all, toast = () => {}, onChange = () => {} }) {
  const isOccasion = (id) =>
    (all(db, "SELECT occasion FROM group_meta WHERE group_id = ?", [id])[0]?.occasion ?? 0) === 1;
  const mealsOn = () =>
    (all(db, "SELECT occasions_visible AS o FROM learner_profile WHERE id = 'prf_local'")[0]?.o ?? 1) === 1;
  const nameOf = (g) => groupDisplayName(db, g, locale) || g.glyph || "Group";

  /** The list as rows, in index order: one row per group, the meal groups
   *  folded into a single row where the first of them sits. */
  function rows() {
    const out = [];
    let meals = null;
    for (const g of groupIndex(db)) {
      if (isOccasion(g.id)) {
        if (!meals) { meals = { ids: [], groups: [] }; out.push(meals); }
        meals.ids.push(g.id);
        meals.groups.push(g);
      } else out.push({ ids: [g.id], groups: [g] });
    }
    return out;
  }
  const rowName = (r) => r.ids.length === 1 && !isOccasion(r.ids[0]) ? nameOf(r.groups[0]) : "Meals";

  function moveRow(row, beforeRow) {
    const before = beforeRow ? beforeRow.ids[0] : null;
    const { undo } = moveGroupBlock(db, row.ids, before);
    render();
    onChange();
    toast(`Moved ${rowName(row)}`, () => { undo(); render(); onChange(); });
  }

  function render() {
    const box = $("group-shows");
    box.replaceChildren();
    const list = rows();
    for (const r of list) {
      const meals = isOccasion(r.ids[0]);
      const name = rowName(r);
      const el = document.createElement("div");
      el.className = "set-head set-listrow set-grouprow";
      el.dataset.groupIds = r.ids.join(" ");

      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "set-grip";
      handle.setAttribute("aria-label", `Move ${name}`);
      handle.textContent = "⠿";
      handle.addEventListener("keydown", (e) => {
        const i = list.indexOf(r);
        if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); moveRow(r, list[i - 1]); }
        if (e.key === "ArrowDown" && i < list.length - 1) {
          e.preventDefault();
          moveRow(r, list[i + 2] ?? null);
        }
        // Keep focus on the moved row's handle after the rebuild.
        queueMicrotask(() => box.querySelector(`[data-group-ids="${r.ids.join(" ")}"] .set-grip`)?.focus?.());
      });
      handle.addEventListener("pointerdown", (e) => startDrag(e, el, r, list));

      const label = document.createElement("span");
      label.className = "seg-label";
      label.textContent = meals
        ? `Meals: ${r.groups.map(nameOf).join(" · ")}`
        : name;

      const sw = document.createElement("button");
      sw.className = "set-switch";
      sw.setAttribute("role", "switch");
      sw.setAttribute("aria-label", meals ? "Show meal groups" : `Show ${name}`);
      sw.setAttribute("aria-checked", String(meals ? mealsOn() : !r.groups[0].hidden));
      sw.onclick = () => {
        const show = sw.getAttribute("aria-checked") !== "true";
        if (meals) setSetting(db, "occasions_visible", show ? 1 : 0);
        else setGroupHidden(db, r.ids[0], !show);
        sw.setAttribute("aria-checked", String(show));
        onChange();
      };
      el.append(handle, label, sw);
      box.append(el);
    }
    $("group-shows-row").hidden = !box.children.length;
  }

  /** Pointer drag on a handle: the row follows the pointer; the drop line
   *  shows where it lands; release commits one moveGroupBlock. */
  function startDrag(e, el, row, list) {
    if (e.button > 0) return;
    e.preventDefault();
    const box = $("group-shows");
    const handle = e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const els = [...box.children];
    let target = list.indexOf(row); // index of the row it will sit before
    el.classList.add("dragging");
    const scroller = (() => {
      for (let n = box.parentElement; n; n = n.parentElement) {
        if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n;
      }
      return null;
    })();
    const mark = (i) => {
      els.forEach((x) => x.classList.remove("drop-before", "drop-after"));
      if (i < els.length) els[i]?.classList.add("drop-before");
      else els.at(-1)?.classList.add("drop-after");
    };
    const move = (ev) => {
      const y = ev.clientY;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (y < r.top + 40) scroller.scrollTop -= 12;
        else if (y > r.bottom - 40) scroller.scrollTop += 12;
      }
      let i = els.findIndex((x) => {
        const b = x.getBoundingClientRect();
        return y < b.top + b.height / 2;
      });
      if (i < 0) i = els.length;
      target = i;
      mark(i);
    };
    const end = (ev) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      el.classList.remove("dragging");
      els.forEach((x) => x.classList.remove("drop-before", "drop-after"));
      if (ev.type === "pointercancel") return;
      const from = list.indexOf(row);
      if (target === from || target === from + 1) return; // dropped where it was
      moveRow(row, list[target] ?? null);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  return { render };
}
