import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildPendingQueue,
  loadResultsMeta,
  rejectArt,
  approveArt,
  readReview,
} from "./review_lane.mjs";

test("buildPendingQueue skips reviewed ids", () => {
  const dir = join(tmpdir(), `review-lane-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "apple.png"), "x");
  writeFileSync(join(dir, "banana.png"), "x");
  const meta = new Map([["apple", { label: "apple", section: "Food" }]]);
  const q = buildPendingQueue(dir, { apple: "approve" }, meta, new Set());
  assert.equal(q.length, 1);
  assert.equal(q[0].id, "banana");
});

test("rejectArt moves png to rejected and records review", () => {
  const root = join(tmpdir(), `review-lane-rej-${Date.now()}`);
  const out = join(root, "art");
  const rejected = join(out, "rejected");
  const reviewPath = join(out, "review.json");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "fries.png"), "png");
  rejectArt("fries", out, rejected, reviewPath);
  assert.equal(existsSync(join(out, "fries.png")), false);
  assert.equal(existsSync(join(rejected, "fries.png")), true);
  assert.equal(readReview(reviewPath).fries, "reject");
});

test("approveArt records without deleting file", () => {
  const root = join(tmpdir(), `review-lane-app-${Date.now()}`);
  const out = join(root, "art");
  const reviewPath = join(out, "review.json");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "toast.png"), "png");
  approveArt("toast", reviewPath);
  assert.equal(existsSync(join(out, "toast.png")), true);
  assert.equal(readReview(reviewPath).toast, "approve");
});

test("loadResultsMeta keeps last line per id", () => {
  const f = join(tmpdir(), `results-${Date.now()}.jsonl`);
  writeFileSync(
    f,
    '{"id":"x","label":"first"}\n{"id":"x","label":"second","section":"Food"}\n',
  );
  const meta = loadResultsMeta(f);
  assert.equal(meta.get("x").label, "second");
});
