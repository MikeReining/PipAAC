/**
 * 034 regression law: the welcome's Continue must leave the document.
 * On iPad Chrome the name field's keyboard pan can outlive the keyboard
 * with scrollY, visualViewport.offsetTop and getBoundingClientRect all
 * reading normal — so showing the board in the same document is the bug,
 * and no in-page repair can be trusted. finish() navigates; the tour
 * resumes on the fresh boot via a one-shot sessionStorage flag.
 *
 * These are source assertions (voice_sentence.test.mjs precedent) because
 * desktop cannot reproduce the pan — the founder's iPad stays the arbiter.
 * DEBUGLOG 2026-10-01 sentence-bar-offscreen-after-welcome.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const onramp = readFileSync(new URL("../../public/board/onramp-ui.js", import.meta.url), "utf8");
const board = readFileSync(new URL("../../public/board.js", import.meta.url), "utf8");

const finishBody = () => {
  const i = onramp.indexOf("async function finish()");
  assert.ok(i > 0, "finish() must exist");
  return onramp.slice(i, onramp.indexOf("\n  }", i));
};

test("finish() persists the user, then leaves the document — never reveals the board in place", () => {
  const body = finishBody();
  const save = body.indexOf("saveUser({ needsSetup: false })");
  const flush = body.indexOf("await flushDb");
  const flag = body.indexOf('sessionStorage.setItem("pip_tour"');
  const nav = body.indexOf("location.replace(");
  assert.ok(save > 0 && nav > save, "the write must land before the navigation");
  assert.ok(flush > save && flush < nav, "sqlite's 300 ms debounce must be flushed before leaving");
  assert.ok(flag > save && flag < nav, "the tour flag must be set before leaving");
  // Removing the overlay and staying is the bug's shape.
  assert.doesNotMatch(body, /wrap\.remove|onDone/);
});

test("boot starts the tour from the consumed flag, else the welcome — never both", () => {
  const get = board.indexOf('sessionStorage.getItem("pip_tour")');
  const rm = board.indexOf('sessionStorage.removeItem("pip_tour")');
  const start = board.indexOf("tourUi.start()", get);
  const ramp = board.indexOf("me.needsSetup) onramp.start()", get);
  assert.ok(get > 0 && rm > get, "the flag must be consumed before the tour starts — a mid-tour refresh must not replay it");
  assert.ok(start > rm);
  assert.ok(ramp > start, "the flag wins; needsSetup is the fallback");
});

test("the welcome overlay no longer mounts inside the pinned #app shell", () => {
  assert.doesNotMatch(onramp, /appRoot\(\)/);
  // The tour still runs on the board — its appRoot() stays.
  const tour = readFileSync(new URL("../../public/board/tour-ui.js", import.meta.url), "utf8");
  assert.match(tour, /appRoot\(\)/);
});
