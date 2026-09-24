/**
 * Add-word sheet. Opening it names the group the word will be filed into.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountAddFlow } from "../../public/board/add-flow.js";

function el() {
  const node = {
    textContent: "",
    value: "",
    hidden: false,
    disabled: false,
    files: [],
    children: [],
    classList: { toggle() {}, add() {} },
    addEventListener() {},
    click() {},
    append() {},
    appendChild(kid) { return kid; },
    set innerHTML(value) { if (value === "") node.children.length = 0; },
  };
  return node;
}

test("add form titles itself with the target group", () => {
  const db = createDatabase(":memory:");
  db.prepare(
    `INSERT INTO board_group (id, kind, name, glyph, index_slot)
     VALUES ('grp_snacks', 'custom', 'Snacks', '🍎', 12)`,
  ).run();
  const title = el();
  const ids = [
    "add-name", "add-photo", "add-hint", "add-kind", "add-newfields", "add-matches", "add-new",
    "bulk-paste", "bulk-preview", "bulk-add", "bulk-title", "add-bulk", "lib-bulk",
    "add-photos", "add-photos-input", "photo-title", "photo-rows", "photo-save", "add-save",
  ];
  const nodes = { "add-title": title };
  for (const id of ids) nodes[id] = el();
  globalThis.document = { getElementById: (id) => nodes[id] };
  const opened = [];

  const add = mountAddFlow({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    catalog: { groups: [] },
    open: (id) => opened.push(id),
    close() {},
    toast() {},
    async savePhoto() { return null; },
    syncUploadBlob() {},
    async loadPhotoURL() { return null; },
    artInto() { return false; },
    invalidateIndex() {},
    rerenderView() {},
    renderStrip() {},
    renderLibrary() {},
  });

  add.openAddForm("grp_snacks");
  assert.equal(title.textContent, "Add to Snacks");
  assert.deepEqual(opened, ["addform"]);
});
