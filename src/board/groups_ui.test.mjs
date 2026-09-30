/**
 * The group surface (027 A3), measured on the painted cells: the index
 * shows doors by name with hidden ones keeping their slot, and a group
 * page shows the home board's top row and frame in its reserved cells —
 * the top row empty (still reserved) when its setting is off.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { mountGroups } from "../../public/board/groups-ui.js";
import { setGroupHidden, setSetting } from "../../public/shared/groups.mjs";
import { coreCells } from "../../public/shared/coremove.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");

function el() {
  const node = {
    children: [],
    textContent: "",
    className: "",
    disabled: false,
    dataset: {},
    style: {},
    value: "",
    files: [],
    classList: {
      add(name) { node.className += ` ${name}`; },
      toggle(name, on) { if (on) node.className += ` ${name}`; },
    },
    setAttribute() {},
    append(...kids) { node.children.push(...kids); },
    appendChild(kid) { node.children.push(kid); return kid; },
    replaceChildren(...kids) { node.children.length = 0; node.children.push(...kids); },
    addEventListener() {},
    set innerHTML(value) { if (value === "") node.children.length = 0; },
  };
  return node;
}

const lexicon = JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8"));
const catalog = buildCatalog(lexicon, parseCoordinateMapMarkdown(
  readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")));

function mount(db, { editing = false, grid = el() } = {}) {
  const nodes = { groupgrid: grid };
  globalThis.document = {
    getElementById: (id) => (nodes[id] ??= el()),
    createElement: () => el(),
  };
  const ui = mountGroups({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    boardGeom: () => ({ name: "grid60", cols: 10, rows: 6, cells: 60 }),
    getEditing: () => editing,
    getModelGlow: () => new Set(),
    getLikelyGroups: () => new Set(),
    setView() {},
    open() {},
    close() {},
    toast() {},
    wordTile: ({ label }) => Object.assign(el(), { textContent: label }),
    layerMark() {},
    fitLabels() {},
    tap() {},
    shownLabel: (id, label) => label,
    navCell(label) {
      const n = el();
      n.textContent = label;
      return n;
    },
    editPointer() {},
    xBadge: () => el(),
    openAddForm() {},
    openWordCard() {},
    homeCells: () => coreCells(db, "grid60", "en"),
    homeTile: (c) => ({ el: Object.assign(el(), { textContent: `home:${c.label}` }), say: c.label }),
    rerenderView() {},
    async loadPhotoURL() { return null; },
    async savePhoto() { return null; },
    syncUploadBlob() {},
  });
  return { ui, grid };
}
const labelsOf = (grid) => grid.children.flatMap((cell) =>
  cell.children.filter((c) => c.className.includes("glabel")).map((c) => c.textContent));

test("the index paints stored groups by name — no back cell in the grid; hidden doors keep their slot", () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  db.prepare(
    `INSERT INTO board_group (id, kind, name, glyph, index_slot)
     VALUES ('grp_snacks', 'custom', 'Snacks', '🍎', 90)`,
  ).run();
  const { ui, grid } = mount(db);
  ui.renderGroupIndex();
  assert.equal(grid.children.length, 60);
  // Row 0 is reserved on the index too — it shows the home board's own
  // tiles when "Top row on every group" is on; no back cell in the grid.
  const home = new Map(coreCells(db, "grid60", "en").map((c) => [c.slot_index, c.label]));
  assert.equal(grid.children[0].textContent, `home:${home.get(0)}`);
  assert.equal(grid.children[9].textContent, `home:${home.get(9)}`, "frame cell always shows");
  setSetting(db, "group_top_row", 0);
  ui.renderGroupIndex();
  assert.match(grid.children[0].className, /empty reserved/);
  assert.equal(grid.children[9].textContent, `home:${home.get(9)}`, "frame cell stays with the toggle off");
  setSetting(db, "group_top_row", 1);
  ui.renderGroupIndex();
  const first = labelsOf(grid);
  assert.deepEqual(first.slice(0, 5), ["My Words", "Breakfast", "Lunch", "Dinner", "Snack"]);
  assert.ok(!first.includes("More people"), "grid15-only groups stay off the 60-cell index");

  setGroupHidden(db, "grp_lunch", true);
  setSetting(db, "occasions_visible", 0);
  ui.renderGroupIndex();
  const after = labelsOf(grid);
  assert.ok(!after.includes("Lunch") && !after.includes("Breakfast"));
  assert.equal(after[0], "My Words");
  // My Words kept its slot: the doors before it are gaps, not a repack.
  const myWordsCell = grid.children.findIndex((cell) => cell.dataset.group === "grp_my_words");
  assert.equal(myWordsCell, 10, "My Words is the first door, at canonical slot 10");

  // Edit mode shows every door; a hidden one reads as hidden.
  const edit = mount(db, { editing: true });
  edit.ui.renderGroupIndex();
  assert.ok(labelsOf(edit.grid).includes("Lunch"));
});

test("a group page: the home board's top row and frame in the reserved cells, words in theirs, Next only when paging", async () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const { ui, grid } = mount(db);
  ui.setGroup("grp_breakfast", 0);
  await ui.renderGroupPage();
  assert.equal(grid.children.length, 60);
  const text = (slot) => grid.children[slot].textContent;
  const home = new Map(coreCells(db, "grid60", "en").map((c) => [c.slot_index, c.label]));
  for (const slot of [0, 1, 2, 7, 8, 9, 19, 39, 49]) assert.equal(text(slot), `home:${home.get(slot)}`, `slot ${slot}`);
  assert.match(grid.children[59].className, /reserved/, "one page: Next's cell stays empty and reserved");
  const milk = catalog.groupCells.find((c) => c.group_id === "grp_breakfast" && c.layout === "grid60"
    && catalog.labels.find((l) => l.sense_id === c.item_id && l.kind === "lemma").text === "milk");
  assert.equal(text(milk.slot_index), "milk");

  // Top row off: those cells go empty and stay reserved; the frame stays.
  setSetting(db, "group_top_row", 0);
  await ui.renderGroupPage();
  for (const slot of [0, 1, 2, 8]) assert.match(grid.children[slot].className, /empty reserved/, `slot ${slot}`);
  assert.equal(text(9), `home:${home.get(9)}`, "yes is a frame word — it always shows");
  assert.equal(text(milk.slot_index), "milk", "nothing moved");
});
