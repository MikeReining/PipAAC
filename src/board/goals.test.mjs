/**
 * 016 slice 5 Works Test — goal words.
 *
 * A goal list of more, help, stop. A scripted week: a Spotlight glow on
 * Monday, none after. Real taps go through learner_event_log →
 * upsertStatsDay → goalWords, so the whole path — flag, day rows,
 * aggregation — is graded, and every count is hand-computed below.
 * Partner modeling taps (coach_event) sit in the fixture to prove they
 * add nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  goalWords, saveSpotList, setListGoal, spotLists,
} from "../../public/shared/spotlight.mjs";
import { applyOp, setDeviceId } from "../../public/shared/ops.mjs";
import { upsertStatsDay } from "../../public/shared/stats.mjs";

const SCHEMA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8",
);
const DAY = 86_400_000;
const WK = 3000; // fixture week index — days WK*7 .. WK*7+6
const MON = WK * 7 + 1;
const TUE = WK * 7 + 2;

function db() {
  const d = new DatabaseSync(":memory:");
  d.exec("PRAGMA foreign_keys = OFF");
  for (const t of [
    "learner_event_log", "sentence", "core_cell", "stats_day", "sync_op",
    "spotlight_list", "spotlight_item", "coach_event", "transform_event",
  ]) {
    const ddl = SCHEMA.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`))?.[0];
    assert.ok(ddl, `schema for ${t}`);
    d.exec(ddl);
  }
  return d;
}

const at = (day, h) => day * DAY + h * 3600 * 1000;
const tap = (d, id, ts, spot = 0) => d.prepare(
  `INSERT INTO learner_event_log
     (item_kind, item_id, selected_at, source, tz_offset_min, spotlit)
   VALUES ('sense', ?, ?, 'grid', 0, ?)`,
).run(id, ts, spot);

/** The scripted week: Monday glow, quiet after. */
function fixture() {
  const d = db();
  setDeviceId("dev_child");
  // Goal list: more, help, stop. A second list stays a non-goal.
  saveSpotList(d, "spl_goal", "Fringe verbs", ["sense:more", "sense:help", "sense:stop"], 1);
  setListGoal(d, "spl_goal", true);
  saveSpotList(d, "spl_other", "Other", ["sense:more", "sense:go"], 2);

  // Monday: more ×3 own + ×2 glowed, help ×2 own + ×1 glowed, stop ×1 own,
  // plus a non-list word.
  tap(d, "more", at(MON, 9)); tap(d, "more", at(MON, 9)); tap(d, "more", at(MON, 10));
  tap(d, "more", at(MON, 10), 1); tap(d, "more", at(MON, 11), 1);
  tap(d, "help", at(MON, 12)); tap(d, "help", at(MON, 12)); tap(d, "help", at(MON, 13), 1);
  tap(d, "stop", at(MON, 14));
  tap(d, "zebra", at(MON, 15));
  // Tuesday on: no glow. more ×2 own, help ×1 own.
  tap(d, "more", at(TUE, 9)); tap(d, "more", at(TUE, 10));
  tap(d, "help", at(TUE, 11));
  // Partner modeling on a linked phone — coach events, not child taps.
  for (let i = 0; i < 5; i++)
    d.prepare("INSERT INTO coach_event (item_kind, item_id, modeled_at) VALUES ('sense', 'more', ?)")
      .run(at(TUE, 12) + i);

  upsertStatsDay(d, MON, at(MON, 23));
  upsertStatsDay(d, TUE, at(TUE, 23));
  return d;
}

test("a goal list's targets split own vs glowed, by week", () => {
  const d = fixture();
  const goals = goalWords(d, MON, WK * 7 + 6);
  assert.equal(goals.length, 1); // the non-goal list contributes nothing
  const g = goals[0];
  assert.equal(g.list_id, "spl_goal");
  assert.equal(g.name, "Fringe verbs");
  const wk = g.weeks[WK];
  assert.deepEqual({ ...wk["sense:more"] }, { own: 5, glow: 2 });
  assert.deepEqual({ ...wk["sense:help"] }, { own: 3, glow: 1 });
  assert.deepEqual({ ...wk["sense:stop"] }, { own: 1, glow: 0 });
  assert.equal(wk["sense:zebra"], undefined); // not a goal target
  // coach_event rows never inflate a goal count (5 partner models of more).
  assert.equal(wk["sense:more"].own + wk["sense:more"].glow, 7);
});

test("a second own-device day row adds to the same goal counts", () => {
  const d = fixture();
  // The user's other device computed its own row for Monday: more ×1 own.
  const other = { day: MON, computed_at: 1, words: 1,
    per_word: { "sense:more": { taps: 1, spotlit: 0 } } };
  d.prepare(
    "INSERT INTO stats_day (day, device_id, computed_at, payload) VALUES (?, 'dev_ipad', 1, ?)",
  ).run(MON, JSON.stringify(other));
  const wk = goalWords(d, MON, WK * 7 + 6)[0].weeks[WK];
  assert.deepEqual({ ...wk["sense:more"] }, { own: 6, glow: 2 });
});

test("setListGoal toggles, records an op, and replays", () => {
  const d = db();
  saveSpotList(d, "spl_x", "List", ["sense:go"], 1);
  assert.equal(spotLists(d)[0].is_goal, 0);
  setListGoal(d, "spl_x", true);
  assert.equal(spotLists(d)[0].is_goal, 1);
  const op = d.prepare(
    "SELECT kind, args FROM sync_op WHERE kind = 'spot_list_goal'").all()[0];
  assert.deepEqual(JSON.parse(op.args), { id: "spl_x", goal: 1 });
  // Replay on a fresh db lands the flag.
  const d2 = db();
  saveSpotList(d2, "spl_x", "List", ["sense:go"], 1);
  applyOp(d2, { kind: "spot_list_goal",
    args: JSON.stringify({ id: "spl_x", goal: 0 }), device_id: "dev_a" });
  assert.equal(spotLists(d2)[0].is_goal, 0);
  // A goal op for a list that never synced skips, not throws.
  applyOp(d2, { kind: "spot_list_goal",
    args: JSON.stringify({ id: "spl_nope", goal: 1 }), device_id: "dev_a" });
});
