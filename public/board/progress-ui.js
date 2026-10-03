/**
 * The Progress page (016 slice 4, Stats_And_Progress § 4; design
 * approved 2026-10-02, public/preview-progress.html).
 *
 * Settings → Progress draws straight into its page — no overlay. A
 * Lifetime user's supporters get the full dashboard; everyone else gets
 * the weekly win card and one way in (§ 4.1) with no control that does
 * nothing. A missing license hides the dashboard, never a word.
 * Numbers are computed in shared/dashboard.mjs and shared/wincard.mjs
 * from stats_day; this module only draws them. No norms, no
 * comparisons, no judging colors — a trend is the user's own periods.
 */
import { WEEK_DAYS, dashboard, firstTapDay, rangeFor } from "../shared/dashboard.mjs";
import { weeklyCard } from "../shared/wincard.mjs";
import { mountReportShare } from "./report-share.js";
import { columns, ownGlowBars, sparkline } from "./progress-charts.js";
import { withIcons } from "./inline-icons.js";
import { barControls } from "../shared/bar.mjs";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const fmt = (n) => (n == null ? "—" : Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));
const DAY = 86_400_000;
const dayLabel = (day) => new Date(day * DAY).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });
const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const HOUR = (h) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
const BUTTON_NAMES = { fix: "✨ fix it", question: "❓ ask it", past: "⏪ past", future: "⏩ future" };
const NEW_SHOWN = 12;
const TOP_SHOWN = 8;

export function mountProgress({ db, me, nameOf, roleOf = () => "None", artOf = async () => null, entitlement, settings }) {
  let span = "month";
  let mode = localStorage.getItem(`pip_dash_mode:${me.id}`) ?? "symbol";
  let current = null; // {fromDay, toDay} of the rendered view
  let showAllNew = false;
  let charts = []; // column charts draw once their box has a width
  const who = () => me.name || "this person";
  const whose = () => (me.name ? `${me.name}'s` : "this person's");

  /** A word as the board draws it: its grammar color, label and
   *  picture. `pic` is the board's tile (label strip over the art);
   *  otherwise a chip with a small icon. The picture arrives async and
   *  a word without one keeps its label. */
  const tile = (key, cls = "") => {
    const [kind, id] = key.split(":");
    const t = el("span", `prog-tile r-${roleOf(kind, id) ?? "None"} ${cls}`.trim());
    const label = nameOf(kind, id) ?? id;
    const img = el("img");
    img.alt = "";
    if (cls.split(" ").includes("pic")) {
      const art = el("span", "pt-a");
      art.append(img);
      t.append(el("span", "pt-l", label), art);
    } else {
      img.hidden = true;
      t.append(img, label);
    }
    artOf(kind, id).then((a) => {
      if (!a) return;
      img.src = a.url;
      img.hidden = false;
      if (a.photo) t.classList.add("photo");
    }).catch(() => {});
    return t;
  };

  async function render() {
    const body = $("prog-body");
    body.replaceChildren();
    const life = (await entitlement().catch(() => null)) === "lifetime";
    for (const id of ["prog-range", "prog-share", "prog-foot"]) $(id).hidden = !life;
    share.close();
    if (!life) return renderFree(body);

    const range = rangeFor(span);
    current = range;
    $("prog-sub").textContent =
      `${me.name || "This person"} · ${dayLabel(range.fromDay)} – ${dayLabel(range.toDay)} · from ${whose()} own taps`;
    const d = dashboard(db, range.fromDay, range.toDay, { nameOf, mode });
    if (!d.words) {
      const box = el("div", "prog-card prog-empty");
      box.append(el("b", null, "No taps in this range yet"),
        el("p", "hint", `Pip counts from ${whose()} first tap on the board.`));
      body.append(box);
      return;
    }
    charts = [];
    body.append(heads(d), cards(d));
    for (const draw of charts) draw();
  }

  /** A column chart sized to its box: SVG text then renders at its
   *  real size instead of scaling with the card. */
  function columnsInto(box, values, labels, opts) {
    const holder = el("div");
    box.append(holder);
    charts.push(() => { holder.innerHTML = columns(values, labels, { ...opts, width: holder.clientWidth || 320 }); });
  }

  /* ---------------- free: the win card, then one way in ---------------- */

  function renderFree(body) {
    $("prog-sub").textContent = `${me.name || "This person"} · this week`;
    const card = weeklyCard(db, Date.now(), nameOf);
    if (card.empty) {
      body.append(el("p", "hint", "No words tapped this week yet."));
    } else {
      // Wins only (§ 4.1): the third figure is the longest sentence once
      // there is one worth naming, else the week's new words, else none.
      const third = card.longest >= 2 ? [card.longest, "longest sentence"]
        : card.newCount ? [card.newCount, card.newCount === 1 ? "new word" : "new words"] : null;
      const stats = el("div", "prog-stats3");
      for (const [n, l] of [[card.words, card.words === 1 ? "word" : "words"],
        [card.different, "different"], ...(third ? [third] : [])]) {
        const s = el("div", "prog-stat");
        s.append(el("span", "prog-stat-n", fmt(n)), el("span", "prog-stat-l", l));
        stats.append(s);
      }
      const wins = el("div", "prog-wins");
      for (const w of card.items) wins.append(winLine(w));
      body.append(stats, wins);
    }

    const offer = el("div", "prog-offer");
    const first = firstTapDay(db);
    if (first != null) {
      const today = rangeFor("week").toDay;
      const days = today - first + 1;
      const counted = days >= 2 * WEEK_DAYS
        ? `${Math.floor(days / WEEK_DAYS)} weeks`
        : `${days} day${days === 1 ? "" : "s"}`;
      offer.append(el("p", "prog-hook", `Pip has counted ${counted} of ${whose()} words.`));
    }
    offer.append(ghost());
    const ticks = el("ul", "prog-ticks");
    for (const t of [
      "Every week as a chart, back to the first tap",
      "Goal words: said on their own, and with the glow",
      "Every new word, with the day it was first said",
      "A PDF report for school and therapy meetings",
      "Every supporter sees it: both parents, the SLP, teachers",
    ]) ticks.append(el("li", null, t));
    offer.append(ticks);
    const cta = el("div", "prog-cta");
    const buy = el("button", "btn", "Get Pip Lifetime · $49 once");
    buy.id = "prog-buy";
    // 040 § 7: one destination — the Lifetime page owns Buy (the
    // no-account code checkout, the code field's door), so every
    // locked state ends in the same place.
    buy.onclick = () => settings.show("lifetime", { focus: true });
    cta.append(buy, el("p", "hint", `For ${who()}. No subscription.`));
    offer.append(cta);
    body.append(offer);
  }

  function winLine(w) {
    const line = el("p", "prog-win");
    line.append(el("span", "prog-star", "★"));
    if (w.kind === "first") {
      line.append(el("span", null, "First time:"));
      for (const k of w.keys) line.append(tile(k, "sm"));
      if (w.more) line.append(el("span", null, `and ${w.more} more`));
    } else if (w.kind === "favorite") {
      line.append(el("span", null, "Favorite this week:"), tile(w.keys[0], "sm"));
    } else {
      line.append(el("span", null, w.text));
    }
    return line;
  }

  /** A drawing of the dashboard with no numbers in it, plainly locked —
   *  never the user's real data, never tappable. */
  function ghost() {
    const g = el("div", "prog-ghost");
    g.setAttribute("aria-hidden", "true");
    g.innerHTML = `
      <div class="pg-card"><i style="width:40%"></i><svg viewBox="0 0 100 26" preserveAspectRatio="none"><polyline points="0,22 15,20 30,21 45,15 60,13 75,9 90,7 100,4"/></svg></div>
      <div class="pg-card"><i style="width:55%"></i><svg viewBox="0 0 100 26" preserveAspectRatio="none"><g>${
        [10, 14, 12, 17, 18, 21, 23].map((h, i) => `<rect x="${2 + i * 13.5}" y="${26 - h}" width="9" height="${h}" rx="2"/>`).join("")
      }</g></svg></div>
      <div class="pg-card pg-wide"><i style="width:30%"></i><div class="pg-chips"><b></b><b></b><b></b><b></b></div></div>
      <div class="pg-lock"><span>Pip Lifetime</span></div>`;
    return g;
  }

  /* ---------------- Lifetime: the dashboard ---------------- */

  function periodsOf(d) {
    const byDay = d.by === "day";
    const list = byDay ? d.days : d.weeks;
    const label = (p) => byDay ? dayLabel(p.day) : `Week of ${dayLabel(Math.max(p.week * WEEK_DAYS, d.fromDay))}`;
    return { list, labels: list.map(label), byDay };
  }

  function heads(d) {
    const { labels, byDay } = periodsOf(d);
    const row = el("div", "prog-heads");
    for (const h of d.headline) {
      const box = el("div", "prog-head");
      box.append(el("span", "prog-head-n", fmt(h.value)),
        el("span", "prog-head-l", h.label));
      const points = h.trend.filter((v) => v != null).length;
      if (points >= 2) {
        const chart = el("div", "prog-spark");
        chart.innerHTML = sparkline(h.trend, labels, `${h.label} by ${byDay ? "day" : "week"}`);
        const ends = el("span", "prog-head-t");
        const firstI = h.trend.findIndex((v) => v != null);
        // The last period is still running: "so far", so a half-done
        // week never reads as a drop.
        ends.append(el("span", null, `${labels[firstI].replace("Week of ", "")}: ${fmt(h.trend[firstI])}`),
          el("span", null, `${byDay ? "today so far" : "this week so far"}: ${fmt(h.trend.at(-1))}`));
        box.append(chart, ends);
      } else {
        box.append(el("span", "prog-head-t", byDay ? "Trend starts tomorrow" : "Trend starts next week"));
      }
      row.append(box);
    }
    return row;
  }

  function card(title, meta, { wide = false, id } = {}) {
    const c = el("section", `prog-card${wide ? " wide" : ""}`);
    if (id) c.id = id;
    const h = el("div", "prog-card-h");
    h.append(el("h3", null, title));
    if (meta) h.append(el("span", "prog-meta", meta));
    c.append(h);
    return c;
  }

  function legend() {
    const l = el("div", "prog-legend");
    l.innerHTML = '<span><i class="lg-own"></i>On their own</span><span><i class="lg-glow"></i>With the glow</span>';
    return l;
  }

  function cards(d) {
    const grid = el("div", "prog-cards");
    grid.append(goalCard(d), newCard(d), sentenceCard(d), topCard(d), kindsCard(d), whenCard(d), tableCard(d));
    return grid;
  }

  function goalCard(d) {
    const c = card("Goal words", null, { wide: true, id: "prog-goals" });
    const weeks = d.weeks.map((w) => w.week);
    const labels = weeks.map((w) => `Week of ${dayLabel(Math.max(w * WEEK_DAYS, d.fromDay))}`);
    if (!d.goals.length) {
      const empty = el("div", "prog-goal-empty");
      const go = el("button", "btn secondary", "Track a Spotlight list");
      go.onclick = () => settings.show("spotlight", { focus: true });
      empty.append(el("p", "hint", "No goal words yet."), go);
      c.append(empty);
    } else {
      c.append(legend());
      const rows = d.goals.map((g) => ({
        name: g.name,
        targets: g.targets.map((key) => {
          const own = weeks.map((w) => g.weeks[w]?.[key]?.own ?? 0);
          const glow = weeks.map((w) => g.weeks[w]?.[key]?.glow ?? 0);
          return { key, own, glow };
        }),
      }));
      const max = Math.max(1, ...rows.flatMap((g) => g.targets.flatMap((t) => t.own.map((o, i) => o + t.glow[i]))));
      for (const g of rows) {
        c.append(el("p", "prog-goal-name", g.name));
        for (const t of g.targets) c.append(ogRow(tile(t.key, "pic"), t.own, t.glow, max, labels));
      }
    }
    // 038: Progress counts only the buttons the person's bar shows.
    const shownBar = barControls(db);
    const presses = Object.entries(BUTTON_NAMES)
      .filter(([m]) => d.buttons.total[m] && shownBar.has(m));
    if (presses.length) {
      const h = el("div", "prog-card-h prog-sub-h");
      h.append(el("h3", null, "Sentence buttons"));
      c.append(h);
      if (!d.goals.length) c.append(legend());
      const series = presses.map(([m, label]) => ({
        label,
        own: weeks.map((w) => d.buttons.weeks[w]?.[m]?.own ?? 0),
        glow: weeks.map((w) => d.buttons.weeks[w]?.[m]?.glow ?? 0),
      }));
      const max = Math.max(1, ...series.flatMap((s) => s.own.map((o, i) => o + s.glow[i])));
      for (const s of series) {
        c.append(ogRow(withIcons(el("span", "prog-tile r-None sm prog-btn-tile"), s.label), s.own, s.glow, max, labels));
      }
    }
    return c;
  }

  /** One target's row: its tile, weekly own-vs-glow bars, and totals. */
  function ogRow(label, own, glow, max, labels) {
    const row = el("div", "prog-og");
    const lab = el("span", "prog-og-l");
    lab.append(label);
    const chart = el("div", "prog-og-c");
    const name = label.textContent;
    chart.innerHTML = ownGlowBars(own, glow, max, labels,
      `${name}: on their own ${sum(own)}, with the glow ${sum(glow)}`);
    const tot = el("span", "prog-og-s");
    tot.append(el("b", null, String(own.at(-1) ?? 0)), " on their own this week",
      el("br"), `${sum(own)} own · ${sum(glow)} with the glow`);
    row.append(lab, chart, tot);
    return row;
  }

  function newCard(d) {
    const n = d.newWords.length;
    const c = card("New words", n ? `${n} first said in this range` : null);
    if (!n) { c.append(el("p", "hint", "No new words in this range.")); return c; }
    const box = el("div", "prog-new");
    const shown = showAllNew ? d.newWords : d.newWords.slice(0, NEW_SHOWN);
    for (const w of shown) {
      const t = el("span", "prog-new-w");
      t.append(tile(w.key, "pic"), el("small", null, dayLabel(w.day)));
      box.append(t);
    }
    if (n > shown.length) {
      const more = el("button", "prog-more", `+${n - shown.length} more`);
      more.onclick = () => { showAllNew = true; render(); };
      box.append(more);
    }
    c.append(box);
    return c;
  }

  function sentenceCard(d) {
    const { list, labels, byDay } = periodsOf(d);
    const c = card("Sentences", d.longest ? `longest: ${d.longest} word${d.longest === 1 ? "" : "s"}` : null);
    const vals = list.map((p) => p.wordsPerSentence);
    if (!vals.some((v) => v != null)) { c.append(el("p", "hint", "No spoken sentences in this range.")); return c; }
    c.append(el("p", "hint", `Words per sentence, by ${byDay ? "day" : "week"}`));
    const top = Math.ceil(Math.max(...vals.filter((v) => v != null)));
    const chart = el("div", "prog-chart");
    columnsInto(chart, vals, labels.map((l) => l.replace("Week of ", "")), {
      every: Math.max(1, Math.ceil(vals.length / 4)), highlight: vals.length - 1,
      ticks: Array.from({ length: top }, (_, i) => i + 1).filter((t) => top <= 4 || t % 2 === 0),
      unit: " words per sentence", aria: "Words per sentence by period",
    });
    c.append(chart);
    return c;
  }

  function topCard(d) {
    const c = card("Most-used words", "taps");
    const top = d.topWords.slice(0, TOP_SHOWN);
    const max = top[0]?.taps ?? 1;
    const list = el("div", "prog-hbars");
    for (const t of top) {
      const row = el("div", "prog-hbar");
      const fill = el("span", "prog-hbar-f");
      fill.style.width = `${((t.taps / max) * 100).toFixed(1)}%`;
      const track = el("span", "prog-hbar-t");
      track.append(fill);
      const lab = el("span", "prog-hbar-l");
      lab.append(tile(t.key, "sm"));
      row.append(lab, track, el("span", "prog-hbar-v", fmt(t.taps)));
      list.append(row);
    }
    c.append(list);
    return c;
  }

  function kindsCard(d) {
    const total = d.core + d.fringe + d.own;
    const c = card("Kinds of words", `${fmt(total)} taps`);
    const parts = [["Core", d.core, "k-core"], ["Fringe", d.fringe, "k-fringe"], ["Own words", d.own, "k-own"]];
    const bar = el("div", "prog-kinds");
    const key = el("div", "prog-kinds-key");
    for (const [label, n, cls] of parts) {
      if (n) {
        const seg = el("span", cls);
        seg.style.flex = String(n);
        seg.title = `${label}: ${n} taps`;
        bar.append(seg);
      }
      const k = el("div");
      k.append(el("b", null, total ? `${Math.round((n / total) * 100)}%` : "—"));
      const l = el("span");
      l.append(el("i", cls), label);
      k.append(l);
      key.append(k);
    }
    c.append(bar, key, el("p", "hint", `Smart bar picked ${Math.round(d.stripShare * 100)}% of taps.`));
    return c;
  }

  function whenCard(d) {
    const peakHour = d.hours.indexOf(Math.max(...d.hours));
    const peakDow = d.dows.indexOf(Math.max(...d.dows));
    const c = card("When", `most taps around ${HOUR(peakHour).replace("a", " am").replace("p", " pm")} · ${DOW_NAMES[peakDow]}`, { wide: true });
    const two = el("div", "prog-when");
    const h = el("div", "prog-chart");
    h.append(el("p", "hint", "By hour"));
    columnsInto(h, d.hours, d.hours.map((_, i) => HOUR(i)), { every: 3, unit: " taps", aria: "Taps by hour" });
    const w = el("div", "prog-chart");
    w.append(el("p", "hint", "By day"));
    columnsInto(w, d.dows, DOWS, { unit: " taps", aria: "Taps by day of week" });
    two.append(h, w);
    c.append(two);
    return c;
  }

  function tableCard(d) {
    const c = card("Week by week", null, { wide: true });
    const wrap = el("div", "prog-table");
    const t = el("table");
    const head = el("tr");
    for (const h of ["Week of", "Words", "Different", "Words per sentence", "Longest", "Words per minute"]) head.append(el("th", null, h));
    t.append(head);
    for (const w of [...d.weeks].reverse()) {
      const r = el("tr");
      for (const v of [dayLabel(Math.max(w.week * WEEK_DAYS, d.fromDay)), fmt(w.words), fmt(w.different),
        fmt(w.wordsPerSentence), w.longest ? fmt(w.longest) : "—", fmt(w.wpm)]) r.append(el("td", null, v));
      t.append(r);
    }
    wrap.append(t);
    c.append(wrap);
    return c;
  }

  /* ---------------- controls ---------------- */

  $("prog-range").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (!v) return;
    span = v;
    showAllNew = false;
    for (const b of $("prog-range").children) b.classList.toggle("on", b.dataset.v === v);
    render();
  });
  $("prog-mode").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (!v) return;
    mode = v;
    localStorage.setItem(`pip_dash_mode:${me.id}`, v);
    for (const b of $("prog-mode").children) b.classList.toggle("on", b.dataset.v === mode);
    render();
  });
  for (const b of $("prog-mode").children) b.classList.toggle("on", b.dataset.v === mode);
  for (const b of $("prog-range").children) b.classList.toggle("on", b.dataset.v === span);

  const share = mountReportShare({
    db, me, nameOf, roleOf, artOf,
    range: () => current ?? rangeFor(span),
    mode: () => mode,
  });

  settings.onShow((id) => { if (id === "progress") render(); });
  return { render };
}

const sum = (a) => a.reduce((n, v) => n + v, 0);
