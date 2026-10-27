/**
 * Nest link Works Test (SLPNest docs/product/Sibling_Contract.md):
 * a stored student code + a goal-word tap emits one aac event that lands
 * in the Nest; a supporter's model emits `modeled`; non-goal words and
 * missing targets emit nothing. Run against the Nest's real handler and
 * validator — a mock of the contract would grade its own homework.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { saveSpotList, setListGoal } from "../../public/shared/spotlight.mjs";
import { setDeviceId } from "../../public/shared/ops.mjs";
import {
  captureNest, nestCode, nestTargets, nestTargetKey,
  emitNest, isGoalWord, goalWordEvent, maybeEmitGoalWord, nestOriginFor,
} from "../../public/shared/nest.mjs";

// Cross-repo on purpose: the contract is proven, not restated.
import { handleRequest } from "../../../SLPNest/src/worker/handleRequest.js";
import { fakeDbEnv } from "../../../SLPNest/src/worker/fake_db.mjs";

const SCHEMA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8",
);

function db() {
  const d = new DatabaseSync(":memory:");
  d.exec("PRAGMA foreign_keys = OFF");
  for (const t of ["spotlight_list", "spotlight_item", "sync_op"]) {
    const ddl = SCHEMA.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([^;]+\\);`))?.[0];
    assert.ok(ddl, `schema for ${t}`);
    d.exec(ddl);
  }
  return d;
}

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

const nestFetch = (env) => (url, init = {}) => handleRequest(new Request(url, init), env);

test("goal-word taps land as aac events; non-goal words do not", async () => {
  const d = db();
  setDeviceId("dev_x");
  saveSpotList(d, "spl_g", "Core words", ["sense:more", "sense:help"], 1);
  setListGoal(d, "spl_g", true);
  saveSpotList(d, "spl_n", "Not a goal", ["sense:go"], 2);

  assert.ok(isGoalWord(d, "sense", "more"));
  assert.ok(!isGoalWord(d, "sense", "go"));
  assert.ok(!isGoalWord(d, "sense", "nope"));

  const env = fakeDbEnv();
  const code = "HZJRUG";
  env.students.set(code, {
    code, seat: "s",
    targets: JSON.stringify([{ kind: "aac", list: "core" }]),
    created: "",
  });
  const storage = memStorage();
  const fetchImpl = nestFetch(env);

  assert.equal(captureNest("?nest=HZJRUG", storage), code);
  await nestTargets(code, { storage, fetchImpl });
  assert.equal(nestTargetKey("aac", storage), "aac:core");

  // Child tap on a goal word -> independent, n:1, lands.
  maybeEmitGoalWord(d, "sense", "more", "independent", { storage, fetchImpl });
  await new Promise((r) => setImmediate(r));
  assert.equal(env.events.length, 1);
  assert.equal(env.events[0].outcome, "independent");
  assert.equal(env.events[0].n, 1);
  assert.equal(env.events[0].target, "aac:core");
  assert.equal(env.events[0].place, "home");
  assert.equal(env.events[0].activity, "board");

  // Supporter's live model -> modeled.
  maybeEmitGoalWord(d, "sense", "help", "modeled", { storage, fetchImpl });
  await new Promise((r) => setImmediate(r));
  assert.equal(env.events[1].outcome, "modeled");

  // Non-goal word: nothing fires.
  maybeEmitGoalWord(d, "sense", "go", "independent", { storage, fetchImpl });
  await new Promise((r) => setImmediate(r));
  assert.equal(env.events.length, 2);
});

test("no aac target or no code -> nothing emitted", async () => {
  const d = db();
  setDeviceId("dev_y");
  saveSpotList(d, "spl_g", "Core", ["sense:more"], 1);
  setListGoal(d, "spl_g", true);
  const env = fakeDbEnv();
  env.students.set("HZJRUG", { code: "HZJRUG", seat: "s", targets: "[]", created: "" });
  const storage = memStorage();
  const fetchImpl = nestFetch(env);

  // No code stored -> no emit.
  assert.equal(maybeEmitGoalWord(d, "sense", "more", "independent", { storage, fetchImpl }), false);
  assert.equal(env.events.length, 0);

  // Code stored but the child has no aac target -> contract can't emit.
  captureNest("?nest=HZJRUG", storage);
  await nestTargets("HZJRUG", { storage, fetchImpl });
  assert.equal(maybeEmitGoalWord(d, "sense", "more", "independent", { storage, fetchImpl }), false);
  assert.equal(env.events.length, 0);
});

test("the event shape validates and offline reports false", async () => {
  const e = goalWordEvent("HZJRUG", "independent", {
    at: "2026-10-07T19:00:00Z", targetKey: "aac:core",
  });
  const env = fakeDbEnv();
  env.students.set("HZJRUG", { code: "HZJRUG", seat: "s", targets: "[]", created: "" });
  assert.equal(await emitNest(e, { fetchImpl: nestFetch(env) }), true);
  assert.equal(env.events.length, 1);
  assert.equal(await emitNest(e, { fetchImpl: () => { throw new Error("offline"); } }), false);
});

test("production sends to app.slpnest.com, never localhost; only this Mac uses the dev Nest", () => {
  assert.equal(nestOriginFor("app.pipaac.org"), "https://app.slpnest.com");
  assert.equal(nestOriginFor("pippaac.emailmike.workers.dev"), "https://app.slpnest.com");
  assert.equal(nestOriginFor(undefined), "https://app.slpnest.com");
  for (const h of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(nestOriginFor(h), "http://localhost:8795");
});
