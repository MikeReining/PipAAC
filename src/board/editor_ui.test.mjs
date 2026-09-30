/**
 * 031 — the board editor. The main board and each group paint through
 * the board's own painters (one renderer, WT 11); the one field finds
 * and adds (WT 3, 4); group changes write through the owners.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase } from "./catalog.mjs";
import { installDom, findAll } from "./fake_dom.mjs";
import { mountEditor } from "../../public/board/editor-ui.js";
import { createEntity, createGroup, placeItem } from "../../public/shared/groups.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

function freshDb() {
  const db = createDatabase(":memory:");
  db.exec(`INSERT INTO layout_shape (layout, cols, rows, frame) VALUES ('grid60', 10, 6, '[9,19,39,49]')`);
  createGroup(db, { id: "grp_food", name: "Food" });
  createGroup(db, { id: "grp_mine", name: "Mine" });
  return db;
}

function harness({ db = freshDb() } = {}) {
  const $ = installDom();
  const log = { main: 0, painted: [], cards: [], made: [], placed: [], bulk: [], views: [], flashed: [] };
  let editor = null;
  editor = mountEditor({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    catalog: { groups: [] },
    me: { id: "u1", name: "Maya" },
    userStore: null,
    flushDb: async () => {},
    async paintGroupPage(zg, opts) { log.painted.push({ zg, ...opts }); return 1; },
    renderMainBoard: () => { log.main++; },
    homeCells: () => [],
    boardGeom: () => ({ cols: 10, name: "grid60", anchors: new Map() }),
    addFlow: {
      makeWord: (text, o) => { log.made.push({ text, ...o }); return createEntity(db, { name: text }).id; },
      placeWord: (kind, id, label, o) => { log.placed.push({ kind, id, ...o }); },
      openBulkForm: (gid, text) => log.bulk.push({ gid, text }),
    },
    openWordCard: (item) => { log.cards.push(item); $("wordcard").classList.add("open"); },
    closeCard: () => $("wordcard").classList.remove("open"),
    // The app's setView("editor") repaints the editor; mirror that.
    setView: (v) => { log.views.push(v); if (v === "editor") editor.renderEditor(); },
    openGroupView: (id) => log.views.push(`group:${id}`),
    flashCell: (el) => log.flashed.push(el),
    toast() {},
    undoLast() {},
    syncState: () => ({ linked: false, pending: 0, online: true, flushError: null }),
    renderLibrary() {},
    invalidateIndex() {},
    renderStrip() {},
    async savePhoto() { return null; },
    syncUploadBlob() {},
    tile: null,
    async loadPhotoURL() { return null; },
    artInto() { return false; },
  });
  const rowsNamed = () => findAll($("ed-groups"), (n) => n.className?.startsWith("ed-grow"))
    .map((n) => findAll(n, (k) => k.className === "ed-gname")[0]?.textContent);
  return { db, $, editor, log, rowsNamed };
}

test("opens on the main board, painted by the board's own painter", async () => {
  const h = harness();
  h.editor.renderEditor();
  await flush();
  assert.equal(h.log.main, 1, "the main board renders through renderGrid (WT 11)");
  assert.equal(h.$("ed-grid").hidden, true);
  assert.equal(h.rowsNamed()[0], "Main board");
  assert.deepEqual(h.rowsNamed().slice(1, 3), ["Food", "Mine"], "groups in door order");
  assert.equal(h.rowsNamed().at(-1), "All words");
});

test("a group paints into the stage through the group painter, gestures on", async () => {
  const h = harness();
  h.editor.renderEditor();
  await h.editor.openGroup("grp_food");
  await flush();
  const p = h.log.painted.at(-1);
  assert.equal(p.zg, h.$("ed-grid"));
  assert.equal(p.group, "grp_food");
  assert.equal(p.page, 0);
  assert.equal(p.gestures, true);
  assert.equal(h.$("ed-grid").hidden, false);
});

test("WT 4 — find → go: typing a word Maya has, Return opens its group and selects it", async () => {
  const h = harness();
  const { id } = createEntity(h.db, { name: "Cooper" });
  placeItem(h.db, "grp_mine", "entity", id);
  h.editor.renderEditor();
  h.$("ed-q").value = "Cooper";
  await h.$("ed-q").fire("input");
  const heads = findAll(h.$("ed-drop"), (n) => n.className === "ed-dhead").map((n) => n.textContent);
  assert.equal(heads[0], "On Maya's board");
  await h.$("ed-q").fire("keydown", { key: "Enter" });
  await flush();
  assert.equal(h.log.painted.at(-1).group, "grp_mine");
  assert.equal(h.log.cards.at(-1)?.item_id, id, "selected: its card opens");
});

test("Make from the field saves into the group on screen", async () => {
  const h = harness();
  h.editor.renderEditor();
  await h.editor.openGroup("grp_food");
  h.$("ed-q").value = "applesauce";
  await h.$("ed-q").fire("input");
  await h.$("ed-q").fire("keydown", { key: "Enter" });
  await flush();
  assert.deepEqual(h.log.made, [{ text: "applesauce", groupId: "grp_food", cell: null }]);
});

test("WT 5 — a pasted list hands over to the list preview for this group", async () => {
  const h = harness();
  h.editor.renderEditor();
  await h.editor.openGroup("grp_food");
  await h.$("ed-q").fire("paste", {
    clipboardData: { getData: () => "kite\nbeach ball\nsunscreen" },
  });
  assert.deepEqual(h.log.bulk, [{ gid: "grp_food", text: "kite\nbeach ball\nsunscreen" }]);
});

test("WT 3 — one add path: the editor has one field that creates words, the old paste pane is gone", () => {
  const html = readFileSync(join(repoRoot, "public/index.html"), "utf8");
  const editor = html.slice(html.indexOf('<div id="editor">'), html.indexOf("<!-- Preview (031"));
  for (const gone of ['id="ed-paste"', 'id="ed-paste-add"', 'id="ed-add"', 'id="menu-editor"', 'id="ed-board"']) {
    assert.equal(html.includes(gone), false, `${gone} removed`);
  }
  const textInputs = [...editor.matchAll(/<input type="text" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(textInputs, ["ed-q", "ed-wq"], "ed-q adds; ed-wq only searches All words");
  assert.equal(editor.includes("<textarea"), false);
});

test("WT 6 — two photos dropped on an empty cell: the first lands there, the second on the next free cell", async () => {
  const h = harness();
  h.editor.renderEditor();
  await h.editor.openGroup("grp_food");
  const slotEl = { dataset: { slot: "22" }, classList: { contains: (c) => c === "empty" } };
  const file = (name) => ({ name, type: "image/jpeg" });
  await h.$("editor").fire("drop", {
    dataTransfer: { types: ["Files"], files: [file("Sand castle.jpg"), file("bucket.png")] },
    target: { closest: () => slotEl },
  });
  await flush();
  const cells = h.db.prepare(
    `SELECT e.spoken_name AS name, gc.page, gc.slot_index FROM group_cell gc
     JOIN personal_entity e ON e.id = gc.item_id WHERE gc.group_id = 'grp_food' ORDER BY gc.slot_index`).all();
  const sand = cells.find((c) => c.name.toLowerCase() === "sand castle");
  assert.deepEqual([sand.page, sand.slot_index], [0, 22]);
  const bucket = cells.find((c) => c.name.toLowerCase() === "bucket");
  assert.ok(bucket && !(bucket.page === 0 && bucket.slot_index === 22), "the second takes the next free cell");
});

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test("Preview → Back / Esc / reload returns to the same group, word and card; Done forgets", async () => {
  globalThis.sessionStorage = memoryStorage();
  const db = freshDb();
  const { id } = createEntity(db, { name: "Cooper" });
  placeItem(db, "grp_mine", "entity", id);
  const h = harness({ db });
  h.editor.renderEditor();
  await h.editor.openGroup("grp_mine");
  h.editor.select({ item_kind: "entity", item_id: id, label: "Cooper" }, { additive: false });
  assert.equal(h.$("wordcard").classList.contains("open"), true);

  await h.$("ed-preview").click();
  assert.equal(h.$("wordcard").classList.contains("open"), false, "Preview shows Maya's view");
  assert.equal(h.log.views.at(-1), "group:grp_mine");

  const cardsBefore = h.log.cards.length;
  await h.$("ed-back").click();
  await flush();
  assert.equal(h.log.painted.at(-1).group, "grp_mine", "same group");
  assert.equal(h.log.cards.length, cardsBefore + 1, "the card reopens");
  assert.equal(h.log.cards.at(-1).item_id, id, "on the same word");

  // Esc from Preview does the same.
  await h.$("ed-preview").click();
  const n = h.log.cards.length;
  await document.fire("keydown", { key: "Escape" });
  await flush();
  assert.equal(h.log.cards.length, n + 1);
  assert.equal(h.log.painted.at(-1).group, "grp_mine");

  // A reload in the same tab lands in the same place, card open.
  const h2 = harness({ db });
  h2.editor.renderEditor();
  await flush();
  assert.equal(h2.log.painted.at(-1)?.group, "grp_mine");
  assert.equal(h2.log.cards.at(-1)?.item_id, id);

  // Done leaves the editor and forgets the place: next time, the main board.
  await h2.$("ed-preview").click();
  await h2.$("ed-done").click();
  const h3 = harness({ db });
  h3.editor.renderEditor();
  await flush();
  assert.equal(h3.log.main, 1);
  assert.equal(h3.log.cards.length, 0);
});

test("the editor's gear opens Settings through the PIN gate, like the board's corner", () => {
  const html = readFileSync(join(repoRoot, "public/index.html"), "utf8");
  const head = html.slice(html.indexOf('<header id="ed-head">'), html.indexOf('<div class="ed-who">'));
  assert.match(head, /id="ed-settings"/, "the gear leads the editor's top bar");
  const board = readFileSync(join(repoRoot, "public/board.js"), "utf8");
  assert.match(board, /\$\("ed-settings"\)\.addEventListener\("click", \(\) => gatePin\(\(\) => settingsUi\.open\(\)\)\)/,
    "never a way around the PIN");
});

test("leaving the editor repaints the main board out of edit gestures", async () => {
  const h = harness({ db: freshDb() });
  h.editor.renderEditor();
  await flush();
  const before = h.log.main;
  h.editor.leave();
  assert.equal(h.log.main, before + 1, "the child's grid is repainted on the way out");
});

test("Done in the top bar leaves for Maya's main board and forgets the place", async () => {
  globalThis.sessionStorage = memoryStorage();
  const db = freshDb();
  const { id } = createEntity(db, { name: "Cooper" });
  placeItem(db, "grp_mine", "entity", id);
  const h = harness({ db });
  h.editor.renderEditor();
  await h.editor.openGroup("grp_mine");
  h.editor.select({ item_kind: "entity", item_id: id, label: "Cooper" }, { additive: false });
  assert.equal(h.$("wordcard").classList.contains("open"), true);

  await h.$("ed-exit").click();
  await flush();
  assert.equal(h.log.views.at(-1), "board", "the child's main board, not a group");
  assert.equal(h.$("wordcard").classList.contains("open"), false);

  const h2 = harness({ db });
  h2.editor.renderEditor();
  await flush();
  assert.equal(h2.log.main, 1, "next open starts on the main board");
  assert.equal(h2.log.cards.length, 0);
});
