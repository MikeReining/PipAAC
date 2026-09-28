/**
 * Cells picker and move-cost preview (014 §§ 3–4). Choosing a different
 * board size shows what moves before anything changes.
 */
import { missingPositions } from "../shared/groups.mjs";
import { moveCost, setBoardLayout } from "../shared/movecost.mjs";

const $ = (id) => document.getElementById(id);

export function mountCellsSheet({
  db, catalog, locale, boardGeom, open, close, toast, renderGrid, rerenderView,
}) {
  let cellsTarget = null;

  function renderCellsSeg() {
    const seg = $("cells-seg");
    seg.innerHTML = "";
    const cur = boardGeom().name;
    for (const [name, l] of Object.entries(catalog.layouts)
      .sort((a, b) => a[1].cols * a[1].rows - b[1].cols * b[1].rows)) {
      const b = document.createElement("button");
      b.dataset.v = name;
      b.textContent = String(l.cols * l.rows);
      b.classList.toggle("on", name === cur);
      seg.appendChild(b);
    }
  }

  function renderCellsForm() {
    const cur = boardGeom().name;
    const mc = moveCost(db, cur, cellsTarget, locale);
    const n = mc.words.length;
    const moved = mc.totals.sector + mc.totals.moved + mc.totals.gone;
    $("cells-title").textContent =
      `Switch to ${catalog.layouts[cellsTarget].cols * catalog.layouts[cellsTarget].rows} cells?`;
    $("cells-summary").textContent = mc.weighted
      ? `${moved} of the ${n} words this board uses will move or leave the home board.`
      : `${moved} of ${n} words will move or leave the home board.`;
    // 027 § 3.3: the groups preview too — words a family added on this
    // size get their place on the new one when the change is accepted.
    const missing = missingPositions(db, cellsTarget).length;
    $("cells-groups").hidden = missing === 0;
    $("cells-groups").textContent = `${missing} group ${missing === 1 ? "word gets its" : "words get their"} place on this size. Switching back later puts every word where it was.`;
    const box = $("cells-moved");
    box.innerHTML = "";
    const CLS = { sector: "moved nearby", moved: "new place", gone: "in Groups" };
    for (const w of mc.words.filter((w) => w.cls !== "same").slice(0, 30)) {
      const row = document.createElement("div");
      row.className = "mv-row";
      const label = document.createElement("span");
      label.textContent = w.label;
      const cls = document.createElement("span");
      cls.className = "mv-cls";
      cls.textContent = CLS[w.cls];
      row.append(label, cls);
    }
  }

  $("cells-seg").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (!v || v === boardGeom().name) return;
    cellsTarget = v;
    renderCellsForm();
    open("cellsform");
  });
  $("cells-apply").addEventListener("click", () => {
    if (!cellsTarget) return;
    const r = setBoardLayout(db, cellsTarget);
    close("cellsform");
    renderCellsSeg();
    renderGrid();
    rerenderView();
    if (r?.moved.length) {
      toast(`${r.moved.length} moved words stay highlighted for two weeks`);
    }
  });
  $("corner").addEventListener("click", renderCellsSeg);
  renderCellsSeg();
  return renderCellsSeg;
}
