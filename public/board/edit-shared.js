/** Edit mode and the undo toast — shared by the board grid, the groups
 *  pages, the library, and the word card. `editing`/`countsOn` stay in
 *  board.js and cross through `live`; the paint calls arrive as deps. */
import { appRoot } from "./viewport.js";

const $ = (id) => document.getElementById(id);

export function mountEditShared({ live, syncCorner, renderGrid, applyLikely }) {
  /** One mode everywhere: entering Edit marks the body (dashed borders)
   *  and turns the corner button into ✓ Done (its glyph swaps on
   *  body.editing). */
  function setEditing(on) {
    live.editing = on;
    live.countsOn = live.countsOn && on; // 📊 leaves with Edit mode
    document.body.classList.toggle("editing", on);
    $("edit-counts").hidden = !on;
    $("edit-counts").classList.toggle("on", live.countsOn);
    syncCorner();
    renderGrid(); // the home grid takes edit gestures too (014 slice 3)
    applyLikely();
  }

  function navCell(label, onTap) {
    const el = document.createElement("button");
    el.className = "gcell nav";
    el.textContent = label;
    el.addEventListener("click", onTap);
    return el;
  }

  /** Live pointer-drag for Edit mode: a clone follows the finger; the slot
   *  under the release point decides the landing. `onDrop(slot)` gets the
   *  target's data-slot; `onTap` fires when the press never became a drag. */
  function editPointer(el, { onDrop, onTap }) {
    let lastPointer = 0;
    // A tile's picture is an <img>: a mouse drag would start the browser's
    // native image drag, which cancels the pointer stream (pointercancel)
    // before the move ever registers. The edit gesture owns the drag.
    el.addEventListener("dragstart", (e) => e.preventDefault());
    // Keyboard/AT Enter fires click with no pointer events — treat it as a tap.
    el.addEventListener("click", () => {
      if (Date.now() - lastPointer > 400) onTap?.();
    });
    el.addEventListener("pointerdown", (e) => {
      lastPointer = Date.now();
      if (e.button !== 0 || e.target.closest(".x")) return;
      const startX = e.clientX, startY = e.clientY;
      let dragging = false, clone = null, hinted = null;
      const clearHint = () => { hinted?.classList.remove("drop-hint"); hinted = null; };
      const move = (ev) => {
        if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 10) return;
        if (!dragging) {
          dragging = true;
          const r = el.getBoundingClientRect();
          clone = el.cloneNode(true);
          clone.classList.add("drag-clone");
          clone.style.width = `${r.width}px`;
          clone.style.height = `${r.height}px`;
          appRoot().appendChild(clone);
          el.classList.add("drag-src");
        }
        clone.style.left = `${ev.clientX - clone.offsetWidth / 2}px`;
        clone.style.top = `${ev.clientY - clone.offsetHeight / 2}px`;
        clearHint();
        const t = document.elementFromPoint(ev.clientX, ev.clientY)
          ?.closest("[data-slot]");
        if (t && t !== el) { hinted = t; t.classList.add("drop-hint"); }
      };
      const finish = (ev, cancelled) => {
        document.removeEventListener("pointermove", move);
        clearHint();
        clone?.remove();
        el.classList.remove("drag-src");
        if (!dragging) { if (!cancelled && onTap) onTap(); return; }
        if (cancelled) return;
        const t = document.elementFromPoint(ev.clientX, ev.clientY)
          ?.closest("[data-slot]");
        if (t && t !== el) onDrop(Number(t.dataset.slot));
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", (ev) => finish(ev, false), { once: true });
      document.addEventListener("pointercancel", (ev) => finish(ev, true), { once: true });
    });
  }

  function xBadge(onRemove) {
    const x = document.createElement("button");
    x.className = "x";
    x.textContent = "×";
    x.title = "Remove";
    x.addEventListener("click", (e) => { e.stopPropagation(); onRemove(); });
    x.addEventListener("pointerdown", (e) => e.stopPropagation());
    return x;
  }

  /** One pending undo at a time. */
  let toastTimer = null;
  /* 031 § 8 — every change with an Undo can also be undone by ⌘Z in the
     editor: the last few undos, newest first, each runs once. */
  const undoStack = [];
  function undoLast() {
    const u = undoStack.pop();
    if (!u) { toast("Nothing to undo"); return; }
    u.run();
  }
  function toast(text, undo, { actionLabel = null, onAction = null } = {}) {
    const el = $("toast");
    clearTimeout(toastTimer);
    if (undo) {
      const original = undo;
      let used = false;
      const once = () => { if (used) return; used = true; original(); };
      const entry = { run: () => { once(); toast(`Undid: ${text}`); } };
      undoStack.push(entry);
      if (undoStack.length > 20) undoStack.shift();
      undo = () => { const i = undoStack.indexOf(entry); if (i >= 0) undoStack.splice(i, 1); once(); };
    }
    $("toast-text").textContent = text;
    $("toast-undo").hidden = !undo;
    $("toast-act").hidden = !onAction;
    $("toast-act").textContent = actionLabel ?? "";
    el.hidden = false;
    $("toast-undo").onclick = () => { el.hidden = true; undo?.(); };
    $("toast-act").onclick = () => { el.hidden = true; onAction?.(); };
    toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  /** "Show on board" marks the cell for a beat after re-render. */
  function flashCell(el) {
    if (!el) return;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1600);
  }

  return { setEditing, navCell, editPointer, xBadge, undoLast, toast, flashCell };
}
