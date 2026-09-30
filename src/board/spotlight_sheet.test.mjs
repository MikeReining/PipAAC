/**
 * Spotlight page paint. A saved list shows up as a row whose label is
 * the list name and how many words it holds, when Settings opens.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountSpotlightSheet } from "../../public/board/spotlight-sheet.js";
import { STARTER_LISTS } from "../../public/shared/spotlight_starters.mjs";

function el() {
  const node = {
    children: [],
    attrs: {},
    style: {},
    textContent: "",
    value: "",
    hidden: false,
    html: "",
    dataset: {},
    listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    append(...kids) { node.children.push(...kids); },
    replaceChildren(...kids) { node.children = [...kids]; },
    replaceWith() {},
    setAttribute(k, v) { node.attrs[k] = v; },
    get childElementCount() { return node.children.length; },
    querySelector() { return null; },
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

test("the Spotlight page paints a saved list when Settings opens", () => {
  const db = createDatabase(":memory:");
  db.prepare(
    "INSERT INTO spotlight_list (id, name, created_at) VALUES ('spl_snack', 'Snack', 1)",
  ).run();
  db.prepare(
    "INSERT INTO spotlight_item (list_id, kind, item_id) VALUES ('spl_snack', 'sense', 'sns_1')",
  ).run();

  const ids = [
    "spot-running", "spot-running-label", "spot-lists",
    "spot-pulse", "spot-dim", "model-speaks", "spot-off", "spot-hero-tiles",
    "spot-hero-say", "spot-running-words", "spot-model-title", "spot-model-hint",
    "spot-link", "spot-look-sum", "spot-prev", "spot-try", "spot-hero-mark",
    "spot-model", "model-done", "spot-end", "spot-pick", "spot-pick-cancel",
    "spot-pick-start", "spot-pick-save", "spot-list-name", "spot-name-save",
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, el()]));
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
  };
  const onOpen = [];

  mountSpotlightSheet({
    db,
    catalog: {},
    me: { name: "Sonja" },
    tileFor: () => el(),
    open() {},
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
    onSettingsOpen: (fn) => onOpen.push(fn),
    openSettings() {},
    startDemo() {},
  });

  assert.equal(onOpen.length, 1, "the page repaints when Settings opens");
  onOpen[0]();
  const kids = nodes["spot-lists"].children;
  const cards = kids.filter((c) => c.className === "spot-card");
  assert.equal(cards.length, 1);
  // Every suggested list follows — none is saved yet.
  assert.equal(kids.filter((c) => c.className === "spot-card spot-idea").length, STARTER_LISTS.length);
  const [head] = cards[0].children;
  assert.deepEqual(head.children.map((c) => c.textContent), ["Snack", "1 word"]);
  // The child's own device has no Model button — it would glow nothing.
  assert.equal(nodes["spot-model"].hidden, true);
  assert.equal(nodes["spot-link"].hidden, false);
});
