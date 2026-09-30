/**
 * The progress dashboard (016 slice 4, Stats_And_Progress § 4.2).
 *
 * Parent Corner → Progress. A Lifetime user's supporters get the full
 * dashboard; everyone else gets the weekly win card and the offer —
 * § 4.3: a missing license hides the dashboard, never a word. Numbers
 * are computed in shared/dashboard.mjs from stats_day; this module only
 * draws them. No norms, no comparisons — a trend is the user's own
 * weeks, in order.
 */
import { dashboard, rangeFor } from "../shared/dashboard.mjs";
import { weeklyCard } from "../shared/wincard.mjs";
import { reportPdf } from "../shared/report.mjs";
import { withIcons } from "./inline-icons.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const fmt = (n) => (n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));
const dayLabel = (day) =>
  new Date(day * 86400000).toLocaleDateString([], { month: "short", day: "numeric" });
const trendOf = (t) => t.map((v) => fmt(v)).join(" → ");

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BUTTON_NAMES = { fix: "✨ sentence", question: "❓ question", past: "⏪ past", future: "⏩ future" };

export function mountProgress({ db, me, nameOf, entitlement, open, toast }) {
  let span = "month";
  let mode = localStorage.getItem(`pip_dash_mode:${me.id}`) ?? "symbol";
  let current = null; // {fromDay, toDay, span} of the rendered view

  async function render() {
    const body = $("prog-body");
    body.replaceChildren();
    const life = (await entitlement().catch(() => null)) === "lifetime";
    const range = rangeFor(span);
    current = range;

    if (!life) {
      // Free path (§ 4.1): the win card and the way in.
      const card = weeklyCard(db, Date.now(), nameOf);
      if (card.empty) {
        body.appendChild(el("p", "hint", "No words tapped yet this week — the card appears once the week has taps."));
      } else {
        body.appendChild(el("p", "wincard-sum", card.summary));
        for (const w of card.wins) body.appendChild(el("p", "wincard-win", `★ ${w}`));
      }
      body.appendChild(el("p", "hint",
        `See all of ${me.name || "this user"}'s progress — trends, goals, and a report for meetings — with Pip Lifetime.`));
      $("prog-share").hidden = true;
      return;
    }
    $("prog-share").hidden = false;

    const d = dashboard(db, range.fromDay, range.toDay, { nameOf, mode });
    if (!d.words) {
      body.appendChild(el("p", "hint", "No taps in this range yet."));
      return;
    }

    const heads = el("div", "prog-heads");
    for (const h of d.headline) {
      const box = el("div", "prog-head");
      box.appendChild(el("div", "prog-head-n", fmt(h.value)));
      box.appendChild(el("div", "prog-head-l", h.label));
      box.appendChild(el("div", "prog-trend", trendOf(h.trend)));
      heads.appendChild(box);
    }
    body.appendChild(heads);

    const sec = (label, ...nodes) => {
      body.appendChild(el("span", "seg-label", label));
      for (const n of nodes) body.appendChild(n);
    };
    sec("New words", el("p", null,
      d.newWords.length ? d.newWords.map((w) => w.name).join(", ") : "—"));
    sec("Top words", el("p", null,
      d.topWords.map((t) => `${t.name} (${t.taps})`).join(", ") || "—"));
    const cls = el("p", null,
      `Core ${d.core} · fringe ${d.fringe} · own words ${d.own} — ` +
      `Smart bar picked ${Math.round(d.stripShare * 100)}% of taps`);
    sec("Kinds of words", cls);
    const peakHour = d.hours.indexOf(Math.max(...d.hours));
    const peakDow = d.dows.indexOf(Math.max(...d.dows));
    sec("When", el("p", null,
      `Most taps around ${peakHour}:00 · ${DOWS[peakDow]}s`));
    if (d.goals.length) {
      const box = el("div");
      for (const g of d.goals) {
        box.appendChild(el("p", "prog-goal-name", g.name));
        const sums = {};
        for (const targets of Object.values(g.weeks)) {
          for (const [key, t] of Object.entries(targets)) {
            const s = (sums[key] ??= { own: 0, glow: 0 });
            s.own += t.own; s.glow += t.glow;
          }
        }
        for (const [key, s] of Object.entries(sums)) {
          box.appendChild(el("p", null,
            `${nameOf(...key.split(":")) ?? key.split(":")[1]} — on their own ${s.own} · with the glow ${s.glow}`));
        }
      }
      sec("Goal words", box);
    }
    // 032 E4: the move Spotlight teaches — two words, then a button.
    if (Object.keys(d.buttons.total).length) {
      const box = el("div");
      for (const [mode, label] of Object.entries(BUTTON_NAMES)) {
        const t = d.buttons.total[mode];
        if (!t) continue;
        const trend = d.weeks.map((w) => d.buttons.weeks[w.week]?.[mode]?.own ?? 0).join(" → ");
        box.appendChild(withIcons(el("p"),
          `${label} — on their own ${t.own} · with the glow ${t.glow} · on their own by week: ${trend}`));
      }
      sec("Sentence buttons", box);
    }
    const weeks = el("div");
    for (const w of d.weeks) {
      weeks.appendChild(el("p", null,
        `w/c ${dayLabel(w.week * 7)}: ${w.words} words, ${w.different} different, ` +
        `mean sentence ${fmt(w.wordsPerSentence)}, wpm ${fmt(w.wpm)}`));
    }
    sec("By week", weeks);
  }

  $("prog-range").addEventListener("click", (e) => {
    const v = e.target.dataset?.v;
    if (!v) return;
    span = v;
    for (const b of $("prog-range").children) b.classList.toggle("on", b === e.target);
    render();
  });
  $("prog-mode").addEventListener("click", (e) => {
    const v = e.target.dataset?.v;
    if (!v) return;
    mode = v;
    localStorage.setItem(`pip_dash_mode:${me.id}`, v);
    for (const b of $("prog-mode").children) b.classList.toggle("on", b === e.target);
    render();
  });
  for (const b of $("prog-mode").children) b.classList.toggle("on", b.dataset.v === mode);
  for (const b of $("prog-range").children) b.classList.toggle("on", b.dataset.v === span);

  $("prog-share").addEventListener("click", async () => {
    const { fromDay, toDay } = current ?? rangeFor(span);
    const label = (day) => new Date(day * 86400000).toLocaleDateString();
    const { pdf } = reportPdf(db, fromDay, toDay,
      { userName: me.name || "This user", fromLabel: label(fromDay), toLabel: label(toDay) },
      nameOf, mode);
    const file = new File([pdf], `pip-progress-${label(toDay).replaceAll("/", "-")}.pdf`,
      { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Pip progress" }).catch(() => {});
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    }
  });

  $("open-progress").addEventListener("click", () => { open("progress"); render(); });
}
