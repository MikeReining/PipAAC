/** Replay-anchor regression proofs (SYNC_REPLAY_ANCHOR): the delivery-order
 * repair must rebuild over the stable anchor, never replay a prefix over a
 * baseline that already contains it; adopted-snapshot coverage is a durable
 * floor; flag repairs roll back atomically. Authored by the 2026-10-05
 * review; set_setting fixtures corrected to a synced key (person_name). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
test("order repair must not replay an already confirmed swap over its result", () => {
  const donor = replica(), recipient = replica(), ordered = replica();
  try {
    createGroup(donor, { id: "grp_review_a", name: "A", indexSlot: 80 });
    createGroup(donor, { id: "grp_review_b", name: "B", indexSlot: 81 });
    const setup = listOps(donor).map((o, i) => ({ ...o, relay_seq: i + 1 }));
    drainOps(donor, setup);
    swapGroups(donor, "grp_review_a", "grp_review_b");
    const swap = { ...listOps(donor).at(-1), relay_seq: setup.length + 1 };
    const older = remote(swap.relay_seq + 1, "set_setting", { key: "person_name", value: "Older" });
    const newer = remote(swap.relay_seq + 2, "set_setting", { key: "person_name", value: "Newer" });
    drainOps(recipient, [...setup, swap]);
    assert.equal(slot(recipient, "grp_review_a"), 81);
    drainOps(recipient, [newer]);
    drainOps(recipient, [older, newer]);
    drainOps(ordered, [...setup, swap, older, newer]);
    assert.equal(slot(recipient, "grp_review_a"), slot(ordered, "grp_review_a"),
      "delivery-order repair undid the family's earlier swap");
  } finally { donor.close(); recipient.close(); ordered.close(); }
});

test("snapshot coverage survives an empty drain", () => {
  const db = replica();
  try {
    adoptSnapshot(db, snapshotSynced(db), 500);
    drainOps(db, []);
    assert.equal(appliedSeqOf(db), 500, "an empty drain forgot the adopted snapshot's coverage");
  } finally { db.close(); }
});

test("snapshot coverage excludes an unknown covered historical op", () => {
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

test("failed order repair preserves the applied flags of the existing baseline", () => {
  const db = replica();
  try {
    drainOps(db, [remote(3, "set_setting", { key: "person_name", value: "Applied" })]);
    const before = db.prepare("SELECT applied FROM sync_op WHERE relay_seq = 3").get().applied;
    assert.equal(before, 1);
    assert.throws(() => drainOps(db, [remote(2, "unknown_review_op")]), /unknown op kind/);
    assert.equal(db.prepare("SELECT applied FROM sync_op WHERE relay_seq = 3").get().applied, before,
      "order repair cleared durable flags outside the rollback transaction");
    assert.equal(appliedSeqOf(db), 3);
  } finally { db.close(); }
});

/** The repair must hold across a real close/reopen: the wound, the
 * rebuild over the anchor, and the restored flags all live in the
 * persisted bytes, not the open handle. */
test("order repair survives a persisted database close and reopen", () => {
  const file = `${mkdtempSync(join(tmpdir(), "pip-anchor-"))}/db.sqlite`;
  let db = createDatabase(file);
  importCatalog(db, catalog);
  ensureBaseline(db);
  createGroup(db, { id: "grp_reopen_a", name: "A", indexSlot: 80 });
  createGroup(db, { id: "grp_reopen_b", name: "B", indexSlot: 81 });
  const setup = listOps(db).map((o, i) => ({ ...o, relay_seq: i + 1 }));
  drainOps(db, setup);
  swapGroups(db, "grp_reopen_a", "grp_reopen_b");
  const swap = { ...listOps(db).at(-1), relay_seq: setup.length + 1 };
  drainOps(db, [swap]);
  const older = remote(swap.relay_seq + 1, "set_setting", { key: "person_name", value: "Older" });
  const newer = remote(swap.relay_seq + 2, "set_setting", { key: "person_name", value: "Newer" });
  // The push lands first, then the process dies before catch-up.
  drainOps(db, [newer], { fetched: false });
  db.close();

  db = createDatabase(file);
  drainOps(db, [older, newer]);
  assert.equal(slot(db, "grp_reopen_a"), 81, "the reopened rebuild must not re-swap");
  assert.equal(
    db.prepare("SELECT person_name FROM learner_profile").get().person_name, "Newer");
  assert.ok(db.prepare("SELECT 1 FROM sync_baseline WHERE id = 2").get(),
    "the replay anchor must persist in the bytes");
  db.close();
});

/** An upgraded database may carry a wound but no anchor row (the anchor
 * predates it). There is no honest rebuild base — the only baseline is
 * the polluted one and the canonical empty base would drop catalog-owned
 * synced rows no op re-creates — so the drain must refuse visibly, flags
 * untouched, until an adoption installs a real anchor. */
test("a wounded database with no stored anchor refuses until adoption installs one", () => {
  const db = replica();
  const donor = replica();
  try {
    const a = remote(1, "create_group", { id: "grp_anchorless", name: "Kept", indexSlot: 85 });
    const b = remote(2, "set_setting", { key: "person_name", value: "Two" });
    const c = remote(3, "set_setting", { key: "person_name", value: "Three" });
    drainOps(db, [a, b, c]);
    // Forge the persisted wound the 6a2c5f17-era repair could leave:
    // a mid-log op unapplied beneath applied ones, and no anchor row.
    db.prepare("UPDATE sync_op SET applied = 0 WHERE relay_seq = 2").run();
    db.prepare("DELETE FROM sync_baseline WHERE id = 2").run();
    const late = remote(4, "set_setting", { key: "person_name", value: "Four" });
    assert.throws(() => drainOps(db, [late]), /no replay anchor/);
    assert.equal(db.prepare("SELECT applied FROM sync_op WHERE relay_seq = 3").get().applied, 1,
      "the refusal must not disturb the applied flags");
    assert.equal(appliedSeqOf(db), 3);
    // Adoption installs the anchor — the next drain heals over it.
    drainOps(donor, [a, b]);
    adoptSnapshot(db, snapshotSynced(donor), 2);
    drainOps(db, [late]);
    assert.equal(
      db.prepare("SELECT person_name FROM learner_profile").get().person_name, "Four");
    assert.equal(appliedSeqOf(db), 4);
  } finally { db.close(); donor.close(); }
});
