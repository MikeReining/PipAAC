/** 043 J — the platform seam: every raw browser capability the board
 *  uses, named in one module. The web app calls these today; an iOS
 *  shell or a native port swaps this file's implementations, not the
 *  flows above it. Types are checked by `tsc --noEmit` (seams
 *  tsconfig, the check:fast `types:seams` gate) — the seam carries
 *  types, the app stays plain JS.
 *
 *  What belongs here: storage, audio playback, media blobs, network
 *  and page lifecycle. What does not: product logic — this file
 *  decides nothing about words, voices, or sync. */

/**
 * localStorage-compatible key/value — the same shape users.mjs's
 * injected `storage` already accepts, so callers never notice the
 * swap. A native port backs it with app-group storage.
 * @type {{ getItem(k: string): string | null, setItem(k: string, v: string): void,
 *          removeItem(k: string): void, key(i: number): string | null, readonly length: number }}
 */
export const kv = {
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
  key: (i) => localStorage.key(i),
  get length() { return localStorage.length; },
};

/** The playback element for a clip or sentence (043 J: audio seam). */
export function createAudio() {
  return new Audio();
}

/** OPFS root — media blob bytes live here, outside IndexedDB (043 C).
 * @returns {Promise<FileSystemDirectoryHandle>} */
export async function opfsRoot() {
  return navigator.storage.getDirectory();
}

/** Lifecycle: network reconnect, page visibility, exit flush. The
 *  guards live at the call site (modules load in node tests too). */
export function onOnline(/** @type {() => void} */ fn) {
  globalThis.addEventListener("online", fn);
}
export function onVisible(/** @type {() => void} */ fn) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fn();
  });
}
export function onHidden(/** @type {() => void} */ fn) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") fn();
  });
}
export function onPageHide(/** @type {() => void} */ fn) {
  window.addEventListener("pagehide", fn);
}
export const isOnline = () => navigator.onLine;
