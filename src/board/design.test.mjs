/**
 * Design handoff works test — the designer's tile system + brand board
 * (docs/product/Design_System.md). Proves against the shipped artifacts,
 * not the code's own report:
 *
 * - the tuned grammar palette is what index.html actually serves (the
 *   retired yellow border, lavender prediction color, and blue buttons
 *   cannot silently return);
 * - the Parent Corner "highlight likely next words" setting exists on
 *   learner_profile, defaults OFF, round-trips, and rejects non-binary
 *   values;
 * - grid60 covers all 60 slots, so the empty-cell law (a gap renders a
 *   dashed placeholder, never a collapsed shift) can hold;
 * - the served brand assets exist on disk.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createDatabase, importCatalog } from "./catalog.mjs";

const repoRoot = join(import.meta.dirname, "../..");
const html = readFileSync(join(repoRoot, "public/index.html"), "utf8");
const css = readFileSync(join(repoRoot, "public/board/base.css"), "utf8");
const catalog = JSON.parse(
  readFileSync(join(repoRoot, "data/catalog/catalog.json"), "utf8"),
);

test("palette: tuned role border hexes are shipped; retired colors are gone", () => {
  for (const hex of ["#b07f00", "#2e8b3a", "#2f6fd0", "#d0438c", "#c62828"]) {
    assert.ok(css.includes(hex), `role border ${hex} missing from base.css`);
  }
  for (const retired of ["#d9a410", "#8a7fbf", "#ece8f9"]) {
    assert.ok(!css.includes(retired), `retired color ${retired} still in base.css`);
  }
  // Primary buttons are solid ink — blue never paints a button.
  assert.match(css, /\.btn \{[^}]*background: var\(--ink\)/s);
});

test("learner_profile.highlight_next defaults OFF, round-trips, rejects non-binary", () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const row = db
    .prepare("SELECT highlight_next FROM learner_profile WHERE id = 'prf_local'")
    .all()[0];
  assert.equal(row.highlight_next, 0);
  db.prepare("UPDATE learner_profile SET highlight_next = 1 WHERE id = 'prf_local'").run();
  assert.equal(
    db.prepare("SELECT highlight_next FROM learner_profile WHERE id = 'prf_local'").all()[0]
      .highlight_next,
    1,
  );
  assert.throws(() =>
    db.prepare("UPDATE learner_profile SET highlight_next = 2 WHERE id = 'prf_local'").run(),
  );
});

test("grid60 covers every slot 0-59 — a gap can never silently shift cells", () => {
  const db = createDatabase(":memory:");
  importCatalog(db, catalog);
  const slots = new Set(
    db
      .prepare("SELECT slot_index FROM core_cell WHERE layout = 'grid60'")
      .all()
      .map((r) => r.slot_index),
  );
  assert.equal(slots.size, 60);
  for (let s = 0; s < 60; s++) assert.ok(slots.has(s), `grid60 slot ${s} empty`);
});

test("served brand assets exist (favicon, ink mark, icons, manifest)", () => {
  for (const f of [
    "public/brand/pip-mark-ink.svg",
    "public/brand/pip-mark-32.svg",
    "public/brand/favicon-32.png",
    "public/brand/icon-180.png",
    "public/brand/icon-512.png",
    "public/manifest.webmanifest",
  ]) {
    assert.ok(existsSync(join(repoRoot, f)), `${f} missing`);
  }
});
