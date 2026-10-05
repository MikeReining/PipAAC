/**
 * The supporter's side of a Spotlight (founder, 2026-10-04). On a device
 * marked Supporter, a running spotlight turns the board itself into the
 * controller: a tap lights that word on the child's board (board.js /
 * spotlight-layer.js send it). This module owns what the supporter reads:
 * the bar line, the word's coaching tip after a tap, and how many times
 * the child pressed each word this session — counted from the child's
 * taps as they arrive live. The child's own device renders none of this.
 */
import { CONTROLS, spotlight, tipFor } from "../shared/spotlight.mjs";
import { withIcons } from "./inline-icons.js";
import { kv } from "../shared/platform.mjs";

const $ = (id) => document.getElementById(id);
const COUNTS_KEY = "spot_counts";

export function mountCoach({ db, locale, all, catalog, me, repaint }) {
  /** { s: session started_at, c: { "kind:id": n } } — device-local, so a
   *  reload keeps the session's counts; a new session starts at zero. */
  let counts = { s: null, c: {} };
  try { counts = JSON.parse(kv.getItem(COUNTS_KEY)) ?? counts; } catch { /* fresh */ }
  let tip = null; // the last modeled word's tip, until the next tap

  const name = () => me.name?.trim() || null;

  function coachLabel(kind, id) {
    if (kind === "control") return CONTROLS[id]?.label ?? id;
    if (kind === "entity") {
      return all(db, "SELECT spoken_name AS t FROM personal_entity WHERE id = ?",
        [id])[0]?.t ?? id;
    }
    return all(db,
      `SELECT text AS t FROM label
       WHERE sense_id = ? AND kind = 'lemma' AND status = 'approved' AND locale = ?`,
      [id, locale])[0]?.t ?? id;
  }

  /** The child's presses in the running session, by "kind:id". */
  const sessionCounts = () => {
    const s = spotlight();
    return s?.session && counts.s === s.startedAt ? counts.c : {};
  };
  const countOf = (key) => sessionCounts()[key] ?? 0;

  /** The child pressed a word on their board (ws, transient). */
  function onChildTap(m) {
    const s = spotlight();
    if (me.role !== "partner" || !s?.session || typeof m.t !== "string") return;
    if (m.s !== s.startedAt) return; // a tap from another session
    if (counts.s !== s.startedAt) counts = { s: s.startedAt, c: {} };
    counts.c[m.t] = (counts.c[m.t] ?? 0) + 1;
    try { kv.setItem(COUNTS_KEY, JSON.stringify(counts)); } catch { /* memory only */ }
    repaint();
  }

  /** The supporter just modeled a word: its tip replaces the bar line. */
  function onModeled(kind, id) {
    const label = coachLabel(kind, id);
    tip = tipFor(db, catalog, kind, id) ?? `Say “${label}” as you tap it, then wait.`;
    renderBar();
  }

  function renderBar() {
    withIcons($("model-line"), tip
      ?? `Your taps light up on ${name() ? `${name()}'s` : "their"} board. Say each word as you tap it.`);
    const total = Object.values(sessionCounts()).reduce((a, b) => a + b, 0);
    $("model-count").textContent = total
      ? `${name() ?? "They"} pressed ${total} time${total === 1 ? "" : "s"}` : "";
  }

  return { coachLabel, countOf, onChildTap, onModeled, renderBar };
}
