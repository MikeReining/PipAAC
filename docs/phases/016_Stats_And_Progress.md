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
| Goal lists | `docs/product/Design_System.md` § Attention layer |

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

**DONE 2026-09-25.** Built:

- `src/board/schema.sql` — `learner_event_log.spotlit` (0/1, default 0;
  `migrateSchema` rebuilds persisted DBs onto it) and `stats_day`
  (`day`, `computed_at`, `payload` JSON — counts only). `user_version` 11.
- `public/shared/funnel.mjs` — `logSelection` takes `ctx.spotlit`.
  `public/board.js` and `public/board/keyboard-ui.js` pass it from the
  live spotlight session (`spotlight().targets.has("kind:id")`) on every
  pick path — grid, strip, group, keyboard.
- `public/shared/stats.mjs` — one function per § 3 definition:
  `tapsOnDay`, `sentencesOnDay`, `newItemsOnDay`, `classifyTaps`
  (core/fringe/own via `core_cell`), `wpmStats` (median over spoken 2+
  word sentences; zero-duration samples skipped), `dailyTotals` → the
  day row (per-word counts keyed by `kind:id` — never text — with the
  spotlit split, sentence-length histogram, source counts, 24-hour
  buckets), `upsertStatsDay`, `refreshStatsDays`. Each event buckets
  into its **own** local day (`selected_at + tz_offset_min`), so travel
  and DST never move a tap.
- `public/board.js` — `refreshStatsDays(db)` on boot and a 2 s-debounced
  refresh after each spoken sentence; older days are never rewritten.

Works Test: `src/board/stats.test.mjs` — 6 tests against a database
holding ONLY `learner_event_log`, `sentence`, `core_cell`, `stats_day`
(the grep-free check: a read of any other table fails at SQLite). Three
scripted days with a cleared sentence, a detached (backspaced) pick,
strip/group/keyboard sources, a glow window, a single-word sentence,
and a travel tap under a different stored offset. Every assertion is a
hand-computed literal; the fixture caught a hand-arithmetic error in the
test itself (a first-seen word counted as "not new"). `check:fast` green.

Not built here (slices 2–6): the win card, supporter sync of
`stats_day`, the dashboard, goal lists, anonymous totals.

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

**DONE 2026-09-25.** Built:

- `public/shared/wincard.mjs` — `ensureStatsDays` (INSERT-only backfill;
  a written day is never rewritten), `weekAggregate` (per-word counts
  add across days, `first` flags collected), `streakOf` (measured back
  from the newest active day — a quiet today doesn't erase it),
  `pickWins` (≤ 3 wins: "First time: …", "Longest sentence: …", "N days
  in a row", "Favorite this week: …" — no rule compares weeks, so no
  card can state a drop), `weeklyCard` (rolling 7 local days; an empty
  week returns `empty` and the UI hides the card).
- `public/shared/stats.mjs` — day rows now flag first-ever words
  (`per_word[k].first`) so the card names them without re-reading the
  log.
- `public/board/wincard-ui.js` + `public/index.html` — the card at the
  top of Parent Corner and a once-a-week toast on boot (per user, keyed
  `pip_wincard:<id>`); the Lifetime line shows only for free users.
- `public/board.js` — mounts the card with a `nameOf` resolver over
  `label`/`personal_entity`, so the shared modules never touch those
  tables.

Works Test: `src/board/wincard.test.mjs` — 12 fixture weeks authored as
raw `stats_day` payloads (not written through stats.mjs, so the rules
are graded on data they never produced): falling, empty, single-tap,
glow-heavy, and streak-boundary weeks. Every card: 1–3 wins, no
decrease wording (regex-checked), "First time" verified verbatim, the
empty week hides. `check:fast` green. Owner-visible iPad leg deferred
to real use — the card reads only slice-1 rows, which the engine test
proves against the log.

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

**DONE 2026-09-25.** Built:

- `src/board/schema.sql` — `stats_day` keyed `(day, device_id)`: several
  of the user's own devices each write their own row, and totals add
  up per word (§ 6.2). `user_version` 12.
- `public/shared/stats.mjs` — `writeStatsDay` (raw per-device upsert,
  the replay path) and `upsertStatsDay` now emits a `put_stats_day` op
  **only when the day changed** — recomputing identical totals records
  nothing. Emission rides the existing op log, so sealing, ordering,
  and relay fan-out are the same path every edit already takes.
- `public/shared/ops.mjs` — `applyOp` case `put_stats_day` writes under
  the op's `device_id` (the originating device, not the local one).
  Fixed a real plumbing bug this exposed: `drainOps`' apply SELECTs
  dropped `device_id`, so every replayed op arrived as `dev_remote` —
  harmless until the first op needed attribution.
- `public/shared/wincard.mjs` — `weekAggregate` merges (day, device)
  rows into per-day words before streaking.

Works Test: `relay.heavy.test.mjs` leg 4 — A computes a day row from
real taps, submits, B drains to an identical row under A's device id;
B's row for the same day flows back; both coexist and add to the sum.
Scans: no item ids in the sealed relay stream; decrypted args carry no
`selected_at`, `sentence_id`, `ended_at`, `tz_offset`, or names.

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

**DONE 2026-09-25.** Built:

- `public/shared/dashboard.mjs` — pure aggregation over `stats_day`
  only: `rangeTotals` merges per-device rows into one totals object
  (per-word taps, first-seen keys, sources, hours, day-of-week, weekly
  buckets, weighted wpm), `headlines` picks the three lead numbers by
  presentation mode (Label-Only → wpm; otherwise different words and
  words per sentence), `dashboard` resolves names and goal splits.
- `public/shared/report.mjs` — a dependency-free PDF writer
  (`linesToPdf` ~40 lines of PDF syntax with proper text escaping) plus
  `reportLines`/`reportPdf`: the date range, headline counts, weekly
  trends, top/new words, core/fringe/own, Smart bar share, and goal
  lines.
- `public/board/progress-ui.js` — the Progress overlay in Parent
  Corner: range seg (week / month / 90 days), a headline-mode toggle a
  supporter can change (persisted per user), and **Share report** via
  `navigator.share` of a PDF `File`, falling back to a download. All
  names go in via textContent — no HTML injection.
- `public/index.html` — the overlay markup and styles; a Progress
  button in Parent Corner.
- `public/board.js` — mount wiring only; the label/entity name resolver
  and the relay entitlement lookup are shared with the win card.

Gate: `entitlement()` (the relay's `self.entitlement`) decides —
`"lifetime"` renders the dashboard and Share report; anything else
(including a relay that never answers) renders the win card and the
offer. Nothing in this path touches speaking.

Works Test: `src/board/dashboard.test.mjs` — a hand-authored fixture
month; every aggregate asserted against values computed by hand in the
test (per-device merge, day-of-week bucketing, weighted wpm, week
boundaries); both headline orders; the report contains the
hand-computed numbers and parses as a valid PDF (escaping proven with a
paren-containing name); the gate test mounts the real UI module on a
DOM stub: free → card + offer, lifetime → dashboard. `check:fast`
green.

## Slice 5 — Goal words

Goal: a Spotlight list can be marked as a goal; the dashboard shows each
target word on the child's own vs with the glow, by week.

Works Test: a goal list of *more, help, stop*. A scripted week with a
glow on Monday and none after: Monday's taps count as "with the glow",
the rest as "on their own", matching hand-computed values. Taps a
partner makes on a linked phone add nothing.

**DONE 2026-09-25.** Built:

- `src/board/schema.sql` — `spotlight_list.is_goal` (0/1, default 0;
  drift rebuild carries it). `user_version` 13. Also removed a latent
  landmine: a `;` inside `spotlight_item`'s DDL comment broke the
  `ddlFor` regex both here and in `public/db.js`'s migrator.
- `public/shared/spotlight.mjs` — `setListGoal` (synced op
  `spot_list_goal`) and `goalWords(db, fromDay, toDay)`: for every goal
  list, each target's `{own, glow}` per week, read from `stats_day`
  only — a goal never re-opens the tap log, and coach events can never
  inflate it. A word in two goal lists counts toward both.
- `public/shared/ops.mjs` — `applyOp` case `spot_list_goal`.
- `public/board/spotlight-sheet.js` — a Goal toggle on each saved list.

Works Test: `src/board/goals.test.mjs` — real taps → `upsertStatsDay`
→ `goalWords`; the scripted Monday-glow week matches hand-computed
`{own, glow}` per target; five partner `coach_event` rows add nothing;
a second own-device day row adds in; the goal op replays and skips
unsynced lists. `check:fast` green.

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

**DONE 2026-09-25.** Built (storage: Workers Analytics Engine — the
`RESEARCH` binding on `pip_research`; append-only datapoints, no schema
or auth surface to defend):

- `src/board/schema.sql` — `learner_profile.share_research` (default 1),
  `research_id` (`res_*`, synced so every device reports under it),
  `presentation_mode` (the whitelist field; 'symbol' until the display
  filter lands with its own phase), `stats_day.reported` (device-local
  send-once flag — never synced, replicas keep 0). `user_version` 14.
- `public/shared/research.mjs` — `dayPayload` builds the whitelist from
  a stats_day row (only `sense:` ids go out as bare `sns_*` ids;
  `entity:` taps collapse to the `own_taps` number); `ensureResearchId`
  mints + syncs the id via `set_setting`; `flushResearch` posts only
  own-device unreported rows, caps a flush at 14, marks `reported` on
  success. `RESEARCH_FIELDS` mirrors the Worker's allowed set.
- `src/worker/research.js` + `POST /research` — `validateResearch`
  constructs a clean object from the allowlist rather than deleting
  forbidden keys (a missed delete can't leak); extra key, non-`sns_`
  word id, non-`res_` rid, out-of-range number → 400. Handler writes
  one AE datapoint indexed by rid.
- `public/board.js` + `index.html` — the "Help improve Pip" seg in
  Parent Corner (same synced-setting mechanics as Smarter suggestions);
  `flushResearch` rides each stats refresh, fire-and-forget.
- `public/shared/groups.mjs` — the three new columns join
  `SYNCED_SETTINGS`.

Works Test: `src/board/research.test.mjs` — a capture-fetch inspects
every byte leaving the device: field set equals the whitelist, all
`words` keys are `sns_*`, Cooper's taps arrive as the number 3, no
name/entity id/user id/device id/hour appears in any body; a supporter
replica's copy of the row never sends; send-once via `reported`; off →
zero requests; the id is random, stable, and syncs via `set_setting`.
`handleResearch` round-trips a real payload into a datapoint and 400s
on extras/malformed JSON; `accounts.heavy.test.mjs` adds the live-worker
leg (200/400/405). `check:fast` green.

Known caveat: a schema rebuild resets `reported` to 0, so an upgraded
device re-posts each day once — dedup on `(rid, day)` when querying.

## Out of scope

Automatic tagging of communicative functions (requesting, commenting,
protesting). Comparisons with other users or norms (banned). Organization
reports for schools and clinics. Publishing claims (only after measured
data exists).
