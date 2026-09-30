/**
 * 013 slice 2 Works Test — Spotlight on one device. The spec's own test:
 * "start, restart the app — still on; pass midnight — off." The
 * lie-prone layer is a session that looks persistent but lives only in
 * memory: this measures the synced row (what a fresh boot reads), the
 * end time against a fake clock, and op replay onto a second database —
 * not the module's own report. The DOM leg (pick mode, chip, settings)
 * is `scripts/probes/spot_session_probe.mjs`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";
import { applyOp, listOps } from "../../public/shared/ops.mjs";
import {
  endSession, endSpotlight, listTargets, nextMidnight, resumeSession,
  saveSpotList, spotLists, spotlight, spotSession, startSession, untilText,
} from "../../public/shared/spotlight.mjs";
import { buildCatalog, parseCoordinateMapMarkdown } from "../../scripts/catalog/build_catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const catalog = buildCatalog(
  JSON.parse(readFileSync(join(repoRoot, "data/launch_lexicon.json"), "utf8")),
  parseCoordinateMapMarkdown(readFileSync(join(repoRoot, "docs/product/Core_Coordinate_Map.md"), "utf8")),
);
const fresh = () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  return db;
};
const senseOf = (db, text) =>
  db.prepare("SELECT sense_id FROM label WHERE text = ? AND locale = 'en' AND kind = 'lemma' AND status = 'approved'")
    .all(text)[0]?.sense_id;

test("saved lists: write, read back, delete — all through synced rows", () => {
  const db = fresh();
  const stop = senseOf(db, "stop");
  const juice = senseOf(db, "juice");
  saveSpotList(db, "spl_test1", "Brown Bear", [`sense:${stop}`, `sense:${juice}`]);
  const lists = spotLists(db);
  assert.equal(lists.length, 1);
  assert.equal(lists[0].name, "Brown Bear");
  assert.equal(lists[0].n, 2);
  assert.deepEqual(
    [...listTargets(db, "spl_test1")].sort(),
    [`sense:${juice}`, `sense:${stop}`].sort(),
  );
  assert.ok(listOps(db).some((o) => o.kind === "spot_list_save"));
});

test("a session is a synced row: it survives a restart and ends at midnight at the latest", () => {
  const db = fresh();
  const stop = senseOf(db, "stop");
  // Runs until ended — the hard bound is local midnight.
  startSession(db, { name: "Brown Bear", targets: [`sense:${stop}`] });
  const row = spotSession(db);
  assert.ok(row, "session row persisted");
  assert.equal(row.ends_at, nextMidnight(row.started_at));
  assert.ok(spotlight()?.targets.has(`sense:${stop}`));
});

test("there is no timer: a start asking for minutes still ends at midnight", () => {
  const db = fresh();
  const stop = senseOf(db, "stop");
  startSession(db, { name: "Quick", targets: [`sense:${stop}`], minutes: 15 });
  const row = spotSession(db);
  assert.equal(row.ends_at, nextMidnight(row.started_at));
  assert.equal(untilText(row), "until tonight");
});

test("a row synced from an older device keeps its timer end", () => {
  const db = fresh();
  const stop = senseOf(db, "stop");
  const started_at = new Date(2026, 8, 29, 15, 0).getTime();
  const ends_at = started_at + 15 * 60000;
  startSession(db, { name: "Old", targets: [`sense:${stop}`], started_at, ends_at });
  const row = spotSession(db);
  assert.equal(row.ends_at, ends_at);
  assert.match(untilText(row), /^until 3:15/);
});

test("restart: the row relights the layer; an expired row ends it", () => {
  const db = fresh();
  const stop = senseOf(db, "stop");
  const juice = senseOf(db, "juice");
  startSession(db, { name: "S", targets: [`sense:${stop}`, `sense:${juice}`] });
  endSpotlight(); // a fresh boot: only the synced row carries the session
  const back = resumeSession(db);
  assert.ok(back, "live session resumed");
  assert.ok(spotlight().targets.has(`sense:${juice}`));
  // Expire it — as if midnight passed while the app was closed.
  db.prepare("UPDATE spotlight_session SET ends_at = ? WHERE id = 1").run(Date.now() - 1);
  endSpotlight();
  assert.equal(resumeSession(db), null, "expired session does not resume");
  assert.equal(spotlight(), null);
  assert.equal(spotSession(db), null, "the expired row is cleared");
});

test("start/end replay onto a second device through the op log", () => {
  const a = fresh();
  const b = fresh();
  const stop = senseOf(a, "stop");
  saveSpotList(a, "spl_x", "Snack", [`sense:${stop}`]);
  startSession(a, { name: "Snack", targets: [`sense:${stop}`] });
  for (const op of listOps(a)) applyOp(b, op);
  assert.equal(spotLists(b).length, 1, "the list synced");
  assert.ok(spotSession(b), "the running session synced");
  // B ends it — the end op comes back to A and dims the board.
  endSession(b);
  for (const op of listOps(b).filter((o) => o.kind === "spot_end")) applyOp(a, op);
  assert.equal(spotSession(a), null);
});

