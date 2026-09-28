/**
 * Web editor grid. The open group paints into the editor through the
 * board's own group painter — one renderer for a group page.
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

test("the editor lists the groups and paints the open one through the board's painter", async () => {
  const db = createDatabase(":memory:");
  db.prepare(
    `INSERT INTO board_group (id, kind, name, glyph, index_slot)
     VALUES ('grp_my_words', 'my_words', 'My Words', '⭐', 10)`,
  ).run();
  const grid = el();
  const groups = el();
  const ids = ["ed-paste", "ed-paste-preview", "ed-paste-add", "editor", "ed-board", "menu-editor", "ed-add"];
  const nodes = { "ed-grid": grid, "ed-groups": groups };
  for (const id of ids) nodes[id] = el();
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
    body: { classList: { add() {}, remove() {} } },
  };
  const painted = [];
  const editor = mountEditor({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    catalog: { groups: [] },
    openAddForm() {},
    async paintGroupPage(zg, opts) { painted.push({ zg, ...opts }); return 1; },
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
  // One renderer for a group page (027 A3): the editor hands its grid to
  // the board's painter, gestures always on.
  assert.equal(painted.length, 1);
  assert.equal(painted[0].zg, grid);
  assert.equal(painted[0].group, "grp_my_words");
  assert.equal(painted[0].page, 0);
  assert.equal(painted[0].gestures, true);
});
