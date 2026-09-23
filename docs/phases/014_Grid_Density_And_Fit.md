# Phase 014 — Grid Density and Individual Fit

**Status:** Ready for slice 1 (renderer of any shape). Rulings and starters below are **DECIDED
2026-09-22** (founder; not built) unless tagged **PROPOSED**. The `grid60`
`why`/`when` change is **BUILT** (catalog regenerated; gate
`src/board/core_map.test.mjs`).

Founder intake: `docs/founder/2026-09-22_Grid_Density_Individual_Fit.md`.
Renamed from "Harmonic Grid Densities" the same day; the harmonic-ladder
framing was withdrawn (§ 6).

| Topic | Owner |
| --- | --- |
| Stability rules, including the adult-move rule | `docs/product/Motor_Grid_And_Art.md` § 1 |
| Default maps (`grid60`, `grid90`, new starters) | `docs/product/Core_Coordinate_Map.md` |
| Clinical framing | `docs/strategy/Vision.md` § 2.4 |
| Ghost cells, hiding | `docs/product/Vocabulary_Masking_And_Safety.md` |
| Soft highlight used after a move | `docs/phases/013_Spotlight_And_Partner_Modeling.md` |

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
6. **`why` and `when` are on `grid60`** (`this` and `who` leave). Owner:
   `docs/product/Core_Grid_Membership.md` § 8.
7. **The Smart bar carries the flexibility.** Family tiles open fixed-order
   families in the bar; the grid never changes. Contract:
   `docs/product/Motor_Grid_And_Art.md` § 2.1.
8. **Setup asks two questions:** who is this for (picks a starter) and how
   do they reach the screen (touch, switch, eye gaze). Every dial stays
   editable afterward.

## 3. Three dials

A profile's board is three independent settings. A starter is a preset of
all three.

| Dial | Question | Values |
| --- | --- | --- |
| **Cells** | How many cells show at once? | Presets 15 (5×3), 30 (6×5), 60 (10×6), 90 (10×9); any size an adult picks within renderer limits. |
| **Vocabulary** | Which words exist? | A starter set that grows, up to the full catalog. Not-yet-introduced cells render as ghosts (masking owner). |
| **Content** | Single words or whole messages? | Core words (default) or message tiles ("I'm in pain"). Phrase catalog: `docs/phases/010_Extended_Picture_Library.md`. |

**One Cells setting per profile** (**DECIDED 2026-09-22**, founder). Cells follow the person's
hands and eyes, not the content, so the home board, every group page, and
the Smart bar all use the profile's one setting. A group has no size of its
own; a big group pages (`Next ›`). Group items keep their saved order; when
Cells changes, groups are laid out again in that order and their moved
items join the move-cost preview (§ 4). Showing fewer choices for an
activity is Spotlight's job (`docs/phases/013_Spotlight_And_Partner_Modeling.md`),
not a bigger or smaller group. To settle in slice 1: at 15 cells a group
page keeps back, the reserved Edit slot, and `Next ›`, leaving 12 items.

Examples: a CP child — 15 cells, full vocabulary, words. A stroke survivor —
15 cells, starter messages, messages. A toddler — 15 cells, first words,
words.

### 3.1 Big buttons, full vocabulary

Every selection is expensive for these users — time, effort, fatigue,
errors — and a page turn is one more selection. The words that matter most
must never cost one.

- **Home page = the First words 15** (§ 5.1). Big buttons and First words
  share one home page and differ only in the Vocabulary dial.
- **The rest of `grid60`** is four built-in groups by grammar — More
  people, More doing, More where, More describing — opened through the
  `🗂️ Groups` anchor like any group. No new mechanism.
- **Speak on tap** is the default; a separate Speak press is one more
  selection.
- **The Smart bar works harder:** two Predict tiles; families at one cell
  wide.
- **Access method sets the motor plan:** touch → place in space; switch →
  scan timing (column-first, left to right, following sentence order);
  eye gaze → spacing and dwell.

Moving up to `grid60` is not zero-move; the move cost is shown (§ 4).
Quadrant pages were withdrawn: they put `yes`, `no`, `stop`, and `help` on
page 2.

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

## 5. Starters

Each is a 5×3 home board. Families list their tiles in fixed order.

### 5.1 First words

| | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| row 1 | I | want | more | yes | stop |
| row 2 | you | like | not | no | help |
| row 3 | what | go | all done | `?` | hurt |

Columns: people · doing · how much · answer and ask · stop, help, hurt.

- `?` family: **why · when · where · who**.
- Rule 0 from `docs/product/Core_Grid_Membership.md` applies here too: the
  board can report that something is wrong without navigating (`help`,
  `stop`, `no`, `hurt`). `yes` pairs with `no` and is the earliest word on
  the list (AoA 2.31).
- The cost: no place words (`in`, `on`, `up`) on the home page; they are in
  the Predict bar and the More where group.
- 11 of the 15 are Universal Core words, including Project Core's first
  three (`go`, `not`, `like`).

### 5.2 Urgent needs (messages)

| | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| row 1 | Yes | Pain ▸ | Water | What's happening? | I'm scared |
| row 2 | No | I can't breathe | Bathroom | Call ▸ | Thank you |
| row 3 | I don't know | Move me | Hot / cold ▸ | Tired | I love you |

Families:

- **Pain ▸** speaks "I'm in pain", then *how much*: `0 · 2 · 4 · 6 · 8 ·
  10` where the bar holds six tiles; on a 4-tile bar, `a little · medium ·
  a lot · worst`. Then *where*: `head · chest · belly · back · arm · leg`.
  Numbers or our own drawn faces only; the Wong-Baker FACES scale is
  licensed.
- **Hot / cold ▸:** `too hot · too cold · fan · blanket`.
- **Call ▸:** `nurse · family · doctor`.

Sources: hospital and aphasia boards (Lingraphica, Aphasia Library);
families of nonvocal ICU patients named repositioning, medication,
bathroom, questions about care, and "I love you" as the messages that
mattered (VidaTalk study, PMC10833611).

### 5.3 Big buttons

Home page = § 5.1; the rest per § 3.1.

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

## 7. Defaults still to validate

Recommended defaults (**PROPOSED**; adjustable per profile):

1. **30 is 6×5.** Near-square cells on a landscape iPad (5×6 would be twice
   as wide as tall), and six columns give questions their own column:
   people · questions · doing · where · describing · regulate.
2. **Switch scanning** is column-first, left to right, following sentence
   order. Validate with an SLP before launch.
3. **Keyguards.** Cell spacing is fixed per preset so plastic keyguards fit.
   Keyguard files are a later slice.
4. **Orientation** is locked per profile (landscape default), so rotation
   never moves a word.

## 8. Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| Cells, cell count, `grid15` / `grid60` / `grid90` | Harmonic density, ladder |
| Starter (First words, Big buttons, Urgent needs) | Low-cognition layout |
| Move cost, moved words | Motor guarantee |
| Adult move | Reflow (no reflow ever happens) |
| Smart bar, family tile, family | Prediction bar (for the whole surface), folder, popup |

## 9. Slices (proposed)

1. **Renderer of any shape.** Remove the ten-column assumption; cells scale
   to the viewport; strip geometry scales with width (5 columns: two
   prediction slots + Groups). Works test: 15, 60, and 90 render with the
   bar and strip in place and no cell under the minimum size.
2. **Starter maps.** Write the § 5 boards into
   `docs/product/Core_Coordinate_Map.md` as named layouts; regenerate
   `core_cell` rows. Works test: each starter renders on a fresh profile
   with § 5's words in § 5's cells.
3. **Adult moves core words.** Per-profile layout on top of the default map;
   Edit mode on the core board, drag to move or swap, never reflow; a
   catalog update never overwrites an adult move. Works test: move `stop`,
   restart, update the catalog — `stop` is still where the adult put it.
4. **Cells picker, move cost, transition highlight.** Parent Corner picker
   with the § 4 preview; the four core groups for Big buttons (§ 3.1). Works test: a
   profile with a known selection log previews exactly the words the two
   maps disagree on.
5. **`grid90` rebuild** on column sectors, with its move cost from `grid60`
   shown in the change record.
6. **Message tiles** for the Urgent needs starter (depends on 010's phrase
   list).
7. **Smart bar families** (Expand mode, fixed order, one-cell tiles, one
   chained family; Parent Corner editor). Works test: tap `?` — the bar
   shows why · when · where · who in that order in slots 1–4, on every
   launch, whatever the prediction state.
8. **Keyguard specifications** (later).
