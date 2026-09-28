# Phase 014 — Grid Density and Individual Fit

**Status:** Slices 1–5 and 7 built; slice 9 built and slices 10–11 added 2026-09-23 (§ 7a) (renderer of any shape; `grid15` Core 15 starter map; adult moves via `core_override`; Cells picker + move cost + transition highlight + grammar groups; `grid90` on `grid60`'s column sectors; Smart bar families). Remaining: slice 6 — message tiles (waits on 010's phrase list); slice 8 — keyguard specs (later). Rulings and starters below are **DECIDED
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
| Soft highlight used after a move | `docs/product/Design_System.md` § Attention layer |

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

The first two rows need the same home board with the whole vocabulary
behind it, so they share one starter, **Core 15**; the access question at
setup handles what differs. Urgent needs is its own starter (§ 5).

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
   opinionated, researched 15-cell default, chosen at setup ("who is this
   for?") and editable. **Amended 2026-09-22:** two starters, Core 15 and
   Urgent needs (First words and Big buttons merged).
5. **Starters do not promise that positions carry up.** Where it is free,
   they follow `grid60` sector order so growing is natural.
6. **`why` and `when` are on `grid60`** (`this` and `who` leave). Owner:
   `docs/product/Core_Grid_Membership.md` § 8.
7. **The Smart bar carries the flexibility.** Family tiles open fixed-order
   families in the bar; the grid never changes. Contract:
   `docs/product/Motor_Grid_And_Art.md` § 2.1.
8. **Setup asks two questions:** who is this for (Core 15 or Urgent needs)
   and how do they reach the screen (touch, switch, eye gaze). Every dial
   stays editable afterward.
9. **Full access by default.** Every starter has the whole vocabulary
   reachable through Groups, the Smart bar, and the keyboard; the starter
   only decides the home page. Holding words back (ghost cells revealed
   over time) is an adult option, not a default, and Pip makes no teaching
   claim for it. Masking stays a family-values and safety tool
   (`docs/product/Vocabulary_Masking_And_Safety.md`). Why: the evidence
   that restricting access helps is thin either way, so Vision § 2.1
   (presume competence) decides.
10. **Starter messages are co-authored.** Urgent needs ships defaults so the
    person has a voice on day one; setup, or the first quiet moment, asks
    the adult to review them with the person — personalize, cut, add. Each
    message stays marked *default* until the person confirms it.

## 3. Three dials

A profile's board is three independent settings. A starter is a preset of
all three.

| Dial | Question | Values |
| --- | --- | --- |
| **Cells** | How many cells show at once? | Presets 15 (5×3), 30 (6×5), 60 (10×6), 90 (10×9); any size an adult picks within renderer limits. |
| **Vocabulary** | Which words are reachable? | Everything, by default. An adult may hold words back and reveal them over time (ghost cells; masking owner). |
| **Content** | Single words or whole messages? | Core words (default) or message tiles ("I'm in pain"). Phrase catalog: `docs/phases/010_Extended_Picture_Library.md`. |

**One Cells setting per profile** (**DECIDED 2026-09-22**, founder). Cells follow the person's
hands and eyes, not the content, so the home board, every group page, and
the Smart bar all use the profile's one setting. A group has no size of its
own; a big group pages (`Next ›`). **AMENDED 2026-09-27; not built (027):**
new group layouts save positions per named size, and Cells changes select those
maps through the existing move-cost preview. Returning to a size restores its
positions exactly. Old saved/custom geometries retain the existing linear rewrap
until explicit adoption. 027 owns new reservations and capacities (7 ordinary
content cells per grid15 topic page, 6 per meal page), replacing the old 12-item
claim for new layouts. Index ordering remains stable; activity choices are
curated group membership, not a separate Cells setting.

Examples: a toddler and a CP child — both Core 15 (15 cells, full
vocabulary, words), with different access settings. A stroke survivor —
Urgent needs (15 cells, messages).

### 3.1 Core 15 for motor and visual access

Every selection is expensive for these users — time, effort, fatigue,
errors — and a page turn is one more selection. The words that matter most
must never cost one.

- **Home page = Core 15** (§ 5.1), the same board a toddler starts on.
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

After accepting, moved words get the layer's soft highlight
(`docs/product/Design_System.md` § Attention layer) in their new
cell for a window the adult sets (default: two weeks), then fade.

## 5. Starters

Each is a 5×3 home board. Families list their tiles in fixed order.

### 5.1 Core 15

For early language and for motor or visual access alike (§ 1). The rest of
the vocabulary is one step away (§ 3.1).

| | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| row 1 | I | want | more | yes | stop |
| row 2 | you | like | all done | no | help |
| row 3 | what | go | `?` | not | hurt |

Columns: people & ask · doing · describing & ask · answers · stop, help,
hurt. **Amended 2026-09-24 (018 slice 2):** re-derived on the v2 color
bands — `not` joins the red answers column with *yes*/*no*, and `all
done`/`?` shift up; membership is unchanged.

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

Defaults for day one, co-authored afterward (ruling 10): "I love you"
becomes "I love you, Maria"; the person cuts what they would never say.

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

### 5.3 Big buttons (merged)

Merged into Core 15 on 2026-09-22: it had the same home page and, once
full access became the default, the same vocabulary.

## 6. Withdrawn from the earlier draft

- The "harmonic ladder" and the "Motor Guarantee": `grid30` at 6×5 is not a
  subsample of 10×6, and the built `grid90` does not preserve `grid60`
  positions. Replaced by § 4.
- "Mathematically invariant" and "law" language for spatial vectors: a
  design bet, not established science. Evidence for fixed-position
  superiority is mostly case studies.
- Competitor doctrine as evidence. AssistiveWare's published guidance
  defends its own decision to give every child the same layout; treat it
  as positioning, not science, unless it cites studies.
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

## 7a. Amendment 2026-09-23 — calling a person, and the family's word first

**DECIDED 2026-09-23** (founder; not built unless tagged).

**The gap.** A young child's most common word is a call to a specific
person. In Wordbank's CDI production data, *mommy* and *daddy* are among
the earliest words children say
([Wordbank](https://wordbank.stanford.edu/); Frank, Braginsky, Yurovsky &
Marchman 2017, CC BY). CHILDES agrees: "mom!" was the most-missed opening
word in 017's held-out check (`docs/phases/017_Prediction_Hardening.md` §
Steered synth). Nothing on the home board does this job, and the
function table in `docs/product/Core_Grid_Membership.md` § 1 had no row
for it.

**Rejected.**

- **Generic `mom` / `dad` core cells.** The person called is specific
  (Mama, Abuela, two moms, a foster dad), and a person's name is a
  record, not a cell (`docs/product/Personal_Entities.md`). A fixed "mom"
  tile is wrong for many families and useless to adult users.
- **A "First Words" starter of nouns** (ball, juice, book). Ruling 4
  merged First words into Core 15 on 2026-09-22. Which nouns matter
  differs per child, which is the family's call, not ours. Banajee's
  toddler core, used across every setting, has no nouns.

**Rulings.**

1. **Setup asks "Who do they call for?"** and adds 1–3 people (a name and
   an optional photo) as personal entities.
   **BUILT** (slice 10): `usr-add` flags `needsSetup`; first open shows the
   question, names become `personal_entity` rows via `createEntity`
   (synced like any other). Photos attach later from each person's card.
2. **The person comes first in the empty-sentence Smart bar:**
   person · hello · Food · help. The old order was hello · Food ·
   person · help, and the Core 15 bar holds two cards
   (`public/board.js:898`), so a Core 15 child never saw the person.
   `help` goes last because it is a cell on every home board (rule 0).
   **BUILT** (slice 9).
3. **Adults may put any word or person in any home cell,** not only move
   or swap core words. The replaced word stays reachable (Groups, Smart
   bar, keyboard), and the replacement shows in the move-cost preview
   (§ 4). The app never does this on its own (ruling 1). The families
   and SLPs decide the home board, not us.
   **BUILT** (slice 10): `core_override` is polymorphic
   (`item_kind`/`item_id`, like `group_cell`); `placeOnBoard` in
   `public/shared/coremove.mjs` is the write owner; Edit mode taps an
   empty cell for the place picker (`public/board/place-ui.js`).
4. **The family's additions beat our defaults everywhere.** Their
   recording, photo, or name wins over ours on the board, in groups, and
   in the Smart bar, including predictions.
   - **BUILT:** a family recording of a catalog word wins over every
     voice (`public/shared/voice.mjs:80`); a family photo or picked image
     wins over the default picture (`public/shared/images.mjs:22`); a
     person's recording wins over the synthesized name
     (`public/shared/voice.mjs:103`).
   - **BUILT** (slice 11): enrichment derives which catalog word, if any,
     the person stands for (`entity_enrichment.sense_suggestion` — a Jev
     judgment, not a string rule; the adult is never asked). When the
     word is offered in the bar, `entityForSense` substitutes the person:
     Mama's photo and name in `mom`'s place, at `mom`'s score; a tap
     speaks her recording, and her home cell takes the word's halo. The
     producer (Jev writing `sense_suggestion`) is 017 R14's work — the
     mechanism is live and proven against seeded rows.
5. **"Call a person" joins the function table** in
   `Core_Grid_Membership.md` § 1, owned by rulings 1–3, not by a core
   cell.

Slices: 9–11 in § 9.

## 8. Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| Cells, cell count, `grid15` / `grid60` / `grid90` | Harmonic density, ladder |
| Starter (Core 15, Urgent needs) | Low-cognition layout, First words / Big buttons (merged) |
| Move cost, moved words | Motor guarantee |
| Adult move | Reflow (no reflow ever happens) |
| Smart bar, family tile, family | Prediction bar (for the whole surface), folder, popup |

## 9. Slices (proposed)

1. **Renderer of any shape.** Remove the ten-column assumption; cells scale
   to the viewport; strip geometry scales with width (5 columns: two
   prediction slots + Groups). Works test: 15, 60, and 90 render with the
   bar and strip in place and no cell under the minimum size.

   **DONE.** `learner_profile.board_layout` (synced via `set_setting`)
   names a `catalog.layouts` entry; `boardGeom()` resolves name → cols ×
   rows + anchors, falling back to `grid60`. The grid, group pages, the
   group index, and the web editor all draw at that size; the strip spans
   the board's columns (`sizeStrip`) with `stripSlots` prediction slots
   (4 at 10 columns, 2 at 5) and Groups/Keyboard always one column each.
   Storage stays canonical: `group_cell` and `board_group.index_slot`
   keep their 60-space coordinates and renderers re-wrap the linear order
   (`visualCell`/`canonCell`/`indexVisual`/`indexSlotAt` in
   `public/shared/groups.mjs`) — a Cells change moves no rows, and the
   index pages like a group page once N < the index. `showGate` takes
   the strip's cap. Works Tests: `src/board/layout.test.mjs` (identity at
   60, 12-per-page at 15, drop-at-visual writes the canonical cell,
   grid90 anchors) and `scripts/probes/layout_probe.mjs` (measured
   pixels: 60 → 75 px cells, 90 → 75 px with the Groups cell at slot 89,
   15 → 157 px, index pages with Next ›, Food shows 12 items + "1/3").
   `window.pip.repaint` exposes a repaint for probes.
2. **Starter maps.** Write the § 5 boards into
   `docs/product/Core_Coordinate_Map.md` as named layouts; regenerate
   `core_cell` rows. Works test: each starter renders on a fresh profile
   with § 5's words in § 5's cells.

   **DONE (Core 15).** `grid15` (5 × 3) is a named layout in
   `Core_Coordinate_Map.md` § 6 — § 5.1's board verbatim, slot 13
   `reserved` as the `?` family slot until slice 7. A layout header may
   now carry its shape (`(5 × 3)`); the builder parses it and validates
   slots = cols × rows. Regenerated catalog: `catalog.layouts.grid15`
   + 14 `core_cell` rows. Works Tests:
   `src/board/layout.test.mjs` ("grid15 is § 5.1's board" — every spec
   slot measured against generated `core_cell` rows joined to labels,
   same senses as `grid60`) and a live leg: `board_layout='grid15'`
   renders I·want·more·yes·stop / you·like·not·no·help /
   what·go·all·done·_·hurt and survives a reload.
   **Deferred:** Urgent needs (§ 5.2) is a *messages* board — its cells
   are phrases, not senses, so it cannot be a `core_cell` layout; it
   lands with message tiles (slice 6, on 010's phrase list).
3. **Adult moves core words.** Per-profile layout on top of the default map;
   Edit mode on the core board, drag to move or swap, never reflow; a
   catalog update never overwrites an adult move. Works test: move `stop`,
   restart, update the catalog — `stop` is still where the adult put it.

   **DONE.** `core_override (layout, sense_id, slot_index)` is the synced
   profile layer; `core_cell` is never rewritten, so regeneration cannot
   touch an adult move. `public/shared/coremove.mjs` owns it:
   `coreCells` resolves the effective map (override shadows catalog; a
   displaced row without its own override takes the mover's vacated
   cell — deterministic, replay-safe), `moveCore` moves or swaps and
   refuses anchor/reserved slots, `coreSlot`/`occupant` answer position.
   Back at the catalog slot the override row drops — canonical is the
   default. `renderGrid` reads `coreCells`; in Edit mode every word cell
   carries `data-slot` and `editPointer` (drag → `moveCore`, tap → word
   card); empty cells are legal targets. Synced via `move_core`
   (intent recomputed on replay — the swap's other half derives from
   local occupancy, so replicas converge). Works Tests:
   `src/board/core_move.test.mjs` (swap, catalog regen with the source
   map changed under it, return-to-default drops the row, anchor
   refusal, cross-db replay) and `scripts/probes/core_move_probe.mjs`
   (real pointer drag stop→want, cells trade, reload persists, catalog
   row untouched).
4. **Cells picker, move cost, transition highlight.** Parent Corner picker
   with the § 4 preview; the four core groups behind Core 15 (§ 3.1). Works test: a
   profile with a known selection log previews exactly the words the two
   maps disagree on.

   **DONE.** Parent Corner → "Cells" seg lists every `catalog.layouts`
   shape (15 / 60 / 90). Picking another opens `#cellsform` — the § 4
   preview BEFORE anything changes: `moveCost` (`public/shared/
   movecost.mjs`) classifies each word same / sector / moved / gone /
   new against both coordinate maps (sectors per the map doc's column
   bands; `grid90` is row-banded until slice 5), weighted by the real
   `learner_event_log` — no history → the whole board, unweighted.
   Apply → `setBoardLayout` writes `learner_profile.board_layout` via
   the synced setting, records `set_layout`, and stamps `move_mark`
   rows on the words that changed place: they render a soft
   `.cell.moved` ring for 14 days, then the marks prune on read.
   Overrides are per-layout, so an adult's grid60 move survives a
   switch and lands again on switch-back. The four grammar groups —
   `grp_more_people` (9), `more_doing` (15), `more_where` (12),
   `more_describing` (10) — derive from the grid60 column sectors
   minus words already on grid15 (`sector` seed in group_seed.json,
   not a hand-copied list). Works Tests: `src/board/
   move_cost.test.mjs` (exact same/sector/moved/gone/new classification
   on synthetic maps, selection-log weighting, marks only on moved
   cells, override survives, `set_layout` replay converges) and
   `scripts/probes/cells_probe.mjs` (seg → preview shows "57 of 83
   words will move" with the profile untouched → Apply → 90 cells and
   57 `.moved` rings → all four groups on the index → switch back and
   the adult's move is still there).
5. **`grid90` rebuild** on column sectors, with its move cost from `grid60`
   shown in the change record.

   **DONE.** `Core_Coordinate_Map.md` § 4 relaid on `grid60`'s five column
   bands, nine rows tall: people 18, doing 27, where 15, describing 17
   (connectors included), regulate 6 — all 83 root-core words, reserved
   cells at each band's tail, `Groups` anchor still at 89. **Every one of
   the 60 shared words keeps its sector** — `moveCost` reports zero
   `moved`/`gone` on 60→90, all sector holds; `SECTORS.grid90` in
   `movecost.mjs` names the same bands so the preview says "moved
   nearby", never "scrambled". Works Test: `move_cost.test.mjs` — the
   60→90 preview shows `moved: 0, gone: 0, sector+same: 60, new: 23`;
   live probe `cells_probe.mjs` re-passed on the new map.
6. **Message tiles** for the Urgent needs starter (depends on 010's phrase
   list).
7. **Smart bar families** (Expand mode, fixed order, one-cell tiles, one
   chained family; Parent Corner editor). Works test: tap `?` — the bar
   shows why · when · where · who in that order in slots 1–4, on every
   launch, whatever the prediction state.

   **DONE.** `bar_family` + `bar_family_item` are the synced store —
   `position` is the whole truth, written only through
   `setFamilyItems`/`createFamily` (ops `set_family_items`,
   `create_family`). The map doc carries family anchors (`?`, `X ▸`)
   that resolve to seed families at build; grid15 slot 13 is `?` →
   `bf_q` (why · when · where · who, `data/family_seed.json`). Expand
   mode in the bar: one-column tiles (`cap = max(4, cols−2)` — the
   § 2.1 widths), fixed order, `more ›` only when the family outgrows
   the bar, any pick returns to Predict, masked words never render, a
   `family` item chains one level deep. A family tile speaks its label
   (`speaks`) then opens — never a sentence pick, never a drop target.
   Parent Corner → Smart bar lists families; the editor reorders,
   removes, and adds words, and the bar shows exactly that order.
   Works Tests: `src/board/family.test.mjs` (seed order, caregiver
   edits survive regen, mask exclusion, replay convergence, chaining)
   and `scripts/probes/family_probe.mjs` (tap `?` on Core 15 →
   why·when·where·who live, pick joins the sentence, editor reorder
   sticks across reload). Deferred: placing a *new* family tile on the
   board (needs a non-sense cell surface — the Pain/Hot-cold/Call
   tiles arrive with slice 6's message tiles anyway).
8. **Keyguard specifications** (later).
9. **Person first in the empty bar** (§ 7a ruling 2). Works test: a fresh
   Core 15 profile with one person added shows that person as the first
   card when the sentence is empty; `grid60` still shows all four cards.

   **DONE.** `idleStarters` (`public/board.js`) now builds person ·
   hello · Food · help; the narrow bar keeps the front. Works Test:
   `scripts/probes/idle_person_probe.mjs` reads the rendered tray —
   Core 15 before a person: hello · Food; after adding "Mama": Mama ·
   hello; `grid60`: Mama · hello · Food · help; survives a reload. The
   same probe fails on the old order (checked 2026-09-23).
10. **Adults put any word or person in a home cell** (§ 7a ruling 3),
    plus the setup question (ruling 1). Works test: put a person on a
    Core 15 cell, restart, update the catalog — the person is still
    there, and the replaced core word is still reachable from Groups.

    **DONE.** Truth owner `public/shared/coremove.mjs`: `core_override`
    is now polymorphic (`layout, item_kind, item_id, slot_index`) — a
    sense or a `personal_entity` may hold any non-anchor home cell.
    `placeOnBoard` writes the placement and, when the item came from
    off-board, evicts the occupant back to its own default (a catalog
    word returns to its `core_cell` slot or leaves the board; it never
    takes a slot the app chose). `coreCells` overlays entities like
    senses; a retired entity's placement stops claiming the cell.
    `moveCore` keeps its call shape and `move_core` op for old logs.
    UI: Edit mode, tap an empty cell → the place picker
    (`public/board/place-ui.js`): the family's people first, then the
    whole word library behind one search. An entity cell renders Yellow
    with its photo, taps/speaks/drags like a word. Setup: `usr-add`
    flags `needsSetup`; first open asks "Who does {name} call for?"
    (≤3 names → `createEntity`). Synced via the `place_cell` op
    (`toSlot: null` clears a cell); replay recomputes intent.
    Move-cost: `cellSlot` reports the *effective* slot, so an evicted
    word previews as `gone`, not as sitting under the person.
    Migrator moved to `public/shared/migrate.mjs` (pure — tests drive
    it with node:sqlite); it carries old `sense_id` override rows into
    the new shape. Works Tests: `src/board/core_place.test.mjs`
    (person on a Core 15 cell; file-db reopen; catalog regen; the word
    stays in `group_cell`; op replay; clear-cell and anchor refusal;
    no auto-placement; old-shape migration keeps the move) and the
    `needsSetup` leg in `src/board/devices_ui.test.mjs`.
11. **The family's person stands in for the catalog word** (§ 7a ruling
    4). Works test: a family adds "Mama" with a photo; after "I want",
    when the book ranks `mom` in the bar, the bar shows Mama's photo and
    speaks her recording.

    **DONE** (mechanism; producer is 017 R14). The mapping lives on
    `entity_enrichment.sense_suggestion` — a ready enrichment row says
    which catalog sense the entity stands for; the rename/photo
    supersede trigger already retires stale suggestions, so an old name
    can never keep standing in. `entityForSense` (`public/shared/groups.mjs`)
    returns the active entity for a sense, latest ready row first;
    `stripCards` (`public/board.js`) substitutes the entity card at the
    word's rank — photo, name, recording on tap — and `applyLikely`
    lands the word's halo on the person's home cell. The row syncs like
    all enrichment. Nothing writes `sense_suggestion` yet: the Jev
    judgment is 017's. Works Test: `src/board/stand_in.test.mjs` —
    mapped stand-in, retired/superseded never show, rename supersedes
    via the real trigger, latest ready row wins.
