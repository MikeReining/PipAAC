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
No incumbent board was consulted for coordinates.

---

## 1. Layouts

| Layout | Grid | Slots | Role |
| --- | --- | --- | --- |
| `grid60` | 10 columns × 6 rows | 60 | Default density. The words a learner builds every sentence out of. |
| `grid90` | 10 columns × 9 rows | 90 | Dense. All 83 root-core cells, one `Groups` anchor, 6 reserved anchors. |

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

Rows top to bottom, slots left to right. `slot_index` is row-major, 0-based.

| Row | Slots |
| --- | --- |
| 1 | I · you · want · like · go · in · out · more · all done · yes |
| 2 | me · my · need · look · come · on · off · not · and · no |
| 3 | he · she · get · make · do · up · down · big · little · stop |
| 4 | this · that · put · take · give · here · there · good · bad · help |
| 5 | it · who · open · turn · play · to · for · happy · sad · hurt |
| 6 | what · where · eat · drink · can · with · at · all · some · please |

The 23 root-core senses with no `grid60` cell: mine, we, they, see, have,
read, feel, tell, think, find, work, wait, away, under, over, same,
different, but, or, because, why, how, when. Each is off by a named reason
in `docs/product/Core_Grid_Membership.md` §6; every one is a `grid90` cell
and strip-eligible.

## 4. `grid90` — dense

| Row | Slots |
| --- | --- |
| 1 | I · you · me · my · mine · he · she · it · we · they |
| 2 | that · this · who · want · like · go · come · get · make · do |
| 3 | see · look · put · take · give · help · play · eat · drink · open |
| 4 | turn · read · can · need · feel · tell · think · find · work · wait |
| 5 | have · stop · in · out · on · off · up · down · away · here |
| 6 | there · with · under · over · to · for · at · more · all done · big |
| 7 | little · good · bad · happy · sad · same · different · some · all · and |
| 8 | but · or · because · what · where · why · how · when · no · not |
| 9 | yes · please · hurt · reserved · reserved · reserved · reserved · reserved · reserved · Groups |

Rows 1–6 are unchanged from the pre-ruling map; `sad` and `hurt` were
inserted at their sector neighbors and the tail shifted two slots, consuming
reserved anchors 81–82.

## 5. Stability

Both stability rules in `docs/product/Motor_Grid_And_Art.md` §1 apply per
layout. Within a named layout, slot indexes are immutable: a category open, a
strip offer, and a suggestion never write this map. Switching density is a
layout change — sector membership is preserved between `grid60` and `grid90`
(pronouns first, verbs next, then spatial, descriptors, and protest/question
on the far edge) while absolute indexes may differ.

---

## Change control

Editing a slot assignment is a product decision. It lands here first, tagged
with a new DECIDED date, and the generated `core_cell` rows are regenerated
from this file — never edited downstream.

Membership disputes run the selection rule in
`docs/product/Core_Grid_Membership.md` §2, not a new opinion pass. Its
gate — UC36 ⊆ `grid60` ∪ named waivers, plus the rule-0 self-report words —
fails `src/board/core_map.test.mjs` if this table drifts from the rule.
