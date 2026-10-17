/**
 * The iPad bar buttons' enabled state (phase 044 parity, web 60b062dc):
 * the web's own `txButtonDisabled` (shared/txbar.mjs) per button, so the
 * supporter-modeling rule (✨ / ❓ press on an empty bar) is decided once.
 * Exported from core_entry.mjs as PIPCORE.txbuttons.
 * `picking` is the web's spotlight target-pick mode; the iPad has no such
 * mode, so it is always false here.
 */
const IDS = { fix: "tx-fix", question: "tx-question", past: "tx-past", future: "tx-future" };

export function disabled(_appId, { words = false, modeling = false, offline = false, tour = false } = {}) {
  const out = {};
  for (const [name, id] of Object.entries(IDS)) {
    out[name] = globalThis.PIPCORE.txbar.txButtonDisabled(id, {
      picking: false, modeling: !!modeling, words: !!words, offline: !!offline, tour: !!tour,
    });
  }
  return out;
}
