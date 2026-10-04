/**
 * 043 I Works Test — the usage ledger: atomic reserve, refund, and the
 * hit trail. Drives the real UsageLedger DO over node:sqlite (the same
 * adapter tile.test.mjs uses for TileLedger) — concurrency is proven by
 * racing reservations through Promise.all: one storage thread means a
 * denied request can never share a stale read with an allowed one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { UsageLedger, add, refund, reserve } from "./usage_ledger.mjs";

const sqlFor = (db) => ({
  exec: (q, ...params) => {
    const reads = /^\s*(SELECT|WITH)/i.test(q) || /RETURNING/i.test(q);
    if (reads || params.length) {
      const st = db.prepare(q);
      const rows = reads ? st.all(...params) : (st.run(...params), []);
      return { toArray: () => rows };
    }
    db.exec(q);
    return { toArray: () => [] };
  },
});

const makeLedger = () => {
  const db = new DatabaseSync(":memory:");
  const sql = sqlFor(db);
  const stub = new UsageLedger(
    { storage: { sql }, blockConcurrencyWhile: (fn) => fn() }, {});
  return {
    sql,
    post: async (path, body) => (await stub.fetch(new Request(
      `https://usage${path}`, { method: "POST", body: JSON.stringify(body) }))).json(),
  };
};

const BUDGET = { dayBudget: 100, minBudget: 50 };

test("reserve bills atomically — a second reserve sees the first's spend", async () => {
  const { sql } = makeLedger();
  const first = reserve(sql, { ns: "usage", uid: "u1", chars: 60, ...BUDGET });
  assert.deepEqual(first, { allowed: true });
  // Already billed: 60 of 100 spent. A 50-char request must deny.
  const second = reserve(sql, { ns: "usage", uid: "u1", chars: 50, ...BUDGET });
  assert.deepEqual(second, { allowed: false, over: "day" });
  // And nothing was billed for the denial.
  const day = sql.exec("SELECT chars, reqs FROM usage_day").toArray()[0];
  assert.equal(day.chars, 60);
  assert.equal(day.reqs, 1);
});

test("raced reserves never exceed the day budget", async () => {
  const { post } = makeLedger();
  // Ten 20-char reservations against a 100-char budget, all at once.
  const gates = await Promise.all(Array.from({ length: 10 }, () =>
    post("/reserve", { ns: "usage", uid: "u1", chars: 20, ...BUDGET })));
  const allowed = gates.filter((g) => g.allowed);
  const denied = gates.filter((g) => !g.allowed);
  assert.equal(allowed.length, 5);
  assert.equal(denied.length, 5);
  assert.ok(denied.every((g) => g.over === "day"));
});

test("raced reserves never exceed the minute budget", async () => {
  const { post } = makeLedger();
  const gates = await Promise.all(Array.from({ length: 8 }, () =>
    post("/reserve", { ns: "usage", uid: "u2", chars: 0, dayBudget: 10_000, minBudget: 3 })));
  assert.equal(gates.filter((g) => g.allowed).length, 3);
  assert.ok(gates.filter((g) => !g.allowed).every((g) => g.over === "minute"));
});

test("denials land on the hit trail", async () => {
  const { sql } = makeLedger();
  reserve(sql, { ns: "usage", uid: "u3", chars: 100, ...BUDGET });
  reserve(sql, { ns: "usage", uid: "u3", chars: 1, ...BUDGET });
  const hits = sql.exec("SELECT over FROM usage_hit WHERE uid = 'u3'").toArray();
  assert.equal(hits.length, 1);
  assert.equal(hits[0].over, "day");
});

test("refund returns day spend but keeps the minute attempt", async () => {
  const { sql, post } = makeLedger();
  await post("/reserve", { ns: "usage", uid: "u4", chars: 40, ...BUDGET });
  await post("/refund", { ns: "usage", uid: "u4", chars: 40 });
  const day = sql.exec("SELECT chars, reqs FROM usage_day WHERE uid = 'u4'").toArray()[0];
  assert.equal(day.chars, 0);
  assert.equal(day.reqs, 0);
  const min = sql.exec("SELECT reqs FROM usage_min WHERE uid = 'u4'").toArray()[0];
  assert.equal(min.reqs, 1);
  // The refund restored capacity: the full budget is spendable again.
  const again = reserve(sql, { ns: "usage", uid: "u4", chars: 100, ...BUDGET });
  assert.equal(again.allowed, true);
});

test("refund clamps at zero — refunding more than spent cannot go negative", async () => {
  const { post, sql } = makeLedger();
  await post("/reserve", { ns: "usage", uid: "u5", chars: 10, ...BUDGET });
  await post("/refund", { ns: "usage", uid: "u5", chars: 10 });
  await post("/refund", { ns: "usage", uid: "u5", chars: 10 }); // double refund
  const day = sql.exec("SELECT chars, reqs FROM usage_day WHERE uid = 'u5'").toArray()[0];
  assert.equal(day.chars, 0);
  assert.equal(day.reqs, 0);
});

test("add meters unconditionally (find/find-batch paths)", async () => {
  const { sql } = makeLedger();
  add(sql, { ns: "usage-pic", uid: "u6", chars: 3 });
  add(sql, { ns: "usage-pic", uid: "u6", chars: 2 });
  const day = sql.exec("SELECT chars, reqs FROM usage_day WHERE uid = 'u6'").toArray()[0];
  assert.equal(day.chars, 5);
  assert.equal(day.reqs, 2);
});

test("namespaces are independent budgets", async () => {
  const { sql } = makeLedger();
  reserve(sql, { ns: "usage", uid: "u7", chars: 100, ...BUDGET });
  const other = reserve(sql, { ns: "usage-tr", uid: "u7", chars: 100, ...BUDGET });
  assert.equal(other.allowed, true);
});

test("day rollover resets the budget", async () => {
  const { sql } = makeLedger();
  const day1 = Date.parse("2026-10-01T23:00:00Z");
  reserve(sql, { ns: "usage", uid: "u8", chars: 100, now: day1, ...BUDGET });
  const day2 = Date.parse("2026-10-02T01:00:00Z");
  const next = reserve(sql, { ns: "usage", uid: "u8", chars: 100, now: day2, ...BUDGET });
  assert.equal(next.allowed, true);
});
