# Phase 014 — Grid Density and Individual Fit

**Status:** Preliminary. Rulings below are **DECIDED 2026-09-22** (not
built); everything else is **PROPOSED**. Slice 1 waits on the joint review of
the starter word lists.

Founder intake: `docs/founder/2026-09-22_Grid_Density_Individual_Fit.md`.
Renamed from "Harmonic Grid Densities" the same day; the harmonic-ladder
framing was withdrawn (§ 6).

| Topic | Owner |
| --- | --- |
| Stability rules, including the adult-move rule | `docs/product/Motor_Grid_And_Art.md` § 1 |
| Default maps (`grid60`, `grid90`, new starters) | `docs/product/Core_Coordinate_Map.md` |
| Clinical framing | `docs/strategy/Vision.md` § 2.4 |
| Ghost cells, hiding | `docs/product/Vocabulary_Masking_And_Safety.md` |
| Soft highlight used after a move | `docs/phases/013_Spotlight_Practice_Mode.md` |

---

## 1. Why this phase exists

Every learner is different. Pip ships strong defaults and lets the parent or
SLP change them. Clinical practice starts from the person (feature matching),
not from a product shape.

Today the board is one shape: the renderer hardcodes ten columns
(`public/board.js:503`), and moving from `grid60` to `grid90` is close to a
restart — `yes` goes from top-right to bottom-left, `stop` from the right
edge to the left (`docs/product/Core_Coordinate_Map.md` §§ 3–4).

A small board is used for three different reasons, and they need different
things:

| Why it is small | Who | What they need | Will they move up? |
| --- | --- | --- | --- |
| **Few words** — early language | Toddlers, emergent communicators | A few high-power core words in sentence order | Usually; keep the move gentle |
| **Big buttons** — motor or visual access | CP, Rett, tremor, CVI, switch users | Big targets and the **whole vocabulary** behind them; presume competence | Maybe never; the body decides, not the language |
| **Urgent needs** — acquired condition | Stroke, aphasia, ALS, ICU | Whole messages, yes/no, adult dignity | Often not; communicate today |

One "density" number bundling all three would cap the CP child's language.
That is the exclusion to avoid.

## 2. Rulings

**DECIDED 2026-09-22** (founder; not built).

1. **Adults may move core words.** The app, prediction, lenses, and catalog
   updates never move a cell. A parent or SLP may, per profile, in Edit
   mode. Owner: `docs/product/Motor_Grid_And_Art.md` § 1.
2. **Consistency is a goal, not a law.** Upgrades should not start the child
   over. Some movement is acceptable; the cost is measured and shown, and
   the adult decides (§ 4).
3. **`grid90` is rebuilt on `grid60`'s column sectors.** Left-to-right
   sentence order and Fitzgerald color carry; words land in roughly the same
   region; exact slots may change. Its users can absorb a planned move.
4. **The smallest board is the clinician's pick.** Pip leads with an
   opinionated, researched 15-cell default for each of the three reasons in
   § 1, chosen at setup ("who is this for?") and editable.
5. **Starters do not promise that positions carry up.** Where it is free,
   they follow `grid60` sector order so growing is natural.

## 3. Three dials

A profile's board is three independent settings. A starter is a preset of
all three.

| Dial | Question | Values |
| --- | --- | --- |
| **Cells** | How many cells show at once? | Presets 15 (5×3), 30, 60 (10×6), 90 (10×9); any size an adult picks within renderer limits. Shape of 30 is open (§ 7). |
| **Vocabulary** | Which words exist? | A starter set that grows, up to the full catalog. Not-yet-introduced cells render as ghosts (masking owner). |
| **Content** | Single words or whole messages? | Core words (default) or message tiles ("I'm in pain"). Phrase catalog: `docs/phases/010_Extended_Picture_Library.md`. |

Examples: a CP child — 15 cells, full vocabulary, words. A stroke survivor —
15 cells, starter messages, messages. A toddler — 15 cells, first words,
words.

### 3.1 Big buttons, full vocabulary (PROPOSED)

When cells are fewer than the vocabulary, the board pages. The candidate
mapping: `grid60` splits into four 5×3 quadrants, and each page is one
quadrant, so every word sits in the same place within its page as within
`grid60`. A child whose motor access improves moves to `grid60` with zero
position change. Cost to check with SLPs: most sentences cross from the left
pages (pronouns, verbs) to the right pages (spatial, descriptors,
regulators). Alternative: pages by sector. Decide in slice 4 with a
side-by-side.

## 4. Move cost

When an adult changes cells, applies a starter, or rebuilds a map, Pip
computes the move before anything changes. Pure function of two layouts and
the profile's selection log (`logSelection`, `public/shared/funnel.mjs:62`):

- for each word the child has used, old cell vs new cell: **same place**,
  **moved within its sector**, **changed sector**, or **gone from the board**;
- weighted by how often the child said it.

The adult sees old and new side by side with moved words marked and the
count ("7 of the 20 words Maya uses most will move"), then accepts or edits.
A profile with no history gets the unweighted count.

After accepting, moved words get the soft highlight from 013 in their new
cell for a window the adult sets (default: two weeks), then fade.

## 5. Starters (draft, pending joint review)

Draft 15-cell lists and their sources are on the review page (founder and
agent decide together). Sources used for the drafts:

- **First words:** Universal Core (CLDS/Project Core). Project Core starts
  with `go`, `not`, `like`, and publishes the same vocabulary as 36-, 9-,
  6-, and 4-location books — respected open practice already uses several
  sizes.
- **Urgent needs:** hospital and aphasia boards (Lingraphica, Aphasia
  Library) and ICU studies; families of nonvocal ICU patients reported
  repositioning, medication, bathroom, questions about care, and "I love
  you" as the messages that mattered (VidaTalk study, PMC10833611).
- **Big buttons:** no new list; it is the full vocabulary, paged (§ 3.1).

## 6. Withdrawn from the earlier draft

- The "harmonic ladder" and the "Motor Guarantee": `grid30` at 6×5 is not a
  subsample of 10×6, and the built `grid90` does not preserve `grid60`
  positions. Replaced by § 4.
- "Mathematically invariant" and "law" language for spatial vectors: a
  design bet, not established science. Evidence for fixed-position
  superiority is mostly case studies.
- Competitor claims ("uniquely equipped", "parental outrage", reflow as the
  primary driver of abandonment): unsourced. Abandonment research names fit,
  setup burden, and partner support. Do not use in copy until verified.

## 7. Open questions

1. **Shape of 30.** 6×5 gives near-square cells; 5×6 keeps one column per
   sector. Decide in slice 1 with a side-by-side.
2. **Switch scanning order.** Proposed: column-first, left to right, matching
   sentence order. Needs SLP input.
3. **Keyguards.** Cell spacing must stay fixed per preset so plastic
   keyguards fit. Publishing keyguard files is a later slice.
4. **Portrait.** The renderer must handle rotation per preset; movement on
   rotation counts as a move (§ 4) or is locked per profile.

## 8. Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| Cells, cell count, `grid15` / `grid60` / `grid90` | Harmonic density, ladder |
| Starter (First words, Big buttons, Urgent needs) | Low-cognition layout |
| Move cost, moved words | Motor guarantee |
| Adult move | Reflow (no reflow ever happens) |

## 9. Slices (proposed)

1. **Starter lists.** Joint review; write the three 15-cell default maps
   into `docs/product/Core_Coordinate_Map.md`; regenerate `core_cell` rows.
   Works test: each starter renders on a fresh profile with the reviewed
   words in the reviewed cells.
2. **Renderer of any shape.** Remove the ten-column assumption; cells scale
   to the viewport; strip geometry scales with width (5 columns: two
   prediction slots + Groups). Works test: 15, 60, and 90 render with the
   bar and strip in place and no cell under the minimum size.
3. **Adult moves core words.** Per-profile layout on top of the default map;
   Edit mode on the core board, drag to move or swap, never reflow; a
   catalog update never overwrites an adult move. Works test: move `stop`,
   restart, update the catalog — `stop` is still where the adult put it.
4. **Cells picker, move cost, transition highlight.** Parent Corner picker
   with the § 4 preview; paging for big buttons (§ 3.1). Works test: a
   profile with a known selection log previews exactly the words the two
   maps disagree on.
5. **`grid90` rebuild** on column sectors, with its move cost from `grid60`
   shown in the change record.
6. **Message tiles** for the Urgent needs starter (depends on 010's phrase
   list).
7. **Keyguard specifications** (later).
