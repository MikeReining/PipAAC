# Stats and progress

**DECIDED 2026-09-23** (founder; not built). Intake:
`docs/founder/2026-09-23_Accounts_And_Pricing.md` § Rulings 16–19.
Execution: `docs/phases/016_Stats_And_Progress.md`. Price gate:
`docs/product/Pricing_And_Packaging.md` § 4.2. SLP channel:
`docs/strategy/SLP_Channel.md`.

---

## 1. What it is for

1. **SLPs need evidence.** School goal plans (IEPs) are written and
   reviewed against numbers: different words, words per sentence, new
   words, target words used without help.
2. **Parents need to know it is working.** "Is my child getting better?"
   is the question no competitor answers.
3. **Adult users need speed.** For a literate adult (ALS, stroke), words
   per minute is the number that matters.
4. **Pip needs proof.** Measured, anonymous totals let us publish what
   Pip does for people, and show where the grid and prediction fail.

Competitors (2026-09-23): PRC-Saltillo's Realize Language (\$9.95 a
year, logging off by default, uploads to a website), TD Snap usage
reports (button and message counts, modeling counts, Excel export),
CoughDrop reports (word counts, parts of speech, time of day, core vs
fringe; every button press to the cloud). All give raw counts, send
every tap to a server, and leave the SLP to turn counts into goal
evidence.

## 2. The instrument: the child's own taps

Every stat is computed from the child's own taps, recorded on the
child's device. Nothing in the app can grade itself: the ranker, the
Smart bar and Spotlight never write the log; they only appear in it as
the `source` of a tap the child made.

**BUILT** today:
- Every tap that speaks a word is logged with its time, sentence,
  position and source (`grid`, `strip`, `group`, `keyboard`):
  `logSelection` (`public/shared/funnel.mjs:62`), called from the pick
  path in `public/board.js`.
- A sentence opens on its first pick and closes `spoken` or `cleared`
  (`openSentence` `public/shared/funnel.mjs:36`, `closeSentence`
  `public/shared/funnel.mjs:44`).

The tap also carries `spotlit` (1 while the Spotlight glow was active)
— stamped at write time, since the session row is overwritten per
session.

Adults who model from their own phone (013's partner modeling) never
touch the child's log, so modeling cannot inflate the child's numbers.

## 3. The numbers

Every number has one definition, computed the same way on every device.

| Stat | Definition |
| --- | --- |
| **Words** | Logged taps in the period (each tap speaks its word) |
| **Different words** | Distinct words (built-in or own) tapped in the period |
| **New words** | Words tapped for the first time ever in the period |
| **Words per sentence** | Mean words in sentences that ended `spoken`; plus the longest |
| **Words per minute** | Words ÷ minutes from first tap to Speak, over spoken sentences of 2+ words; the daily median and quartiles |
| **Time between picks** | Pick-to-pick ms inside a sentence, by the second pick's path (Smart bar, home grid, group, typed); daily median and quartiles per path |
| **Core / fringe / own** | Share of taps on root-core words, other built-in words, and the family's own words |
| **Smart bar help** | Share of taps with source `strip` |
| **Goal words** | For each word on a goal list (a Spotlight list, § 5): taps **on their own** (no glow) vs **with the glow** |
| **Sentence buttons** | Presses of ✨ ❓ ⏪ ⏩ on a bar with words, by button: **on their own** vs **while the button glowed** in a Spotlight, by week (032 E4). Not counted: the first-run tour, Try it, ▶ returning to present, feeling faces |
| **When** | Taps by hour of day and day of week |
| **Top words** | The most-tapped words in the period |

**Words per minute, honestly.** Published research puts aided AAC at
roughly 3–20 words per minute, against 125–185 for speech. We measure it
and publish only what we measure. For a young child it is the wrong
headline; for a literate adult it is the right one (§ 4).

## 4. Who sees what

### 4.1 The weekly win card (free, every user)

A preview of the dashboard. Once a week, every supporter and the user's
own device can see a card of **wins**, for example: "This week: 142
words, 38 different, longest sentence 4 words", "First time: *help*".

- Wins only. A quieter week shows the most-used word or a streak, never
  a drop.
- The card ends with the way in: "See all of Maya's progress with Pip
  Lifetime."

**BUILT 2026-09-25** — `public/shared/wincard.mjs` (rules) +
`public/board/wincard-ui.js` (Parent Corner card + once-a-week note).
Wins are absolute-only by construction — no rule compares weeks.

### 4.2 The dashboard and the report (Pip Lifetime)

For a Lifetime user, every supporter sees the full dashboard:

- **One screen:** three headline numbers with their trend over weeks,
  then new words, top words, core/fringe/own, Smart bar help, when, and
  goal words.
- **Headline by person:** for a user in Label-Only mode
  (`docs/product/Profile_Presentation_Modes.md`) words per minute
  leads; otherwise different words and words per sentence lead. A
  supporter can change it.
- **A one-tap progress report** (PDF) for a date range, for an IEP
  meeting: the numbers, the trends, goal words, and the date range.
  Shared from the device, through the system share sheet.

BUILT: Parent Corner → Progress (`public/board/progress-ui.js` +
`public/shared/dashboard.mjs` + `report.mjs`). Aggregation reads
`stats_day` only — the raw tap log and sentence table are never
opened. The headline toggle is a supporter preference stored per user
(`pip_dash_mode:<user>`), separate from the child's presentation mode.
Share report produces a real PDF via `navigator.share` with a download
fallback. A missing or unreachable relay resolves to the free view —
the win card and the offer — and never touches the board.

### 4.3 Never

- Never a comparison with other children, a percentile, or a "behind"
  label. Progress is against the person's own past
  (defaults plus parent/SLP judgment, not norms).
- Never a gate on speaking. A lapsed or missing license hides the
  dashboard, never a word.

## 5. Goals are Spotlight lists

A supporter marks a Spotlight list (`docs/product/Design_System.md` § Attention layer)
as a **goal**. The dashboard then shows each target word used on the
child's own vs with the glow, week by week. "Uses *more* on their own 5
times a day" becomes a number the app produces, not a tally sheet.

**BUILT 2026-09-25** — `spotlight_list.is_goal` (Goal toggle in the
Spotlight sheet, synced via `spot_list_goal`) + `goalWords(db, from,
to)` in `public/shared/spotlight.mjs`: per-target `{own, glow}` per
week from `stats_day`. The dashboard surface itself is slice 4.

## 6. Where the data lives

### 6.1 On the child's device

The event log, sentences and strip impressions stay on the device. They
never sync and are never sent (`docs/strategy/Dual_Engine_Predictive_Intelligence.md`
§ 4.1).

**BUILT 2026-09-25** — the on-device engine: `learner_event_log` (with
`spotlit`), `sentence`, `transform_event` (sentence-button presses,
032 E4), and `core_cell` feed `public/shared/stats.mjs`
→ one `stats_day` JSON row per local day, recomputed for today and
yesterday on boot and after each spoken sentence
(`src/board/stats.test.mjs`).

### 6.2 Daily totals to the support team

**DECIDED 2026-09-23** (founder: "they are on the support team; they got
the QR code"). Each of the user's devices computes a **daily totals**
row per day: counts per word, sentence-length counts, rate numbers,
source counts, goal-word counts, sentence-button counts, taps per hour.
It is sealed with the
user key and synced like any other user data, so every supporter's
device (the SLP's laptop included) shows the same numbers. The relay
cannot read it. Per-word counts make totals from several devices add up
exactly.

No sentence, no sequence of words and no tap time leave the device;
daily totals carry counts only.

**BUILT 2026-09-25** — `stats_day` rows are `(day, device_id)` and sync
via the `put_stats_day` op (emitted only on change; replay lands under
the originating device). Heavy proof: `relay.heavy.test.mjs` slice-3
leg — sealed in transit, counts only after decrypt, per-device totals
add up.

### 6.3 Anonymous totals to Pip

**DECIDED 2026-09-23** (founder: agreed, following the Jev sharing
pattern: on by default, one switch, a strict list).

- **Setting:** "Help improve Pip" per user, synced, **on by default**.
  Off means nothing is sent, ever.
- **Sent (daily, whitelist only):** built-in word ids with counts; the
  count of own-word taps (a number, never which words); sentence-length
  counts; words per minute (median and quartiles); time between picks
  per path (median and quartiles); Smart bar share; layout, Cells setting and
  presentation mode; days since the user started; app version; a random
  **research id** per user (not the user id, not a device id), so
  progress over time can be measured.
- **Never sent:** names, own words, photos, recordings, sentences or any
  sequence of words, tap times, the user id, or anything a supporter
  typed.
- **Used for:** the grid, the catalog and prediction; and published
  claims such as "new words in the first 90 days", only as measured.

BUILT 2026-09-25 — `learner_profile.share_research` is the synced
switch ("Help improve Pip" in Parent Corner). `public/shared/research.mjs`
posts each device-computed `stats_day` row once to `POST /research`;
`src/worker/research.js` validates by constructing a clean object from
the allowlist (extras → 400) and writes Analytics Engine datapoints on
the `RESEARCH` binding (`pip_research` dataset), indexed by the random
`res_*` id. Own-word taps report as a count only; tap times and sentence
sequences never leave the device. A schema rebuild re-posts a device's
days once — dedup on `(rid, day)` at query time.
- **DECIDED 2026-09-23** (founder: "our flywheel should be on"). The
  prediction flywheel adds anonymous 1–3-word counts of built-in words
  from spoken sentences, with no identifier at all, under this same
  switch. It amends "never … any sequence of words" above. Whitelist and
  tests: `docs/phases/017_Prediction_Hardening.md` step 26. Not built;
  this section and § 7 change in the commit that builds it.
- **DECIDED 2026-09-23** (founder). Speed numbers are added under the
  same switch: daily WPM median and quartiles, time between picks per
  path (strip, home grid, group, typed), the Jev-timing experiment's two
  medians and counts, and the wrong-pick count. Numbers only; no words,
  ids, or times of day. Spec:
  `docs/phases/017_Prediction_Hardening.md` step 28.
  **BUILT 2026-09-24** for WPM quartiles, per-path timings, the
  Jev-timing experiment, and the wrong-pick count: `wpmStats`,
  `pathTimes`, `jevTiming`, `wrongPicks` in `public/shared/stats.mjs`
  (payload keys `wpm_q1`/`wpm_q3`/`path_ms`/`jev_ms`/`wrong_n`), the
  `speed` block and `wrongPicks` in `predictionReport`, and the worker
  whitelist in lockstep (`src/board/speed.test.mjs`). Calibration
  (item 6) waits on real totals.

## 7. Bans

| Ban | Negative test |
| --- | --- |
| A sentence leaves the device | Capture every request during a scripted week of taps: no payload decrypts to a word sequence, a tap time, or a `sentence` / `learner_event_log` row |
| Research data identifies a family | Same capture with sharing on: no own-word name, entity id, user id, device id or photo hash in any research payload; with sharing off, no research request at all |
| Stats grade themselves | Stats computed from a fixture of known taps equal hand-computed values; no stat reads ranker or Jev output |
| Modeling inflates the child's numbers | Taps a partner makes on a linked phone add nothing to the child's totals |
| A win card shows a loss | Across fixtures with falling weeks, the card never states a decrease |
| The dashboard gates speech | With the license missing and the relay down, every word speaks; only the dashboard is hidden |
| Children are ranked | No screen or report shows another person's data or a norm |
