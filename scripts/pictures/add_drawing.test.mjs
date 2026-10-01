import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { checkPng, recordLocally, slugFor } from "./add_drawing.mjs";

test("slugFor matches the extended-art id shape", () => {
  assert.equal(slugFor("Crocs"), "crocs");
  assert.equal(slugFor(" ice cream "), "ice_cream");
  assert.equal(slugFor("mac & cheese!"), "mac_cheese");
  assert.equal(slugFor("???"), "");
});

test("checkPng refuses non-PNG and missing files", () => {
  const dir = mkdtempSync(join(tmpdir(), "add-drawing-"));
  const bad = join(dir, "x.png");
  writeFileSync(bad, "not a png");
  assert.throws(() => checkPng(bad), /not a PNG/);
  assert.throws(() => checkPng(join(dir, "none.png")), /no such file/);
  const ok = join(dir, "ok.png");
  writeFileSync(ok, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]));
  checkPng(ok);
});

test("recordLocally copies, approves, and records the label once", () => {
  const dir = mkdtempSync(join(tmpdir(), "add-drawing-"));
  const src = join(dir, "src.png");
  writeFileSync(src, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const out = join(dir, "out");
  const resultsPath = join(dir, "results.jsonl");
  for (let i = 0; i < 2; i++) {
    recordLocally({ id: "crocs", label: "crocs", section: "Clothes", src, out, resultsPath });
  }
  assert.ok(existsSync(join(out, "crocs.png")));
  assert.equal(JSON.parse(readFileSync(join(out, "review.json"), "utf8")).crocs, "approve");
  const rows = readFileSync(resultsPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].label, rows[0].section], ["crocs", "Clothes"]);
});
