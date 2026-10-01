/* Repro: does a tap on a real main-board word in the editor produce
 * onReplace (the "Replace with another word" button)? Uses the real
 * catalog import + real coreCells, at every seeded layout. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "../src/board/catalog.mjs";
import { installDom } from "../src/board/fake_dom.mjs";
import { mountEditor } from "../public/board/editor-ui.js";
import { coreCells } from "../public/shared/coremove.mjs";

const root = join(import.meta.dirname, "..");
const catalog = JSON.parse(readFileSync(join(root, "public/catalog.json"), "utf8"));
const locale = "en";

for (const layout of ["grid15", "grid30", "grid60", "grid90"]) {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const cells = coreCells(db, layout, locale);
  const $ = installDom();
  const cardOpts = [];
  const editor = mountEditor({
    db, locale,
    all: (d, sql, p = []) => d.prepare(sql).all(...p),
    catalog, me: { id: "u1", name: "Maya" }, userStore: null,
    flushDb: async () => {},
    paintGroupPage: async () => 1,
    renderMainBoard: () => {},
    homeCells: () => coreCells(db, layout, locale),          // the real board.js wiring
    boardGeom: () => ({ cols: 10, name: layout, anchors: new Map() }),
    addFlow: { makeWord: () => "x", placeWord() {}, openBulkForm() {} },
    openWordCard: (item, opts = {}) => { cardOpts.push({ item, opts }); $("wordcard").classList.add("open"); },
    closeCard: () => $("wordcard").classList.remove("open"),
    replaceOnBoard: () => {},
    setView() {}, openGroupView() {}, toast() {}, undoLast() {},
    syncState: () => ({}), renderLibrary() {}, invalidateIndex() {}, renderStrip() {},
    savePhoto: async () => null, syncUploadBlob() {}, tile: null,
    loadPhotoURL: async () => null, artInto: () => false, flashCell() {},
  });
  editor.renderEditor();
  await new Promise((r) => setTimeout(r, 10));

  const wordCells = cells.filter((c) => c.kind === "sense");
  const entCells = cells.filter((c) => c.kind === "entity");
  let withReplace = 0, without = 0;
  const misses = [];
  for (const c of [...wordCells.slice(0, 40), ...entCells]) {
    cardOpts.length = 0;
    editor.select({
      item_kind: c.kind,
      item_id: c.kind === "entity" ? c.entity_id : c.sense_id,
      label: c.label,
    });
    const o = cardOpts.at(-1)?.opts;
    if (o?.onReplace) withReplace++;
    else { without++; misses.push(`${c.kind}:${c.kind === "entity" ? c.entity_id : c.sense_id}`); }
  }
  console.log(`${layout}: cells=${cells.length} replace=${withReplace} noReplace=${without}`);
  if (misses.length) console.log(`   misses: ${misses.slice(0, 10).join(", ")}`);
}
