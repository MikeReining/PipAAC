/**
 * Word card paint. A personal word opens with its name and is editable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountWordCard } from "../../public/board/word-card.js";

function el() {
  const node = {
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    className: "",
    files: [],
    children: [],
    classList: {
      add(name) { node.className += ` ${name}`; },
      toggle() {},
    },
    addEventListener() {},
    appendChild(kid) { node.children.push(kid); return kid; },
    replaceChildren(...kids) { node.children = kids; },
    querySelector() { return null; },
    set innerHTML(value) { if (value === "") node.children.length = 0; },
  };
  return node;
}

test("a personal word opens with its name", () => {
  const db = createDatabase(":memory:");
  const name = el();
  const role = el();
  const ids = [
    "wc-pic", "wc-photolabel", "wc-photo", "wc-ownpiclabel", "wc-ownpic",
    "wc-kind", "wc-kindlabel",
    "wc-remove", "wc-hide", "wc-grouplist", "wc-groups", "wc-ourpic", "wc-libpics",
    "wc-record", "wc-revert", "wc-play", "wc-rechint", "wc-addgroup", "wc-show",
  ];
  const nodes = { "wc-name": name, "wc-role": role };
  for (const id of ids) nodes[id] = el();
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
  };
  const opened = [];

  const card = mountWordCard({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    open: (id) => opened.push(id),
    close() {},
    toast() {},
    metaFor() { return { role: "Yellow" }; },
    artInto() { return false; },
    async loadPhotoURL() { return null; },
    async savePhoto() { return null; },
    syncUploadBlob() {},
    speakItem() {},
    xBadge: () => el(),
    invalidateIndex() {},
    setView() {},
    rerenderView() {},
    renderStrip() {},
    renderGrid() {},
    flashCell() {},
    getCell() { return null; },
    getGroupKey() { return null; },
    setGroup() {},
    dropEntityPhoto() {},
    dropEntityRole() {},
    dropSenseMeta() {},
  });

  card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  assert.equal(name.value, "Pip");
  assert.equal(name.disabled, false);
  assert.equal(role.textContent, "personal word");
  assert.deepEqual(opened, ["wordcard"]);
});
