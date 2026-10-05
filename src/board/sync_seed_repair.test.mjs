/**
 * T3 regression — the 095302a3 starter artifact broke board sync.
 *
 * The artifact shipped applied group state (38 boards, memberships,
 * cells, install markers) but deleted the seed_install op and kept a
 * pre-seed baseline. The first drainOps restored the empty baseline,
 * wiped every board, and silently skipped confirmed writes into the
 * missing groups — the relay consumed the ops, the words never landed,
 * and no later boot could bring them back.
 *
 * The fix restores the invariant the rebase design always assumed:
 * every device performs its own install and records it (independent op
 * ids, first-confirmed-wins), and replay treats seed installs as the
 * preconditions they are. These tests boot replicas straight from the
 * shipped artifact — the baseline is never retaken — so they are red
 * on the old file and old replay order.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { importCatalog } from "../../public/shared/import.mjs";
import {
  createGroup, deleteGroup, groupPage, placeItem, removeItem, setGroupHidden,
} from "../../public/shared/groups.mjs";
import * as opsModule from "../../public/shared/ops.mjs";
const { drainOps, listOps } = opsModule;
// Absent on the broken code this file guards against: red there too.
const repairDrainedWithoutSeeds = opsModule.repairDrainedWithoutSeeds ?? (() => false);

const repoRoot = join(import.meta.dirname, "../..");
const ARTIFACT = join(repoRoot, "public/fresh_db.sqlite");
const catalog = JSON.parse(readFileSync(join(repoRoot, "public/catalog.json"), "utf8"));

const NUMBERS = catalog.groupLabels.find((l) => l.text === "Numbers")?.group_id;
const AND = catalog.labels.find(
  (l) => l.text === "and" && l.kind === "lemma" && l.status === "approved" && l.locale === "en",
)?.sense_id;
assert.ok(NUMBERS && AND, "catalog must ship a Numbers board and an approved 'and' lemma");

const dir = mkdtempSync(join(tmpdir(), "pip-seed-repair-"));

/** The db.js facade over a real file, so "reload" is close + open. */
const openDb = (file) => {
  const raw = new DatabaseSync(file);
  return {
    exec: (s) => raw.exec(s),
    prepare: (s) => raw.prepare(s),
    all: (s, p = []) => raw.prepare(s).all(...p),
    close: () => raw.close(),
  };
};

/** A device booted from the shipped artifact — exactly what db.js serves. */
let deviceN = 0;
const bootDevice = (name = `dev${deviceN++}`) => {
  const file = join(dir, `${name}.sqlite`);
  copyFileSync(ARTIFACT, file);
  const db = openDb(file);
  db.file = file;
  importCatalog(db, catalog);
  return db;
};

const member = (db, groupId, kind, id) =>
  !!db.prepare(
    "SELECT 1 AS x FROM group_membership WHERE group_id = ? AND item_kind = ? AND item_id = ?",
  ).all(groupId, kind, id)[0];
const cell = (db, groupId, kind, id) =>
  db.prepare(
    "SELECT page, slot_index FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
  ).all(groupId, kind, id)[0] ?? null;
const boardCount = (db) => db.prepare("SELECT COUNT(*) AS n FROM board_group").all()[0].n;
const pageLabels = (db, groupId, page = 0) =>
  groupPage(db, groupId, page, "en").map((r) => r.label);
const relay = (db, start = 1) =>
  listOps(db).map((o, i) => ({ ...o, relay_seq: start + i }));

test("the shipped starter carries no applied boards — the install is the device's own", () => {
  const file = join(dir, "direct.sqlite");
  copyFileSync(ARTIFACT, file);
  const db = openDb(file);
  assert.equal(boardCount(db), 0, "artifact must not ship installed boards");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sync_op").all()[0].n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM group_seed_install").all()[0].n, 0);
  db.close();
});

test("each device records its own seed install at boot — independent op ids", () => {
  const a = bootDevice("own-a");
  const b = bootDevice("own-b");
  assert.equal(boardCount(a), 38);
  const seedA = listOps(a).find((o) => o.kind === "seed_install");
  const seedB = listOps(b).find((o) => o.kind === "seed_install");
  assert.ok(seedA && seedB, "each replica must log its own install");
  assert.notEqual(seedA.op_id, seedB.op_id);
});

test("founder repro: 'and' added on iPad lands on Desktop's Numbers board", () => {
  const ipad = bootDevice("ipad");
  const desktop = bootDevice("desktop");
  placeItem(ipad, NUMBERS, "sense", AND);
  drainOps(desktop, relay(ipad));
  assert.ok(member(desktop, NUMBERS, "sense", AND), "membership must exist after sync");
  assert.ok(cell(desktop, NUMBERS, "sense", AND), "the word needs a cell to render");
  assert.ok(pageLabels(desktop, NUMBERS).includes("and"),
    "the rendered board must show the added word");
  // Both directions: a desktop edit reaches the iPad too.
  const drink = catalog.groupLabels.find((l) => l.text === "Food & Drink" || l.text === "Drinks")?.group_id
    ?? catalog.groups.find((g) => g.id !== NUMBERS).id;
  const juice = catalog.labels.find(
    (l) => l.text === "juice" && l.kind === "lemma" && l.status === "approved" && l.locale === "en",
  )?.sense_id;
  placeItem(desktop, drink, "sense", juice);
  drainOps(ipad, relay(desktop));
  assert.ok(member(ipad, drink, "sense", juice), "the reverse direction must sync too");
});

test("a foreign stream with no seed ancestry still rebuilds the boards first", () => {
  // A broken-era device: applied seed state, no install op anywhere —
  // its place_item reached the relay with no seed ahead of it.
  const broken = bootDevice("broken-a");
  broken.exec("DELETE FROM sync_op");
  placeItem(broken, NUMBERS, "sense", AND);
  const stream = listOps(broken).map((o, i) => ({ ...o, relay_seq: 1 + i }));
  assert.deepEqual(stream.map((o) => o.kind), ["place_item"]);

  const desktop = bootDevice("desktop2");
  drainOps(desktop, stream);
  assert.ok(member(desktop, NUMBERS, "sense", AND),
    "the device's own pending install must rebuild boards before the foreign write");
  assert.ok(pageLabels(desktop, NUMBERS).includes("and"));
  // Offline catch-up in two batches is the same drain twice.
  const second = relay(broken, 2);
  drainOps(desktop, stream);
  drainOps(desktop, second.length ? second : stream);
  assert.ok(member(desktop, NUMBERS, "sense", AND), "repeated replay stays healed");
});

test("an install damaged by the broken artifact repairs at boot — skipped writes return", () => {
  // Reconstruct the damaged state honestly: seeded boards + markers
  // wiped by the broken drain, the foreign write already consumed
  // (relay_seq set), baseline still empty of seed state.
  const db = bootDevice("damaged");
  const foreign = {
    groupId: NUMBERS, kind: "sense", id: AND, added_at: 1,
    cells: [{ layout: "grid60", page: 0, slot_index: 5 }],
  };
  db.exec(`DELETE FROM group_cell; DELETE FROM group_membership;
           DELETE FROM board_group; DELETE FROM group_seed_install; DELETE FROM sync_op`);
  db.prepare(
    `INSERT INTO sync_op (op_id, device_id, kind, args, created_at, relay_seq)
     VALUES ('op_foreign_place', 'dev_ipad', 'place_item', ?, 1, 1)`,
  ).run(JSON.stringify(foreign));
  // The damage predates the watermark: the consumed write sits in the
  // log under a baseline that carries no stamp and no state.
  db.prepare("UPDATE sync_baseline SET applied_seq = NULL WHERE id = 1").run();
  assert.equal(boardCount(db), 0, "the damaged device starts with no boards");

  // Boot-time repair: importCatalog re-installs the seed, records the
  // missing op, then one ordinary drain rebuilds and replays history.
  importCatalog(db, catalog);
  assert.ok(member(db, NUMBERS, "sense", AND), "the consumed write must come back");
  assert.ok(pageLabels(db, NUMBERS).includes("and"));
  assert.equal(repairDrainedWithoutSeeds(db), false,
    "the healed baseline ends the signature — repair is one-shot");
});

test("legitimately deleted boards stay deleted through the repair", () => {
  const a = bootDevice("del-a");
  const b = bootDevice("del-b");
  // A custom group the family made and deleted: create + delete sync,
  // the board must not come back on the replica.
  const { id } = createGroup(a, { name: "Scratch", id: "grp_scratch" });
  placeItem(a, id, "sense", AND);
  deleteGroup(a, id);
  // A built-in board hidden, not deleted: the flag syncs, the seed
  // stays installed but hidden.
  const feelings = catalog.groupLabels.find((l) => l.text === "Feelings")?.group_id
    ?? catalog.groups.find((g) => g.id !== NUMBERS).id;
  setGroupHidden(a, feelings, true);
  drainOps(b, relay(a));
  assert.ok(!b.prepare("SELECT 1 AS x FROM board_group WHERE id = ?").all(id)[0],
    "a deleted custom board must stay deleted");
  assert.equal(
    b.prepare("SELECT hidden FROM board_group WHERE id = ?").all(feelings)[0]?.hidden, 1,
    "a hidden built-in stays hidden after the rebuild",
  );
  // A caregiver removal from a seeded board replays over the rebuild too.
  const seeded = dbSenseIn(b, NUMBERS);
  removeItem(a, NUMBERS, "sense", seeded);
  drainOps(b, relay(a));
  assert.ok(!member(b, NUMBERS, "sense", seeded),
    "a caregiver removal must survive the rebuild");
});

function dbSenseIn(db, groupId) {
  return db.prepare(
    "SELECT item_id FROM group_membership WHERE group_id = ? AND item_kind = 'sense' ORDER BY rowid LIMIT 1",
  ).all(groupId)[0]?.item_id;
}

test("repair state persists across a database reopen", () => {
  const a = bootDevice("persist-a");
  const b = bootDevice("persist-b");
  placeItem(a, NUMBERS, "sense", AND);
  drainOps(b, relay(a));
  const file = b.file;
  b.close();
  const reopened = openDb(file);
  assert.ok(member(reopened, NUMBERS, "sense", AND));
  importCatalog(reopened, catalog);
  assert.ok(member(reopened, NUMBERS, "sense", AND),
    "a healed baseline must not re-trigger the repair");
  assert.ok(pageLabels(reopened, NUMBERS).includes("and"));
  reopened.close();
});
