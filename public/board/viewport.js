/**
 * The sentence bar lives in normal flow at the top of #app.
 * iOS Chrome (WebKit) pans the visual viewport to reveal a focused
 * field and often leaves offsetTop > 0 after the keyboard closes,
 * with scrollY still 0. scrollTo cannot see that pan — #app has to
 * occupy the visible rect itself.
 */

export function appRoot() {
  return document.getElementById("app") ?? document.body;
}

/** The origin #app must sit at. Null when the viewport has no size yet.
 *  Width/height stay CSS-owned (100% of the layout viewport): a vv.height
 *  read while the keyboard is still animating closed bakes the shrunken
 *  size into the shell and nothing reliable corrects it — the founder's
 *  scrunched-grid bug (2026-10-01). */
export function visualFrame(vv) {
  if (!vv || !vv.width || !vv.height) return null;
  return {
    top: vv.offsetTop || 0,
    left: vv.offsetLeft || 0,
  };
}

export function applyVisualFrame(el, frame) {
  el.style.top = `${frame.top}px`;
  el.style.left = `${frame.left}px`;
  // Clear any stale inline size left by an older pin — CSS owns it.
  el.style.width = "";
  el.style.height = "";
}

/** If the sentence bar is still above the visible rect after #app is
 *  placed at offsetTop, the pan was not expressed as offsetTop. Move
 *  #app by the measured gap. `barTop` and `appVisualTop` are visual
 *  coordinates; the bar's place inside #app is their difference. */
export function correctedTop(frameTop, barTop, appVisualTop) {
  if (barTop >= -2) return frameTop;
  const local = barTop - appVisualTop;
  return frameTop + (local - barTop);
}

export function pinAppToVisualViewport(
  el = document.getElementById("app"),
  vv = window.visualViewport,
) {
  const frame = visualFrame(vv);
  if (!el || !frame) return null;
  applyVisualFrame(el, frame);
  const bar = document.getElementById("topbar");
  if (!bar) return frame;
  const barTop = bar.getBoundingClientRect().top;
  const appTop = el.getBoundingClientRect().top;
  const top = correctedTop(frame.top, barTop, appTop);
  if (top !== frame.top) el.style.top = `${top}px`;
  return frame;
}

/** The visible height above the iPad keyboard, or null when no keyboard
 *  covers the page. The keyboard overlays without resizing the layout
 *  viewport, so a centered sheet hides under it. Only trusted while a
 *  text field holds focus (a stale vv.height after the keyboard closes
 *  must not shrink anything) and at 1× zoom (a pinch is not a keyboard). */
export function keyboardVisibleHeight(vv, layoutHeight, fieldFocused) {
  if (!vv?.height || !fieldFocused) return null;
  if (Math.abs((vv.scale ?? 1) - 1) > 0.01) return null;
  return layoutHeight - vv.height > 120 ? Math.round(vv.height) : null;
}

const isField = (el) => !!el && (el.tagName === "TEXTAREA"
  || (el.tagName === "INPUT" && !["button", "checkbox", "radio", "file", "range"].includes(el.type))
  || el.isContentEditable);

/** html.kb-up + --vv-h: overlays fit the space above the keyboard. */
function markKeyboard() {
  const h = keyboardVisibleHeight(window.visualViewport, innerHeight, isField(document.activeElement));
  const root = document.documentElement;
  root.classList.toggle("kb-up", h != null);
  if (h != null) root.style.setProperty("--vv-h", `${h}px`);
}

export function installViewportPin() {
  const pin = () => { pinAppToVisualViewport(); markKeyboard(); };
  pin();
  window.visualViewport?.addEventListener("resize", pin);
  window.visualViewport?.addEventListener("scroll", pin);
  window.addEventListener("pageshow", pin);
  // The keyboard's closing pan arrives after focus has already left.
  window.addEventListener("focusout", () => setTimeout(pin, 350));
  window.addEventListener("focusin", () => setTimeout(pin, 350));
}
