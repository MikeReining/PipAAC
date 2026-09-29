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
const CONTROLS = [
  "wincard", "open-progress", "add-mywords", "open-setup", "edit-groups",
  "open-library", "hl-next", "group-toprow", "group-occasions",
  "fresh-speak", "grammar-help", "expressive-voice", "share-research",
  "open-spot", "cells-seg", "fam-list", "kb-mode", "kb-order", "usr-list",
  "usr-add", "acct-row", "dev-list", "dev-add", "dev-link", "sup-row",
  "dev-lifetime-row", "dev-sheet", "dev-restore", "dev-delete-row",
];

function menuBlock() {
  const a = html.indexOf('<div class="overlay settings" id="menu">');
  const b = html.indexOf('<div class="overlay" id="progress">');
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
