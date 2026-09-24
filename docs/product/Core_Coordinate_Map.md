# Core coordinate map

**DECIDED 2026-09-22, final grid ruling 2026-09-22** — `grid60` is organized
into vertical syntactic sectors (founder spec). Membership is **final**: it is
the output of the selection rule in `docs/product/Core_Grid_Membership.md` §2
(founder delegated the final call; ruling recorded there). Root core is 83
senses (`hurt` and `sad` promoted). Built as of the catalog regeneration that
carries this table; the membership gate is `src/board/core_map.test.mjs`.
Layout law and the two stability rules: `docs/product/Motor_Grid_And_Art.md`.
Word list: `docs/product/Initial_Vocabulary_600.md` §2.
Row storage: `docs/product/Language_And_Voice_Schema.md` (`core_cell`, with a
`layout` column — one row per sense per layout).

This file is the truth owner for **which sense sits in which slot** in each
named layout. It is original work: the words came from the published lists
named in the vocabulary doc, and the placement below is Pip AAC's own pass.
No incumbent board was consulted for coordinates. **Amended 2026-09-24:**
incumbent boards were looked at for the v2 board and deliberately
differed from; the derivation is recorded in `docs/phases/018_Core_Board_V2_And_Groups.md` D3.

---

## 1. Layouts

| Layout | Grid | Slots | Role |
| --- | --- | --- | --- |
| `grid60` | 10 columns × 6 rows | 60 | Default density. The words a learner builds every sentence out of. |
| `grid90` | 10 columns × 9 rows | 90 | Dense. All 83 root-core cells, one `Groups` anchor, 6 reserved anchors. |
| `grid15` | 5 columns × 3 rows | 15 | Core 15 starter (014 § 5.1): early language and motor/visual access. The whole vocabulary stays reachable through the Groups anchor and the keyboard. |

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
language. Slots 83–88 are **reserved anchors**: documented here, rendered
empty, and immovable like core cells. A reserved slot that gets silently
filled is a bug.

`grid60` is not a vocabulary cut. All 83 root-core senses keep permanent
coordinates in `grid90`; the default board holds the 60 a learner needs every
hour. The 23 off-grid senses are strip-eligible everywhere and reachable in
`grid90` and through their sector neighbors' positions.

## 2. Sector order

`grid60` is organized into **vertical grammatical column sectors**: Subject
→ Verb → Spatial → Descriptor, with the regulator column on the far edge.
What the sectors buy is category coherence for visual search (a verb is
always in the middle band) and a stable left-to-right path for the
multi-word utterances that do get built. Within a sector, earlier-acquired
and higher-frequency words sit higher (`data/reference/aoa.csv`); paired
opposites share a row (in/out, on/off, up/down, here/there, this/that,
big/little, good/bad, happy/sad, all/some).

| Columns | Sector | Color |
| --- | --- | --- |
| 1–2 | Pronouns, deictics & questions | Yellow (questions pink) |
| 3–5 | Core verbs & actions | Green |
| 6–7 | Prepositions & spatial words | Pink |
| 8–9 | Descriptors, quantity & feelings | Blue |
| 10 | Regulators — yes, no, stop, help, hurt, please | Red / pink |

Fitzgerald color (owner: `docs/product/Motor_Grid_And_Art.md` §3) is the
word's own grammar role — `and` (pink conjunction) and `not` (red negation)
live in the descriptor sector and keep their colors; `help` keeps green in
the regulator column. Color does the disambiguation where sector and role
diverge.

## 3. `grid60` — default

> **DECIDED 2026-09-24 — replaced, rebuild pending** (founder). The new
> board, colors, and provenance are in `docs/phases/018_Core_Board_V2_And_Groups.md` D1–D3. The table
> below is what the build reads today; slice 1 of 018 swaps it.

Rows top to bottom, slots left to right. `slot_index` is row-major, 0-based.

| Row | Slots |
| --- | --- |
| 1 | I · you · want · like · go · in · out · more · all done · yes |
| 2 | me · my · need · look · come · on · off · not · and · no |
| 3 | he · she · get · make · do · up · down · big · little · stop |
| 4 | it · that · put · take · give · here · there · good · bad · help |
| 5 | why · when · open · turn · play · to · for · happy · sad · hurt |
| 6 | what · where · eat · drink · can · with · at · all · some · please |

The 23 root-core senses with no `grid60` cell: mine, we, they, see, have,
read, feel, tell, think, find, work, wait, away, under, over, same,
different, but, or, because, how, this, who.

**Amended 2026-09-22** (founder): `why` and `when` take cells; `this` and
`who` leave; `it` moves up one row so the four questions form one block
(rows 5–6, cols 1–2). Rationale: `docs/product/Core_Grid_Membership.md` § 8. Each is off by a named reason
in `docs/product/Core_Grid_Membership.md` §6; every one is a `grid90` cell
and strip-eligible.

## 4. `grid90` — dense (10 × 9)

Rebuilt 2026-09-24 on `grid60`'s column sectors (014 § 2 ruling 3): the
same bands — people · doing · where · describing · regulate — hold the
same words, nine rows tall instead of six. Every `grid60` cell keeps its
sector; the 23 dense-only words extend their own bands (pronouns and
questions with people, verbs with doing, spatial with where, connectors
with describing). Reserved cells sit at each band's tail — room to grow
in-sector — and the `Groups` anchor keeps slot 89.

| Row | Slots |
| --- | --- |
| 1 | I · you · want · like · go · in · out · more · all done · yes |
| 2 | me · my · need · look · come · on · off · not · and · no |
| 3 | mine · he · get · make · do · up · down · big · little · stop |
| 4 | she · it · put · take · give · here · there · good · bad · help |
| 5 | we · they · open · turn · play · to · for · happy · sad · hurt |
| 6 | this · that · eat · drink · can · with · at · all · some · please |
| 7 | who · what · see · read · feel · away · under · same · different · reserved |
| 8 | where · why · tell · think · find · over · reserved · but · or · reserved |
| 9 | when · how · work · wait · have · reserved · reserved · because · reserved · Groups |

## 5. Stability

The stability rules in `docs/product/Motor_Grid_And_Art.md` §1 apply per
layout. Within a named layout, slot indexes are immutable to the app: a
category open, a strip offer, and a suggestion never write this map.
**DECIDED 2026-09-22** (not built): this file holds the **defaults**. A
parent or SLP may move words on one child's board; that move is profile
data, never an edit to this map, and a regeneration never overwrites it. Switching density is a
layout change — sector membership is preserved between `grid60` and `grid90`
(pronouns first, verbs next, then spatial, descriptors, and protest/question
on the far edge) while absolute indexes may differ. **BUILT** (014 slice 5):
§ 4 is laid out on `grid60`'s column sectors — every `grid60` word keeps its
band on `grid90`, so a Cells change shows sector moves, not scrambles.

## 6. `grid15` — Core 15 starter (5 × 3)

The smallest board is the clinician's pick (014 § 2 ruling 4): 15 cells,
full vocabulary behind the Groups anchor and the keyboard. Column bands
follow § 5.1 of the phase doc: people · doing · how much · answer and ask ·
stop, help, hurt. Rule 0 holds — `help`, `stop`, `no`, `hurt` report that
something is wrong without navigating.

| Row | Slots |
| --- | --- |
| 1 | I · want · more · yes · stop |
| 2 | you · like · not · no · help |
| 3 | what · go · all done · ? · hurt |

Slot 13 is the `?` family tile — it opens the Smart bar's `?` family
(why · when · where · who, fixed order — 014 slice 7).


Editing a slot assignment is a product decision. It lands here first, tagged
with a new DECIDED date, and the generated `core_cell` rows are regenerated
from this file — never edited downstream.

Membership disputes run the selection rule in
`docs/product/Core_Grid_Membership.md` §2, not a new opinion pass. Its
gate — UC36 ⊆ `grid60` ∪ named waivers, plus the rule-0 self-report words —
fails `src/board/core_map.test.mjs` if this table drifts from the rule.
