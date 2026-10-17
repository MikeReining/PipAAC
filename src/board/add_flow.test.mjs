/**
 * Add-word sheet. Opening it names the group the word will be filed into.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountAddFlow } from "../../public/board/add-flow.js";
import { installDom } from "./fake_dom.mjs";

test("add form names the page the word will be filed into", () => {
  const db = createDatabase(":memory:");
  db.prepare(
    `INSERT INTO board_group (id, kind, name, glyph, index_slot)
     VALUES ('grp_snacks', 'custom', 'Snacks', '🍎', 12)`,
  ).run();
  const $ = installDom();
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
  assert.equal($("add-title").textContent, "Add a word");
  assert.equal($("add-destname").textContent, "Snacks");
  assert.deepEqual(opened, ["addform"]);
});

/** 028 Works Test 12 — the supporter's save is the mint trigger: one
 *  background ensure, fired after the entity lands, never blocking. */
test("a saved entity word fires exactly one background mint", async () => {
  const db = createDatabase(":memory:");
  // Geometry is catalog data the import writes — placeItem needs it.
  db.exec(`INSERT INTO layout_shape (layout, cols, rows, frame) VALUES
    ('grid60', 10, 6, '[9,19,39,49]')`);
  db.prepare(
    `INSERT INTO board_group (id, kind, name, glyph, index_slot)
     VALUES ('grp_snacks', 'custom', 'Snacks', '🍎', 12)`,
  ).run();
  const $ = installDom();
  const mints = [];
  const add = mountAddFlow({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    catalog: { groups: [] },
    open() {},
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
    openAddToBoards() {},
    tile: {
      ensure: (text, opts) => {
        mints.push({ text, source: opts?.source });
        return Promise.resolve({ ok: true });
      },
    },
  });

  add.openAddForm("grp_snacks");
  $("add-word").value = "Cooper";
  await $("add-word").fire("input");
  await $("add-word").fire("keydown", { key: "Enter" });

  assert.deepEqual(mints, [{ text: "Cooper", source: "user_typed" }]);
  const ent = db.prepare(
    "SELECT spoken_name FROM personal_entity WHERE spoken_name = 'Cooper'").get();
  assert.equal(ent.spoken_name, "Cooper"); // the tile is placed either way
});

/** The drawings-left number in the paste sheet is what the server says
 *  NOW: a paste spends drawings, so the next open must ask again. */
test("the paste sheet re-reads the drawing allowance on every open", async () => {
  const db = createDatabase(":memory:");
  db.prepare(
    `INSERT INTO board_group (id, kind, name, glyph, index_slot)
     VALUES ('grp_snacks', 'custom', 'Snacks', '🍎', 12)`,
  ).run();
  const $ = installDom();
  const lefts = [5, 1]; // server answers over time
  const add = mountAddFlow({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    catalog: { groups: [] },
    open() {}, close() {}, toast() {},
    async savePhoto() { return null; },
    syncUploadBlob() {},
    async loadPhotoURL() { return null; },
    artInto() { return false; },
    invalidateIndex() {}, rerenderView() {}, renderStrip() {}, renderLibrary() {},
    openAddToBoards() {},
    creds: async () => ({ userId: "u", license: null }),
    pictures: {
      allowance: async () => ({ left: lefts.shift() }),
      // Nothing close for a common word, calibrated: both rows "will draw".
      findBatch: async ({ items }) => ({
        results: items.map(() => ({ scope: "common", calibrated: true, candidates: [] })),
      }),
    },
  });
  const settle = () => new Promise((r) => setTimeout(r, 450));

  add.openBulkForm("grp_snacks", "zorpwug\nblatnik");
  await settle();
  assert.equal($("bulk-note").hidden, true, "2 drawings of 5 left: no warning");

  add.openBulkForm("grp_snacks", "zorpwug\nblatnik");
  await settle();
  assert.equal($("bulk-note").hidden, false);
  assert.match($("bulk-note").textContent, /more drawings than you have left \(1\)/);
});
