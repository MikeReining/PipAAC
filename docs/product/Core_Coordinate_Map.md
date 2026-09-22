# Core coordinate map

**DECIDED 2026-09-22, amended 2026-09-22** — `grid60` reorganized into
vertical syntactic sectors (founder spec); membership re-derived from
age-of-acquisition and frequency evidence (`data/reference/`) and the
function-word layer added to the lexicon. Built as of the catalog
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
| `grid90` | 10 columns × 9 rows | 90 | Dense. All 81 root-core cells, one `Groups` anchor, 8 reserved anchors. |

Ten columns keeps tiles near or above ~100 pt on an 11-inch iPad in
landscape — large enough for the motor-impaired hands this board exists for.
Fifteen columns (~72 pt tiles) was considered and rejected: cells that small
tax exactly the users the product serves. `grid90` is the dense layout: 9
rows at ~75 pt is the compromise for power users who want every root-core
word gridded.

`grid90` slot 89 is the **`Groups` anchor**: it opens the in-place index of
the category sub-zones. One anchor, not a dock row of category cells — the
incumbent pattern of spending a bottom row on folder buttons does not scale
to 16 categories and spends prime real estate on navigation instead of
language. Slots 81–88 are **reserved anchors**: documented here, rendered
empty, and immovable like core cells. A reserved slot that gets silently
filled is a bug.

`grid60` is not a vocabulary cut. All 81 root-core senses keep permanent
coordinates in `grid90`; the default board holds the 60 a learner needs every
hour. The 21 off-grid senses are strip-eligible everywhere and reachable in
`grid90` and through their sector neighbors' positions.

## 2. Sector order

`grid60` is organized into **vertical grammatical column sectors** that
mirror natural English Subject → Verb → Spatial → Descriptor → Protest
progression. Sentence-building reads left to right instead of zigzagging
down stacked category rows. Within a sector, higher-frequency and
earlier-acquired words sit higher (`data/reference/aoa.csv`); semantically
paired opposites share a row where possible (in/out, on/off, up/down,
big/little, good/bad, and/but, or/because).

| Columns | Sector | Color |
| --- | --- | --- |
| 1–2 | Pronouns & subjects | Yellow |
| 3–5 | Core verbs & actions | Green |
| 6–7 | Prepositions & spatial words | Pink |
| 8–9 | Descriptors, modifiers & connectors | Blue |
| 10 | Urgent protests, social & questions | Red |

Fitzgerald color (owner: `docs/product/Motor_Grid_And_Art.md` §3) is the
word's own grammar role — a pink conjunction that lives in the descriptor
sector (`and`, `but`, `or`, `because`) keeps its color, and color does the
disambiguation where sector and role diverge.

## 3. `grid60` — default

Rows top to bottom, slots left to right. `slot_index` is row-major, 0-based.

| Row | Slots |
| --- | --- |
| 1 | I · you · want · like · go · in · out · more · all done · no |
| 2 | it · me · come · get · do · on · off · big · little · yes |
| 3 | my · he · see · put · take · up · down · good · bad · stop |
| 4 | she · we · give · help · play · here · there · happy · all · please |
| 5 | they · this · eat · drink · can · to · for · and · but · what |
| 6 | that · who · need · have · wait · with · at · or · because · why |

The 21 root-core senses with no `grid60` cell: mine, look, make, open, turn,
read, feel, tell, think, find, work, away, under, over, same, different,
some, not, where, how, when. Slot math forces choices: eighteen verb cells
cannot hold twenty-nine verbs, and the six protest/question cells cannot
hold every wh-question. Every demoted sense is a `grid90` cell, lives in its
fringe zone, and is strip-eligible.

## 4. `grid90` — dense

| Row | Slots |
| --- | --- |
| 1 | I · you · me · my · mine · he · she · it · we · they |
| 2 | that · this · who · want · like · go · come · get · make · do |
| 3 | see · look · put · take · give · help · play · eat · drink · open |
| 4 | turn · read · can · need · feel · tell · think · find · work · wait |
| 5 | have · stop · in · out · on · off · up · down · away · here |
| 6 | there · with · under · over · to · for · at · more · all done · big |
| 7 | little · good · bad · happy · same · different · some · all · and · but |
| 8 | or · because · what · where · why · how · when · no · not · yes |
| 9 | please · reserved · reserved · reserved · reserved · reserved · reserved · reserved · reserved · Groups |

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
