/**
 * 030 slice 6 — the extended-library join contract:
 *   approved + manifest-served   → main index (source: extended)
 *   approved but not published   → never indexed (the img route can't serve)
 *   manifest r2Key ≠ serve path  → never indexed (disagreement, not a 404)
 *   rejected                     → never indexed
 *   unreviewed                   → calibration index only, status pending
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildRows } from "./build_index.mjs";

const dir = mkdtempSync(join(tmpdir(), "pip-idx-"));
const w = (name, content) => {
  const p = join(dir, name);
  writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content));
  return p;
};

const paths = {
  catalog: w("catalog.json", {
    senses: [{ id: "s1", category: "Food & Drink" }],
    labels: [{ sense_id: "s1", locale: "en", text: "apple" }],
    images: [{ id: "img_0001", sense_id: "s1", key: "symbols/apple.png", status: "approved" },
             { id: "img_0002", sense_id: "s1", key: "symbols/x.png", status: "pending" }],
  }),
  cfg: w("cfg.json", { caption_version: 1 }),
  review: w("review.json", {
    ok_art: "approve",
    unpublished_art: "approve",
    wrong_key_art: "approve",
    bad_art: "reject",
    // fresh_art: unreviewed
  }),
  manifest: w("manifest.json", { entries: {
    ok_art: { r2Key: "symbols/extended/ok_art.png" },
    wrong_key_art: { r2Key: "symbols/extended/renamed_file.png" },
    // unpublished_art: approved but never published
  } }),
  results: w("results.jsonl", [
    { id: "ok_art", label: "ok art", section: "Toys", spec: { framing: "object" } },
    { id: "unpublished_art", label: "unpub", section: "Toys", spec: {} },
    { id: "wrong_key_art", label: "wrong", section: "Toys", spec: {} },
    { id: "bad_art", label: "bad", section: "Toys", spec: {} },
    { id: "fresh_art", label: "fresh", section: "Toys", spec: {} },
  ].map((r) => JSON.stringify(r)).join("\n")),
  drawings: w("drawings.json", [
    { key: "a".repeat(64), status: "ready", scope: "common", text: "pool", kind: "None" },
    { key: "b".repeat(64), status: "failed", scope: "common", text: "x" },
  ]),
};

const byId = (rows) => new Map(rows.map((r) => [r.image_id, r]));

test("catalog: approved images only, captions from labels + category", () => {
  const rows = buildRows({ paths });
  const m = byId(rows);
  assert.ok(m.has("img_0001"));
  assert.equal(m.get("img_0001").caption, "apple · Food & Drink");
  assert.ok(!m.has("img_0002"), "pending catalog art stays out");
});

test("extended join: only approved AND manifest-served rows index", () => {
  const m = byId(buildRows({ paths }));
  assert.equal(m.get("ext_ok_art")?.status, "approved");
  assert.equal(m.get("ext_ok_art")?.asset, "/api/v1/pictures/img/ext_ok_art");
  assert.equal(m.get("ext_ok_art")?.caption, "ok art · Toys · object");
  assert.ok(!m.has("ext_unpublished_art"), "approved but no manifest row");
  assert.ok(!m.has("ext_wrong_key_art"), "manifest r2Key ≠ serve path");
  assert.ok(!m.has("ext_bad_art"), "rejected");
  assert.ok(!m.has("ext_fresh_art"), "unreviewed stays out of main");
});

test("calibration index carries unreviewed/rejected-free pending rows", () => {
  const m = byId(buildRows({ calibration: true, paths }));
  assert.equal(m.get("ext_fresh_art")?.status, "pending");
  assert.equal(m.get("ext_fresh_art")?.asset, "/ext-local/fresh_art.png");
  assert.ok(!m.has("ext_bad_art"), "rejected never calibrates either");
});

test("drawn rows: ready ledger exports join as source drawn", () => {
  const m = byId(buildRows({ paths }));
  assert.equal(m.get(`drw_${"a".repeat(64)}`)?.source, "drawn");
  assert.equal(m.get(`drw_${"a".repeat(64)}`)?.status, "approved");
  assert.ok(!m.has(`drw_${"b".repeat(64)}`), "failed draws never index");
});

test("live repo state: every indexed ext row resolves to its manifest key", async () => {
  const rows = buildRows({}); // real paths
  const manifest = JSON.parse(
    (await import("node:fs")).readFileSync("data/catalog/extended_art_r2.json", "utf8")).entries;
  for (const r of rows.filter((x) => x.source === "extended")) {
    assert.equal(manifest[r.image_id.slice(4)]?.r2Key,
      `symbols/extended/${r.image_id.slice(4)}.png`,
      `${r.image_id} manifest/serve disagreement`);
  }
});
