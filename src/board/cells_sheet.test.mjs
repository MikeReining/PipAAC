/**
 * Cells sheet paint. The segment shows each layout's cell count, and
 * choosing one previews the move cost before the layout is written.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { bindLayouts } from "../../public/shared/movecost.mjs";
import { mountCellsSheet } from "../../public/board/cells-sheet.js";

function el() {
  const node = {
    children: [],
    textContent: "",
    dataset: {},
    on: false,
    listeners: {},
    classList: {
      toggle(name, force) { if (name === "on") node.on = !!force; },
      add() {},
      remove() {},
      contains() { return false; },
    },
    append(...kids) { node.children.push(...kids); },
    appendChild(kid) { node.children.push(kid); return kid; },
    addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
    set innerHTML(value) { if (value === "") node.children.length = 0; },
  };
  return node;
}

test("cells sheet marks the current layout and previews a different one", () => {
  const db = createDatabase(":memory:");
  // Group geometry is catalog data the import writes (027 § 3.2).
  db.exec(`INSERT INTO layout_shape (layout, cols, rows, frame) VALUES
    ('grid60', 10, 6, '[9,19,39,49]'), ('grid15', 5, 3, '[3,4,8,9]')`);
  const seg = el();
  const summary = el();
  const nodes = {
    "cells-seg": seg,
    "cells-moved": el(),
    "cells-title": el(),
    "cells-summary": summary,
    "cells-groups": el(),
    "cells-apply": el(),
    corner: el(),
  };
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
  };
  const opened = [];
  const catalog = {
    layouts: {
      grid60: { cols: 10, rows: 6 },
      grid15: { cols: 5, rows: 3 },
    },
  };
  bindLayouts(catalog.layouts);

  mountCellsSheet({
    db,
    catalog,
    locale: "en",
    boardGeom: () => ({ name: "grid60" }),
    open: (id) => opened.push(id),
    close() {},
    toast() {},
    renderGrid() {},
    rerenderView() {},
  });

  assert.deepEqual(
    seg.children.map((b) => [b.textContent, b.dataset.v, b.on]),
    [
      ["15", "grid15", false],
      ["60", "grid60", true],
    ],
  );

  seg.listeners.click[0]({
    target: { closest: () => ({ dataset: { v: "grid15" } }) },
  });
  assert.deepEqual(opened, ["cellsform"]);
  assert.equal(nodes["cells-title"].textContent, "Switch to 15 cells?");
  assert.equal(
    summary.textContent,
    "0 of 0 words will move or leave the main board.",
  );
});
