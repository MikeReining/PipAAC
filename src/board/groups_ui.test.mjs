/**
 * Groups index paint. A stored group shows up on the index under its
 * own name; the back cell stays in slot 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { mountGroups } from "../../public/board/groups-ui.js";

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
    classList: { add(name) { node.className += ` ${name}`; } },
    append(...kids) { node.children.push(...kids); },
    appendChild(kid) { node.children.push(kid); return kid; },
    addEventListener() {},
    set innerHTML(value) { if (value === "") node.children.length = 0; },
  };
  return node;
}

test("groups index paints a stored group by name", () => {
  const db = createDatabase(":memory:");
  db.prepare(
    `INSERT INTO board_group (id, kind, name, glyph, index_slot)
     VALUES ('grp_snacks', 'custom', 'Snacks', '🍎', 12)`,
  ).run();
  const grid = el();
  const nodes = {
    groupgrid: grid,
    "group-save": el(),
    "group-name": el(),
    "group-photo": el(),
    "del-title": el(),
    "del-yes": el(),
  };
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => el(),
  };

  const groups = mountGroups({
    db,
    locale: "en",
    all: (database, sql, p = []) => database.prepare(sql).all(...p),
    boardGeom: () => ({ name: "grid60", cols: 10, rows: 6, cells: 60 }),
    getEditing: () => false,
    getModelGlow: () => new Set(),
    getLikelyGroups: () => new Set(),
    setView() {},
    open() {},
    close() {},
    toast() {},
    wordTile: () => el(),
    layerMark() {},
    fitLabels() {},
    tap() {},
    navCell(label) {
      const n = el();
      n.textContent = label;
      return n;
    },
    editPointer() {},
    xBadge: () => el(),
    openAddForm() {},
    openWordCard() {},
    async loadPhotoURL() { return null; },
    async savePhoto() { return null; },
    syncUploadBlob() {},
  });

  groups.renderGroupIndex();
  assert.equal(grid.children[0].textContent, "← Board");
  const labels = grid.children.flatMap((cell) =>
    cell.children.filter((c) => c.className.includes("glabel")).map((c) => c.textContent));
  assert.deepEqual(labels, ["Snacks"]);
});
