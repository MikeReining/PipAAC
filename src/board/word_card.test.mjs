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
    on: {},
    classList: {
      add(name) { node.className += ` ${name}`; },
      toggle() {},
    },
    addEventListener(type, fn) { node.on[type] = fn; },
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
    "wc-voice", "wc-voicetry", "wc-flag",
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

/** Mount the card with a DOM-harness element set and a tile seam. */
function cardHarness({ tile, nodes = {} } = {}) {
  const db = createDatabase(":memory:");
  const ids = [
    "wc-pic", "wc-photolabel", "wc-photo", "wc-ownpiclabel", "wc-ownpic",
    "wc-kind", "wc-kindlabel",
    "wc-remove", "wc-hide", "wc-grouplist", "wc-groups", "wc-ourpic", "wc-libpics",
    "wc-record", "wc-revert", "wc-play", "wc-rechint", "wc-addgroup", "wc-show",
    "wc-voice", "wc-voicetry", "wc-flag", "wc-name", "wc-role",
  ];
  for (const id of ids) nodes[id] ??= el();
  const toasts = [];
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
  };
  const card = mountWordCard({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    open() {},
    close() {},
    toast: (m) => toasts.push(m),
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
    tile,
  });
  return { card, nodes, toasts };
}

test("028 WT14 — 'Sounds wrong' flags the shared clip and keeps playing", async () => {
  const flagged = [];
  const tile = {
    status: () => null,
    message: () => "",
    onStatus: () => () => {},
    ensure: async () => ({ ok: true }),
    flag: async (text) => { flagged.push(text); return true; },
    shared: () => true,
  };
  const nodes = {};
  const { card, toasts } = cardHarness({ tile, nodes });

  card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  const flagBtn = nodes["wc-flag"];
  assert.equal(flagBtn.hidden, false); // shared voice → flag offered
  await flagBtn.on.click();
  assert.deepEqual(flagged, ["Pip"]); // the clip's text, not an id
  assert.equal(flagBtn.disabled, true);
  assert.equal(flagBtn.textContent, "Flagged for review");
  assert.equal(toasts.at(-1), "Flagged — it keeps playing meanwhile");
});

test("028 — flag stays hidden for catalog words and device voices", () => {
  const tile = {
    status: () => null,
    message: () => "",
    onStatus: () => () => {},
    ensure: async () => ({ ok: true }),
    flag: async () => false,
    shared: () => false, // device TTS — nothing shared to flag
  };
  const nodes = {};
  const { card } = cardHarness({ tile, nodes });
  card.openWordCard({ item_kind: "entity", item_id: "ent_pip", label: "Pip" });
  assert.equal(nodes["wc-flag"].hidden, true);

  // A shared voice still hides it for a catalog word — senses play the
  // catalog clip pipeline, which has its own review path.
  const tile2 = { ...tile, shared: () => true };
  const nodes2 = {};
  const { card: card2 } = cardHarness({ tile: tile2, nodes: nodes2 });
  card2.openWordCard({ item_kind: "sense", item_id: "s_1", label: "zebra" });
  assert.equal(nodes2["wc-flag"].hidden, true);
});
