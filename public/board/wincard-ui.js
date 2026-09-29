/**
 * The weekly win card (016 slice 2, Stats_And_Progress § 4.1).
 *
 * Renders in Parent Corner and surfaces once a week as a note on the
 * user's own device. Rules and totals live in shared/wincard.mjs; this
 * module only draws them. Wins only — the card never shows a drop, and
 * a week with no taps hides the card instead of scolding.
 * Free users get the Lifetime line; Lifetime users get the dashboard
 * instead (slice 4).
 */
import { weeklyCard, WINCARD_DAYS } from "../shared/wincard.mjs";
import { dayIndex } from "../shared/stats.mjs";

const $ = (id) => document.getElementById(id);

export function mountWincard({ db, me, nameOf, entitlement, toast }) {
  const el = () => $("wincard");

  function fill(card, life) {
    el().replaceChildren();
    const sum = document.createElement("p");
    sum.className = "wincard-sum";
    sum.textContent = card.summary;
    el().appendChild(sum);
    for (const w of card.wins) {
      const p = document.createElement("p");
      p.className = "wincard-win";
      p.textContent = `★ ${w}`;
      el().appendChild(p);
    }
    if (!life) {
      const pitch = document.createElement("p");
      pitch.className = "hint";
      pitch.textContent = `See all of ${me.name || "this person"}'s progress with Pip Lifetime.`;
      el().appendChild(pitch);
    }
  }

  async function render() {
    const card = weeklyCard(db, Date.now(), nameOf);
    el().hidden = card.empty;
    if (card.empty) return;
    fill(card, true); // wins are never wrong while entitlement resolves
    const life = (await entitlement().catch(() => null)) === "lifetime";
    fill(card, life);
  }

  /** The once-a-week note: on boot, once per week per user, the card's
   *  summary toasts — the way in for adults who never open the corner. */
  function noteOnceAWeek(now = Date.now()) {
    const tz = -new Date(now).getTimezoneOffset();
    const week = Math.floor(dayIndex(now, tz) / WINCARD_DAYS);
    const key = `pip_wincard:${me.id}`;
    if (localStorage.getItem(key) === String(week)) return;
    const card = weeklyCard(db, now, nameOf);
    if (card.empty) return;
    localStorage.setItem(key, String(week));
    toast(`${card.summary} — ${card.wins[0] ?? "open Settings for the week."}`);
  }

  $("corner").addEventListener("click", render);
  noteOnceAWeek();
}
