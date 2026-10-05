/** Code-traced follow-ups to 6a2c5f17. Not executed by the review agent.
 * Quarantined until 2026-10-08; remove TODOs after the replay owner is fixed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabase, importCatalog } from "./catalog.mjs";
import { createGroup, swapGroups } from "../../public/shared/groups.mjs";
import { adoptSnapshot, appliedSeqOf, drainOps, ensureBaseline, listOps, snapshotSynced } from "../../public/shared/ops.mjs";

const catalog = JSON.parse(readFileSync(new URL("../../public/catalog.json", import.meta.url), "utf8"));
const replica = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  ensureBaseline(db);
  return db;
};
const slot = (db, id) => db.prepare("SELECT index_slot FROM board_group WHERE id = ?").get(id)?.index_slot;
const remote = (seq, kind, args = {}) => ({
  op_id: `op_review_${seq}`, relay_seq: seq, kind, args, device_id: "dev_review", created_at: seq,
});
const todo = "Sync developer: stable replay anchor + snapshot coverage; expires 2026-10-08 (QUARANTINE.md)";

test("order repair must not replay an already confirmed swap over its result", { todo }, () => {
  const donor = replica(), recipient = replica(), ordered = replica();
  try {
    createGroup(donor, { id: "grp_review_a", name: "A", indexSlot: 80 });
    createGroup(donor, { id: "grp_review_b", name: "B", indexSlot: 81 });
    const setup = listOps(donor).map((o, i) => ({ ...o, relay_seq: i + 1 }));
    drainOps(donor, setup);
    swapGroups(donor, "grp_review_a", "grp_review_b");
    const swap = { ...listOps(donor).at(-1), relay_seq: setup.length + 1 };
    const older = remote(swap.relay_seq + 1, "set_setting", { key: "review_setting", value: "Older" });
    const newer = remote(swap.relay_seq + 2, "set_setting", { key: "review_setting", value: "Newer" });
    drainOps(recipient, [...setup, swap]);
    assert.equal(slot(recipient, "grp_review_a"), 81);
    drainOps(recipient, [newer]);
    drainOps(recipient, [older, newer]);
    drainOps(ordered, [...setup, swap, older, newer]);
    assert.equal(slot(recipient, "grp_review_a"), slot(ordered, "grp_review_a"),
      "delivery-order repair undid the family's earlier swap");
  } finally { donor.close(); recipient.close(); ordered.close(); }
});

test("snapshot coverage survives an empty drain", { todo }, () => {
  const db = replica();
  try {
    adoptSnapshot(db, snapshotSynced(db), 500);
    drainOps(db, []);
    assert.equal(appliedSeqOf(db), 500, "an empty drain forgot the adopted snapshot's coverage");
  } finally { db.close(); }
});

test("snapshot coverage excludes an unknown covered historical op", { todo }, () => {
  const db = replica();
  try {
    // The snapshot already covers this group's historical create and
    // deletion. Its create was never logged on this recipient.
    adoptSnapshot(db, snapshotSynced(db), 500);
    drainOps(db, [remote(400, "create_group", {
      id: "grp_review_deleted", name: "Already deleted", indexSlot: 90,
    })]);
    assert.equal(slot(db, "grp_review_deleted"), undefined,
      "an op already covered by the snapshot resurrected a deleted group");
    assert.equal(appliedSeqOf(db), 500);
  } finally { db.close(); }
});

test("failed order repair preserves the applied flags of the existing baseline", { todo }, () => {
  const db = replica();
  try {
    drainOps(db, [remote(3, "set_setting", { key: "review_setting", value: "Applied" })]);
    const before = db.prepare("SELECT applied FROM sync_op WHERE relay_seq = 3").get().applied;
    assert.equal(before, 1);
    assert.throws(() => drainOps(db, [remote(2, "unknown_review_op")]), /unknown op kind/);
    assert.equal(db.prepare("SELECT applied FROM sync_op WHERE relay_seq = 3").get().applied, before,
      "order repair cleared durable flags outside the rollback transaction");
    assert.equal(appliedSeqOf(db), 3);
  } finally { db.close(); }
});
