# Design & Engineering Invariants

Cross-cutting invariants for PipAAC. Product-specific contracts add detail in
`docs/product/` as the codebase grows.

## 1. Truth before surface

API responses and generated output may render truth; they must not invent durable
product truth. Prompt prose may request work; it must not be the only owner of
semantics.

## 2. One proof path

Every feature slice needs one owner-visible Works Test or an explicit proof
waiver. Measure the actual thing, not the system's report of it.

**A gate must be seen to fail.** An invariant that has never been observed failing
is not known to work, and a measurement that *structurally cannot* fail is
indistinguishable from a pass.

**The runner is a gate too. BUILT** (`scripts/test.sh`). A proof command is only
evidence if naming a missing file fails and being blocked is distinguishable from
being green. Missing path exits 2; lock-blocked exits 75.

## 3. Deterministic checks over agent judgment

Prefer gates, scanners, and scripted proof over recurring human or model review
for things that can be checked mechanically.

## 4. Maintenance preserves behavior

Code maintainer and deslop passes preserve behavior unless the task is explicitly
a bug fix. Do not mix broad cleanup into feature or bug slices.

## 5. Trust capable agents

Give agents tools and clear packets; do not bolt scoring/threshold harnesses on
to compensate for vague instructions. Taste and judgment live in skills and
packets, not hidden veto layers.

## 6. Symbol art and the motor grid

Human figures, object icons, Fitzgerald color, and the motor-grid coordinate
map have one owner: `docs/product/Motor_Grid_And_Art.md`. **DECIDED 2026-09-22**
(not built). Do not copy an incumbent symbol library or button map into assets
or fixtures.

Captioning, motion, and child-safety claims still need an explicit owner in
`docs/product/SSOT.md` before anyone asserts compliance. Until that owner
exists, do not assert those outcomes in code comments alone.
