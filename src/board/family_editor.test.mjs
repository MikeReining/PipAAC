/**
 * Family editor paint. The list the adult sees is the bar_family rows,
 * not a second copy kept in the board script.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountFamilyEditor } from "../../public/board/family-editor.js";

function el() {
  const node = {
    children: [],
    className: "",
    textContent: "",
    value: "",
    disabled: false,
    listeners: {},
    append(...kids) { node.children.push(...kids); },
    appendChild(kid) { node.children.push(kid); return kid; },
    addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
    set innerHTML(value) { if (value === "") node.children.length = 0; },
  };
  return node;
}

test("family editor paints one chip per bar_family row", () => {
  const db = createDatabase(":memory:");
  db.prepare(
    "INSERT INTO bar_family (id, name, glyph) VALUES ('bf_food', 'Food', '?')",
  ).run();
  const famList = el();
  const nodes = {
    "fam-list": famList,
    "fam-items": el(),
    "fam-title": el(),
    "fam-add": el(),
    "fam-add-btn": el(),
    "fam-save": el(),
    corner: el(),
  };
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
  };

  mountFamilyEditor({
    db,
    locale: "en",
    open() {},
    close() {},
    toast() {},
    resolveTyped() { return null; },
  });

  assert.equal(famList.children.length, 1);
  assert.equal(famList.children[0].textContent, "? Food");
  assert.equal(famList.children[0].className, "fam-chip");
  assert.equal(nodes.corner.listeners.click.length, 1);
});
