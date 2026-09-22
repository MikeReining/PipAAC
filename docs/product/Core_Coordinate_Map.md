# Core coordinate map

**DECIDED 2026-09-22, amended 2026-09-22** — `grid60` reorganized into
vertical syntactic sectors (founder spec). Built as of the catalog
regeneration that carries this table.
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
| `grid80` | 10 columns × 8 rows | 80 | Dense. All 75 root-core cells, one `Groups` anchor, 4 reserved anchors. |

Ten columns keeps tiles near or above ~100 pt on an 11-inch iPad in
landscape — large enough for the motor-impaired hands this board exists for.
Fifteen columns (~72 pt tiles) was considered and rejected: cells that small
tax exactly the users the product serves.

`grid80` slot 79 is the **`Groups` anchor**: it opens the in-place index of
the category sub-zones. One anchor, not a dock row of category cells — the
incumbent pattern of spending a bottom row on folder buttons does not scale
to 14 categories and spends prime real estate on navigation instead of
language. Slots 75–78 are **reserved anchors**: documented here, rendered
empty, and immovable like core cells. A reserved slot that gets silently
filled is a bug.

`grid60` is not a vocabulary cut. All 75 root-core senses keep permanent
coordinates in `grid80`; the default board holds the 60 a learner needs every
hour. The 15 off-grid senses are strip-eligible everywhere and reachable in
`grid80` and through their sector neighbors' positions.

## 2. Sector order

`grid60` is organized into **vertical grammatical column sectors** that
mirror natural English Subject → Verb → Spatial → Descriptor → Protest
progression. Sentence-building reads left to right instead of zigzagging
down stacked category rows. Within a sector, higher-frequency words sit
higher; semantically paired opposites share a row where possible (in/out,
on/off, up/down, big/little, good/bad, same/different, all/some).

| Columns | Sector | Color |
| --- | --- | --- |
| 1–2 | Pronouns & subjects | Yellow |
| 3–5 | Core verbs & actions | Green |
| 6–7 | Prepositions & spatial words | Pink |
| 8–9 | Descriptors & modifiers | Blue |
| 10 | Urgent protests, social & questions | Red |

Fitzgerald color (owner: `docs/product/Motor_Grid_And_Art.md` §3) is the
word's own grammar role — a green verb that lives in the descriptor sector
(`feel`, used by learners as a state word) keeps its color, and color does
the disambiguation where sector and role diverge.

## 3. `grid60` — default

Rows top to bottom, slots left to right. `slot_index` is row-major, 0-based.

| Row | Slots |
| --- | --- |
| 1 | I · me · want · come · help · in · out · more · happy · no |
| 2 | you · my · like · get · put · on · off · all done · feel · not |
| 3 | it · they · go · make · take · up · down · big · little · stop |
| 4 | we · that · can · see · give · to · for · good · bad · please |
| 5 | he · this · need · play · drink · here · there · same · different · what |
| 6 | she · mine · do · eat · open · with · away · all · some · where |

The 15 root-core senses with no `grid60` cell: under, over, why, how, when,
work, turn, tell, think, look, read, find, wait, yes, who. Slot math forces
choices: eighteen verb cells cannot hold twenty-three verbs, and the six
protest/question cells cannot hold every wh-question. Every demoted sense is
a `grid80` cell, lives in its fringe zone, and is strip-eligible.

## 4. `grid80` — dense

| Row | Slots |
| --- | --- |
| 1 | I · you · me · my · mine · he · she · it · we · they |
| 2 | that · this · want · like · go · come · get · make · do · see |
| 3 | look · put · take · give · help · play · eat · drink · open · turn |
| 4 | read · can · need · feel · tell · think · find · work · wait · more |
| 5 | in · out · on · off · up · down · away · here · there · with |
| 6 | under · over · to · for · big · little · good · bad · happy · same |
| 7 | different · some · all · all done · what · where · who · why · how · when |
| 8 | no · not · stop · yes · please · reserved · reserved · reserved · reserved · Groups |

## 5. Stability

Both stability rules in `docs/product/Motor_Grid_And_Art.md` §1 apply per
layout. Within a named layout, slot indexes are immutable: a category open, a
strip offer, and a suggestion never write this map. Switching density is a
layout change — sector membership is preserved between `grid60` and `grid80`
(pronouns first, verbs next, then spatial, descriptors, and protest/question
on the far edge) while absolute indexes may differ.

---

## Change control

Editing a slot assignment is a product decision. It lands here first, tagged
with a new DECIDED date, and the generated `core_cell` rows are regenerated
from this file — never edited downstream.
