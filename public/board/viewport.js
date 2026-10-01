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

/** The rectangle #app must occupy. Null when the viewport has no size yet. */
export function visualFrame(vv) {
  if (!vv || !vv.width || !vv.height) return null;
  return {
    top: vv.offsetTop || 0,
    left: vv.offsetLeft || 0,
    width: vv.width,
    height: vv.height,
  };
}

export function applyVisualFrame(el, frame) {
  el.style.top = `${frame.top}px`;
  el.style.left = `${frame.left}px`;
  el.style.width = `${frame.width}px`;
  el.style.height = `${frame.height}px`;
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

export function installViewportPin() {
  const pin = () => pinAppToVisualViewport();
  pin();
  window.visualViewport?.addEventListener("resize", pin);
  window.visualViewport?.addEventListener("scroll", pin);
  window.addEventListener("pageshow", pin);
  // The keyboard's closing pan arrives after focus has already left.
  window.addEventListener("focusout", () => setTimeout(pin, 350));
}
