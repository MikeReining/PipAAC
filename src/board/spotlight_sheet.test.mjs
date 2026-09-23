/**
 * Spotlight sheet paint. A saved list shows up as a row whose label is
 * the list name and how many words it holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountSpotlightSheet } from "../../public/board/spotlight-sheet.js";

function el() {
  const node = {
    children: [],
    textContent: "",
    value: "",
    hidden: false,
    html: "",
    dataset: {},
    listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    append(...kids) { node.children.push(...kids); },
    appendChild(kid) { node.children.push(kid); return kid; },
    addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
    querySelectorAll() { return []; },
    set innerHTML(value) {
      node.html = value;
      if (value === "") node.children.length = 0;
    },
    get innerHTML() { return node.html; },
  };
  return node;
}

test("spotlight sheet paints a saved list when the sheet opens", () => {
  const db = createDatabase(":memory:");
  db.prepare(
    "INSERT INTO spotlight_list (id, name, created_at) VALUES ('spl_snack', 'Snack', 1)",
  ).run();
  db.prepare(
    "INSERT INTO spotlight_item (list_id, kind, item_id) VALUES ('spl_snack', 'sense', 'sns_1')",
  ).run();

  const ids = [
    "spot-running", "spot-running-label", "spot-lists", "spot-minutes",
    "spot-pulse", "spot-dim", "model-speaks", "spot-boost", "open-spot",
    "spot-model", "model-done", "spot-end", "spot-pick", "spot-pick-cancel",
    "spot-pick-start", "spot-pick-save", "spot-list-name", "spot-name-save",
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, el()]));
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
  };
  const opened = [];

  mountSpotlightSheet({
    db,
    catalog: {},
    open: (id) => opened.push(id),
    close() {},
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    coachLabel: () => "",
    bindSpotSettings: () => 0,
    renderGrid() {},
    renderStrip() {},
    rerenderView() {},
    setModeling() {},
    setPicking() {},
    getPicking: () => null,
    getSpotPulse: () => false,
    getModelSpeaks: () => false,
  });

  nodes["open-spot"].listeners.click[0]();
  assert.deepEqual(opened, ["spotform"]);
  assert.equal(nodes["spot-lists"].children.length, 1);
  assert.equal(nodes["spot-lists"].children[0].children[0].textContent, "Snack (1 word)");
});
