# Founder Intake: Prediction blend, Jev sharing, listening, occasions

**Intake date:** 2026-09-22.
Source: founder review session on the predictive strip (audit of the
dual-engine spec against the code and the TypeSafe Jev docs, then two
rounds of founder rulings).
Intake workflow: `docs/workflows/SSOT_Founder_Input_Workflow.md`.
Nothing in this file is the truth owner. Routed claims live in the docs named
below.

## Founder intent

1. Prediction is the category-defining feature. Suggesting likely words is
   not spoon-feeding when the suggestions are usually right and the child
   still chooses. Communication rate is the problem being solved.
2. **Jev sharing is a setting, on by default** (founder ruling, same day:
   "on by default"); a parent can turn it off. No enterprise zero-retention
   contract. What goes to Jev is anonymous: TypeSafe does not know the app
   or the user. Founder expects almost no one to turn it off.
3. **Jev gets no time of day and no history.** Jev judges meaning. Local
   code owns time, occasion, habit, and everything the child said before.
4. **The device is not always listening.** Listening can be off for good in
   settings, or turned on and off by a key on the board. Some users never
   want it. When nothing was heard, Jev works from the shortlist and the
   sentence being built — no clue what anyone said before.
5. **The blend is where the magic is.** Combine the engines properly and
   learn from the child's own behavior. Learning from real use is the focus.
6. **Sentence boundaries matter.** Track when a sentence ends or the child
   starts over.
7. **Occasions (breakfast, bedtime …) are a separate dimension from
   groups.** Test how to build them before deciding: an LLM reasoning over
   the word list vs. Jev classification, compare the overlap, then use
   agreement, both, or a weighting.
8. Rate limits are parked. No users today; hitting them means success.

## Product value

- The strip is right more often, sooner, for each child — and learns that
  child's routine without an adult configuring anything.
- Families who never want a microphone lose nothing but partner echo.
- Every claim about "better" becomes a number from the child's own taps.

## Audit findings that fed this intake

- **BUILT defect.** The strip's time-of-day signal compares the current
  **local** hour (`funnel.mjs:80`) with the **UTC** hour of each logged
  tap (`strftime(..., 'unixepoch')` in the same file). Measured on
  2026-09-22: an 8:20 tap reads as hour 8 in UTC, 13 in Chicago, 6 in
  Berlin. Outside UTC the signal boosts the wrong time of day. Fix routed
  to `docs/phases/006_Prediction_Engine.md` slice 1.
- The event log has no sentence boundary, and the strip logs no
  impressions, so nothing can be learned or measured yet.
- The old blend (`0.55·P_Jev + 0.35·P_local`) adds numbers on different
  scales, and the old confidence gate uses Jev's top-1 peakedness for a
  four-tile strip. Both replaced.
- Jev reads times poorly (TypeSafe jaggedness list, jev-1.13): moot now
  that time stays local.

## Routed decisions

- **DECIDED 2026-09-22** (not built). Blend, learning, confidence gate,
  Jev request contents, Jev sharing on by default:
  `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 3, § 5.
- **DECIDED 2026-09-22** (not built). Listening modes and the Listen key:
  `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 6; layout in
  `docs/product/Motor_Grid_And_Art.md` § 2.
- **DECIDED 2026-09-22** (not built). Sentence table, event-log columns,
  strip impressions, learned weights, profile settings:
  `docs/product/Language_And_Voice_Schema.md` § 6.2c–6.2e.
- **DECIDED 2026-09-22** (not built). Occasions as their own dimension,
  experiment first: `docs/phases/007_Occasions.md`.
- **DECIDED 2026-09-22** (direction, not built). Prediction as a fading
  prompt on core cells, and an independence report for the SLP:
  `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 7.4.

## Execution

| Phase | Doc |
| --- | --- |
| 006 — Prediction engine (time fix, logging, blend, learning, Jev) | `docs/phases/006_Prediction_Engine.md` |
| 007 — Occasions (breakfast experiment, then the occasion prior) | `docs/phases/007_Occasions.md` |
| 008 — Partner listening (settings, Listen key, on-device speech) | `docs/phases/008_Partner_Listening.md` |

## Blocking questions

None for the docs. Two founder calls are named in the phase docs where they
bite: the Listen key's position (008 slice 1) and where 006 slice 1 sits in
the critical path (`docs/phases/README.md` § Next is unchanged).
