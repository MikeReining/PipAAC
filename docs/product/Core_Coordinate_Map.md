# Core coordinate map

**DECIDED 2026-09-24, core board v2** — `grid60` is organized into vertical
color bands (founder spec, phase 018 D1–D3, in git history).
Membership is the output of the selection rule in
`docs/product/Core_Grid_Membership.md` §2. Root core is 78 senses (`is`,
`mom`, `dad` promoted; `take`, `give`, `big`, `little`, `bad`, `happy`,
`please`, `at` demoted to their Tier-2 groups). Built as of the catalog
regeneration that carries this table; the membership gate is
`src/board/core_map.test.mjs`.
Layout law and the two stability rules: `docs/product/Motor_Grid_And_Art.md`.
Word list: `docs/product/Initial_Vocabulary_600.md` §2.
Row storage: `docs/product/Language_And_Voice_Schema.md` (`core_cell`, with a
`layout` column — one row per sense per layout).

This file is the truth owner for **which sense sits in which slot** in each
named layout. It is original work: the words came from the published lists
named in the vocabulary doc, and the placement below is Pip AAC's own pass.
No incumbent board was consulted for coordinates. **Amended 2026-09-24:**
incumbent boards were looked at for the v2 board and deliberately
differed from; the derivation is recorded in phase 018 D3 (in git history).

---

## 1. Layouts

| Layout | Grid | Slots | Role |
| --- | --- | --- | --- |
| `grid60` | 10 columns × 6 rows | 60 | Default density. The words a learner builds every sentence out of. |
| `grid90` | 10 columns × 9 rows | 90 | Dense. All 78 root-core cells, one `Groups` anchor, 11 reserved anchors. |
| `grid15` | 5 columns × 3 rows | 15 | Core 15 starter (014 § 5.1): early language and motor/visual access. The whole vocabulary stays reachable through the Groups anchor and the keyboard. |
| `grid30` | 6 columns × 5 rows | 30 | Core 30 (014 § 3): the step between 15 and 60. All of Core 15 plus the next most-said words; the rest stays behind the Groups anchor and the keyboard. |

Ten columns keeps tiles near or above ~100 pt on an 11-inch iPad in
landscape — large enough for the motor-impaired hands this board exists for.
Fifteen columns (~72 pt tiles) was considered and rejected: cells that small
tax exactly the users the product serves. `grid90` is the dense layout: 9
rows at ~75 pt is the compromise for power users who want every root-core
word gridded.

`grid90` slot 89 is the **`Groups` anchor**: it opens the in-place index of
the built-in groups. One anchor, not a dock row of category cells — the
incumbent pattern of spending a bottom row on folder buttons does not scale
to 16 categories and spends prime real estate on navigation instead of
language. The remaining dense-only slots are **reserved anchors**:
documented here, rendered empty, and immovable like core cells. A reserved
slot that gets silently filled is a bug.

`grid60` is not a vocabulary cut. All 78 root-core senses keep permanent
coordinates in `grid90`; the default board holds the 60 a learner needs every
hour. The 18 off-grid senses are strip-eligible everywhere and reachable in
`grid90` and through their band neighbors' positions.

## 2. Color bands

`grid60` is organized into **vertical color bands** — one band, one role
color (018 D2). What the bands buy is category coherence for visual search
(an action is always in the green middle band) and a stable left-to-right
path for the multi-word utterances that do get built. Within a band,
earlier-acquired and higher-frequency words sit higher
(`data/reference/aoa.csv`); paired opposites share a row (in/out, on/off,
up/down, here/there, this/that).

| Columns | Band | Color |
| --- | --- | --- |
| 1–2 | People — pronouns, deictics, family | Yellow |
| 3–5 | Actions & being | Green |
| 6–7 | Little words — spatial & joining | Pink |
| 8 | Describing — quantity & feelings | Blue |
| 9 | Questions | Purple |
| 10 | Safety — yes, no, not, stop, help, hurt | Red |

Fitzgerald color (owner: `docs/product/Motor_Grid_And_Art.md` §3) is the
word's own grammar role — on `grid60` it coincides with the band by design:
every question is Purple, every safety word Red, regardless of dictionary
POS (`yes` is an interjection, `help` a verb — both Red in the safety
column). Words that live off the default board keep their grammar colors in
groups and the strip.

## 3. `grid60` — default

> **DECIDED 2026-09-24** (founder, 018 D1). Provenance:
> phase 018 D3 (in git history).

Rows top to bottom, slots left to right. `slot_index` is row-major, 0-based.

| Row | Slots |
| --- | --- |
| 1 | I · you · want · like · go · in · out · more · what · yes |
| 2 | me · my · need · look · come · on · off · all · where · no |
| 3 | he · she · get · make · do · up · down · some · who · not |
| 4 | mom · dad · is · have · can · here · there · good · why · stop |
| 5 | this · that · put · open · turn · to · for · sad · when · help |
| 6 | it · we · eat · drink · play · with · and · all done · how · hurt |

The 18 root-core senses with no `grid60` cell: mine, they, see, read, feel,
tell, think, find, work, wait, away, under, over, same, different, but, or,
because. Each is off by a named reason in
`docs/product/Core_Grid_Membership.md`; every one is a `grid90` cell and
strip-eligible.

## 4. `grid90` — dense (10 × 9)

Rebuilt 2026-09-24 on `grid60`'s color bands (018 D1): rows 1–6 are the
default board verbatim — every `grid60` cell keeps its slot — and the 18
dense-only words extend their own bands (people with people, verbs with
actions, spatial and connectors with little words, `same`/`different` with
describing). Reserved cells sit at each band's tail — room to grow
in-band — and the `Groups` anchor keeps slot 89.

| Row | Slots |
| --- | --- |
| 1 | I · you · want · like · go · in · out · more · what · yes |
| 2 | me · my · need · look · come · on · off · all · where · no |
| 3 | he · she · get · make · do · up · down · some · who · not |
| 4 | mom · dad · is · have · can · here · there · good · why · stop |
| 5 | this · that · put · open · turn · to · for · sad · when · help |
| 6 | it · we · eat · drink · play · with · and · all done · how · hurt |
| 7 | mine · they · see · read · feel · away · under · same · reserved · reserved |
| 8 | reserved · reserved · tell · think · find · over · but · different · reserved · reserved |
| 9 | reserved · reserved · work · wait · reserved · or · because · reserved · reserved · Groups |

## 5. Stability

The stability rules in `docs/product/Motor_Grid_And_Art.md` §1 apply per
layout. Within a named layout, slot indexes are immutable to the app: a
category open, a strip offer, and a suggestion never write this map.
**DECIDED 2026-09-22** (not built): this file holds the **defaults**. A
parent or SLP may move words on one child's board; that move is profile
data, never an edit to this map, and a regeneration never overwrites it. Switching density is a
layout change — band membership is preserved between `grid60` and `grid90`
(people, actions, little words, describing, questions, safety — left to
right) while absolute indexes may differ. **BUILT** (018 slice 1):
§ 4 is laid out on `grid60`'s color bands — every `grid60` word keeps its
slot on `grid90`, so a Cells change shows band moves, not scrambles.

## 6. `grid15` — Core 15 starter (5 × 3)

The smallest board is the clinician's pick (014 § 2 ruling 4): 15 cells,
full vocabulary behind the Groups anchor and the keyboard. **Re-derived
2026-09-24 (018 slice 2)** on the D2 bands: people & ask · doing ·
describing & ask · answers · stop, help, hurt. Red needs two columns —
answers (*yes* · *no* · *not*, all Red) apart from safety. Rule 0 holds —
`help`, `stop`, `no`, `hurt` report that something is wrong without
navigating.

| Row | Slots |
| --- | --- |
| 1 | I · want · more · yes · stop |
| 2 | you · like · all done · no · help |
| 3 | what · go · ? · not · hurt |

Slot 13 is the `?` family tile — it opens the Smart bar's `?` family
(why · when · where · who, fixed order — 014 slice 7). `what` and `?`
are the board's two Purple cells; the other columns are color-pure.


## 7. `grid30` — Core 30 (6 × 5)

**DECIDED 2026-09-30 (founder).** Why it exists: 15 → 60 shrinks each
button to a quarter of its area; 30 halves that step. Membership and the
reasons for each choice: `Core_Grid_Membership.md` § 9. Placement: each
word sits as close as possible to its `grid60` screen position (the board
the user graduates to), bands keeping `grid60`'s left-to-right order.
`hurt` stays bottom-right as on 15 and 60; `sad · help · hurt` close the
bottom-right corner. Average on-screen move: 15 → 30 ≈ 35% of the board,
30 → 60 ≈ 12% (15 → 60 direct ≈ 39%).

| Row | Slots |
| --- | --- |
| 1 | I · want · go · in · more · yes |
| 2 | you · like · look · on · what · no |
| 3 | my · get · do · up · ? · not |
| 4 | mom · dad · can · here · sad · stop |
| 5 | it · that · have · all done · help · hurt |

Slot 17 (1-based; index 16) is the same `?` family tile as on `grid15`.

Editing a slot assignment is a product decision. It lands here first, tagged
with a new DECIDED date, and the generated `core_cell` rows are regenerated
from this file — never edited downstream.

Membership disputes run the selection rule in
`docs/product/Core_Grid_Membership.md` §2, not a new opinion pass. Its
gate — UC36 ⊆ `grid60` ∪ named waivers, plus the rule-0 self-report words —
fails `src/board/core_map.test.mjs` if this table drifts from the rule.
