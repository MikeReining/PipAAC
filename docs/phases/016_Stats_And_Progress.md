# Phase 016 — Stats and progress

**Status:** Executing. Slice 0 (rulings) done 2026-09-23. Next: slice 1,
after 015 slice 2 (one database per user).

**Direction DECIDED 2026-09-23** (founder). Product owner:
`docs/product/Stats_And_Progress.md`. Intake:
`docs/founder/2026-09-23_Accounts_And_Pricing.md` § Rulings 16–19.

This phase touches privacy (daily totals to supporters, anonymous totals
to Pip) and billing (the dashboard gate). The founder ruled on all three
(2026-09-23). Any change to what is sent stops the phase for a new
founder call.

| Topic | Owner |
| --- | --- |
| Definitions, who sees what, what is sent, bans | `docs/product/Stats_And_Progress.md` |
| The tap log and sentences | `docs/product/Language_And_Voice_Schema.md` § 6.2c–6.2e |
| What stays on the device | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 4.1 |
| Sync and the user key | `docs/product/Sync_And_Web_Editing.md` § 2, § 12 |
| The Lifetime gate | `docs/product/Pricing_And_Packaging.md` § 4.2 |
| Goal lists | `docs/phases/013_Spotlight_And_Partner_Modeling.md` |

## Depends on

- 015 slice 2 (one database per user): stats are per user.
- 015 slice 4 (supporter accounts): slice 3 here syncs to supporters.
- 015 slice 6 (the license): slice 4 here gates on it.
- 013 slice 2 (Spotlight lists, built): slice 5 here makes them goals.

## Build order

```text
1 stats engine ─▶ 2 win card ─▶ 3 totals to supporters ─▶ 4 dashboard + report
      │                                                   ▲
      └──────────────▶ 5 goal words ─────────────────────┘
      └──────────────▶ 6 anonymous totals
```

---

## Slice 0 — Founder rulings (done 2026-09-23)

The SLP's laptop gets the stats (daily totals, sealed, to every
supporter); anonymous totals on by default with the whitelist; a free
weekly win card as the dashboard's preview; the full dashboard and
report are Pip Lifetime. Routed to `docs/product/Stats_And_Progress.md`.

## Slice 1 — The stats engine, on the device

Goal: one pure module computes every number in
`docs/product/Stats_And_Progress.md` § 3 from the tap log and sentences,
and writes one **daily totals** row per day.

Scope:
- `learner_event_log` gains `spotlit` (0/1): whether a Spotlight glow
  was on for that tap. `logSelection` (`public/shared/funnel.mjs:62`)
  takes it in `ctx`; the pick path in `public/board.js` passes it.
- A new module (proposed `public/shared/stats.mjs`) with one function per
  definition, plus `dailyTotals(db, day)` → a `stats_day` row: counts per
  word, sentence-length counts, words-per-minute inputs, source counts,
  spotlit counts, taps per hour. Counts only: no times, no sequences.
- Totals are recomputed for today and yesterday on each boot and after
  each spoken sentence (debounced). Older days are fixed.

Truth owner: `docs/product/Stats_And_Progress.md` § 3.

Works Test: a fixture of scripted taps over 3 days with known times
(including a cleared sentence, a backspace, Smart bar picks, a glow
window, and a single-word sentence). Every stat equals a value computed
by hand in the test file, not by the module. A stat that reads anything
but the log and sentences fails a grep-free check: the module is called
with a database holding only those tables.

## Slice 2 — The weekly win card (free)

Goal: every user gets a weekly card of wins on the device.

Scope: rules that pick up to three wins from the week's totals
(different words, a new word, longest sentence, a streak, the top word);
the card in the Parent Corner and as a once-a-week note; the Lifetime
line at the bottom. Copy never states a decrease.

Works Test: 12 fixture weeks, including falling ones. Every card shows
1–3 wins; no card states a drop; a first-ever word appears as "First
time". Owner-visible: on a real iPad after a week of use, the card shows
numbers that match slice 1's totals.

## Slice 3 — Daily totals to supporters

Goal: the SLP's laptop and every supporter's device show the same
numbers as the child's iPad.

Scope: `stats_day` rows sealed with the user key and synced like other
user data. Per device and day, last write wins. Proposed transport: the
op log (`put_stats_day`) or its own sealed record; decide in the slice
by what keeps replay cheap. Totals from several own devices add up per
word.

Works Test: the child's client taps a scripted week. The supporter
client, signed in on another browser, shows identical totals. Every
captured relay payload is scanned: none decrypts to a word sequence, a
tap time, or a `sentence` / `learner_event_log` row, and the relay
stores only sealed bytes.

## Slice 4 — The dashboard and the report (Pip Lifetime)

Goal: the full dashboard for every supporter of a Lifetime user, and a
one-tap PDF report.

Scope: one screen (three headline numbers with weekly trend; new words;
top words; core/fringe/own; Smart bar help; when; goal words); headline
by presentation mode; a date range; **Share report** through the system
share sheet. Free users see the win card and the offer instead.

Works Test:
1. A Lifetime user's supporter sees the dashboard; a free user's
   supporter sees the win card and the offer.
2. The report for a fixture month contains the hand-computed numbers
   from slice 1's fixture.
3. With the license missing and the relay down, every word still speaks.
4. No screen shows another user's data or a norm.

## Slice 5 — Goal words

Goal: a Spotlight list can be marked as a goal; the dashboard shows each
target word on the child's own vs with the glow, by week.

Works Test: a goal list of *more, help, stop*. A scripted week with a
glow on Monday and none after: Monday's taps count as "with the glow",
the rest as "on their own", matching hand-computed values. Taps a
partner makes on a linked phone add nothing.

## Slice 6 — Anonymous totals to Pip

Goal: "Help improve Pip", on by default, sends the whitelisted daily
totals of `docs/product/Stats_And_Progress.md` § 6.3.

Scope: the synced setting; a random research id per user, separate from
the user id; a Worker endpoint that accepts only the whitelisted fields
and rejects anything else; storage (proposed: Workers Analytics Engine or
D1, decided in the slice).

Works Test: with the setting on, capture a scripted week's research
requests: every field is on the whitelist; no own-word name, entity id,
user id, device id or photo hash appears; the Worker rejects a payload
with an extra field. With the setting off, no research request is made.

## Out of scope

Automatic tagging of communicative functions (requesting, commenting,
protesting). Comparisons with other users or norms (banned). Organization
reports for schools and clinics. Publishing claims (only after measured
data exists).
