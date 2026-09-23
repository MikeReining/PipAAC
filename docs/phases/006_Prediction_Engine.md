# Phase 006 — Prediction Engine

**Status:** In progress — slices 1–4 done. Slice 5 is
blocked on the founder's `TYPESAFE_API_KEY` Worker secret — see its
high-risk stop. Slices 6+ follow it.

**DECIDED 2026-09-22** (founder review: "I agree with all of the above …
please update all documents and create the new documents that we need").
Intake: `docs/founder/2026-09-22_Prediction_Blend_Privacy_Listening.md`.

**Order.** Slice 1 is a fix to built code and does not depend on anything
(004 slice 7 — the other event-log reader — has already shipped; this fix
applies retroactively). Slices 2–5 run in order. Occasions
(`docs/phases/007_Occasions.md`) feed the `occasion` feature when they
exist; this phase works without them. Partner words
(`docs/phases/008_Partner_Listening.md`) feed `echo` and the Jev request
when they exist; this phase works without them.

Product truth this phase implements:

| Topic | Owner |
| --- | --- |
| Blend, features, show gate, learning, metrics | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5 |
| What Jev receives; the Jev sharing setting (on by default) | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 3.2 |
| Tables and columns | `docs/product/Language_And_Voice_Schema.md` § 6.2c–6.2e |
| Strip layout, cap of four, zero layout shift | `docs/product/Motor_Grid_And_Art.md` § 2 |
| Entity representation in a Jev request | `docs/product/Personal_Entities.md` § Enrichment |

---

## Why this phase exists

The strip built in 002 slice 3 ranks with hand-set points
(`scoreRow` in `funnel.mjs`: 100 for an invitation, 20 for recency, 5 per
same-hour pick, 2 per pick). It cannot learn, it logs nothing it could
learn from, it has no notion of a sentence, and its time-of-day term is
wrong outside UTC. There is no number anywhere that says whether the strip
is right.

This phase makes prediction measurable first, then better, then personal,
then adds Jev.

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| shortlist, candidate | options list, suggestions list |
| impression (one strip moment, logged) | event, view |
| show gate, `none` | confidence gate, confidence threshold |
| `local_only` / `with_jev` weight sets | offline mode weights, cloud weights |
| Jev sharing (the setting) | cloud mode, AI mode |

---

## Slice 1 — Local time and sentences

Goal: the time-of-day term uses the child's local hour, and every pick
belongs to a sentence that ends spoken or cleared.

Files: `src/board/schema.sql`, `public/shared/funnel.mjs`, `public/board.js`
(speak, clear, backspace, every `logSelection` call),
`src/board/strip.test.mjs`, `sentences.test.mjs` (new, in src/board).

1. Schema amendment § 6.2c: `sentence` table; event-log `sentence_id`,
   `position`, `source`, `tz_offset_min`; first `PRAGMA user_version`-gated
   migration (old rows: `sentence_id` NULL, offset backfilled once).
2. `logSelection` takes the sentence id, position, source, and
   `-new Date(at).getTimezoneOffset()`.
3. The hour term reads
   `strftime('%H', selected_at / 1000 + tz_offset_min * 60, 'unixepoch')`
   and compares with the local hour of `now`.
4. A sentence opens on the first pick after an empty bar, closes `spoken`
   on Speak and `cleared` on Clear. Backspace and form changes rewrite
   `position` for the rest of the sentence.

Truth owner: `docs/product/Language_And_Voice_Schema.md` § 6.2c.

Lie-prone layer: SQL computes hours in UTC while JS computes them in local
time; the current test runs in one timezone and cannot see the difference.

Missing proof today: no test sets a timezone.

Works Test (write it first; it must fail on the current code): for
`TZ` in `UTC`, `America/Chicago`, `Europe/Berlin` (set `process.env.TZ`
per case), log a fringe noun picked at 08:20 local on three earlier days
and another at 13:20 local on three earlier days, then rank at 08:20 local
today with a verb tail. The 08:20 word ranks above the 13:20 word in every
timezone. Second test: speak *I want juice*, then *go outside*; no pair
`juice → go` exists when pairs are read by `sentence_id`. Third: Clear
closes the sentence as `cleared`.

Proof command: `scripts/test.sh src/board/strip.test.mjs` plus the new
sentences test.

Done when: the three tests pass, the first was seen failing before the fix,
and a person can tap a sentence, speak it, and see one `sentence` row with
`end_kind = 'spoken'`.

**DONE.** `sentence` table + event-log `sentence_id` / `position` /
`source` / `tz_offset_min` (`user_version` 5; pre-existing rows get the
device's offset backfilled once). `logSelection` records sentence,
position, source, and `-new Date(at).getTimezoneOffset()`; the hour term
buckets by `selected_at + tz_offset_min` — local hour that survives
travel and DST. `board.js` opens a sentence on the first pick, closes
`spoken` on Speak and `cleared` on Clear (the bar may keep its words
after Speak — the next pick opens a new row), and ⌫ detaches a popped
pick's event. Proof: `src/board/sentences.test.mjs` — the TZ sweep was
seen failing on the UTC-only hour term, and live in a browser: taps →
one `sentence` row `end_kind='spoken'`, events with positions 0/1 and
`tz_offset_min=-420`, Clear → `'cleared'`.

---

## Slice 2 — The instrument: impressions, metrics, simulation

Goal: every strip moment is logged, and three numbers exist before any
ranking change — shortlist recall, strip hit rate, taps per word.

Files: `src/board/schema.sql` (§ 6.2d `strip_impression`),
`public/shared/funnel.mjs` (`logImpression`, `predictionReport`),
`public/board.js` (`renderStrip` writes the impression; the next pick
fills `chosen_*`), `src/board/fixtures/routine_days.en.json` (new),
`prediction_sim.test.mjs` (new, in src/board).

1. `strip_impression` rows: shortlist with features, shown tiles,
   `p_none`, weight set, `jev_status`, and the next pick with its source.
2. `predictionReport(db, {from, to})`: shortlist recall, hit rate,
   false-show rate, strip share of picks — from impressions only.
3. Fixture: a simulated child over 14 days — timed sentences from a
   routine (school-day breakfast, after-school snack, bath, bedtime,
   weekend variants) plus 20% unscripted sentences. Every word is a catalog
   lemma or a fixture entity. Written by hand before any ranker change and
   not edited to suit a ranker.
4. The simulation replays days 1–10 through the real logging path and
   measures days 11–14. Taps per word: 1 if the word is a core cell or a
   shown tile; otherwise the group path (Groups anchor, group, item = 3).
   Same method as `docs/archive/phases/004_Keyboard.md` slice 7.

Truth owner: `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.7.

Lie-prone layer: a metric computed from the ranker's own output instead of
from what was picked. The label is always the fixture's next word.

Works Test: run the simulation on the current ranker; record baseline
recall, hit rate, and taps per word in this doc under § Baselines.
Negative control: a ranker that returns nothing scores 0% hit rate and the
full group-path tap count — the metric can fail.

Proof command: `scripts/test.sh` on the simulation test.

Missing proof / waiver: a simulated child is not a real child. Real-use
numbers come from `predictionReport` once the app is in use; the
simulation is the instrument until then.

Done when: baselines are recorded below, and a person can use the board
and see impression rows accumulate.

**DONE.** `strip_impression` (user_version 6); `stripScored` is the
feature-bearing shortlist `stripCandidates` now delegates to; `renderStrip`
logs one impression per distinct offer (deduped on sentence+position+shown);
the next logged pick fills `chosen_*` via `fillChosen`; `predictionReport`
computes recall / hit rate / false-show / strip share from impressions
only. `src/board/fixtures/routine_days.en.json` is the hand-written
14-day child (school/weekend routines + ~20% unscripted);
`prediction_sim.test.mjs` replays it through the real logging path —
days 1–10 train, 11–14 measure. Negative control proven: an empty
ranker scores 0% hit rate and pays the full group-path taps. Live check
in Chrome: three taps wrote three impressions, two labeled by the next
pick (`chosen_source='grid'`), the last left NULL.

---

## Slice 3 — The local model: features, log-linear score, show gate

**BUILT 2026-09-23** (`18a6c56`). `features()` computes the § 5.3
vector per candidate — decayed counts (30-day half-life) enter as
`log(1+count)`, `recency` is a 0–1 ramp over 15 minutes, `invited`/
`fresh`/`echo` 0/1; `occasion`/`echo`/`jev` stay 0 until 007/008/Jev
exist. `scoreCandidates` softmaxes over the shortlist ∪ `none`;
`showGate` returns tiles with `P ≥ τ_tile`, nothing when
`P(none) ≥ τ_none`. `stripScored` caps the shortlist at 16 (§ 5.2) and
takes one resolved weight set; `board.js` runs `local_only` (no Jev
yet). `data/prediction/defaults.json` ships the fitted starting weights
(`006-s3.*`), embedded as `catalog.prediction` by the catalog build.
`scripts/prediction/fit_defaults.mjs` replays fixture days 1–10,
fits θ on in-shortlist rows + calibrates `none_bias` on all rows, and
sweeps τ. Days 11–14 stay held out. Works Test
(`prediction_sim.test.mjs`): hit 25.4% vs baseline 23.7%, false-show
7.6% vs 36.4%, taps/word 1.356 vs 1.39 — all green, plus the
unscripted-show-rate and zeroed-ranker controls.

Measured (held-out days 11–14, vs slice-2 baseline):

| metric | slice 2 baseline | slice 3 model |
| --- | --- | --- |
| hit rate | 23.7% | 25.4% |
| false-show | 36.4% | 7.6% |
| taps/word | 1.39 | 1.356 |
| shortlist recall | 28.0% | 27.1% |

Goal: replace `scoreRow` with the model in
`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.3–5.4 using the
`local_only` weights, and beat the slice 2 baseline.

Files: `public/shared/funnel.mjs` (`features`, `score`, `showGate`),
`data/prediction/defaults.json` (new: starting weights, `τ_tile`,
`τ_none`, version), `fit_defaults.mjs` (new, in scripts/prediction: fits the
starting weights on the simulation's training days),
`prediction_sim.test.mjs`.

1. Retrieval sources and features as listed in § 5.2–5.3: `phrase`,
   `pair` (sentence-scoped), `occasion` (0 until 007), `hour`, `recency`,
   `freq`, `invited`, `echo` (0 until 008), `fresh`. Counts decay with a
   30-day half-life, enter as `log(1 + count)`.
2. Softmax over shortlist ∪ `none`; `none` has a bias term.
3. Show gate: up to four tiles with `P ≥ τ_tile`; nothing if
   `P(none) ≥ τ_none`.
4. Starting weights are fitted offline on days 1–10 and committed as
   data with a version; the device never fits them.

Truth owner: § 5.3–5.4 of the strategy doc.

Lie-prone layer: tuning the defaults on the same days that are measured.
Fit on days 1–10, measure on days 11–14 only.

Works Test: on held-out days, strip hit rate is above the slice 2 baseline
and taps per word are below it. The unscripted 20% show nothing more often
than the baseline did (false-show rate falls). Zeroed weights fall back to
the negative control — the test can fail.

Proof command: `scripts/test.sh` on the simulation test and
`src/board/strip.test.mjs`.

Done when: both beat the baseline, the new numbers are recorded under
§ Baselines, and the existing strip tests (Cooper offered after *play
with*; core map untouched) still pass.

---

## Slice 4 — Learning on the device

Goal: each child's weights drift from the defaults toward what works for
that child, after every spoken sentence.

Files: `src/board/schema.sql` (§ 6.2e `prediction_weights`),
`public/shared/learn.mjs` (new), `public/board.js` (call after Speak),
`learn.test.mjs` (new, in src/board),
`src/board/fixtures/routine_days_varied.en.json` (new).

1. After a spoken sentence: one gradient step on the log loss per
   impression in it, L2 pull toward the shipped defaults. Label = the
   pick; a pick outside the shortlist trains `none`.
2. Cleared sentences: no update.
3. `local_only` learns from every impression (Jev terms dropped);
   `with_jev` only from impressions where Jev answered.
4. Weights never leave the device.

Truth owner: § 5.5 of the strategy doc.

Lie-prone layer: a learner that "improves" by memorizing the days it is
scored on. Train on days as they are replayed; score each day before
learning from it (prequential).

Works Test: two simulated children from the same defaults — the routine
child (slice 2 fixture) and a varied child (new fixture: same words, little
routine). Over 14 replayed days, each child's day-by-day hit rate with
learning beats the fixed defaults over days 8–14. The routine child's
`hour` and `occasion` weights end higher than the varied child's. A
cleared sentence leaves both weight rows byte-identical.

Proof command: `scripts/test.sh` on `learn.test.mjs`.

Done when: the test passes and a person can see `examples_seen` grow as
they speak sentences.

**DONE.** `prediction_weights` (`user_version` 7, schema § 6.2e);
`public/shared/learn.mjs` takes one gradient step per impression on the
log loss after Speak (`board.js speakSentence` → `learnFromSentence`),
L2 toward the shipped defaults, `none_bias` on a slower rate so ordering
evidence lands before the gate moves, and a 50-impression burn-in so a
child with little data runs the defaults. `local_only` trains on every
labeled impression; `with_jev` only on `jev_status='answered'` — none
exist yet, so that row stays unwritten. The sim walker was corrected to
match production: position-0 picks are not strip moments (the strip
renders mid-sentence only), so they log no impression and train nothing.

Works Test (`src/board/learn.test.mjs`), prequential — each day scored
before it is learned: routine child hit rate 25.7% learned vs 24.3%
fixed defaults; varied child (`routine_days_varied.en.json` — same words
and entities, habitual phrases at scattered hours) 24.3% vs 23.8%. Both
beat frozen defaults on days 8–14. The margins are a few picks on ~110
measured picks — real but small, as expected of 14 days of on-device
drift. Personalization is not subtle: `hour` ends at 1.93 for the
routine child vs 0.39 for the varied child. A cleared sentence leaves
the row byte-identical. Live in Chrome: two taps + Speak wrote the
`local_only` row with `examples_seen=1`, no console errors.

The slice-3 numbers above were measured under the old walker (position-0
picks logged impressions). Under the corrected instrument the shipped
model measures: hit 36.6%, false-show 21.1%, taps/word 1.424,
shortlist recall 45.1% — and the gate is tap-free (always-showing the
same ranking scores identical taps, with false-show 60.6%).

---

## Slice 5 — Jev reranker behind the sharing setting

Goal: with Jev sharing on, Jev re-ranks the shortlist on meaning; with it
off, nothing leaves the device.

**High-risk stop (credentials, privacy):** the founder provides the
TypeSafe key as a Worker secret (`TYPESAFE_API_KEY`); it is never in the
repo or on the device. Ask before the first live call.

Files: `src/worker/index.js` (a rank route that forwards to
`https://api.typesafe.ai/v1/systemone` with the secret and logs no body),
`public/shared/jev.mjs` (new: `buildJevRequest`, pure),
`public/shared/funnel.mjs` (re-rank with `with_jev`),
`public/board.js` (Parent corner: Jev sharing toggle, on by
default), `src/worker/index.test.mjs`, `jev.test.mjs` (new, in
src/board).

1. `buildJevRequest(shortlist, sentence, partnerWords)` returns `null`
   when sharing is off, or when the sentence is empty and there are no
   partner words. Otherwise exactly the fields in § 3.2 — nothing else.
   Entities as key + category + enrichment description.
2. Model pinned to a versioned id; the response `model` is logged on the
   impression.
3. First paint never waits. An answer within 150 ms of first paint
   re-ranks with `with_jev`; later answers are `late` — logged, not shown.
4. Shortlist size 8 / 16 / 32 compared on the simulation (live calls,
   small cost), result recorded under § Baselines.

Truth owner: § 3.2 of the strategy doc; the entity rule in
`docs/product/Personal_Entities.md`.

Lie-prone layer: a request builder test that asserts on the builder's
return value while the real fetch sends something else. Capture the body
at the network boundary.

Works Test: stub `fetch` and capture every outgoing body across the
scenarios — sharing off (no request), empty sentence with nothing heard
(no request), *I want* with Cooper in the shortlist. The captured body's
keys equal the § 3.2 whitelist exactly; it contains Cooper's key and
description and not his `spoken_name`; it contains no digits from the
clock, no earlier sentence, no counts. Worker test: the key is added
server-side and never appears in a response.

Live smoke (after the founder supplies the key): the simulation's day-1
(cold start, no history) hit rate with `with_jev` vs. `local_only`,
recorded under § Baselines.

Proof command: `scripts/test.sh` on `jev.test.mjs` and
`src/worker/index.test.mjs`.

Missing proof / waiver: the live smoke waits for the key.

Done when: the contract test passes, the toggle is in the Parent corner and
on by default, and with sharing on a person sees the strip re-rank on a
real device.

---

## Baselines

Filled in by slices 2–5. Numbers only, with the commit that produced them.

| Slice | Shortlist recall | Strip hit rate | False-show rate | Taps per word | Commit |
| --- | --- | --- | --- | --- | --- |
| 2 (current ranker) | 28.0% | 23.7% | 36.4% | 1.39 | 006/2 sim, held-out days 11–14 |

## Out of scope

Occasions data (007). Listening and partner words (008). Core-cell halos
and the fading prompt (`docs/strategy/Dual_Engine_Predictive_Intelligence.md`
§ 7.4 — no phase yet). The independence report UI. Rate limits.
