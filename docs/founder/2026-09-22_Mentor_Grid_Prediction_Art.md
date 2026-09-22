# Founder Intake: Mentor Session on Grid, Prediction, and Art

**Intake date:** 2026-09-22.
Source: founder summary of a mentor conversation (2026-09-21), delivered as a
product and architecture requirements note.
Intake workflow: `docs/workflows/SSOT_Founder_Input_Workflow.md`.
Nothing in this file is the truth owner. Routed claims live in the docs named
below.

---

## Founder intent

Capture three product constraints from the mentor session:

1. A **predictive strip** that surfaces likely next words, especially deep fringe, without moving the core grid.
2. An **independently designed core grid**, seeded from open clinical vocabulary research, not transcribed from an incumbent board.
3. An **in-house image system**: one neutral stick character for people and actions, and a separate illustrated style for objects.

## Product value

- Motor memory stays intact because prediction cannot reorder core cells.
- Fringe words can appear in one tap instead of a folder maze.
- The symbol set can be owned, generalized across users, and kept clear of competitor art libraries.

## Trusted workflow slice

Documentation only. No UI, model, or asset pipeline is built in this intake.

## Current state

Vision and dual-engine prediction were already **DECIDED 2026-09-21**. This intake adds the grid, art, and strip contracts. No motor grid, symbol renderer, or suggestion engine exists in `src/`.

## Truth owners

| Topic | Owner |
| --- | --- |
| Clinical why, and how the strip sits on the motor grid | `docs/strategy/Vision.md` |
| How suggestion candidates are chosen, and the latency split | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` |
| Clean-room grid, Fitzgerald color, stick figure, object art, strip layout | `docs/product/Motor_Grid_And_Art.md` |
| Fact map | `docs/product/SSOT.md` |

## Proof scenario

Citation lint passes. A reader can find each adopted rule in exactly one owner doc, tagged **DECIDED 2026-09-22** and marked not built.

## What was adopted, and what was reconciled

Adopted:

- Session-level coordinate immutability: while a density and orientation are in use, core cells do not swap, hide, or shift because a model prefers another word.
- Predictive strip under the sentence bar and above the core grid, at most four tiles, each with text and an in-house icon.
- Clean-room coordinate map and in-house assets. Do not copy incumbent grids or symbol libraries.
- Core-word seeding from open sources already named in the clinical bibliography, plus CLDS core-word studies and the MacArthur-Bates CDI.
- Modified Fitzgerald Key torso and button colors, as specified in the product doc.
- One stick character for human and action meanings; illustrated objects for inanimate nouns.
- In-place category sub-zones that leave the sentence bar and navigation anchors where they are.
- Strip bias from the words already chosen, time of day, and the learner's own fringe entities.

Reconciled with 2026-09-21 decisions (those decisions stay):

- **Absolute pixel freeze across densities is still rejected.** Within one density, cells do not move. Across densities and orientations, stability remains spatial-vector anchoring, not one copied `(x, y)` template.
- **Prediction is not redefined as on-device-only.** The strip's first paint is local and must resolve in under 50 ms. TypeSafe Jev may refine candidates when online and must not block that first paint or move core cells. Offline clamp from the dual-engine doc still applies.
- **Core lexicon size stays the ~200 high-frequency anchors** already decided. The mentor's ~50–100 figure is the first independently mapped primary set on the motor grid, not a replacement for the broader graph.
- **Legal outcome is not a product claim.** The mentor cited compilation-copyright and trade-dress risk as the reason for a clean-room method. The adopted rule is the engineering constraint. This repo does not assert that the method produces a particular legal result.

## Blocking questions

None for documentation. The first executing phase is still unopened.

## Next slice

Open an executing phase when build work starts. Proposed build order is listed in `docs/product/Motor_Grid_And_Art.md` and is **PROPOSED**, not scheduled.
