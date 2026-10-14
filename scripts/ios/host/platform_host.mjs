/**
 * iOS build of public/shared/platform.mjs for the sync loop (044 C2).
 * The web wires these to window/document events; on iOS Swift owns the
 * signals (NWPathMonitor -> "online", scenePhase active -> "visible")
 * and re-enters through __pipPlatformEvent on the core queue.
 *
 * Only the verbs sync.mjs imports exist here. A shared module needing
 * another platform.mjs verb on iOS is a seam gap: add it here.
 */

const listeners = { online: new Set(), visible: new Set(), hidden: new Set() };

export const onOnline = (fn) => { listeners.online.add(fn); };
export const onVisible = (fn) => { listeners.visible.add(fn); };
export const onHidden = (fn) => { listeners.hidden.add(fn); };
export const onPageHide = (fn) => { listeners.hidden.add(fn); };

globalThis.__pipPlatformEvent = (kind) => {
  for (const fn of [...(listeners[kind] ?? [])]) {
    try { fn(); } catch (err) { console.error(`platform ${kind}: ${err?.stack ?? err}`); }
  }
};

/** localStorage-shaped store for shared modules that import `kv`
 *  (account.mjs). The iOS facades keep durable state in the keychain
 *  (app_account.mjs "account/state"); this stays in memory and unused by
 *  them - it exists so the import resolves. */
const kvMap = new Map();
export const kv = {
  getItem: (k) => (kvMap.has(k) ? kvMap.get(k) : null),
  setItem: (k, v) => { kvMap.set(k, String(v)); },
  removeItem: (k) => { kvMap.delete(k); },
  key: (i) => [...kvMap.keys()][i] ?? null,
  get length() { return kvMap.size; },
};
