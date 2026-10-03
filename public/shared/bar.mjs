/**
 * 038 — Sentence bar settings: which buttons the person sees. The
 * truth owner is the synced profile column `learner_profile.bar_controls`
 * — a JSON list of the shown control names; the bar renders it, it never
 * decides it. Play is never in the list: it always shows. An absent
 * column or a NULL row is Everything, the bar that shipped before 038.
 * An adult sets this in Settings → Talking; nothing infers it from the
 * child's behaviour.
 */

/** The hidable controls, in bar order (Backspace and Clear sit inside
 *  the message bar). */
export const BAR_CONTROLS = ["fix", "question", "past", "future", "backspace", "clear"];
/** Control name → its button id in index.html. */
export const BAR_BUTTON = {
  fix: "tx-fix", question: "tx-question",
  past: "tx-past", future: "tx-future",
  backspace: "backspace", clear: "clear",
};
export const BAR_NAMES = {
  fix: "Fix it", question: "Question",
  past: "Past", future: "Future",
  backspace: "Backspace", clear: "Clear",
};
/** A preset just sets the toggles (038 § 2). `controls` is the shown
 *  list the row writes — copy it before storing. */
export const BAR_PRESETS = [
  { id: "play", name: "Just play", controls: [] },
  { id: "question", name: "Play + Question", controls: ["question"] },
  { id: "fix", name: "Play + Question + Fix it", controls: ["question", "fix"] },
  { id: "all", name: "Everything", controls: BAR_CONTROLS },
];

/** The shown controls as a Set — all of them on a pre-038 profile. */
export function barControls(db) {
  try {
    const v = db.prepare(
      "SELECT bar_controls AS c FROM learner_profile WHERE id = 'prf_local'",
    ).all()[0]?.c;
    if (v == null) return new Set(BAR_CONTROLS);
    return new Set((JSON.parse(v) ?? []).filter((c) => BAR_CONTROLS.includes(c)));
  } catch {
    return new Set(BAR_CONTROLS);
  }
}

/** The preset whose shown list this is, or null for a custom set. */
export function barPreset(shown) {
  return BAR_PRESETS.find(
    (p) => p.controls.length === shown.size && p.controls.every((c) => shown.has(c)),
  ) ?? null;
}

/** The settings-list summary ("Play + Question") — the preset's name
 *  when the shown set is one, else the buttons named. */
export function barLabel(db) {
  const shown = barControls(db);
  const preset = barPreset(shown);
  if (preset) return preset.name;
  const names = BAR_CONTROLS.filter((c) => shown.has(c)).map((c) => BAR_NAMES[c]);
  return `Play + ${names.join(" + ")}`;
}
