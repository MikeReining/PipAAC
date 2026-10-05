/** Replay-anchor regression proofs (SYNC_REPLAY_ANCHOR): the delivery-order
 * repair must rebuild over the stable anchor, never replay a prefix over a
 * baseline that already contains it; adopted-snapshot coverage is a durable
 * floor; flag repairs roll back atomically. Authored by the 2026-10-05
 * review; set_setting fixtures corrected to a synced key (person_name). */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, importCatalog } from "./catalog.mjs";
import { createEntity, createGroup, swapGroups } from "../../public/shared/groups.mjs";
import { migrateSchema, ADDITIVE_COLUMNS } from "../../public/shared/migrate.mjs";
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

/** The shipped WASM facade's prepare().run() returned undefined for
 * years — drainOps read ins.changes and threw on every nonempty batch,
 * rolling back every incoming sync page in the browser while Node tests
 * (node:sqlite returns {changes}) stayed green. The ordering logic must
 * not depend on run()'s return at all: this facade hides it on purpose
 * and every delivery shape must still converge. */
const voidRunFacade = (inner) => ({
  exec: (sql) => inner.exec(sql),
  prepare: (sql) => ({
    run: (...p) => { inner.prepare(sql).run(...p); },
    all: (...p) => inner.prepare(sql).all(...p),
    get: (...p) => inner.prepare(sql).get(...p),
  }),
  all: (sql, p = []) => inner.prepare(sql).all(...p),
});

test("drainOps works against a facade whose run() returns nothing", () => {
  const inner = createDatabase(":memory:");
  const db = voidRunFacade(inner);
  try {
    importCatalog(db, catalog);
    ensureBaseline(db);
    // A fetched foreign batch: logged, applied, flagged.
    drainOps(db, [
      remote(1, "create_group", { id: "grp_facade", name: "Facade", indexSlot: 86 }),
      remote(2, "set_setting", { key: "person_name", value: "Fetched" }),
    ]);
    assert.equal(slot(inner, "grp_facade"), 86);
    assert.equal(db.prepare("SELECT applied AS a FROM sync_op WHERE relay_seq = 1").get().a, 1);
    // A duplicate delivery of the same op: no re-apply, no crash.
    drainOps(db, [remote(2, "set_setting", { key: "person_name", value: "Dup" })]);
    assert.equal(db.prepare("SELECT person_name FROM learner_profile").get().person_name,
      "Fetched", "a duplicate delivery replayed the op");
    // A live push overlays onto live state without moving coverage.
    drainOps(db, [remote(3, "set_setting", { key: "person_name", value: "Pushed" })],
      { fetched: false });
    assert.equal(db.prepare("SELECT person_name FROM learner_profile").get().person_name, "Pushed");
    // Our own echo stamps relay_seq; the fetched fold flags it once.
    createEntity(db, { id: "ent_facade_own", name: "Mine" });
    const own = listOps(inner).at(-1);
    drainOps(db, [{ ...own, relay_seq: 4 }, remote(3, "set_setting", { key: "person_name", value: "Pushed" })]);
    assert.equal(db.prepare("SELECT applied AS a FROM sync_op WHERE op_id = ?").get(own.op_id).a, 1,
      "the own-echo was never folded");
    assert.equal(appliedSeqOf(db), 4);
  } finally { inner.close(); }
});

/** Build the bytes an old release actually saved: the pre-anchor schema
 * (sync_baseline CHECK (id = 1)), confirmed+applied ops, a nonzero
 * derived baseline, a family edit, a pending op — and a persisted
 * wound: a mid-log op unapplied beneath applied ones. */
const savedWoundedDb = (file) => {
  const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  const old = schema.replace("CHECK (id IN (1, 2))", "CHECK (id = 1)");
  assert.notEqual(old, schema, "schema no longer carries the anchor CHECK to revert");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(old);
  importCatalog(db, catalog); // ensureBaseline: old shape — baseline id=1 only
  db.prepare("DELETE FROM sync_baseline WHERE id = 2").run(); // anchors did not exist
  const ops = [
    remote(1, "set_setting", { key: "person_name", value: "Family" }),
    remote(2, "create_group", { id: "grp_saved", name: "Saved", indexSlot: 87 }),
    remote(3, "set_setting", { key: "person_name", value: "Folded" }),
  ];
  drainOps(db, ops);
  // The wound the 6a2c5f17-era repair could leave persisted.
  db.prepare("UPDATE sync_op SET applied = 0 WHERE relay_seq = 2").run();
  createEntity(db, { id: "ent_saved_pending", name: "Pending edit" });
  db.close();
};

test("a saved pre-anchor database upgrades without a fabricated anchor", () => {
  const file = `${mkdtempSync(join(tmpdir(), "pip-upgrade-"))}/db.sqlite`;
  savedWoundedDb(file);
  const donor = replica();
  try {
    // Reopen exactly as bootDb does: migrate, import (idempotent
    // reconcile), ensureBaseline — then a fetched drain hits the wound.
    const db = new DatabaseSync(file);
    const d = voidRunFacade(db);
    migrateSchema(d, catalog.schemaSql, ADDITIVE_COLUMNS);
    d.exec(catalog.schemaSql);
    importCatalog(d, catalog); // runs ensureBaseline internally
    const anchor = db.prepare("SELECT tables FROM sync_baseline WHERE id = 2").get();
    assert.equal(anchor, undefined,
      "ensureBaseline fabricated a trusted anchor for a non-origin baseline");
    assert.throws(() => drainOps(d, [remote(4, "set_setting", { key: "person_name", value: "Four" })]),
      /no replay anchor/);
    // Refusal preserves everything: family data, flags, pending edit.
    assert.equal(db.prepare("SELECT person_name FROM learner_profile").get().person_name, "Folded");
    assert.equal(db.prepare("SELECT applied AS a FROM sync_op WHERE relay_seq = 3").get().a, 1);
    assert.ok(db.prepare("SELECT 1 FROM personal_entity WHERE id = 'ent_saved_pending'").get());
    // A bridging snapshot installs a real anchor; the wound heals.
    drainOps(donor, [remote(1, "set_setting", { key: "person_name", value: "Family" }),
      remote(2, "create_group", { id: "grp_saved", name: "Saved", indexSlot: 87 }),
      remote(3, "set_setting", { key: "person_name", value: "Folded" })]);
    adoptSnapshot(d, snapshotSynced(donor), 3);
    drainOps(d, [remote(4, "set_setting", { key: "person_name", value: "Four" })]);
    assert.equal(db.prepare("SELECT person_name FROM learner_profile").get().person_name, "Four");
    assert.equal(slot(db, "grp_saved"), 87);
    assert.equal(appliedSeqOf(d), 4);
    db.close();
  } finally { donor.close(); }
});

test("a '{}' placeholder anchor written by the e5cf9708 release is not trusted", () => {
  const file = `${mkdtempSync(join(tmpdir(), "pip-placeholder-"))}/db.sqlite`;
  savedWoundedDb(file);
  const db = new DatabaseSync(file);
  const d = voidRunFacade(db);
  try {
    migrateSchema(d, catalog.schemaSql, ADDITIVE_COLUMNS);
    d.exec(catalog.schemaSql);
    // The e5cf9708 release wrote this fabricated anchor on upgrade —
    // the CHECK only relaxes after migration, so the write lands here.
    db.prepare(
      "INSERT INTO sync_baseline (id, tables, applied_seq) VALUES (2, '{}', 0)").run();
    importCatalog(d, catalog);
    const anchor = db.prepare("SELECT tables FROM sync_baseline WHERE id = 2").get();
    assert.ok(anchor === undefined || anchor.tables !== "{}",
      "the fabricated placeholder anchor survived the boot path");
    assert.throws(() => drainOps(d, [remote(4, "set_setting", { key: "person_name", value: "Four" })]),
      /no replay anchor/, "a wound rebuilt over the fabricated empty base");
    assert.equal(db.prepare("SELECT person_name FROM learner_profile").get().person_name, "Folded",
      "rebuild-over-{} wiped the family's profile settings");
  } finally { db.close(); }
});

/** prod finding (2026-10-06): sync_op carried CHECK (op_id GLOB 'op_*')
 * and the foreign-op insert used INSERT OR IGNORE, which swallows ANY
 * constraint failure — a relayed op whose id didn't match applied via
 * the push overlay while never landing in the log. The fetched fold then
 * saw an empty tail, claimed no coverage, and the family forked with no
 * error. Relay op_ids are foreign data — the log records them verbatim —
 * and the dedupe targets op_id only, so every other violation is loud. */
test("a foreign op with a non-'op_*' id is logged, applied, and folded", () => {
  const db = replica();
  try {
    const pushed = { ...remote(1, "set_setting", { key: "person_name", value: "Pushed" }),
      op_id: "probe_1" };
    // The push channel: apply + log together — an applied op that never
    // reaches the log is exactly the prod divergence.
    drainOps(db, [pushed], { fetched: false });
    assert.equal(db.prepare("SELECT person_name FROM learner_profile").get().person_name, "Pushed");
    assert.ok(db.prepare("SELECT 1 FROM sync_op WHERE op_id = 'probe_1'").get(),
      "the push applied an op it never logged");
    // The fetched page carrying it folds it once — coverage advances.
    drainOps(db, [pushed]);
    assert.equal(db.prepare("SELECT applied AS a FROM sync_op WHERE op_id = 'probe_1'").get().a, 1,
      "the fetched drain never folded the logged op");
    assert.equal(appliedSeqOf(db), 1);
  } finally { db.close(); }
});

test("a foreign op violating a real constraint fails loudly, never silently", () => {
  const db = replica();
  try {
    const name = db.prepare("SELECT person_name FROM learner_profile").get()?.person_name;
    // "" violates CHECK (length(op_id) > 0): the old INSERT OR IGNORE
    // dropped the row, then the overlay applied its effect anyway.
    const bad = { ...remote(1, "set_setting", { key: "person_name", value: "Bad" }),
      op_id: "" };
    assert.throws(() => drainOps(db, [bad], { fetched: false }),
      "a malformed op slipped past the log");
    assert.equal(db.prepare("SELECT person_name FROM learner_profile").get()?.person_name, name,
      "the malformed op's effect survived the rolled-back drain");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sync_op WHERE op_id = ''").get().n, 0);
    assert.equal(appliedSeqOf(db), 0, "coverage claimed a failed drain");
  } finally { db.close(); }
});
