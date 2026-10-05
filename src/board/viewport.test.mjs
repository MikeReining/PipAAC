/**
 * The sentence bar is in normal flow at the top of #app. After the
 * welcome name field, iOS Chrome pans the visual viewport and leaves
 * offsetTop > 0 while scrollY stays 0 — scrollTo cannot bring the bar
 * back. Pinning #app to that rect does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyVisualFrame, correctedTop, keyboardVisibleHeight, visualFrame } from "../../public/board/viewport.js";

test("a stuck visual-viewport pan hides the sentence bar until #app moves with it", () => {
  const vv = { offsetTop: 68, offsetLeft: 0, width: 1180, height: 752 };
  const frame = visualFrame(vv);
  const barInApp = 6; // padding above #topbar
  // scrollY is 0. The bar's visual top is its place in #app minus the pan.
  const unpinned = barInApp - vv.offsetTop;
  assert.equal(unpinned, -62);
  assert.ok(unpinned < 0);
  // #app.top = offsetTop cancels the pan. The bar lands on its padding.
  const pinned = barInApp + frame.top - vv.offsetTop;
  assert.equal(frame.top, 68);
  assert.equal(pinned, barInApp);
  assert.ok(pinned >= 0 && pinned < 40);
});

test("applyVisualFrame writes the pan offset onto the shell but never its size", () => {
  const el = { style: { width: "500px", height: "400px" } };
  const frame = visualFrame({ offsetTop: 68, offsetLeft: 2, width: 800, height: 500 });
  applyVisualFrame(el, frame);
  assert.equal(el.style.top, "68px");
  assert.equal(el.style.left, "2px");
  // A vv.height read mid-keyboard-close is the shrunken height; baking it
  // inline was the scrunched-grid bug — CSS owns the size, JS only the pan.
  assert.equal(el.style.width, "");
  assert.equal(el.style.height, "");
});

test("a pan that offsetTop does not report is corrected from the bar's measured top", () => {
  // #app sits at the layout origin, the bar is 62px above the screen,
  // and its place inside #app is still the 6px padding.
  assert.equal(correctedTop(0, -62, -68), 68);
  // Already on screen: leave the frame alone.
  assert.equal(correctedTop(0, 6, 0), 0);
  assert.equal(correctedTop(68, 6, 0), 68);
});

test("visualFrame ignores a viewport that has not been laid out", () => {
  assert.equal(visualFrame({ offsetTop: 10, offsetLeft: 0, width: 0, height: 700 }), null);
  assert.equal(visualFrame(null), null);
});

test("the iPad keyboard shrinks overlays to the space above it, only while a field is focused", () => {
  // iPad landscape: 820 tall, the keyboard leaves 395 visible.
  const kb = { height: 395, scale: 1 };
  assert.equal(keyboardVisibleHeight(kb, 820, true), 395);
  // Focus left: a stale short vv.height after the keyboard closes must not stick.
  assert.equal(keyboardVisibleHeight(kb, 820, false), null);
  // No keyboard (or a small accessory bar only): sheets stay centered.
  assert.equal(keyboardVisibleHeight({ height: 790, scale: 1 }, 820, true), null);
  // A pinch-zoom shrinks vv.height too; that is not a keyboard.
  assert.equal(keyboardVisibleHeight({ height: 395, scale: 2 }, 820, true), null);
});
