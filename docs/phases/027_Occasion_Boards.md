# Phase 027 — Occasion boards and independent editing

**Status:** BUILT 2026-09-28 — A1–A4 landed and the Works Test passed on an
agent slot (§ 6, observations below). Founder approved 2026-09-27; simplified
the same day (founder: "there is nothing to preserve. We have no users"). Open
before retirement: founder review of the seed curation and the corrected
CHILDES starter table (both need the founder; see the end of this doc). No
parent/child trial is a launch gate. This packet does not authorize media
generation or publishing.

## 1. Scope and ownership

**User-visible claim:** the words for an everyday activity are together;
common short messages are one tap away; editing one group changes only that
group. The meal kit — drinks, fruit, vegetables, tableware — sits in the
same cells on every board that offers it; positions are how the boards
*start*, not a rule that overrides a family's edits. Being better than
incumbents is a goal, not a measured outcome.

| Concern | Owner |
| --- | --- |
| Durable group behavior and edit scope | `docs/product/Motor_Grid_And_Art.md` § Groups |
| Topic membership, noun color, natural-color art, door icons | `docs/phases/026_Topic_Groups.md` |
| Word identity, word-card scope, Library recovery | `docs/product/Word_Library.md` |
| New personal words and enrichment | `docs/product/Personal_Entities.md` |
| Membership, positions, geometry, placement writes | `public/shared/groups.mjs` (extend the existing owner) |
| Group view, index, controls | `public/board/groups-ui.js` |
| Speech completion, sentence state, Smart bar | `public/board.js` |
| Edit replay and snapshots | `public/shared/ops.mjs`; `docs/product/Sync_And_Web_Editing.md` § 4–5 |
| Catalog output | `scripts/catalog/build_catalog.mjs`, `src/board/catalog.mjs`, `public/shared/import.mjs` |
| Prediction ranking, learned time windows | 017 / `docs/phases/007_Occasions.md` — neither may write placements |

**Launch:** Breakfast, Lunch, Dinner, Snack; Fruit and Drinks; 026 topic
groups; local editing and explicit multi-board add; all three named sizes.
**Out of scope:** more occasions, a Now cell, linked editing, global move,
layout reset tools, automatic filing by classification.

## 2. Decisions

`board_group.kind` keeps builtin / my_words / custom. No new kind of group.

| ID | Decision |
| --- | --- |
| B1 | One group model. Blocks exist only in the authoring input the builder reads. No block tables, no block renderer. |
| B2 | **The meal kit holds one position per size.** (Amended 2026-09-28 — per-word coordinates across every occasion group produced sparse, unreadable pages.) `shared` clusters — dishes, drinks, fruit, vegetables — are all-or-nothing: a board holds the whole block or none, and the block claims the same cells on every board that offers it. Everything else packs per-board. The Fruit and Drinks doors are ordinary topic groups carrying the full shelves, with layouts of their own. |
| B3 | **The top row and the frame are part of the page, not group content.** Reserved cells show whatever the home board holds in those cells: the top row (row 0, minus frame cells) and the frame (the home cells of yes, no, stop, help). A home-board edit shows in every group at once. They are not editable inside a group. |
| B4 | *Eat, drink, all done* are ordinary seeded words in the meal groups, at their home coordinates where free. |
| B5 | Home in the corner, outside the grid, replaces Settings while a group or the index is open; Groups still opens the index. Add sits by Groups in Edit mode only. The last grid cell is always reserved for Next, shown only when a group has more than one page, cycling with a page counter. |
| B6 | Setting **Top row on every group**, **on by default** (founder may change it in testing). Off leaves those cells empty and still reserved — nothing reflows, nothing collides when it goes back on. The frame always shows. |
| B7 | Empty-sentence suggestions in a group come from real first-word counts (§ 5), then the child's own starts. After the first word, continuation ranking owns the bar. |
| B8 | New-profile index: Breakfast, Lunch, Dinner, Snack, then My Words and 026's topics. Fixed once seeded. Occasions visible by default; one setting hides all four; any group can be hidden and keeps its slot. Time and history only glow a door — never open, move, or hide one. |
| B9 | Add and remove are local to the current group. Move and swap are local to the current group and board size. Word identity edits (picture, name, recording) are shared and say so. **Add to other boards** picks named destinations. No scope question, pins, drift warnings, or "make it match". |
| B10 | Speak stays in the current group and page. Sentence clearing keeps its own preference. A late speech callback never undoes the user's navigation. |

## 3. Geometry and storage

### 3.1 Authoring and build

- `data/group_seed.topics.json` — 026 topic membership and layout eligibility.
- `data/group_seed.occasions.json` (was `data/occasions/block_doors.proposed.json`): explicit per-group word lists, stable group
  IDs, and ordered clusters. Add Dinner. Clusters suggest coordinates; they
  never imply membership. `data/group_seed.json` is deleted.
- **Positions are computed, not typed** (amended 2026-09-28). One rule in the
  builder assigns every size's seed positions on each occasion board: the home
  coordinates of *eat, drink, all done* where free, then the size's first-page
  priority list (grid15) and each board's lead word, then `shared` clusters —
  the meal kit, anchored to the right by the frame — then board clusters kept
  together from a row start, then leftovers, most-said first inside every
  block. Shared blocks claim from an identical used set on every board, so the
  kit lands in the same cells. The same reading-order rule fills topic groups
  in band order. Hand coordinates for three sizes would drift; the rule plus
  its validation gate cannot.
- Meal groups hold their meal word, useful food and drink choices, *eat, drink,
  all done*, and tableware. Every launch food word has a route; no Food
  mega-group; overflow goes to named sibling topic groups, never dropped.
- The builder resolves meanings with `word#slot`, then emits ordinary
  membership plus explicit per-size positions. The browser never reads
  prototype JSON; there is one renderer.
- Clusters yield to reserved cells. Shared-block words must agree in page and
  cell on every board that holds them. Other repeated words may sit wherever
  each board packs them.

### 3.2 Reserved cells and capacity

Reserved on every page of every group: the top-row cells, the frame cells, and
the last cell (Next). They come from the named size's shipped home layout, so
they never move. Automatic placement never uses them.

| Size | Reserved | Content cells per page |
| --- | --- | --- |
| grid60 | row 0 (10, incl. *yes*) + *no, stop, help* + Next = 14 | 46 |
| grid90 | same cells + Next at 89 = 14 | 76 |
| grid15 | row 0 (*I, want, more, yes, stop*) + *no, help* + Next = 8 | 7 |

Counts are derived from the reserved set, never hard-coded. On grid15 page 1 of
every meal group holds *milk, water, banana, cup*, plus the remaining content
cells chosen once from the food priorities under the shared-position rule;
A1 records the exact seed. Later pages may be sparse.

The index keeps today's `indexVisual`/`indexSlotAt` mapping (canonical slots
from 10). New-profile occasions take slots 10–13, My Words 14, then topics.
Remove the upper bound of 59 and let `lowestFreeIndexSlot` append beyond it.
Hidden or layout-ineligible groups keep their slots; nothing compacts.

### 3.3 Storage

Extend the existing schema owners; none of this exists today.

- `group_membership(group_id, item_kind, item_id, added_at)` — PK
  `(group_id, item_kind, item_id)`. Removing it removes that group's positions,
  never the word record.
- `group_cell(group_id, layout, item_kind, item_id, page, slot_index)` — FK to
  membership; PK `(group_id, layout, item_kind, item_id)`; UNIQUE
  `(group_id, layout, page, slot_index)`; slots exclude the reserved cells.
- `group_seed_install(group_id PRIMARY KEY, seed_version)` — written when a
  group is seeded, kept after the group is deleted. Any marker stops seeding
  that group again, whatever the catalog version.
- Synced settings: `group_top_row` (default true), `occasions_visible` (default
  true); per-group `hidden` (default false). Occasion eligibility is catalog
  metadata, not `kind`.

`groupPage` stays the one content reader; `groups.mjs` owns geometry for the
builder, writes, replay, and renderer. Membership queries (Library, keyboard,
recency, entity chips, path hints) read `group_membership`, not one row per size.

**Positions per size, created when needed.** The fresh seed installs authored
positions for all three named sizes. After that, adds and moves write only the
active size. A Cells change (014's move-cost preview) also previews the groups;
accepting it writes the missing positions for every group in one op, using the
placement rule below. Switching back is exact, because stored positions stay.
Custom sizes follow the same rules, with reserved cells from that size's home
layout.

Page count is one plus the highest content page (minimum one). Empty pages in
between remain. Removing a word never changes another word's page.

### 3.4 Placement, editing, and replay

Choosing a cell, in order:

1. The explicit target cell, if free. A stale occupied target refreshes the
   picker; an add never overwrites or swaps.
2. The word's authored seed coordinate, if free.
3. The word's position in another group at this size (by index order, then
   group ID), if free — a preference only, never a link.
4. The lowest free `(page, slot)`, adding a page if needed.

A drag onto a word swaps just those two. Nothing else reflows. Remove leaves a
hole, in built-in groups too. Hiding a word globally stays separate from
removing it from a group. A word with no placements stays in the Library and
keyboard; the automatic move to My Words goes.

**Add to other boards** is one transaction and one op, carrying the chosen
destinations and positions. None preselected; groups that already hold the word
are skipped, never moved; any failure rolls it all back; its Undo removes only
what it added. Ordinary Undo restores exact positions when free; otherwise the
first free cell, and says the word moved. Undo never displaces a later edit.
`added_at` survives moves and undo.

Ops: extend place/remove/move/swap with the layout and chosen coordinates, and
add the multi-add, seed-install, and Cells-switch ops. Choices are captured at
edit time so replay never recomputes them from another group's later state.
Conflicts resolve in relay order: the earlier occupant stays, the later write
takes the first free cell. Writes to deleted groups are skipped, not redirected.
The seed-install op carries the installed memberships and positions, so restore
and replay never re-derive them from a newer catalog. Snapshots and replay
include every new table and setting.

## 4. Installation — a clean break

**No compatibility layer.** There are no users and no saved boards to keep.
The schema version goes up; a device database from before this change is reset
to the fresh seed. No v1 geometry, no conversion of old edits or sync
baselines, no adoption preview, no "Add meal boards" setup action.

**Decided 2026-09-28 (founder approved the review):**

- **Reset scope: the whole device database.** `bootDb` (`public/db.js`) opens a
  fresh database when the saved one's `user_version` predates this change,
  before `migrateSchema` runs. A group-tables-only reset was considered and
  dropped: `sync_baseline` and the `sync_op` log both carry old group rows and
  arg shapes, so the next rebase would replay them into the new tables.
- **Old ops on the relay.** A group op recorded before this change has no
  `layout` field. Every replica skips such ops, deterministically, so a device
  that restores from a relay still holding them converges without converting
  them. No other op kind changes.
- **Seed install is an op, and the first install wins.** The rebase baseline is
  taken after catalog import and before seeding; seeding then records one
  `seed_install` op carrying memberships and positions. On replay, a group that
  already has an install marker ignores later installs, so two devices that
  each seeded offline converge on the first one the relay confirmed.

Fresh profile: install the curated seed once, with install markers. A new custom
group starts empty; its reserved cells show like any group's. A catalog reimport may update word identity
metadata; it never touches installed memberships, positions, visibility, order,
or a family's label, image, or voice overrides.

Current call paths that change (verified from entrypoints):

- `importCatalog` (`public/shared/import.mjs`) calls `seedGroups`
  (`public/shared/groups.mjs`), which inserts every missing seed cell and
  recreates a deleted built-in group — a removed word would come back.
- `groups-ui.js` calls `groupPage`, which rewraps a canonical 60-cell strip
  (`canonPos`/`visualCell`); per-size positions replace it.
- `removeItem` refuses built-in word removal and moves an entity's last
  placement to My Words. Both go.
- `speakSentence` (`public/board.js`) calls `kbUi.setView('board')` after a
  sentence closes. That navigation goes; sentence, event, and audio handling stay.
- `placeFromEnrichment` can file a word by category. That write goes;
  classification stays a suggestion.
- `migrateLegacyGroups` (pre-groups `zone_slot` databases) is deleted with the
  clean break.

## 5. Smart bar evidence

Fix `scripts/prediction/childes/door_starters.mjs`: read the compiled group
membership; take child turns whose own words, or the two turns before, touch the
group; count **only the first analyzed token**. An unmapped first token counts as
unmapped — never promote a later word. Keep one-word replies. Emit aggregate
counts with corpus/tokenizer/seed provenance into
`data/prediction/door_starters.en.json`; never ship transcripts.

At runtime, filter out masked, retired, and already-visible words, then backfill
under the strip's existing capacity and slot rules (017, 025). The empty home
board is unchanged. Custom groups use pooled starts; the child's own first picks
per group rank ahead as they accumulate, from completed spoken sentences. After
the first pick, continuation ranking takes over. Missing priors never block the
grid.

Exploratory counts (2026-09-27, 10,828 transcripts; a food/drink proxy selected
148,751 child turns): mapped first words led with *I* (11,632) and *no* (6,655);
47,423 first tokens were unmapped. These are aggregate counts, not labeled
mealtimes or measured gains. Permission:
`data/prediction/permissions/2026-09-23_TalkBank_CHILDES.md`. A4 records the
corrected script's counts on the final seed.

## 6. Slices

Each slice includes its focused tests, hunk cleanup, and owner-doc status. Install
and verify the test guard per `docs/operations/Testing.md` first; the full wall
needs its own approval.

| Slice | Deliverable | Depends on | Proof |
| --- | --- | --- | --- |
| **A1 — Seed and geometry** | Update both authoring inputs; resolve meanings and eligibility; emit membership and per-size positions from `build_catalog.mjs`; reserved-cell geometry in `groups.mjs`; finish 026 membership against real capacity; `preview_blocks.mjs` reads compiler output. Two parts: the compiler, geometry and gates (code), and the curation — sibling-group splits, grid15 first pages, Dinner — which ships as a draft for founder review on the preview. Code never waits on curation. | — | `src/board/groups.test.mjs`: duplicate meaning, overlap, reserved cell, missing route, repeated-word mismatch, out-of-bounds, one-page 60/90 seeds — each rejection seen once. grid15 first pages and Dinner checked. |
| **A2 — State, install, replay** | `src/board/schema.sql`, `src/board/catalog.mjs`, `import.mjs`, `public/db.js` (boot order, reset, `migrateLegacyGroups` call), `public/shared/migrate.mjs`, groups/ops owners: membership/position split, install markers, settings and hidden, schema bump with reset, ops with layout coordinates, multi-add and Cells-switch ops, index beyond 59. Audit every `group_cell` reader and the snapshot allowlist. | A1 | `groups.test.mjs`, `sync_op.test.mjs`, `sync_merge.test.mjs`, `layout.test.mjs`: remove → reimport stays removed, deleted group stays deleted, Cells switch and exact switch-back, offline same-cell adds, fresh-device restore, multi-add Undo, pre-change DB resets to the fresh seed. |
| **A3 — One group surface and editor** | `groups-ui.js`, `board.js`, `index.html`, board styles: reserved cells rendered from the home board, Home/Next/Add, top-row setting, hides, index and glow, local remove/move/swap, multi-add and scope copy. Automatic enrichment filing off. | A2 | `groups_ui.test.mjs`, `keyboard_ui.test.mjs`, affected writer suites. Render all three sizes; run the Works Test. |
| **A4 — Stay after Speak; real starters** | Speech completion and `renderStrip` in `board.js`; corrected CHILDES builder and table; per-group first-pick history. Delete `meal_doors.proposed.json` and `preview_addresses.mjs` once unused. | A2; A3 for rendered proof | `scripts/prediction/childes/childes.test.mjs` (first vs later word, unmapped starts); prediction/speech tests; rendered speech offline, fresh-start both ways, expressive/transformed/cancelled speech, later navigation, learned and cold-start suggestions. |
| **A5 — Launch proof** | Final catalog and previews from source, 026 visuals, owner docs, SSOT, live index. No audio swaps or bulk art. | A1–A4; 026 visuals | Works Test, focused suites, `npm run check:fast`, doc routes and phase freshness. Record what was observed; mark built only when proven. |

### Works Test

On `npm run dev:agent` (never the founder's `npm run dev`), online and offline,
checking rendered cells and audible speech — not a helper's report.

1. Fresh grid60: open Breakfast; *I, want, milk* and *more, milk* are direct
   taps. Speak; the page stays. Home and Groups each work.
2. Lunch, Dinner, Snack: the kit (drinks, fruit, vegetables, tableware)
   shares cells on every board that offers it. Fruit and Drinks are dense
   topic doors. Breakfast has yogurt; Dinner has corn. Every launch word
   has a route. No overlaps.
3. Move *want* on the home board: every group's top row shows the move.
4. Remove chocolate milk from Breakfast: a hole; Lunch and Drinks unchanged.
   Restart, reimport, restore on another device: still removed. Remove a
   personal word's last placement: Library and keyboard still find it; no
   My Words placement.
5. Move milk on Breakfast: only that placement moves. Undo. Add a word whose
   seed cell is taken: nothing moves. Fill a page and add again: Next appears.
6. Add a personal drink to Breakfast offline: only Breakfast changes. Add it to
   Lunch and Snack with Add to other boards; Undo that. Change its photo on the
   word card: every placement updates.
7. Top row off, then on: nothing moves; the frame stays.
8. grid15: the authored first pages, paging, the kit's shared positions.
   grid90: bounds and full vocabulary. Customize, change Cells with the
   preview, switch back: exact.
9. Empty group sentence: first-word suggestions; after a tap, continuations.
   Navigate away during playback: no jump back. No suggestion moves a tile.

```sh
scripts/test.sh src/board/groups.test.mjs src/board/layout.test.mjs
scripts/test.sh src/board/sync_op.test.mjs src/board/sync_merge.test.mjs
scripts/test.sh src/board/groups_ui.test.mjs src/board/keyboard_ui.test.mjs
scripts/test.sh scripts/prediction/childes/childes.test.mjs
npm run check:fast
npm run lint:phase-freshness
```

## 7. Done means deleted

- No block tables, linked edits, pins, drift state, or category filing.
- No stored copies of the top row or frame; no per-page anchor roles.
- No v1 geometry, legacy op conversion, adoption preview, or
  `migrateLegacyGroups`.
- No return home after Speak; no built-in removal veto; no My Words re-filing;
  no reimport restoring removals.
- No within-turn counts labeled as starters. Retired prototype sources removed
  once unused; output regenerated from the final authoring owner.
- At completion the durable contract lives in Motor_Grid_And_Art, identity in
  Word_Library, sync in Sync_And_Web_Editing, storage in
  Language_And_Voice_Schema; this phase retires per the playbook.

**Works Test — observed 2026-09-28** (fresh profile on an agent slot,
headless Chromium with autoplay allowed; cells read from the painted grid,
speech from the audio element's own `ended` events; 12/12 checks, no page
errors):

1. Breakfast: *I, want, milk, more* on the page; ▶ played `i want milk` and
   `more milk` to `ended`, the view stayed on the group; corner Home → board,
   Groups → index.
2. milk, water, juice, cup, banana, apple, eat, all done each sit in one cell
   across Breakfast/Lunch/Dinner/Snack/Fruit/Drinks; Breakfast has yogurt, Snack
   has cup. (Every launch word's route and no overlaps: the A1 gate.)
3. Swapping *want* and *like* on the home board (Edit-mode drag) showed in
   Lunch's and Snack's top rows.
4. × on chocolate milk in Breakfast left slot 18 empty; Lunch and Drinks kept it;
   after a reload (catalog reimport) Breakfast still lacked it. Removing a
   personal word's only placement left it in the Library with no My Words
   placement. (Restore on another device: `groups.test.mjs` fresh-device drain.)
5. Dragging milk 27 → 13 in Breakfast changed only that cell; Lunch's milk stayed
   at 27. (Undo, seed-cell-taken adds, and Next on a full page:
   `groups.test.mjs` placement test and `edit_mode.test.mjs`.)
6. Offline: adding Kefir to Breakfast changed only Breakfast; the toast offered
   Add to other boards → Lunch, Snack in one op; Undo left only Breakfast.
   (Photo change on the word card updating every placement: not driven here —
   every placement reads the one `personal_entity` row.)
7. Top row off: row 0 empty except *yes* (frame), content unchanged; on again:
   identical.
8. grid15 Breakfast page 1: milk, banana, all done, water, cup, eat, cereal, Next
   1/6; Lunch's milk in the same cell; grid90 renders 90 cells; back on 60 every
   stored position was exact.
9. Navigating to the index during playback stayed on the index; no tile's word
   changed cell. Empty-sentence starters were empty: no corpus table yet, and
   her one first pick (*I*) is already on the page.

Found and fixed on the way (own commits): multi-word Speak never sounded
(license lookup threw; clip loop stopped after one word — 354f1c1); Edit-mode
drag with a mouse was cancelled by native image drag (54348c1); the corner is
Home on group surfaces in Edit mode too (3da8bda).

**Founder review (needed to retire this phase):**

- **Seed curation** — `node scripts/catalog/preview_blocks.mjs`, then open
  `public/preview-blocks.html`: the sibling splits (Home/Things, Describing/Touch
  & sound, Little words/Who & which), Dinner's words, the grid15 first page
  (milk, water, banana, cup, eat, all done + cereal/pasta/cracker), and grid15
  Fruit's expanded shelf. Edits go in
  `data/group_seed.occasions.json` / `data/group_seed.topics.json`, then
  `npm run catalog:build` — the gate re-checks every size.
- **Starter table** — on the machine with the CHILDES cache:
  `node scripts/prediction/childes/door_starters.mjs && npm run catalog:build`.
  Until then the empty-sentence bar starts from the child's own first picks.
- **026 visuals** (topic door icons, neutral noun frame) stay open in 026;
  groups show their emoji glyphs meanwhile.

No efficacy or clinical claim.
