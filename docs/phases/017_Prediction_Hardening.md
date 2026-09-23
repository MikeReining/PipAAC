# Phase 017 — Prediction you can prove

**Status:** Ready to execute. Not started. Founder rulings recorded
(step 0, 2026-09-23). Start with M1 (steps 4, 3, 5, 1, 2); the opening
book (step 23) can start in parallel.

**DECIDED 2026-09-23** (founder: "If we nail prediction … we can create a
category killer. I don't think we are there yet."). Source: an independent
mentor's 20-item audit, reviewed line by line against the code on
2026-09-23 (`2f69c2c`). All 20 items stand. Each one either names a real
defect or a real gap. This doc turns them into steps a developer can
execute. Where the review changed an item, the step says so.

**The job, in one line:** make the predictor work correctly, give it
knowledge of how people talk (the opening book), build an honest
comparison, then improve it until the gain is visible, on users the
system has never seen.

**The breakthrough this phase is built around (founder, 2026-09-23):**
"This is like chess. Predict the next move." Our vocabulary is finite
(680 English lemmas). For any sentence so far, only a narrow set of next
words makes sense. Today the strip knows nothing about English: only this
user's own past picks plus two grammar rules, which is why day one is
empty. Step 23 ships an **opening book**: for every common context, the
likely next words, built from free text about how people talk,
especially how adults and children talk to each other. On held-out child
turns, a book built from speech addressed to children put the right
non-core next word in the top 4 **34% (age 2) and 49% (age 5)** of the
time, with no personal history. That is twice what adult text scores
(step 23 § Experiments). The layers, general to personal: **opening
book → what the partner just said → the user's own history → Jev live**,
and every user feeds the book back (step 26, the flywheel). The grid is
untouched; the user can still say anything.

> **CHILDES rule (DECIDED 2026-09-23, founder).** CHILDES data, or
> anything computed from it, goes into Pip **only if TalkBank gives us
> written permission.** The founder emailed TalkBank on 2026-09-23. Until
> a written yes arrives: no CHILDES file, count, table, or model in the
> repo, the opening book, the bench, or any shipped build. The free
> sources carry the plan on their own. If permission arrives, it is
> stored in the repo, its exact scope (test set only, or also the book)
> is recorded in R11, and the book build may then add CHILDES within
> that scope. If the answer is no, CHILDES stays out for good, and the
> 2026-09-23 measurement remains the only use.

| Topic | Owner |
| --- | --- |
| Blend, features, show gate, learning, metrics | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5 |
| What Jev receives (the whitelist) | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 3.2 |
| Tables and columns | `docs/product/Language_And_Voice_Schema.md` § 6.2c–6.2e |
| Strip layout, cap, no layout shift | `docs/product/Motor_Grid_And_Art.md` § 2 |
| Occasion data | `docs/phases/007_Occasions.md` (step 9 runs it) |
| Previous prediction phase (history, baselines) | `docs/archive/phases/006_Prediction_Engine.md` |

At closeout, update the owners above to match what was built. This phase
doc is not the long-term owner.

---

## 1. Where we are (measured 2026-09-23 on `2f69c2c`)

Every claim below was reproduced or read from code, not from a doc. Line
numbers are at `2f69c2c`. `public/board.js` is changing under 015 slice 2,
so its rows also name the function.

| Finding | Evidence |
| --- | --- |
| **One keyboard sentence erases every learned weight.** Keyboard-mode impressions store empty feature vectors; the learner multiplies by `undefined`, gets `NaN`, and saves `null` for all 11 weights. | `public/board.js:555` (`renderStrip`, keyboard branch) logs `x: {}`; `public/shared/learn.mjs:86-94` trains on it. Reproduced: one keyboard impression + Speak → `{"phrase":null,…,"none_bias":null}`. |
| **`with_jev` never learns.** Speak trains `local_only` only. | `public/board.js:242` (`speakSentence`) calls `learnFromSentence` with the default set. |
| **`local_only` learns Jev's feature.** When Jev changes the offer, the new row carries `jev = log P`, and `local_only` trains on it. | `public/shared/learn.mjs:63-70` (no weight-set filter for `local_only`); `public/board.js:604-606` (`maybeJev`). |
| **`phrase` and `pair` are the same number.** Whenever a candidate matches a longer phrase, it also matches the tail, and both add the same weight. | `public/shared/funnel.mjs:147-156`. Measured: equal in 2,394 of 2,394 candidate rows. The fitted defaults show it too: `phrase` = `pair` = 1.5496. |
| **A word must have been used before it can be suggested.** Day one is empty. | `public/shared/funnel.mjs:273-278` (`EXISTS learner_event_log`, `freq > 0`). 006 measured day-1 hit rate: 0% for both engines. |
| **Grammar is a hard filter.** A fringe word that isn't "invited" can never appear (after *red*, nothing). | `public/shared/funnel.mjs:278` (`&& x.invited`). |
| **The ranker never sees the open board or group.** | `stripScored(db, sentence, now, locale, model)`, `public/shared/funnel.mjs:251`. |
| **Occasion is a constant zero.** | `public/shared/funnel.mjs:179`. |
| **Jev's "none" means something else, but it is folded into the same term.** Jev's `none` = "no word here fits". The local `none` = "the next pick is not in the shortlist". The code adds them into one score. | `public/shared/jev.mjs:49`; `public/shared/funnel.mjs:197-198`. |
| **The Jev smoke run uses the wall clock**, so breakfast and bedtime look the same, and it applies every Jev answer, even one that arrives after the user's next pick. | `scripts/prediction/jev_smoke.mjs:97`, `jev_smoke.mjs:102`, `jev_smoke.mjs:112`; answers applied at `jev_smoke.mjs:61` with no timing check. |
| **The recorded "cap 32" result is really cap 16.** The shortlist is cut to 16 before the smoke's cap applies. The median shortlist has 5 words anyway, so the cap almost never matters. | `public/shared/funnel.mjs:283`, `jev_smoke.mjs:44`. |
| **Stored evidence can't replay a decision.** Rows drop each candidate's score, Jev's probabilities, and the weights used. When Jev leaves the offer unchanged, only a status label is stored. | `public/board.js:178` (`maybeImpression`), `public/board.js:608` (`maybeJev`). |
| **The defaults were fitted on the two children the tests measure.** No result is on an unseen user. | `data/prediction/defaults.json` `fittedOn`; `scripts/prediction/fit_defaults.mjs:56`. |
| **On-device learning shows no gain.** After the Monday-anchor fix, learned weights score the same as fixed defaults. | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.5. |
| **The simulation's calendar starts from today**, so a daylight-saving change can shift hours between two runs. | `src/board/sim_replay.mjs:86-90`. |
| **Every non-core word costs "3 taps".** Real group paths, page flips, and the time spent looking at the strip are not modeled. | `src/board/sim_replay.mjs:137`. |

Two measurements set the ceiling (routine fixture, held-out days 11–14,
118 picks):

- **67 of 118 picks are core words.** The strip never offers core words in
  picture mode. Even a perfect strip saves at most **46%** of modeled taps
  under the 3-tap rule.
- **47 of 118 picks are the first word of a sentence.** The strip makes no
  prediction there; it shows fixed starters (`public/board.js` idle
  starters). 10 of those 47 are non-core words.

So the numbers so far are small because the plumbing is broken, the test is
too easy in some ways and too crude in others, and some of the biggest
opportunities are never measured.

## 2. What "wow" means (the finish line)

Four things a parent or SLP would notice, each checked by a number in the
bench (step 13):

1. **Day one is useful.** A new user gets sensible suggestions before any
   history exists (steps 23, 7).
2. **It saves real effort.** Clearly fewer modeled actions than no
   prediction, on users the system has never seen — reported as two
   lifts: own data alone, and Jev on top (step 19).
3. **It keeps quiet when unsure.** Suggestions that cost more than they
   save are counted as harm and kept rare (steps 6, 16).
4. **It never moves under a finger.** No tile is replaced while the user is
   reaching (step 17).

Jev earns its place by adding a measured gain on top of the best local
system. Jev is not the definition of success.

## 3. Rules for the whole phase

- **The answer key is independent.** Synthetic users are generated and
  frozen before any predictor runs. The generator imports nothing from
  `public/shared/funnel.mjs`, `public/shared/learn.mjs`,
  `public/shared/jev.mjs`, or the bench. A test enforces this.
- **The user is the unit.** Averages, confidence intervals, and splits are
  per user, not per pick. One easy user must not carry a result.
- **Evaluation users stay unseen.** Nothing is fitted, tuned, or
  prompt-edited on users 81–100 (step 12).
- **One timing rule, one walker.** The app and the bench call the same
  functions for "can Jev's answer still be shown" and "replay a day". No
  private copies (the Jev smoke's copy is why step 1 exists).
- **Each improvement is a bench arm first.** It ships only if it beats the
  previous arm on the tuning users with no regression in any group of
  users.
- **Never weaken the comparator.** The report states the lift and its
  uncertainty, whatever they are.
- **Free data only.** Every opening-book source allows commercial use
  without paying (founder, 2026-09-23: "we're not gonna pay for any
  license"). Non-commercial, no-derivatives, and paid sources are out.
  Attribution is kept in one sources file that ships with the app.
- **The book and the test users never share a source.** Otherwise the
  test grades its own answer key (step 11, step 23).
- **Every local step stays inside the local latency budget** (step 17).
  Measure as you go; don't discover it at the end.

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| synthetic user, answer key, intended message | fake data, labels, ground truth file |
| fit users (1–60), tune users (61–80), eval users (81–100) | train set, test set (ambiguous here) |
| arm (one predictor setup in the bench) | variant, model config |
| modeled actions (activations + inspection + correction) | taps (unless you mean only activations) |
| delivered (reached the screen before the next pick) / theoretical (ignoring timing) | Jev accuracy |
| opening book (population next-word table, shipped as data) | corpus model, dictionary, AI prior |
| retrieval miss (target not in shortlist) / no-fit (Jev: nothing here fits) | none (without saying which) |

## Build order

The mentor's numbers are kept as step IDs so each step traces back to the
audit. The build order is different from the audit's order: measure
before improving, and put the founder's view early.

```text
Step 0  founder rulings
M1  Trustworthy plumbing   4 → 3 → 5 → 1 → 2
M2  The instrument          11 → 12 → 16 → 13 → 15 → 18
M3  Measured improvement    23 → 24 → 25 → 7 → 10 → 6 → 8 → 9 → 21 → 14 → 17
M4  Proof                   19 → 22
F   The flywheel            26 (after 016 slice 6; parallel to M3)
```

Step 23 (the opening book) needs none of M1 to start: building and
checking the book is offline data work. It joins the ranker in M3.

Why this changes the audit's order:

- Step 6 moves from M1 to M3 because it changes the model, and a model
  change needs the bench to show it doesn't regress.
- Step 18 (the replay screen) moves up so the founder can see every
  improvement as it lands, not only at the end.
- Steps 21 and 22 are additions from this review (§ Additions). Step 23
  is the founder's opening-book insight.
- Step 20 (a pilot with AAC users) is removed (step 0, R5).

---

## Step 0 — Founder rulings

**DECIDED 2026-09-23** (founder).

| # | Question | Ruling |
| --- | --- | --- |
| R1 | Targets | No pass/fail targets up front ("we will see what the data reveals"). The bench reports two lifts: own data alone vs no prediction, and Jev on top of that. Simulation alone should already show a lift. |
| R2 | Speed device | The iPad. Speed is checked on the real app, not in the simulation. |
| R3 | Occasions | Learned from the user's picks; no screen for adults to edit times. Kept only if it beats time-of-day alone (step 9). |
| R4 | Jev spend | No cap. Jev is cheap. The question is only whether it improves predictions. |
| R5 | Pilot with AAC users | Dropped. The simulation decides whether this is worth deploying; after launch, `predictionReport` measures real use. |
| R6 | First-word predictions and whole-message tiles on screen (steps 21, 22) | Decide after the bench numbers. This phase only measures them. |
| R7 | The 150 ms Jev window | Removed ("we shouldn't set a gate"). A Jev answer is used whenever it arrives before the user's next pick, unless a finger is already reaching (step 2). Response times are recorded as data. |
| R8 | Data licenses | Free sources only; no paid license (step 23). |
| R9 | Ranking | By probability: the words the user is about to say, like a phone keyboard. Never by how far away a word is. |
| R10 | The flywheel | On by default under the existing "Help improve Pip" switch; anonymous 1–3-word counts of built-in words (step 26). Amends Stats § 6.3's "no sequence of words". Turning it off stays free (recommended; founder floated charging for opt-out). |
| R11 | CHILDES | **Only with TalkBank's written permission** (see the CHILDES rule at the top). Founder emailed TalkBank 2026-09-23; answer pending. Until then, nothing CHILDES-derived in the repo, book, bench, or builds. A one-off measurement (step 23 § Real children) shows what it's worth: +11–16 points in top 4 over the best free book. When the answer arrives, record its date and exact scope here. |

---

# M1 — Trustworthy plumbing

## Step 4 — Keyboard mode must not corrupt learned weights

Goal: typing, speaking, and returning to picture mode leaves valid,
finite weights.

Files: `public/board.js` (`renderStrip`, keyboard branch),
`public/shared/learn.mjs`, `public/shared/funnel.mjs`
(`logImpression`), `src/board/schema.sql` (§ 6.2d amendment),
`src/board/learn.test.mjs`.

Build:
1. Impressions gain `mode` (`picture` | `keyboard`). Keyboard-mode
   impressions are metrics only; the learner skips them. The keyboard
   ranker is a different model: it offers core words and has no feature
   vector. Giving it one is out of scope.
2. The learner skips any candidate whose features are not all finite
   numbers, and refuses to write a weight row containing a non-finite
   value (the row stays as it was; log once to the console).
3. One-time repair (schema `user_version` bump): any `prediction_weights`
   row with a `null` or non-finite value is reset to the shipped defaults
   with `examples_seen = 0`.

Truth owner: `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.5.

Lie-prone layer: `JSON.stringify(NaN)` writes `null`, and
`weights[f] ?? 0` then reads it as 0. The corruption is silent: the strip
keeps working, just with zeroed weights.

Works Test (write first; it must fail on current code): replay through
the real `board.js` path in a browser probe (`scripts/probes/jev_probe.mjs`
pattern): two picture-mode sentences spoken, one keyboard sentence
spoken, one more picture-mode sentence spoken. Assert every stored weight
is a finite number, `none_bias` is within 1.0 of the shipped value, and
the keyboard sentence changed nothing. Unit version in
`src/board/learn.test.mjs`: the exact impression `renderStrip`'s keyboard branch writes
leaves the row byte-identical.

Done when: both tests pass, and the repair migration turns a
hand-corrupted row back into the defaults.

## Step 3 — Both learning paths train, and stay separate

Goal: after every eligible spoken sentence, `local_only` and `with_jev`
each learn from the right evidence. Offline learning never depends on
Jev.

Files: `public/board.js` (`speakSentence`), `public/shared/learn.mjs`,
`src/board/learn.test.mjs`.

Build:
1. `speakSentence` trains both sets.
2. `local_only` trains on the local ranking of each moment. The `jev`
   feature is left out of its feature list entirely, not just zeroed.
3. `with_jev` trains on every moment where Jev returned probabilities —
   answered in time **or late**. **Review change:** the audit didn't
   specify late answers. A late answer is still valid evidence about the
   word; only its display was blocked. Training on it roughly doubles
   `with_jev`'s data (half of answers arrived late in 006).
4. This depends on step 5's row shape (one row per moment holding both
   rankings). Build 5's schema first if convenient; the order within M1
   is flexible.

Truth owner: § 5.5.

Lie-prone layer: a test that calls `learnFromSentence` directly passes
while `board.js` never calls it for `with_jev`. Test through Speak.

Works Test: in a browser probe with Jev stubbed at the network boundary
(answers in time for some moments, late for others): speak three
sentences. Both rows exist. `with_jev.examples_seen` = moments with an
answer. `local_only.weights.jev` is absent. With sharing off,
`local_only` changes exactly as it did with sharing on for the same
picks (same local rankings → same update).

Done when: that passes through the real Speak path.

## Step 5 — Stored evidence matches what was on screen

Goal: any stored moment can be replayed to reproduce its ranking and its
display decision exactly, including moments where Jev changed nothing.

Files: `src/board/schema.sql` + `docs/product/Language_And_Voice_Schema.md`
§ 6.2d (amendment), `public/shared/funnel.mjs` (`logImpression`, a new
`replayImpression`), `public/board.js` (`maybeImpression`, `maybeJev`,
`markJev`).

Build: **one row per strip moment**, updated in place when Jev answers.
Today a Jev change inserts a second row, and the first row never gets its
label (`fillChosen` fills only the newest). The row holds:

| Field | Meaning |
| --- | --- |
| `candidates` | per candidate: `kind`, `id`, `x`, local score, local p; Jev p and with-Jev p when answered |
| `weights_local`, `weights_jev` | the exact weight vectors used (11 numbers each) + `defaults_version` + `examples_seen` |
| `shortlist_cap`, `mode` | as used |
| `p_none_local`, `p_none_jev` | both, kept separate (step 6 renames them) |
| `jev_probs`, `jev_model`, `jev_prompt_version`, `jev_latency_ms`, `jev_status` | raw answer and timing |
| `shown_local`, `shown_final` | what local painted; what was on screen when the next pick happened |
| `chosen_*` | the next pick, as today |

Truth owner: schema § 6.2d.

Lie-prone layer: recording what the code *meant* to show. `shown_final`
must be written by `paintStrip` (what was actually painted), not by the
ranker.

Works Test: run the routine fixture through the walker with a stub Jev
that sometimes changes the offer, sometimes doesn't, and sometimes answers
late. For 100% of rows, `replayImpression(row)` reproduces candidate
order, `p` values (to 1e-9), and `shown_final`. Rows where Jev left the
offer unchanged still carry `jev_probs`.

Done when: that passes, and a live browser check shows `shown_final`
matching the painted tiles after a Jev repaint.

## Step 1 — One clock, one walker

Goal: every arm replays the same simulated dates, times, and gaps, so
breakfast and bedtime give different history whatever day the bench runs.

Files: `scripts/prediction/jev_smoke.mjs` (delete its private walker),
`src/board/sim_replay.mjs`.

Build:
1. `replayDays` accepts async offers and a list of arms, and replays one
   frozen event stream for all of them. Each arm has its own database; the
   picks and times are identical.
2. The calendar anchor is a fixed date (e.g. Monday 2026-01-05), not
   today (`sim_replay.mjs:86-90`). Gaps between picks come from the
   answer key (step 11), not a fixed 1.5 s.
3. The jev smoke run becomes a thin caller of `replayDays`, or is
   deleted once the bench (step 13) exists.

Truth owner: this doc § 3 ("one walker").

Lie-prone layer: `Date.now()` anywhere in the replay path. Add a test that
fails if the walker or an arm reads the wall clock (stub `Date.now` to
throw during replay).

Works Test: the same moment ("I want" at 07:50 vs at 19:50 on a school
day, same history) gives different `hour` features and a different offer.
Running the bench on two different real dates gives byte-identical
reports.

Done when: that passes, and `jev_smoke.mjs` has no `Date.now()`.

## Step 2 — The simulation obeys the app's timing rules

Goal: the bench reports Jev's **theoretical** result (every answer used)
and its **delivered** result (only answers the app would show). There is
no fixed time window (R7): the only real limits are that an answer after
the next pick can't help that pick, and a tile must not change under a
finger.

Files: `public/shared/jev.mjs` (new pure function `jevDeliverable`),
`public/board.js` (`maybeJev` calls it), `src/board/sim_replay.mjs`.

Build:
1. Delete the 150 ms window (`JEV_WINDOW_MS` in `public/board.js`) and
   pull the display rule out of `maybeJev` (`public/board.js:591`) into
   one pure function used by both the app and the bench:
   `jevDeliverable({ answeredAt, reachStartedAt, moved }) → bool` — true
   when the sentence position hasn't moved and no reach has started
   (no pointer-down on the board since paint; step 17).
2. In the bench, a reach starts `reach_ms` before each pick (one
   constant in the step 16 config, default 600 ms; reported at 300 and
   1,000 too). The pick time comes from the answer key; each answer's
   latency comes from the step 14 cache.
3. Every run reports Jev latency: median, p90, max, and the share of
   answers that arrived in time.

Truth owner: `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 3.4
(amended 2026-09-23, R7).

Lie-prone layer: two copies of the rule drifting apart. `board.js` must
import the function, never re-implement it.

Works Test: a stub Jev that is always right (puts the target first) but
answers after the next pick: theoretical gain > 0, delivered gain = 0
exactly. The same stub answering at 400 ms with picks 3 s apart:
delivered = theoretical (no 150 ms cutoff). A pointer-down before the
answer: no repaint in the app.

Done when: that passes, and `board.js` has no inline copy of the rule.

---

# M2 — The instrument

## Step 11 — 100 reproducible synthetic users over 30 days

Goal: a varied, frozen answer key that no predictor can influence.

Files: `gen_users.mjs` and `personas.mjs` (new, in scripts/prediction/synth),
`data/prediction/synth/manifest.json` (new, committed),
`data/prediction/synth/banks/` (new, committed message banks),
generated users under `out/prediction/synth/` (gitignored — derived).

Build:
1. A seeded random generator (e.g. mulberry32). Seed + generator version
   in the manifest.
2. Each persona draws: routine strength, active vocabulary size (30–300
   non-core words), Zipf skew of preferences, repetition, weekly novelty
   (new words per week), schedule jitter (minutes), weekend shift, one
   schedule change mid-month (holiday, new school time), 2–8 personal
   entities, a mix of message types (requests, refusals, comments,
   questions, repairs), utterance length (mostly 1–3 words, telegraphic
   allowed), and a time zone.
3. Messages come from occasion scripts (breakfast, school, play, bath,
   bedtime, …) with slots filled from the persona's preferences, plus
   free messages. Repairs are a wrong pick, then backspace, then the
   right pick; the answer key records both.
4. Words are catalog lemmas and the persona's entities. A small share
   (about 3%) are not on any board and must be typed, to exercise the
   keyboard path.
5. Output per user: every message with its day, time, intended words,
   gaps between picks, and repairs. The manifest stores a SHA-256 per
   user file. The bench regenerates and **refuses to run on a hash
   mismatch**, so a changed answer key is always a deliberate, reviewed
   commit.
6. The persona generator's occasion schedule is its own. The app's
   occasion data (step 9) is built from the catalog by 007's method,
   never from these banks, or the test grades its own homework.
7. **Partner turns.** Messages that answer a partner carry the partner's
   words, at a per-persona echo rate (10–70%), fixed in the answer key
   (step 24).
8. **No shared text with the opening book.** Message banks are never
   drawn from any step 23 source, and the book never reads the banks.
   If both use an LLM, they use different prompts, and the bench reports
   the book's lift separately on `template` and `llm` banks. The human
   check is step 23's held-out writers, which no synthetic user touches.

**Review addition — LLM-written text favors an LLM.** If message banks are
drafted with an LLM, Jev (also a language model) may find them unusually
predictable. Tag every bank as `template` or `llm`, and report Jev's gain
on each separately. If the gain exists only on `llm` banks, it isn't
real.

Truth owner: this doc § 3 ("answer key is independent").

Lie-prone layer: generator code that shares logic with the ranker (same
feature ideas, same occasion table). The independence test greps the
generator's imports.

Works Test: same seed → byte-identical output (hash match) on two runs.
Different seed → different users. The import test fails if the generator
imports a predictor module. A summary prints the spread of each persona
parameter (so a founder can see the users really differ).

Done when: those pass and the manifest is committed.

## Step 12 — Keep evaluation users unseen

Goal: users 81–100 cannot influence any weight, prompt, or threshold
before the reported run.

Build:
1. Split by user ID: 1–60 fit, 61–80 tune, 81–100 eval. The eval set
   includes persona patterns absent from 1–80 (e.g. a night-shift
   household, a vacation week, a new sibling entity mid-month, a
   comment-heavy talker).
2. `fit_defaults.mjs` and every tuning script assert they never load
   an eval user.
3. The bench reads eval users only with `--final`. `--final` requires a
   clean git tree and appends one line (commit, date, arms, headline
   numbers) to `data/prediction/final_runs.jsonl` (committed). Repeated
   peeking is then visible in history.

Works Test: calling the fit script with an eval ID throws. `--final` on a
dirty tree refuses.

Done when: both pass.

## Step 16 — Count actions through the real board

Goal: replace "every non-core word costs 3 taps" with the real path, and
count the cost of looking at suggestions, so a suggestion can score as
unhelpful or harmful.

Files: `actions.mjs` (new, in scripts/prediction/bench) using the real
layout functions (`public/shared/groups.mjs` page geometry, the user's
seeded groups, entity placement, the keyboard matcher).

The action model, per intended word:

| Path | Cost |
| --- | --- |
| Core cell on the home layout | 1 activation |
| Group item | Groups anchor + index page flips + group tile + page flips within the group + item, from the user's actual board |
| Entity | same, via its group |
| Not on any board | typed letters until the real completions list shows it, + 1 |
| Strip hit | 1 activation |
| Looking at a shown strip | `inspect` per moment where the strip is non-empty (default 0.25 action-equivalents) |
| Mistaken strip pick | probability `slip` (default 2%) of taking a neighbor tile: + backspace + the correct path |
| Repair in the answer key | its real cost |

All constants live in one config, including `reach_ms` (how long before a
pick the finger starts moving; step 2). **Every headline number is reported at
three inspection costs (0.1, 0.25, 0.5)** so no conclusion depends on one
guess.

A shown strip is **harmful** at a moment if the target wasn't shown (the
user looked and gained nothing), and **unhelpful** if the target was
shown but the strip saved less than it cost.

Truth owner: this doc until closeout, then
`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.7.

Lie-prone layer: costing the target path with a hand-typed table instead
of the real layout functions. The test uses a real seeded board.

Works Test: on a seeded board, a word three pages deep in a group costs
more than a word on page one. A strip that always shows four wrong tiles
scores worse than no prediction. A strip that shows the target but also
three decoys costs more at `inspect = 0.5` than at `0.1`.

Done when: those pass.

## Step 13 — One comparison command

Goal: `npm run prediction:bench` produces one side-by-side report.

Files: `bench.mjs`, `arms.mjs`, `report.mjs` (new, in scripts/prediction/bench),
`package.json` script. Output: `out/prediction/<run>/report.md` +
`report.json` (gitignored); `--final` results are copied into § Results
below.

Arms:

| Arm | What it is |
| --- | --- |
| A0 no prediction | the strip is empty |
| A1 simple baseline | every enabled non-core word + entities; score by backoff over this user's past sentences (last 3 → 2 → 1 items → same hour → overall count); always show the top slots. This is classic AAC word prediction. The new system must beat it. |
| B book only | the opening book (step 23), no personal history, no Jev. The lift from knowing English alone. |
| A2 current local | a frozen copy of the ranker and learner as of this phase's start (copied into the bench's arms folder, never edited) |
| A3 improved local | the working tree |
| A4 improved local + Jev, delivered | step 2's rule applied |
| A4t same, theoretical | every answer used |
| O1 perfect reranker | if the target is in A3's shortlist, show it first; else show nothing. The gap between A3 and O1 is ranking. The gap between O1 and O2 is retrieval. |
| O2 perfect strip | every non-core target shown. This is the ceiling. |

Every arm runs **prequentially**: each user starts from the shipped
defaults, each moment is scored before it is learned from, over 30 days.

Report, per arm (columns) and per cohort (routine-heavy, varied,
novelty-heavy, schedule-change, unpredictable, and each synthetic
persona pattern in eval):

- modeled actions per message (headline), per word, and saving vs A0,
  with 95% bootstrap intervals **over users**
- hit rate, shortlist recall, false-show rate, harmful-show rate
- day 1 / week 1 / days 22–30 curves (cold start vs. learned)
- split by position: first word / later words; core / non-core targets
- Jev: calls, answered in time, late, errors, cost, latency p50/p90
- **regressions:** every user and cohort where A3 or A4 is worse than A1

Truth owner: this doc § 3.

Lie-prone layer: an arm computing its own success. The report computes
every number from the answer key and the painted offer, never from an
arm's self-report.

Works Test: A0 has zero saving and zero hits. O2 has the maximum saving
and zero harm. A2 on the old routine fixture reproduces 006's recorded
numbers, within rounding, when run with the old 3-tap rule.

Done when: one command prints the table for fit + tune users in under 10
minutes without Jev (with `--jev cache` once step 14 exists).

## Step 15 — Show the bench can catch failure

Goal: each deliberate sabotage removes exactly the benefit it should
remove. If it doesn't, the bench is lying.

| Flag | Sabotage | Expected |
| --- | --- | --- |
| `--control shuffle-history` | each user's history days come from another user | personalization gain (A3 days 22–30 vs day 1) collapses |
| `--control shift-time` | measured days' routines shift +6 h; history unchanged | hour/occasion gain disappears or turns negative |
| `--control jev-noise` | Jev probabilities replaced by random ones | A4 − A3 ≤ 0 |
| `--control outside-shortlist` | targets removed from retrieval | hit rate 0; saving ≤ 0; harm reported |
| `--control unpredictable` | a user whose messages are uniform random picks | saving within ±2% of zero; false-show low |

Works Test: `prediction_bench_controls.test.mjs` (new, in src/board) runs each
control on a small user subset and asserts the direction above.

Done when: all five pass. Any control that fails blocks M3.

## Step 18 — A replay screen the founder can inspect

Goal: someone can look at 20 simulated moments side by side and see why
each arm won or lost, without reading logs.

Files: `replay.mjs` (new, in scripts/prediction/bench), `npm run prediction:replay`
→ writes one static HTML file under `out/prediction/<run>/` and prints
its path. Local only; synthetic data only.

Each moment is one card with three columns: **no prediction · local ·
local + Jev**. Each card shows:

- persona in one line, day, clock time, occasion if any
- sentence so far and the intended message, with the target word marked
- each arm's strip (target highlighted if present, or "silent")
- actions spent on this word and on the whole message, per arm
- Jev: latency, delivered or late
- the reason, in plain words: top two features that ranked the winner,
  and why the gate showed or stayed silent

The 20 moments are sampled across categories: Jev helped, Jev hurt,
local won, everyone missed, harmful show, first word, late answer, day
one.

This matches how the founder prefers to judge model output: a
side-by-side page and a joint decision.

Done when: the founder opens the page, reads 20 cards, and can say for
each why it went the way it did.

---

# M3 — Measured improvement

Each step lands as a change to arm A3 (or A4), is run on fit + tune users,
and is kept only if the bench shows a gain with no cohort regression. For
each step, record before/after under § Results.

## Step 23 — The opening book

Goal: for any sentence so far, a ranked list of the likely next words
from our vocabulary, built from free text about how people talk. It ships
as data, answers instantly, and works offline and on day one.

This is the founder's chess insight: we have 680 words, and for any
position only a narrow set of next moves makes sense. The book is how the
strip learns English before it learns the user.

### Sources (licenses checked 2026-09-23)

**The main finding: talk addressed to children beats adult text by about
2×.** On held-out child turns (§ Experiments below), a book built from
caregiver speech put the child's next non-core word in the top 4 34% of
the time at age 2 and 49% at age 5. The adult AAC book scored 15% and 28%.
Child conversation is the main source; adult text is background.

| Source | What it is | License | Role |
| --- | --- | --- | --- |
| **TinyDialogues** ([Hugging Face](https://huggingface.co/datasets/styfeng/TinyDialogues), Feng, Goodman & Frank, EMNLP 2024) | ~130k conversations with a child aged 2, 5, 10, or 15 at the center (with mom, dad, teacher, sibling…), written by GPT-4 | MIT | **Main source.** One book per age band (step 23 item 9). Both the adults' and the children's turns. |
| Wordbank ([data](https://langcog.github.io/wordbank-datapage/)) | Which words real toddlers say, by age (MacArthur-Bates CDI) | CC BY 4.0 (skip any dataset marked NC in its license column) | Stage prior for young users (item 10) |
| Imagine AAC messages ([aactext.org/imagine](https://www.aactext.org/imagine/), Vertanen & Kristensson, EMNLP 2011) | 5,890 messages written as if speaking through an AAC device | CC BY 4.0 (two test files excepted) | Background; the AAC message style; the older-user book |
| Imagine AAC language models (same page) | 2- to 4-gram models from AAC-like Twitter, blog, and Usenet sentences | CC BY 4.0 | Background; wide coverage |
| TinyStories ([Hugging Face](https://huggingface.co/datasets/roneneldan/TinyStories)) | 2.1M very simple children's stories, written by an LLM | CDLA-Sharing-1.0: computed counts unrestricted (§ 3.5) | Child vocabulary; stories |
| SODA ([Hugging Face](https://huggingface.co/datasets/allenai/soda)) | 1.5M everyday social dialogues, written by an LLM | CC BY 4.0 | Conversation, older users |
| Tatoeba ([downloads](https://tatoeba.org/en/downloads)) | Short everyday sentences, human-written | CC BY 2.0 FR (part CC0) | Short, simple |
| Google Books Ngram ([datasets](https://storage.googleapis.com/books/ngrams/books/datasetsv3.html)) | 1- to 5-gram counts from books | CC BY 3.0 | Frequency backbone |
| Our own table | Jev or an LLM asked offline which of our words follow each common context | Ours | Fills thin contexts |
| Childlike dialogues (`data/prediction/sources/childlike_en.jsonl`) | ~540k utterances we generate: authored frames in real child-speech shapes, slot-filled from our own vocabulary weighted by AoA (`scripts/prediction/book/gen_childlike.mjs`) | Ours | Second child source; +3–5 pts over TinyDialogues alone (§ Steered synth) |
| The flywheel (step 26) | Anonymous word-to-word counts from Pip users | Ours | Real AAC use; grows every month |

Excluded:
- **CHILDES/TalkBank:** CC BY-NC-SA 4.0. TalkBank's rules say the license
  "precludes the incorporation of the data in commercial products".
  Pip sells Pip Lifetime, so Pip is a commercial product even though the
  core app is free. CHILDES is used **only if TalkBank gives written
  permission**, and only within the scope they grant (test set only, or
  also the book). Enforced: `book_sources.json` may list CHILDES only
  with a `permission` field pointing to the stored permission letter
  (`data/prediction/permissions/`); the license test fails otherwise
  (R11).
- **BabyLM:** it bundles CHILDES and OpenSubtitles, both non-commercial.
- OpenSubtitles via OPUS (CC BY-NC-SA); the Santa Barbara Corpus (CC
  BY-ND); wordfreq's data (CC BY-SA); anything paid (Switchboard, COCA,
  Web 1T).
- "OpenAAC usage logs": no public dataset was found. CoughDrop has
  opt-in research data, but it isn't public.

The Kuperman AoA file already in the repo (`data/reference/aoa.csv`)
carries no stated license. Use it only as a number per word, and credit
it.

### Build

Files: `build_book.mjs` and `score_book.mjs` (new, in scripts/prediction/book),
`data/prediction/book_sources.json` (source manifest: URL, SHA-256,
license, credit), `data/prediction/opening_book.en.json` (generated),
`data/prediction/SOURCES.md` (credits), `public/shared/funnel.mjs`
(`book` feature and retrieval).

1. Download each source into a gitignored cache, pinned by URL and
   SHA-256 in the manifest. A test fails if any manifest license is not
   on the allow list (CC0, CC BY, CDLA-Sharing results, our own).
2. Tokenize and map to our lemmas: multi-word lemmas first (*all done*,
   *good night*), then word forms to their lemma (simple suffix rules
   until `docs/phases/005_Word_Forms.md` lands). A word outside our
   vocabulary breaks the context, so no count spans it.
3. Count 1-, 2-, and 3-grams per source, inside sentences, with a
   sentence-start token (this feeds step 21).
4. Combine sources with weights chosen on the held-out checks (below).
   A source that doesn't help gets weight 0. Smooth with backoff; pick
   the method (e.g. interpolated Kneser–Ney vs. simple backoff) by the
   held-out score.
5. Prune to the top 32 next words per context, with probabilities.
   Budget: about 2 MB for English. Regenerating reproduces the file byte
   for byte.
6. On the device: feature `book` = log P(word | last two items), backing
   off to one item, then to sentence start. Retrieval source: the book's
   top words for this context, minus core cells, hidden words, and words
   already on screen (steps 7, 8). The user's own history (step 10) sits
   on top, and per-user learned weights decide the mix, so a user's own
   habits win as they build up.
7. Credits: `SOURCES.md` lists every source, license, and required
   attribution; the app's About screen shows it.
8. Jev has two possible roles, and the bench decides which earn a place:
   offline as a source (our own table, especially where the corpora are
   thin), and live, reranking the shortlist the book and history produce
   (step 14).
9. **Age-band books.** Build one book per TinyDialogues age band (2, 5,
   10, 15), mixed with background sources, and pick weights per band on
   held-out child turns. A user starts on the band closest to the age a
   supporter gives at setup (default: 5). The learned weights then move
   toward the band whose book predicts this user's own picks best. This
   is how age enters prediction. A penalty per word did not work (§
   Experiments).
10. **AoA and Wordbank as stage signals, not rankers.** They inform the
    starting band, and break day-one ties among equally likely words.
    They also feed modeling and fading, deciding which words to teach
    next (`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 7.4).
    They never filter a word out.

### Held-out checks: the independent tests

- **Held-out child turns:** TinyDialogues' own validation split, per
  age band. The book never reads it.
- **Held-out adult AAC writers:** the Imagine AAC dev and test sets. They
  are human-written, so they guard against LLM-written sources
  flattering an LLM (Jev).
- **Real children (if permitted, R11):** CHILDES child utterances, used
  as a test set only, never read by the build.

`build_book.mjs` refuses to read any held-out file; a test checks it.
`score_book.mjs` reports top-4 and top-16 for the non-core next word,
split into first words and later words.

### Experiments (2026-09-23, scratch scripts, not committed)

Rough lemma mapping, simple interpolated 1–3-grams, no tuning beyond
what's stated. Metric: the child's next non-core word in the top 4.
Test: TinyDialogues validation child turns (age 2: 483 later words and
568 first words; age 5: 2,161 later and 489 first).

| Book | Age 2 later / first | Age 5 later / first |
| --- | --- | --- |
| Random 4 | 0.2% / 1.2% | 0.7% / 1.2% |
| AoA only (earliest-learned words) | 1.0% / 0.5% | 0.7% / 0.6% |
| Adult AAC (Imagine train) | 15.3% / 0.5% | 28.2% / 13.1% |
| Adult AAC + AoA penalty (strength tuned on train) | 16.6% / 1.1% | 28.2% / 13.1% (tuned to zero) |
| Adult AAC, AoA as the fallback | 12.6% / 0% | 24.9% / 10.0% |
| **Caregiver speech (adult turns, train dialogues)** | **33.5%** / 1.1% | **49.1% / 32.5%** |
| Child turns (train dialogues; same generator, optimistic) | 51.6% / 13.7% | 56.1% / 51.1% |

Also measured: the adult AAC book on held-out adult writers scored top 4
= 50.9% and top 16 = 74.4%. 76% of those writers' words are in our
vocabulary.

What it means:
- **Domain matters most.** Child conversation roughly doubles adult
  text.
- **AoA barely helps next-word ranking** (+1.3 points at age 2, none at
  age 5). Our 680 words were already chosen by AoA
  (`data/reference/aoa-README.md`: "age is the filter"), so that signal
  is spent. AoA says which words a child knows, not which comes next.
- **Partner words:** see step 24.

Limits: GPT-4 wrote TinyDialogues, both the source and the test. The
real-children run below corrects the size of both effects.

### Real children (CHILDES, 2026-09-23, measurement only)

At the founder's direction, a one-off measurement on CHILDES transcripts:
a public Hugging Face mirror of 10,828 English transcripts, 4.2M
utterances with speaker tags, and no ages. The data was kept in scratch
space outside the repo and is not in any shipped file (R11). Transcripts
were split 80/20. Test: 1,743 held-out transcripts, with 2,500 sampled
predictions per stage. Stage = the child's mean utterance length (MLU),
the standard language-stage measure. Metric: the child's next non-core
word in the top 4, later words / first words. "+ partner" = words from
the adult's previous turn get a fixed +2 boost.

| Book | MLU < 2 (~age 2) | MLU 2–3.5 (~age 3) | MLU > 3.5 (~age 4+) |
| --- | --- | --- | --- |
| Adult AAC (Imagine) | 20.6% / 3.4% | 26.8% / 7.1% | 27.8% / 9.9% |
| TinyDialogues caregiver + child (**legal**) | 24.9% / 3.6% | **37.0%** / 9.8% | **36.5%** / 18.7% |
| + partner words | 29.1% / 6.1% | 38.2% / 13.0% | 38.7% / 20.0% |
| CHILDES caregiver speech (not licensed) | 40.7% / 4.7% | 48.2% / 11.6% | 47.4% / 14.3% |
| CHILDES child speech (not licensed) | 43.5% / 16.5% | 49.2% / 22.5% | 49.7% / 22.3% |

Share of the child's non-core words that the adult said in the previous
turn: **18.4% (MLU < 2), 12.8%, 10.3%**.

What real children say:
- **The legal child book beats adult text on real children:** about +9
  points at ages 3–4+ (+35% relative), +4 at age 2.
- **Real child speech is worth another 11–16 points.** That is what
  permission to use CHILDES-derived counts would buy, and what the
  flywheel (step 26) must earn from real AAC use. It is optimistic:
  longitudinal corpora put the same child in train and test sessions,
  which acts partly like personal history.
- **Partner echo is real but modest in natural play:** 10–18% of words,
  +1 to +4 points in top 4. GPT-4's toddlers (70%) overstated it. It may
  run higher in AAC, where partners offer choices ("juice or milk?"),
  so the bench measures it per user and the weight is learned.
- **First words stay hard** (4–22%). Step 21 and occasions (step 9)
  aim here.

### Steered synth (2026-09-23, our corpus)

If TalkBank declines the derived-counts ask (R11), the fallback is to write
our own child-register text: `gen_childlike.mjs` authors dialogue frames in
the shapes real children use (from aggregate research patterns — no
transcript text or counts), expands them over our 680-word vocabulary
weighted by age-of-acquisition, and emits one dialogue corpus per language
stage. Same held-out CHILDES measurement as above:

| Book | MLU < 2 | MLU 2–3.5 | MLU > 3.5 |
| --- | --- | --- | --- |
| TinyDialogues age-band book (this harness) | 20.4% | 31.3% | 33.2% |
| childlike synth alone | 21.9% | 27.2% | 29.0% |
| **synth + TinyDialogues mix** | **25.4%** | **34.4%** | **36.4%** |

What it means: the authored corpus is weaker alone — ~200 frames can't
match GPT-4's 130k varied dialogues — but it adds +3–5 points as a second
source because it fills the high-frequency child contexts TinyDialogues
misses. It ships either way; if TalkBank says yes, CHILDES counts join as
one more weighted source in the same build (step 23 item 4), not a
replacement. Scratch harness, not committed; numbers use this doc's
protocol (80/20 transcripts, 2,500 sampled predictions per band).

Truth owner: this doc until closeout, then
`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.2–5.3.

Lie-prone layer: building and scoring on the same text. Held-out writers
are scoring-only, enforced by a test.

Works Test: regenerating is byte-identical. The full build beats the
scratch results above on every held-out check (e.g. above 33.5% later
words at age 2, above 50.9% on adult AAC writers). The license test
passes. Bench arm B (book only, no history) shows a day-1 saving above
zero on synthetic users.

Done when: those pass, and the numbers are in § Results.

## Step 24 — The partner's words

Goal: when an adult has just said or modeled words, the strip already
holds the ones the user is likely to answer with. "Juice or milk?" → the
strip shows *juice* and *milk*.

Why: in real children's speech (CHILDES, step 23 § Real children),
10–18% of a child's non-core words were just said by the adult, the most
at the youngest stage. Boosting them adds +1 to +4 points in top 4 in
natural play. That is smaller than GPT-4's dialogues suggested (70%), but
it is free, and it should be larger when an adult offers choices, which
is exactly what modeling on an AAC device does. The weight is learned
per user.

Files: `public/shared/funnel.mjs` (`echo` feature, retrieval source),
`public/board.js`, the 013 Spotlight modules, `src/board/strip.test.mjs`.

Build, in order of how the partner's words reach the device:
1. **Partner modeling on the device.** Taps an adult makes while
   modeling (013 partner modeling) become the partner's turn for the
   next strip moment. No microphone.
2. **The active Spotlight list.** An open Spotlight session's words are
   a retrieval source and a small `echo` boost for the session.
3. **The Listen key** (`docs/phases/008_Partner_Listening.md`), for
   families who turn it on.

`echo` is 1 for a candidate the partner said in their last turn (decays
over about two minutes), and the partner's words are a retrieval
source. Its weight starts from the fit users and is learned per user,
so a child who rarely echoes loses the boost. The partner's words stay
on the device; the Jev request gets them only as § 3.2 already allows
(`partner_said`, when listening).

Bench: synthetic users get partner turns (step 11). Messages that answer
a partner carry the partner's words, at an echo rate set per persona
(10–70%), written into the answer key before any prediction. Report the
lift with and without partner turns.

Works Test: an adult models *juice* and *milk* → the next strip shows
both. A user whose history shows no echoing gets a learned `echo` weight
near zero after 50 moments. No partner word is persisted in
`learner_event_log` as the child's pick (013's rule: modeling taps
aren't the child's).

Done when: those pass and the lift is in § Results.

## Step 25 — Word classes, slots, and topic

Goal: one example teaches a whole class. After *eat cookie*, other
foods rise after *eat*. *Cooper* is predicted after *play with* on the
day he's added. Suggestions a user keeps passing over fade.

Build:
1. **Classes.** Each word's class is its catalog group (Food, Animals,
   People…); each entity's class is its category. The book stores counts
   at both levels: word → word, and word → class ("I want [Food]",
   "play with [Toy]", "where is [Person]"). A candidate's `book_class`
   feature = log P(class | context) + log P(word | class, user). Personal
   history counts the same way, so the user's own "eat → [Food]" habit
   generalizes to foods they haven't said yet.
2. **Slots for personal entities.** An entity inherits its category's
   slot predictions immediately (step 23's source data has no names; the
   class does the work).
3. **Topic.** `topic` feature: the candidate's class appeared in this
   user's last three sentences (decays over ~10 minutes). After
   *dinosaur*, animals and toys rise.
4. **Ignored suggestions fade.** `ignored` feature: how many times this
   word was shown to this user in a similar context and not picked
   (decayed). Learned weight, so it can't bury a word the user still
   picks.

Works Test: after one *eat cookie*, *cracker* ranks higher after *eat*
than before. A fresh entity in "Animals & Nature" appears after *play
with* on day one. A word shown 10 times in a context and never picked
drops below a comparable word never shown.

Done when: those pass and the bench shows the lift, with no cohort
regression.

## Step 7 — Suggest words the user has never picked

Goal: any available word can appear on day one when context supports it.

Files: `public/shared/funnel.mjs` (retrieval), new aggregate tables in
`src/board/schema.sql` (step 17 constraint).

Build:
1. Retrieval pool: every non-core word reachable on this user's boards
   and groups, plus active entities, minus hidden words (`sense_mask`),
   minus core cells on the current home layout (picture mode keeps the
   "core words are never strip tiles" rule).
2. Retrieval sources, each giving up to N candidates into a budget (e.g.
   64) before ranking cuts to the shortlist: the opening book (step 23),
   history continuations, board and group context (step 8), occasion
   (step 9), and grammar fit as a *score*.
3. Remove the evidence requirement (`funnel.mjs:273-278`).

Lie-prone layer: flooding the shortlist so hit rate looks fine while
harm rises. Watch harmful-show rate and latency with every change.

Works Test: a brand-new user at 07:50 on a school day with *I want*:
the strip offers breakfast-appropriate words that were never picked, and
a hidden word never appears. Bench: A3 day-1 saving > 0 (today it is 0).

Done when: both pass and step 17's latency budget still holds.

## Step 10 — Real phrase memory; grammar as a hint

Goal: "I want to" and "I need to" can rank differently. Short or
non-standard sentences still get suggestions.

Build:
1. Replace `phrase` and `pair` with three separate features: `ctx1`,
   `ctx2`, `ctx3` — decayed counts of this word after exactly the last
   1, 2, and 3 items in earlier sentences. Each counted once, in its own
   slot.
2. `invited` stays a feature and stops being a filter (`funnel.mjs:278`).
   Adjective and other tails get candidates too; ranking decides.
3. Refit defaults on fit users (`fit_defaults.mjs` reads synthetic users,
   not the old fixtures). Bump `defaults.json` version.

Works Test: two histories that differ only at position −3 give different
`ctx3` and a different order. After *red*, the strip can offer a noun.
The feature-duplication check (the one in § 1) now reports zero
identical columns.

Done when: those pass and the bench shows no cohort regression.

## Step 6 — Separate "nothing here fits" from "the word isn't here"

Goal: two different questions get two different answers. Plausible
breakfast suggestions must not make the strip certain the person wants
breakfast.

Files: `public/shared/funnel.mjs` (`scoreCandidates`, `applyJev`,
`showGate`), `public/shared/learn.mjs`, `scripts/prediction/fit_defaults.mjs`,
`data/prediction/defaults.json`.

Build:
1. **Ranker:** softmax over the candidates only (no `none` term). Jev
   enters as `log P_Jev(w)` renormalized over the candidates, excluding
   Jev's `none`. (The offline fit already fits θ this way,
   `fit_defaults.mjs:61-91`; inference should match.)
2. **Gate:** a separate small logistic model for "the target will be one
   of the tiles I'd show". Features: top shown probability, how often
   this user's next pick fell outside the shortlist after a similar tail
   (learned count), how often the next pick after this tail was a core
   word, shortlist size, first-word flag, and Jev's `P(no-fit)` as **its
   own feature** with its own weight (starts at 0, learned).
3. **Show by likelihood (R9):** show the most likely words when
   `P(hit)` clears a threshold tuned on tune users. Tiles are ordered by
   probability, never by how far away a word is.
4. Refit on fit users; tune the threshold on tune users.

Truth owner: § 5.3–5.4 (rewritten at closeout).

Lie-prone layer: the gate trained on the ranker's own confidence only.
It must also learn from how often this user goes elsewhere.

Works Test: a breakfast moment where Jev gives `P(no-fit) = 0.01` for
plausible breakfast words, but this user's history says the next pick
after this tail is outside the shortlist 90% of the time → the strip
stays silent. Jev's `no-fit` never changes the order of candidates.
Bench: harmful-show rate falls vs the previous A3 with no loss in
saving.

Done when: both pass.

## Step 8 — The open board and group are local context

Goal: the same sentence and history can give different, useful
suggestions on a food group vs a playground group. This context never
leaves the device.

Build:
1. `stripScored` takes a `view` argument: active board, open group,
   most recently opened group in this sentence.
2. Feature `group_ctx`: candidate belongs to the open or recent group.
3. **Review addition:** words already visible on screen are not
   suggested. They cost one activation where they are, so a strip tile
   only adds scanning.
4. Nothing about the view goes into the Jev request (§ 3.2 whitelist is
   unchanged; step 14's request-body test proves it).

Works Test: same prefix and history, food group recently open vs
playground group → different top tiles. A word visible on the open page
is never a strip tile. The captured Jev request body has no group or
board field.

Done when: those pass.

## Step 9 — Occasions as a soft local signal

Goal: at breakfast, breakfast words are easier to reach — without
blocking *blanket*, *stop*, or anything unexpected — and only if
occasions beat what time of day already does.

Why they might not: the `hour` feature already learns "juice around
07:50 on school days" from the user's own picks. Occasions can only add
value in three places: **day one** (no history yet), **grouping**
(breakfast words belong together even if one was never said at 07:52),
and **schedule changes** (breakfast at 06:30 on weekdays, 09:30 on
Saturday, a school holiday).

Build (R3): run `docs/phases/007_Occasions.md` slices 1, 3, and 4 (slice 2
optional):

1. Ship default time windows by day type, and a per-word occasion score
   (breakfast, school, play, bath, bedtime to start).
2. The user's own picks move the windows (007 slice 4). No screen for
   adults to edit times.
3. The `occasion` feature is a score and a retrieval source only, never
   a filter.

Works Test (from the audit): at breakfast the occasion helps retrieve
breakfast words; a non-breakfast word the user picks still ranks as it
would without occasions (within one slot). Plus 007's own Works Tests.

Bench: arm "hour only" vs "hour + occasions". **Keep occasions only if
they win on day one and in the schedule-change cohort, with no loss in
the unpredictable cohort.** Otherwise record the result and drop them.

Done when: the comparison is in § Results and the keep/drop call is made.

## Step 21 (addition) — Predict the first word

Why: 47 of 118 held-out picks in the routine fixture are sentence-first,
and the strip shows fixed starters there. The first word is also where
time and occasion say the most, because there is no sentence yet.

Build: a bench arm only. At position 0, the strip offers predicted
starters (the opening book's sentence-start words, plus history at this
hour and occasion), using
the same gate. Report the saving on first words separately.

Done when: the number is in § Results. Changing the real idle strip is
founder ruling R6.

## Step 14 — Real Jev on frozen requests

Goal: Jev experiments are repeatable, cheap to re-run, and honest about
list size, cost, and failure.

Files: `public/shared/jev.mjs`, `public/shared/funnel.mjs`
(`SHORTLIST_CAP` becomes model config), `jev_cache.mjs` (new, in
scripts/prediction/bench), `data/prediction/jev_cache/` (committed;
synthetic content only).

Build:
1. The shortlist cap moves into `catalog.prediction` config and is passed
   to `stripScored`. Truncation happens once, at the configured size.
2. `JEV_PROMPT_VERSION` next to `JEV_MODEL`; the request records it.
3. Cache key = hash of the exact request body + model + prompt version.
   Each entry stores the response, measured latency, and date. Bench
   modes: `--jev live` (no spend cap, R4), `--jev cache` (default;
   misses are reported, not called), `--jev off`.
4. Run caps 8 / 16 / 32. The report prints the **actual** list-size
   distribution per cap (if most lists have 5 words, say so), calls,
   failures, latency, and the gain A4 − A3, delivered and theoretical.
5. Offline Jev as an opening-book source (step 23, item 8): the same
   cache, run over the book's common contexts. The bench compares "book
   with the Jev source" vs "book without it".

Live runs use `TYPESAFE_API_KEY` from `.dev.vars` (local Worker) and
synthetic data only.

Works Test: a cache run twice gives byte-identical Jev results. The cap
32 run shows lists longer than 16 where retrieval had more. The captured
request body still equals the § 3.2 whitelist exactly
(`src/board/jev.test.mjs`).

Done when: those pass and the cap table is in § Results.

## Step 17 — Speed and stability on the iPad

Goal: local prediction paints within budget with months of history, and
a late answer can never replace a tile during a reach.

Build:
1. **Speed.** Per-render cost must not grow with history. Today
   `features()` runs one query per candidate plus one per past event of
   that candidate (`funnel.mjs:126-157`). With step 7's larger pool this
   will not scale. Keep running counts, updated in `logSelection`, per
   (context → word), (hour, day type → word), (occasion → word), and
   read them at render.
2. **Stability.** `jevDeliverable` (step 2) blocks a repaint once a
   pointer-down has happened on the board since paint. When a repaint
   happens, tiles that stay keep their slots.
3. **Measure.** A browser probe (pattern `scripts/probes/jev_probe.mjs`)
   loads the heaviest eval persona × 6 months of history on an iPad (R2),
   taps 200 picks, and records pick → painted-strip time
   (`performance.mark` around `renderStrip` through the next animation
   frame).

For scale: in Node, with 2,430 events (84 routine days), `stripScored`
takes 3.5 ms median today. That is not the device, and the pool is tiny.
Measure the real thing.

This is a check on the real app only; the simulation has no device.

Works Test: p95 below 50 ms on the iPad (the local-paint target in
`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 3.4). Stub Jev
answering at 400 ms with a pointer-down at 300 ms → no repaint. Answer
at 400 ms with no touch → repaint, and the unchanged tiles keep their
slots.

Done when: those pass on the iPad, not just in Node.

---

# M4 — Proof

## Step 19 — Report the lifts

Goal: one plain answer to the founder's two questions, on users the
system has never seen: **how much does our own data save, and how much
more does Jev add?** No pass/fail targets (R1).

The `--final` report leads with:

| Lift | Comparison | Question it answers |
| --- | --- | --- |
| Language | B (book only) vs A0 (no prediction) | What does knowing English alone save, on day one? |
| Own data | A3 (book + history + context) vs A0 | What does everything local save? |
| Jev | A4 delivered vs A3 | What does Jev add on top? (Theoretical shown beside it.) |
| vs. classic | A3 vs A1 (simple baseline) | Are we better than standard word prediction? |

Each lift is modeled actions per message, with a 95% bootstrap interval
over eval users, at all three inspection costs, for day 1, week 1, and
days 22–30. Each is labeled **clear gain** (interval above zero), **no
clear effect** (interval spans zero), or **clear loss** (interval below
zero). Every cohort where a lift is a loss is listed.

The report also shows the ceiling (O2) and each lift as a share of it,
so "how close to perfect" is visible.

Done when: `npm run prediction:bench -- --final` has run once on a clean
tree and its table is pasted under § Results with the commit.

## Step 22 (addition) — The whole-message ceiling

Why: word-by-word prediction can save at most the non-core share (46% on
the routine fixture). Families repeat whole messages ("I want juice" at
07:50). A tile that completes the rest of a habitual message may be
where "wow" lives.

Build: a bench arm only. When history strongly predicts the rest of the
message, one strip tile offers the completion (e.g. after *I* at 07:50 →
*want juice*). It uses the same gate and the same inspection cost. Report
the saving vs A3 and the harmful-show rate.

Done when: the number is in § Results. Showing message tiles on screen
is founder ruling R6 and overlaps
`docs/phases/014_Grid_Density_And_Fit.md` slice 6.

## Step 20 — Removed

Removed 2026-09-23 (R5): no pilot. The simulation decides whether this is
worth deploying; after launch, `predictionReport` measures real use.

# F — The flywheel (parallel track)

## Step 26 — Every user makes prediction better for everyone

**DECIDED 2026-09-23** (founder: "our flywheel should be on … that data
flow must be in our specs"). Anonymous word-to-word counts from every
Pip user flow back into the opening book. Legacy AAC runs offline with
static boards, so no competitor has this. The book improves every
month, measured against real AAC use instead of adult text.

**Amends** `docs/product/Stats_And_Progress.md` § 6.3, which today
never sends "sentences or any sequence of words". The amendment (R10):
short word-to-word counts of built-in words may be sent; whole
sentences, own words, names, and times still never leave the device.
Update § 6.3 and its § 7 ban test in the same commit that builds this
step.

**The setting:** the existing "Help improve Pip" switch (§ 6.3), on by
default. One switch, not a second one. Off means nothing is sent, ever.
Turning it off stays free for everyone (R10).

**Sent (once a day, whitelist only):**

| Field | What |
| --- | --- |
| `book_version`, `app_version`, `locale`, `layout` | as named |
| `age_band` | the band the user's prediction currently runs on (2 / 5 / 10 / 15) |
| `ngrams` | counts of 1-, 2-, and 3-word sequences **inside spoken sentences**, built-in catalog ids only, plus a start token. Personal entities become their category token (e.g. `<Animals & Nature>`); own words become `<own>`. Nothing longer than 3. |
| `strip` | per built-in word id: times shown, times picked from the strip, times picked elsewhere while shown |
| `partner` | counts of (partner word id → next child word id) when step 24 had partner words, ids only |

**Never sent:** sentences as spoken, any sequence longer than 3, names,
own words, entity ids, photos, times of day, tap times, the user id, a
device id, or the research id. The upload carries no identifier at all.
The Worker stores the counts and logs no body and no IP.

**Server side:** daily uploads are summed. An n-gram enters the book
only after it has appeared in at least K separate uploads (start K =
50), so no rare family phrase can be traced back. A monthly rebuild adds
the flywheel as a book source (step 23), with its weight chosen on the
held-out checks like any other source. The new book ships with the
catalog update.

Files: `flywheel.mjs` (new, in public/shared: builds the daily payload
from the local log, pure), the 016 anonymous-totals sender (same
schedule, same switch), a Worker route, `docs/product/Stats_And_Progress.md`
§ 6.3 and § 7.

Depends on: 016 slice 6 (anonymous totals) for the sender and the
switch.

Truth owner: `docs/product/Stats_And_Progress.md` § 6.3 (after the
amendment).

Lie-prone layer: a payload builder test that passes while the real
request sends more. Capture at the network boundary, like
`src/board/jev.test.mjs`.

Works Test: capture every request during a scripted week of taps with
the switch on. Every payload's keys equal the whitelist exactly. No
payload contains a sequence longer than 3, an entity name or id, an own
word, a time, or any identifier. Switch off → no request at all. On the
server, an n-gram seen in K − 1 uploads is absent from the rebuilt book.

Done when: those pass, § 6.3 is amended, and a rebuilt book with the
flywheel source scores on the held-out checks.

Note: `docs/product/Clipart_Pipeline_And_Catalog_Growth.md` § 6 still says
utterances have "zero cloud transmission". That was already untrue
under Jev sharing, and this step changes it again. Reconcile that table
at closeout.

---

## Additions from this review

The audit fixed and measured the strip we have. It never asked what the
strip should know. These additions go after the biggest gains:

| Step | Idea | Why |
| --- | --- | --- |
| 23 | The opening book, from child conversation | The strip knows nothing about English today; caregiver speech doubles adult text on held-out child turns |
| 24 | The partner's words | 10–18% of real children's non-core words echo the adult's last turn; +1–4 points |
| 25 | Word classes, slots, topic, fading | One example teaches a class; new entities are predicted on day one |
| 26 | The flywheel | Every user improves the book; nobody else in AAC has this data |
| 21 | Predict the first word (bench arm) | 40% of picks are sentence-first and get no prediction today |
| 22 | Complete the whole message (bench arm) | Word-level savings are capped by core words (46% ceiling on the fixture) |

Core-cell halos (`docs/strategy/Dual_Engine_Predictive_Intelligence.md`
§ 7.4) would help with the 57% of picks that are core words, but they
save search time, not activations. They stay out of scope until the
action model includes search time.

## Human stops

None open; R1–R11 are ruled. Step 26 changes what leaves the device;
build it exactly to its whitelist. Any change to what Jev receives on a user's
device (the § 3.2 whitelist) stops the phase for a founder call. Offline
book-building calls send only our own vocabulary and synthetic contexts.

## Out of scope

Partner listening and `echo` (`docs/phases/008_Partner_Listening.md`).
Entity enrichment (§ 5.6). A feature vector for the keyboard ranker.
Screen changes for steps 21 and 22 (R6). Rate limits. Core-cell halos.

## Results

Filled in by each step: numbers only, with the commit and the bench run
that produced them. M3 steps record before → after on fit + tune users.
Step 19 records the one `--final` eval run.

| Step | Arm / change | Saving vs A0 | Hit | Harmful show | Day-1 saving | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| 23 prototype | Imagine AAC train set only; held-out writers, non-core next word | — | top-4 50.9%, top-16 74.4% | — | — | scratch, 2026-09-23 |
| 23 experiment | Caregiver-speech book vs adult AAC book, TinyDialogues held-out child turns (later words) | — | age 2: 33.5% vs 15.3%; age 5: 49.1% vs 28.2% | — | — | scratch, 2026-09-23 |
| 24 experiment | Partner's last-turn words boosted (fixed +4 logit), caregiver book, TinyDialogues | — | age 2: 15.8% → 27.9%; age 5: 46.6% → 44.1% | — | — | scratch, 2026-09-23 |
| 23/24 real children | CHILDES held-out transcripts, later words top 4: adult AAC → legal child book → CHILDES book (+partner on legal) | — | ~age 3: 26.8% → 37.0% (38.2%) → 49.2% | — | — | scratch, 2026-09-23 |
