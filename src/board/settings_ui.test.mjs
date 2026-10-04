/**
 * Settings redesign — the shipped index.html, not the code's report:
 * every control that lived in Parent corner still exists, inside a
 * Settings page (a .set-sec), exactly once; the chrome never names a
 * role for the person.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { personWords } from "../../public/board/settings-ui.js";

const html = readFileSync(join(import.meta.dirname, "../../public/index.html"), "utf8");

// The Parent corner controls as of 2026-09-28 (before the redesign).
// "Open the full editor" (menu-editor) merged into "Edit the board" (031 G).
// "Practice words" (open-spot) became the Spotlight page (032); its
// controls are checked through spot-pick and SPOTLIGHT below.
const CONTROLS = [
  "wincard", "prog-page", "add-mywords", "open-setup", "edit-groups",
  "open-library", "hl-next", "group-toprow", "group-shows",
  "fresh-speak", "grammar-help", "expressive-voice", "share-research",
  "spot-pick", "cells-seg", "fam-list", "kb-mode", "kb-order", "usr-list",
  "usr-add", "acct-row", "dev-list", "dev-add", "usr-join", "sup-row",
  "dev-lifetime-row", "dev-sheet", "dev-restore", "dev-delete-row",
];

function menuBlock() {
  const a = html.indexOf('<div class="overlay settings" id="menu">');
  const b = html.indexOf('<div class="overlay" id="spotname">');
  assert.ok(a > 0 && b > a, "Settings overlay not found");
  return html.slice(a, b);
}

test("every Parent corner control lives inside a Settings page, once", () => {
  const block = menuBlock();
  const secs = block.split('<section class="set-sec"').slice(1);
  for (const id of CONTROLS) {
    const n = html.split(`id="${id}"`).length - 1;
    assert.equal(n, 1, `#${id} appears ${n} times`);
    assert.ok(secs.some((s) => s.includes(`id="${id}"`)), `#${id} is not inside a Settings page`);
  }
});

test("the person is named, never given a role", () => {
  assert.equal(personWords("Maya").title, "Maya");
  assert.equal(personWords("").inline, "this person");
  const block = menuBlock();
  for (const role of ["your child", "Parent corner", "Parent PIN"]) {
    assert.ok(!block.includes(role), `Settings still says "${role}"`);
  }
});

// 032: Spotlight is a Settings page, not a sheet behind a button — its
// controls live in that page, the timer is gone, and the old name too.
const SPOTLIGHT = ["spot-running", "spot-end", "spot-pick", "spot-lists",
  "spot-role-now", "model-speaks", "spot-pulse", "spot-dim"];

test("Spotlight is its own Settings page, with no timer and no old name", () => {
  const block = menuBlock();
  const page = block.split('<section class="set-sec"').find((s) => s.includes('data-sec="spotlight"'));
  assert.ok(page, "no Spotlight page");
  for (const id of SPOTLIGHT) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `#${id} is not unique`);
    assert.ok(page.includes(`id="${id}"`), `#${id} is not on the Spotlight page`);
  }
  assert.ok(!html.includes('id="spotform"'), "the old Spotlight sheet is still there");
  assert.ok(!html.includes('id="spot-minutes"'), "the session timer is still there");
  assert.ok(!html.includes("Practice words"), `"Practice words" is still in the app`);
});

// spot_dim is the dimmed words' opacity (board.js bindSpotSettings sets
// --dim-o from it), so "A lot" of dimming is the lowest number. Before
// 032 the labels ran the other way and "A little" dimmed the most.
test("Dim the other words: A lot is the lowest opacity", () => {
  const seg = html.slice(html.indexOf('id="spot-dim"'), html.indexOf("</div>", html.indexOf('id="spot-dim"')));
  const v = (label) => Number(seg.match(new RegExp(`data-v="(\\d+)">${label}<`))[1]);
  assert.ok(v("A little") > v("Medium") && v("Medium") > v("A lot"),
    `A little ${v("A little")}, Medium ${v("Medium")}, A lot ${v("A lot")}`);
});
