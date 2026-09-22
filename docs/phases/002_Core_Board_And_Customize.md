# Phase 002 — Core board and the Cooper proof

**Status:** Executing. Slices 1–3 built and proven on the dev board.

**DECIDED 2026-09-22** (not built). Revised the same day. Prove that an adult
can add Cooper before anyone draws the launch library. The 677-word catalog
stays the later lexicon. It is not a prerequisite for this proof, and none of
it is illustrated in this phase.

Revised again 2026-09-22 in founder review: the default board is the 60-cell
`grid60` layout, the add form is name + photo + optional hint (no type, no
pronoun, no edges), and strip relevance is computed live rather than read
from a stored edge table.

Intake: `docs/founder/2026-09-22_Build_Order_Customize.md`.

## Goal

On one iPad, with no account and no network, an adult adds Cooper in one
confirm: name and photo. He is reachable immediately — in Animals & Nature
when the add started there, otherwise in My Words. The core cells do not
move. The strip can offer him. Words on screen are labels and Fitzgerald
color. No clipart.

If that add is clumsy, the illustrated 677-word library does not get built.

## Truth owners

| Topic | Owner |
| --- | --- |
| Strip layout, color, art rules, stability rules | `docs/product/Motor_Grid_And_Art.md` |
| Which sense sits in which slot, per layout | `docs/product/Core_Coordinate_Map.md` |
| The 75 root-core words and the 524 primary-fringe words | `docs/product/Initial_Vocabulary_600.md` |
| Entity record, parent corner, filing, bans | `docs/product/Personal_Entities.md` |
| Ids, tables, playback | `docs/product/Language_And_Voice_Schema.md` |

Surface owner for every slice that draws the board:
`docs/product/Core_Coordinate_Map.md`. The renderer reads it. A category, an
add, and the strip do not write it.

## Order

Do not start a later slice to unblock an earlier one.

1. **Core board.** The `grid60` default layout: 60 cells, labels and Fitzgerald color.
2. **Add Cooper.** Name, photo, save. He is filed by context — Animals & Nature if the add started there, else My Words. This is the proof.
3. **Strip offers Cooper.** Local only: the sentence so far and recency. He can be reached without opening a category.

The rest of the 677-word catalog, and every illustration, waits until this
proof has passed. Drawing rules, for when that work starts, stay in
`docs/product/Motor_Grid_And_Art.md`. Personal entities use a photo from the
device.

## Slices

### 1 — Core board

Goal: The motor grid shows the `grid60` layout from `docs/product/Core_Coordinate_Map.md` §3 — 60 cells, each with one original coordinate. Label and color only.

Out of scope: Tier 2 words, personal entities, the strip, accounts, sync, cloud prediction, any illustration.

Truth owner: `docs/product/Core_Coordinate_Map.md` (assignments), `docs/product/Motor_Grid_And_Art.md` (layout law).

Lie-prone layer: a renderer that stores a second copy of positions and reports the canonical map as unchanged.

Works Test: Load the coordinate table. `grid90` contains each of the 83 root-core ids exactly once; `grid60` contains the 60 listed ids exactly once. Run the operations a later slice will be tempted to use (open a placeholder sub-zone, apply an empty suggestion). Deep-compare the table to the snapshot taken before those operations.

Proof command: `scripts/test.sh` on the test file this slice adds.

Missing proof / waiver: none for the map compare. Owner-visible check on an iPad-sized browser viewport is part of done, not a substitute for the compare.

Done when: the compare passes, and a person can read the 60 words on the board in those positions.

### 2 — Add Cooper

Goal: On the same iPad, an adult adds one personal entity — name, photo, save. The zone it was added from (or My Words) shows Cooper, and closing a sub-zone restores the same core cells. No account and no network. No clipart.

Out of scope: the other 15 categories, the other 594 fringe words, photo or sentence classification, second device, QR pairing, Cloudflare, illustrations.

Truth owner: `docs/product/Personal_Entities.md`

Lie-prone layer: an add that secretly inserts a cell and calls it a record, or an add that works only because a network call succeeded.

Works Test: With the network unavailable, save the fixture entity Cooper — spoken name plus a local photo fixture — from inside the Animals & Nature sub-zone. Animals & Nature then includes Cooper. A second fixture save from the parent corner lands in My Words. The core sense count is unchanged. The core coordinate snapshot is unchanged. The save wrote no edge rows and attempted no network call.

Proof command: `scripts/test.sh` on the test file this slice adds.

Missing proof / waiver: enrichment is waived — the Muse Spark call needs the network this slice does not use. Cooper files by context instead; the enrichment job is proven when it exists.

Done when: that test passes, and a person can perform the add from the parent corner and then select Cooper in his zone.

### 3 — Strip offers Cooper

Goal: After slice 2, Cooper can appear in the predictive strip without a coordinate. At most four tiles. Core cells stay put. Ranking is local: sentence position, recency, and routine/time-of-day — the funnel in `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.2, minus its online inputs.

Out of scope: TypeSafe Jev, partner microphones, river view, visual scenes.

Truth owner: strip layout in `docs/product/Motor_Grid_And_Art.md`. Eligibility of a personal entity in `docs/product/Personal_Entities.md`.

Lie-prone layer: the strip ranking function also rewriting the coordinate table, or a test that only asserts the ranker returned a flag.

Works Test: Given Cooper saved and a state that makes him eligible (he was recently selected, or the open sentence invites a personal entity, e.g. "play with"), the strip's rendered candidates include Cooper and contain no more than four tiles. Deep-compare the core coordinate table before and after the offer. A low-signal state with no eligible entity renders no Cooper tile.

Proof command: `scripts/test.sh` on the test file this slice adds.

Missing proof / waiver: cloud ranking is waived. This slice does not call it.

Done when: the compare and the candidate assertion pass, and a person can see Cooper offered above an unchanged core grid.

## Out of scope

The illustrated launch library. **DECIDED 2026-09-22, amended same day.** Do
not draw the 677 words until the slices pass — but the 594 fringe records
*are* loaded on-device as labels (founder ruling: empty zones are a broken
first-run experience; the gate was on illustrations, which labels don't
need). The catalog in `docs/product/Initial_Vocabulary_600.md` remains the
source for illustration work.

**PROPOSED**, not this phase. A parent or teacher on their own phone, which will not share the child's Apple ID:

- The child's iPad shows a short-lived QR from the parent corner.
- The adult scans it. The iPad asks for Allow. Until Allow, the scan does nothing.
- The QR is a one-time introduction. Each device then keeps its own key.
- Cloudflare carries ciphertext for that board. It is not iCloud.
- If every linked device is lost, the board is gone, because there is no account.

Live partner modeling, the context river, and visual scenes stay in `docs/strategy/Vision.md`. They are not slices here.

## Current state

**BUILT** (slice 1): the coordinate table exists and is proven immutable
under the slice's placeholder ops. `scripts/catalog/build_catalog.mjs`
generates `data/catalog/catalog.json` (677 senses, 674 utterances, 677 labels,
141 `core_cell` rows, `grid90` anchors, embedded `schemaSql`) from the
lexicon and the map doc — both stay the source. `src/board/schema.sql` +
`public/shared/import.mjs` create and import the on-device database
(shared by `node:sqlite` in tests and sqlite-wasm in the page).
Proof: `scripts/test.sh src/board/core_map.test.mjs` (6 tests).

**BUILT** (slice 2): `src/board/entities.mjs` + the browser runtime —
SQLite WASM (`@sqlite.org/sqlite-wasm` vendored in `public/vendor/`) with
OPFS persistence (`public/db.js`), zones UI, and the name+photo add flow
(`public/board.js`, `public/index.html`). Photos persist as OPFS files
keyed by entity id. Speech is `speechSynthesis` (device TTS lane).
Proof: `src/board/entities.test.mjs` (3 tests) + headless-Chrome smoke
run of the live add flow.

**BUILT** (slice 3): `learner_event_log` (schema doc § 6.2c) +
`public/shared/funnel.mjs` — sentence position (verb/preposition tail
invites an entity), recency (15-min window), same-hour frequency, capped
at 4 tiles, read-only against `core_cell`. The strip renders offers above
the grid; every tap logs a selection event.
Proof: `src/board/strip.test.mjs` (4 tests) + smoke run showed Cooper
offered after tapping `play`.
Known defect (found 2026-09-22): the same-hour term compares the local
hour with the UTC hour of each logged pick (`funnel.mjs:80`), so outside
UTC it favors the wrong time of day. Fix: `docs/phases/006_Prediction_Engine.md`
slice 1.
