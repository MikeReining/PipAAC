/**
 * 031 — the editor's pure rules, measured on the real op log and the
 * real owners: honest save status (WT 9), find sections (WT 4), paste
 * detection (WT 5), and group changes that undo to the byte (WT 7).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createDatabase } from "./catalog.mjs";
import { editorStatus, findSections, isList } from "../../public/board/editor-find.js";
import {
  createEntity, createGroup, deleteGroupUndoable, placeItem, renameGroup,
  setGroupGlyph, swapGroups,
} from "../../public/shared/groups.mjs";
import { applyOp, confirmOps, listOps } from "../../public/shared/ops.mjs";

const openDb = () => {
  const db = createDatabase(":memory:");
  db.exec(`INSERT INTO layout_shape (layout, cols, rows, frame) VALUES ('grid60', 10, 6, '[9,19,39,49]')`);
  return db;
};
const pending = (db) => listOps(db).filter((o) => o.relay_seq === null).length;

test("WT 9 — status says Saving until the relay accepted the op, then Saved; offline says so", () => {
  const db = openDb();
  createGroup(db, { id: "grp_a", name: "A" });
  const linked = { linked: true, online: true, flushError: null };
  assert.equal(editorStatus({ ...linked, pending: pending(db) }).text, "Saving…");
  assert.equal(editorStatus({ ...linked, pending: pending(db), online: false }).text, "Offline — will sync");
  assert.equal(editorStatus({ ...linked, pending: pending(db), flushError: "fetch failed" }).text,
    "Offline — will sync");
  // The relay's acceptance is the only thing that flips it (relay_seq set).
  confirmOps(db, listOps(db).map((o, i) => ({ op_id: o.op_id, relay_seq: i + 1 })));
  assert.equal(editorStatus({ ...linked, pending: pending(db) }).text, "✓ Saved");
  // Never claims a device got it; unlinked says where it is.
  assert.equal(editorStatus({ linked: false, pending: 5, online: true }).text, "Saved on this device");
});

test("F11 — a failed inbound replay, a lost upload, and an unflushed save are never green", () => {
  const clean = { linked: true, pending: 0, mediaPending: 0, online: true };
  // Unsupported/corrupt inbound ops: pending counts were zero yet the
  // device has NOT applied the family's state — never "✓ Saved".
  assert.equal(editorStatus({ ...clean, ingestError: "sync: bad op" }).tone, "warn");
  assert.match(editorStatus({ ...clean, ingestError: "x" }).text, /Couldn't apply/);
  // A media item nobody can still save is a failure, not "Saving…".
  assert.equal(editorStatus({ ...clean, mediaError: "relay 404" }).tone, "warn");
  // …while the queue still owes it, it stays busy, not failed.
  assert.equal(editorStatus({ ...clean, mediaError: "offline", mediaPending: 1 }).text, "Saving…");
  // Writes not yet flushed to storage are not "Saved" — linked or not.
  assert.equal(editorStatus({ ...clean, dirty: true }).text, "Saving…");
  assert.equal(editorStatus({ linked: false, pending: 0, dirty: true }).text, "Saving…");
  // Local persistence outranks sync failures and a green board alike.
  assert.equal(editorStatus({ ...clean, ingestError: "x", saveBlocked: true }).text,
    "Not saving — saved board couldn't open");
  assert.equal(editorStatus({ ...clean, saveError: "quota" }).text,
    "Couldn't save — keep this open");
});

test("WT 4 — a word Maya has lands in 'on the board' with where it lives; ours don't", () => {
  const db = openDb();
  createGroup(db, { id: "grp_food", name: "Food" });
  const { id } = createEntity(db, { name: "Cooper" });
  placeItem(db, "grp_food", "entity", id);
  const r = findSections(db, "coop", { locale: "en", groupId: "grp_food" });
  assert.equal(r.onBoard[0].label, "Cooper");
  assert.deepEqual(r.onBoard[0].where, ["Food"]);
  assert.equal(r.onBoard[0].here, true);
  assert.equal(r.exact, null, "'coop' is not Cooper — Make stays the Return target");
  const exact = findSections(db, "cooper", { locale: "en", groupId: null });
  assert.deepEqual(exact.exact, { section: "onBoard", index: 0 });
  const home = findSections(db, "cooper", { locale: "en", groupId: null, homeKeys: new Set([`entity:${id}`]) });
  assert.deepEqual(home.onBoard[0].where, ["Main board", "Food"]);
});

test("WT 5 — two or more lines are a list; one line is a word", () => {
  assert.equal(isList("kite\nbeach ball"), true);
  assert.equal(isList("kite\n\n"), false);
  assert.equal(isList("apple sauce"), false);
});

const snapshot = (db) => JSON.stringify([
  db.prepare("SELECT id, kind, name, glyph, photo_key, index_slot, hidden FROM board_group ORDER BY id").all(),
  db.prepare("SELECT group_id, item_kind, item_id FROM group_membership ORDER BY 1, 2, 3").all(),
  db.prepare("SELECT group_id, layout, item_kind, item_id, page, slot_index FROM group_cell ORDER BY 1, 2, 3, 4").all(),
]);

test("WT 7 — delete a group, reorder, rename, icon: each undo restores the snapshot", () => {
  const db = openDb();
  createGroup(db, { id: "grp_a", name: "Beach" });
  createGroup(db, { id: "grp_b", name: "Park" });
  const e1 = createEntity(db, { name: "sand" }).id;
  const e2 = createEntity(db, { name: "shell" }).id;
  placeItem(db, "grp_a", "entity", e1);
  placeItem(db, "grp_a", "entity", e2, { page: 0, slot_index: 22 });
  setGroupGlyph(db, "grp_a", "icon:outside");
  const s0 = snapshot(db);

  const undo = deleteGroupUndoable(db, "grp_a");
  assert.notEqual(snapshot(db), s0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM personal_entity").get().n, 2, "words stay");
  undo.undo();
  assert.equal(snapshot(db), s0, "delete → undo");

  swapGroups(db, "grp_a", "grp_b");
  swapGroups(db, "grp_a", "grp_b");
  assert.equal(snapshot(db), s0, "reorder → undo");

  renameGroup(db, "grp_a", "Seaside");
  renameGroup(db, "grp_a", "Beach");
  assert.equal(snapshot(db), s0, "rename → undo");

  setGroupGlyph(db, "grp_a", "icon:weather");
  setGroupGlyph(db, "grp_a", "icon:outside");
  assert.equal(snapshot(db), s0, "icon → undo");
});

test("rename and icon replay on another device (synced ops)", () => {
  const a = openDb();
  const b = openDb();
  createGroup(a, { id: "grp_a", name: "Beach" });
  renameGroup(a, "grp_a", "Seaside");
  setGroupGlyph(a, "grp_a", "icon:outside");
  for (const op of listOps(a)) applyOp(b, op);
  assert.deepEqual(
    { ...b.prepare("SELECT name, glyph FROM board_group WHERE id = 'grp_a'").get() },
    { name: "Seaside", glyph: "icon:outside" },
  );
  assert.throws(() => setGroupGlyph(a, "grp_a", "<svg>"), /bad glyph/);
});

test("WT 8 — a reserved cell refuses a word; positions are unchanged", () => {
  const db = openDb();
  createGroup(db, { id: "grp_a", name: "Beach" });
  const e = createEntity(db, { name: "sand" }).id;
  placeItem(db, "grp_a", "entity", e);
  const s0 = snapshot(db);
  const e2 = createEntity(db, { name: "shell" }).id;
  // Slot 9 is in the frame (yes/no/stop/help) — reserved on every group page.
  assert.throws(() => placeItem(db, "grp_a", "entity", e2, { page: 0, slot_index: 9 }), /reserved/);
  assert.equal(snapshot(db), s0);
});
