/**
 * Coach bar. On a partner device, the running spotlight's words sit
 * above the mirror. One tap models the word on the child's board.
 * The child's own device renders none of this.
 */
import { CONTROLS, coachTap, coachTally, spotlight, tipFor } from "../shared/spotlight.mjs";

const $ = (id) => document.getElementById(id);

const COACH_BASICS = [
  "Point while you talk — your voice does the teaching.",
  "Model without expecting a response.",
  "Wait — silently count to five before helping.",
  "Model one step above their level, not a whole sentence.",
  "Come back to it tomorrow — repetition is the lesson.",
];

export function mountCoach({ db, locale, all, catalog, me, syncSendModel }) {
  const coachSeen = new Set(
    JSON.parse(localStorage.getItem("coach_basics_seen") ?? "[]"),
  );

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

  function renderCoachTally() {
    const n = coachTally(db);
    $("coach-tally").textContent = n
      ? `You modeled ${n} word${n === 1 ? "" : "s"} today`
      : "Tap a word — it glows on their board.";
  }

  function renderCoach() {
    const bar = $("coachbar");
    const s = spotlight();
    const on = me?.role === "partner" && !!s;
    bar.hidden = !on;
    if (!on) return;
    const box = $("coach-targets");
    box.innerHTML = "";
    for (const key of s.targets) {
      const [kind, id] = key.split(":");
      const label = coachLabel(kind, id);
      const b = document.createElement("button");
      b.className = "coach-word";
      b.textContent = label;
      b.addEventListener("click", () => {
        // The same transient path as Model mode — the word glows on the
        // child's board; the tally stays here, measuring the partner.
        syncSendModel(key, label);
        // The tally counts words modeled — a button press is not one.
        if (kind !== "control") coachTap(db, kind, id);
        b.classList.add("sent");
        setTimeout(() => b.classList.remove("sent"), 700);
        const tip = tipFor(db, catalog, kind, id)
          ?? `"${label}" — tap it while you say it, then wait.`;
        const tipEl = $("coach-tip");
        tipEl.textContent = tip;
        tipEl.hidden = false;
        renderCoachTally();
      });
      box.appendChild(b);
    }
    // The basics, one line at a time — each shows once, then it's out of
    // the way. Seen state is device-local: it coaches this partner.
    const idx = COACH_BASICS.findIndex((_, i) => !coachSeen.has(i));
    $("coach-basic").hidden = idx < 0;
    if (idx >= 0) {
      $("coach-basic-text").textContent = COACH_BASICS[idx];
      $("coach-basic-x").onclick = () => {
        coachSeen.add(idx);
        localStorage.setItem("coach_basics_seen", JSON.stringify([...coachSeen]));
        renderCoach();
      };
    }
    renderCoachTally();
  }

  return { renderCoach, renderCoachTally, coachLabel };
}
