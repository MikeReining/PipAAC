/**
 * Density-switch regression law: applying a new board size must repaint
 * the strip's contents, not just its grid template. renderGrid() calls
 * sizeStrip(cols), which only rewrites #strip/#tray grid templates; the
 * tray's children stay painted for the old density and wrap into a second
 * implicit row (probe: grid60→grid30 left 4 cards in repeat(2, 1fr)).
 * Reload fixed the symptom because boot renders the strip once, in the
 * persisted layout. renderStrip() is the sole owner of tray contents.
 *
 * Source assertions (voice_sentence.test.mjs precedent) plus the live
 * CDP proof: scripts/probes/density_probe.mjs.
 * DEBUGLOG 2026-10-01 strip-stale-after-density-switch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cells = readFileSync(new URL("../../public/board/cells-sheet.js", import.meta.url), "utf8");
const board = readFileSync(new URL("../../public/board.js", import.meta.url), "utf8");
const strip = readFileSync(new URL("../../public/board/strip.js", import.meta.url), "utf8");

test("cells-apply repaints the strip after renderGrid resizes its template", () => {
  const i = cells.indexOf('"cells-apply"');
  assert.ok(i > 0, "cells-apply handler must exist");
  const body = cells.slice(i, cells.indexOf("});", i));
  const grid = body.indexOf("renderGrid()");
  const strip = body.indexOf("renderStrip()");
  const view = body.indexOf("rerenderView()");
  assert.ok(grid > 0, "apply must renderGrid()");
  assert.ok(strip > grid, "renderStrip() must run after the template resize");
  assert.ok(view > grid, "the active group view must repaint too");
});

test("mountCellsSheet receives renderStrip through board.js wiring", () => {
  assert.match(cells, /renderStrip/);
  const i = board.indexOf("mountCellsSheet({");
  assert.ok(i > 0);
  const call = board.slice(i, board.indexOf("})", i));
  assert.match(call, /renderStrip/, "the mount args must pass renderStrip");
});

test("strip slots hold a three-card floor at every board size", () => {
  // Motor_Grid § Strip: the smart bar's job doesn't shrink with the
  // grid — sparse boards get one-column cards, never one suggestion.
  const i = strip.indexOf("function stripSlots");
  assert.ok(i > 0);
  const body = strip.slice(i, strip.indexOf("}", i));
  assert.match(body, /Math\.min\(4, Math\.max\(3, cols - 2\)\)/,
    "stripSlots must be clamp(3..4, cols - 2): floor 3, ceiling 4");
});
