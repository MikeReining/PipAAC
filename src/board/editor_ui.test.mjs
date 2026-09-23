/**
 * Web editor grid. The open group paints into the editor, with the
 * group name in the first cell and Add in the second.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountEditor } from "../../public/board/editor-ui.js";

function el() {
  const node = {
    value: "",
    textContent: "",
    disabled: false,
    hidden: false,
    className: "",
    dataset: {},
    style: {},
    children: [],
    classList: { add() {}, remove() {} },
    addEventListener() {},
    append(...kids) { node.children.push(...kids); },
    appendChild(kid) { node.children.push(kid); return kid; },
    set innerHTML(value) { if (value === "") node.children.length = 0; },
  };
  return node;
}

test("the editor grid names the open group and offers add", () => {
  const db = createDatabase(":memory:");
  db.prepare(
    `INSERT INTO board_group (id, kind, name, glyph, index_slot)
     VALUES ('grp_my_words', 'my_words', 'My Words', '⭐', 10)`,
  ).run();
  const grid = el();
  const groups = el();
  const ids = ["ed-paste", "ed-paste-preview", "ed-paste-add", "editor", "ed-board", "menu-editor"];
  const nodes = { "ed-grid": grid, "ed-groups": groups };
  for (const id of ids) nodes[id] = el();
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
    body: { classList: { add() {}, remove() {} } },
  };

  const editor = mountEditor({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    catalog: { groups: [] },
    boardGeom: () => ({ cols: 10, rows: 6, cells: 60 }),
    navCell(label) {
      const n = el();
      n.textContent = label;
      return n;
    },
    fitLabels() {},
    openAddForm() {},
    async itemCell() { return el(); },
    renderLibrary() {},
    invalidateIndex() {},
    setView() {},
    toast() {},
    close() {},
    async savePhoto() { return null; },
    syncUploadBlob() {},
  });

  editor.renderEditor();
  assert.equal(groups.children.length, 1);
  assert.equal(groups.children[0].textContent, "My Words");
  assert.match(groups.children[0].className, /on/);
  assert.equal(grid.children[0].textContent, "My Words");
  assert.equal(grid.children[1].textContent, "+ Add");
  assert.equal(grid.children.length, 60);
});
