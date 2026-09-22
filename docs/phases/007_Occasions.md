# Phase 007 — Occasions

**Status:** Ready to execute. Not started. Slice 1 can run any time; it
touches no app code.

**DECIDED 2026-09-22** (founder: "brilliant idea … I don't know if JEV
should classify our words or if an LLM should reason over it. I think we
should test it"). Intake:
`docs/founder/2026-09-22_Prediction_Blend_Privacy_Listening.md`.

Product truth this phase implements:

| Topic | Owner |
| --- | --- |
| Occasion as a feature of the local model | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.2–5.3 |
| Stored model output carries provenance, used as a hint | `docs/product/Design_Invariants.md` § 7 |
| Groups (topics) stay what they are | `docs/product/Motor_Grid_And_Art.md` § Groups |

---

## Why this phase exists

Groups are topics (Food & Drink, Clothing). Occasions cut across them:
breakfast is waffles and juice, but also *brush teeth*, *get dressed*,
*hurry*, *bus*. The strip needs "what does this child say at breakfast";
groups cannot answer it, and linking groups to times would be wrong.

A new child also has no history, so the strip is empty on day one. A
shipped occasion prior fills that gap until the child's own picks take
over (006 slice 4 learns how much to trust it).

**No edge table, reconciled.** `docs/product/SSOT.md` says strip relevance
is computed live with no edge table. Occasion tags are not authored links:
they are generated model output with provenance (model id, prompt version,
score per word), regenerated from source, consumed as one weighted feature
— the pattern `docs/product/Design_Invariants.md` § 7 allows.

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| occasion (breakfast, bath, bedtime …) | routine group, scene, context folder |
| occasion prior (shipped, per word, 0–1) | occasion membership, occasion list |
| occasion window (time range, per child) | schedule |

---

## Slice 1 — The breakfast experiment

Goal: decide, with evidence neither model produced, how occasion tags are
built.

Files: `arm_llm.mjs`, `arm_jev.mjs`, `compare.mjs` (new, in
scripts/occasions), `data/occasions/breakfast.llm.json`,
`data/occasions/breakfast.jev.json` (new, generated),
`src/board/fixtures/occasion_breakfast.en.json` and
`src/board/fixtures/occasion_bedtime.en.json` (new),
`occasions_experiment.test.mjs` (new, in src/board).

1. **The instrument first**, committed before either arm runs:
   - A breakfast fixture of at least 60 short sentences children say or
     hear at breakfast. Preferred source: CHILDES mealtime transcripts,
     reduced to catalog-word frequencies (derived counts, not transcripts).
     **UNVERIFIED:** whether TalkBank's licence allows committing derived
     counts in a commercial repo — check before using; if not, fallback is
     a person who has not seen either arm's output writing the sentences.
   - A bedtime fixture of the same size and source: the control.
2. **Arm A — reasoning LLM.** For each of the catalog words: breakfast,
   yes or no, with a one-line reason. Output stores model id and prompt.
3. **Arm B — Jev.** One Noul per word ("Is this word commonly said by or to
   a young child at breakfast?"), batched as in TypeSafe's counting
   pattern (`words[i]` in state, one Noul per index). Output: probability
   per word, model id, prompt.
4. **Variants:** A alone; B at cut-offs 0.3 / 0.5 / 0.7; A∩B; A∪B; B as a
   soft weight (no cut-off).
5. **Measure each variant:**
   - coverage: share of breakfast-fixture catalog-word tokens in the set;
   - specificity: share of bedtime-fixture tokens *not* in the set;
   - size;
   - strip hit rate at 08:00 on 006's simulation with the variant as the
     occasion prior (requires 006 slice 3; until then, coverage and
     specificity decide).
6. **Disagreement list** for the founder: words in A not B and B not A,
   with A's reason and B's probability. A taste check, not the gate.

Truth owner: this doc until the method is chosen; then
`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.2.

Lie-prone layer: grading the arms against each other. Neither model's
output is the answer key; the fixtures are.

Works Test: `compare.mjs` prints the table for every variant; a variant
equal to the whole catalog scores 100% coverage and ~0% specificity, and
an empty variant scores 0% coverage — the metrics can fail.

Proof command: `scripts/test.sh` on the experiment test (asserts the
fixtures load, every variant is scored, and the two controls behave).

Done when: the table and the disagreement list are recorded under
§ Results and the founder has picked the method.

---

## Slice 2 — One harder occasion

Goal: confirm the chosen method on an occasion where the words are less
obvious than breakfast (bedtime or school — founder picks). Breakfast may
flatter both arms.

Same files and measures as slice 1, with the roles of the fixtures swapped
or a new control. Done when the method holds (or the founder changes it)
and the result is under § Results.

---

## Slice 3 — The occasion prior in the catalog

Goal: ship a prior for about ten occasions, generated by the chosen method.

Files: `generate.mjs` (new, in scripts/occasions), `data/occasions/occasions.json`
(generated: occasions, default time windows by day type, per-word score,
model id, prompt version), `scripts/catalog/build_catalog.mjs`,
`src/board/schema.sql` (catalog tables `occasion`, `occasion_sense`),
`docs/product/Language_And_Voice_Schema.md` (DDL).

Occasions (starting list; founder may edit): wake up, breakfast, getting
dressed, school, lunch, snack, play, bath, dinner, bedtime, car.

Works Test: after import, 006's `occasion` feature is non-zero for
breakfast words at 08:00 and zero at 20:00; the simulation's **day-1**
hit rate (no history) rises over the slice-3 baseline in
`docs/phases/006_Prediction_Engine.md`.

Done when: that passes and regenerating from the script reproduces the
committed JSON byte for byte.

---

## Slice 4 — Each child's own occasion windows

Goal: the shipped windows are only a start; the child's picks move them
(breakfast at 06:30 on school days, 09:30 on Saturdays).

Files: `public/shared/occasions.mjs` (new), `public/shared/funnel.mjs`.

1. Current occasion = the shipped window, shifted by this child's own time
   histogram for that occasion's words (school day vs. weekend).
2. Recent picks nudge it: *hungry*, *eat* make a meal occasion more likely
   now.
3. The child's picks within the occasion add to the `occasion` feature;
   the shipped prior's weight is learned in 006 slice 4, so it fades as
   the child's own evidence grows.

Works Test: a simulated child who eats breakfast at 09:30 on weekends;
after two weeks the breakfast occasion is active at 09:30 on Saturday and
not at 07:00.

Done when: that passes on the simulation.

---

## Results

Filled in by slices 1–2.

## Out of scope

Caregiver-declared occasions ("it's bath time" button) — a later slice if
the learned windows are not enough. Occasion-specific UI surfaces (Context
River).
