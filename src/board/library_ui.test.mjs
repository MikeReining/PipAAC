/**
 * Word library paint. An empty Added tab says so, instead of a blank sheet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountLibrary } from "../../public/board/library-ui.js";

function el() {
  const node = {
    value: "",
    textContent: "",
    id: "",
    children: [],
    classList: { toggle() {}, add() {} },
    addEventListener() {},
    append(...kids) { node.children.push(...kids); },
    appendChild(kid) { node.children.push(kid); return kid; },
    querySelectorAll() { return []; },
    set innerHTML(value) { if (value === "") node.children.length = 0; },
  };
  return node;
}

test("an empty library says nothing is here yet", () => {
  const db = createDatabase(":memory:");
  const list = el();
  const nodes = {
    "lib-q": el(),
    "lib-list": list,
    "lib-tabs": el(),
    "open-library": el(),
  };
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
  };

  const lib = mountLibrary({
    db,
    locale: "en",
    open() {},
    async loadPhotoURL() { return null; },
    artInto() { return false; },
    openWordCard() {},
  });

  lib.renderLibrary();
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].textContent, "Nothing here yet.");
});
