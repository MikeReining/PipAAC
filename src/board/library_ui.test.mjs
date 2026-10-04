/**
 * Word library paint. An empty Added tab says so, instead of a blank sheet.
 * Rows keep a real height — searching can never collapse results to slivers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase } from "./catalog.mjs";
import { mountLibrary } from "../../public/board/library-ui.js";

const repoRoot = join(import.meta.dirname, "../..");

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

test("addmatch rows can't squash — min-height floor, shrink off", () => {
  // .addmatch is overflow:hidden, so a flex column capped by max-height
  // (#lib-list 50vh, or any .sheet squeezed by the iPad keyboard) treats its
  // automatic minimum as 0 and compresses rows to slivers. The row component
  // must declare the floor itself.
  const css = readFileSync(join(repoRoot, "public/board/add-flow.css"), "utf8");
  const block = css.match(/\.addmatch \{([^}]*)\}/s)?.[1] ?? "";
  assert.match(block, /flex:\s*none|flex-shrink:\s*0/, ".addmatch must not shrink");
  assert.match(block, /min-height:\s*[4-9]\dpx/, ".addmatch needs a min-height floor");
});
