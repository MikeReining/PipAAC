# Phase 027 — Occasion boards and independent editing

**Status:** READY FOR IMPLEMENTATION — founder approved 2026-09-27. Not built.
This replaces the earlier linked-block design. Blocks author starting layouts;
families edit ordinary groups. No parent/child research trial is a launch gate.
The required proof is deterministic checks plus our own rendered interaction
and speech checks. This packet does not authorize media generation or publishing.

## 1. Scope and ownership

**User-visible claim:** familiar words are together for an everyday activity;
common short messages are available directly; editing one group changes only
that group. Cross-group coordinate consistency is a seed property, not a rule
that overrides family choices. Comparative superiority is a product goal, not
an outcome established by the corpus or the prototype.

| Concern | Truth / surface owner |
| --- | --- |
| Durable group behavior and edit scope | `docs/product/Motor_Grid_And_Art.md` § Groups |
| Topic membership, noun color, natural-color art, door icons | `docs/phases/026_Topic_Groups.md` |
| Word identity, word-card scope, Library recovery | `docs/product/Word_Library.md` |
| New personal words and enrichment | `docs/product/Personal_Entities.md` |
| Group membership, positions, geometry, placement writes | `public/shared/groups.mjs` (extend existing owner) |
| Group view/index state and controls | `public/board/groups-ui.js` |
| Speech completion, sentence state, Smart bar integration | `public/board.js` |
| Shared edit replay, snapshot, baseline conversion | `public/shared/ops.mjs`; `docs/product/Sync_And_Web_Editing.md` § 4–5 |
| Catalog output | `scripts/catalog/build_catalog.mjs`, `src/board/catalog.mjs`, `public/shared/import.mjs` |
| Prediction ranking / learned time windows | 017 / `docs/phases/007_Occasions.md`; neither may write placements |

Launch: Breakfast, Lunch, Dinner, Snack; Fruit and Drinks; 026 topic groups;
local editing and explicit multi-board add; all three supported sizes. Further
occasions, Now cell, linked block editing, global move, layout reset tools, and
new automatic classification filing are out of scope.

## 2. Locked launch decisions

These are implementation requirements for the product contract, not new kinds
of group. `board_group.kind` keeps builtin / my_words / custom.

| ID | Decision |
| --- | --- |
| B1 | One runtime group model. Blocks exist only in authoring/build input. No block tables, `group_block`, `door_pin`, `door_hide`, or separate block renderer. |
| B2 | Author common positions for repeated words across the four meal groups, Fruit, and Drinks per layout. Curate each group's membership separately; allow subsets of clusters. Preserve blanks, including on single-topic Fruit/Drinks. |
| B3 | Seed yes/no/stop/help in their named-layout home cells; deduplicate with the top row. Seed eat/drink/all done in meal groups. |
| B4 | Corner Home outside the grid replaces Settings while a group/index is open. Groups still opens the index. Add by Groups only in Edit mode. Permanently reserve the last grid cell for Next; show it only if multiple pages, cycling with a page counter. |
| B5 | Existing core top row ON by default for new profiles/groups. Smart bar supplements it. The setting changes visibility without reflow; locally customized/removed tiles are respected (§ 3). |
| B6 | Empty-sentence suggestions come from actual first-word counts. Nonempty sentences keep continuation ranking. Never treat within-turn frequency as an opener distribution. |
| B7 | Breakfast, Lunch, Dinner, Snack first, in that order, on a new index; then My Words and 026's topics. Fixed after seeding. Occasion visibility defaults ON; individual group hides preserve slots. Likelihood glows only, with existing scoring; no auto-opening or reordering. |
| B8 | Add/remove is local to the current group; move/swap additionally local to the active layout. Word identity edits are shared and labeled. Explicit Add to other boards chooses destinations. No ordinary scope questions, block UI, pins, drift warnings, or make-it-match. |
| B9 | Speak stays in the current group/page. Sentence clearing/fresh-start preference is independent. No async speech completion may undo the user's later navigation. |

## 3. Geometry and storage contract

### 3.1 Seed inputs and generated output

A1 updates the existing authoring sources; their current contents are prototypes,
not this decision's final data:

- `data/group_seed.topics.json`: 026 topic membership and layout eligibility.
- `data/occasions/block_doors.proposed.json`: replace whole-block membership with
  explicit per-group words, stable group IDs, ordered layout clusters, and
  per-layout seed placements. Add Dinner (absent from the current prototype).
  Clusters may suggest coordinates; they never imply runtime membership.
- Require yogurt on Breakfast and cup on Snack. Meals include their named meal
  word, useful food/drink choices, eat/drink/all done, and tableware. Ensure all
  launch food words have a home or group route; no Food mega-group. Overflowing
  topic content uses explicitly named sibling topic groups, never silent loss.
- Resolve meanings with the existing `word#slot` resolver. The builder emits
  ordinary group membership and explicit per-layout positions. Do not read
  prototype JSON directly from the browser or maintain a second renderer.
- Cluster layout yields to fixed core anchors. Seed food words around them;
  trim/reassign topic membership rather than overlap anchors or break the
  one-page fresh-seed rule on 60/90. Repeated meal/Fruit/Drinks words must still
  agree. Short columns are acceptable. No number-of-words multiple is required.

### 3.2 Per-layout positions and supplied anchors

Replace the current single canonical strip for group contents. Target schema:

- `group_membership(group_id, item_kind, item_id, added_at)`: one membership per word
  per group; PK `(group_id, item_kind, item_id)`. Removing this row removes all
  its layout placements, never the word record.
- `group_cell(group_id, layout, item_kind, item_id, page, slot_index, seed_role)`:
  FK to membership; PK `(group_id, layout, item_kind, item_id)`;
  UNIQUE `(group_id, layout, page, slot_index)`. Nonnegative page and slot within
  the named layout, with navigation excluded. `seed_role` is content / top /
  frame / meal. It records initial presentation only, not block inheritance.
- `group_layout(group_id, layout, geometry_version)`: v1 retains the old
  cells-minus-three geometry for existing saves; v2 uses this packet. This is
  internal compatibility state, never a family-facing group type.
- `group_seed_install(group_id PRIMARY KEY, seed_version)`: persisted installation record,
  including for an empty group. Imported again does not mean installed again.
  Keep this marker after group deletion to prevent automatic recreation; it has
  no cascading FK to `board_group`. The version is provenance only: any marker
  suppresses seeding, even when the catalog version changes. Carry authored preference coordinates
  and anchor reservations with the installed version; updates must not silently
  change its next-free policy or reinterpret seed roles.
- Synced profile setting `group_top_row` defaults true for new profiles;
  `occasions_visible` defaults true. Per-group `hidden` defaults false. Store
  occasion classification/layout eligibility as catalog metadata, not `kind`.

Extend existing schema/migration owners; these tables and fields are planned,
not present today. `groupPage` remains the one content reader. `groups.mjs`
owns geometry for the builder, local writes, replay, and renderer; no separate
`doorCells` path. Membership queries (Library, keyboard, eligibility, recency,
entity chips, path hints) read `group_membership` once, not one row per layout.

Top/frame/meal placements have page 0 as their stored address and render at that
slot on every page. They reserve that slot on every page even when not shown.
Frame takes precedence over top, then meal, then content; seed one membership
and placement per word. Thus yes appears once, and remains when the top row is
off. A position edit of any supplied anchor converts it to content in that
layout; its repeats disappear and only the chosen position remains. Remove
removes membership from this group across layouts. Identity/image/voice edits
do not change its seed role. Toggle off/on never recreates a removed placement.

The top-row switch controls only unmodified supplied top-role tiles. Customized
positions stay visible. Its settings explanation must say this. The fixed seed
anchor cells remain reserved for automatic placement, even after a local
removal/move; an adult can explicitly place a content tile in a vacated cell.
An occupied hidden top-role cell is not empty and cannot be overwritten without
an explicit local removal. Edit mode shows hidden supplied tiles as muted
placeholders, distinct from globally masked words. No setting changes capacity.

Dragging a repeated anchor on a later page resolves its word identity from the
stored page-0 placement but uses the **displayed** source/destination page for
move/swap. Both swap participants become ordinary content if either was an
anchor; Undo restores their original role, stored address, and repetitions.
Manual re-add always creates content, never silently restores an anchor role.
Only seed installation or explicitly previewed adoption creates supplied roles.

The index retains the existing `indexVisual`/`indexSlotAt` mapping (canonical
index slots begin at 10, visual page width is cells-minus-three). This is
independent of group-content v2 geometry; it has no repeated word anchors.
Its first two visual slots remain unavailable; corner Home and Edit controls
are outside the grid, and the last cell is Next. New-profile occasions occupy
canonical slots 10–13, My Words 14, then topics. Do not remap an existing index.
Remove the storage upper bound of 59 and let `lowestFreeIndexSlot` append beyond
it; existing index positions remain unchanged and extra groups page normally.
Hidden/ineligible groups keep their slots; filtering never compacts other doors.

All repeated anchor slots plus Next are excluded from ordinary automatic
placement on every page. Default capacities (top ON, before local edits):

| Layout | Topic content slots/page | Meal content slots/page | Small-layout treatment |
| --- | --- | --- | --- |
| grid60 | 46 | 43 | Core top row + four frame words; meal adds three anchors. |
| grid90 | 76 | 73 | Same named core coordinates; last cell 89 is Next in groups. |
| grid15 | 7 | 6 | Top row I/want/more/yes/stop; no/help complete frame; all done at slot 7. Eat/drink have no home cell here, so are ordinary paged content. |

The last cell is reserved even on a one-page group; paging can never evict a
word. Counts are derived from the union of slots, not hard-coded as 56 or 57.
In product copy, page 1 means stored page 0. At 15 cells put milk, water,
banana, and cup on page 1 of every meal. Assign the remaining two content positions from the authored food priorities subject
to the shared-coordinate constraint; A1 records the resulting exact seed. Do
not independently choose those two per occasion and then claim alignment.
Repeated words in the meal/Fruit/Drinks family use the same page and cell, so later pages may be sparse.
Layout-ineligible groups (the More groups on 60/90) stay out of the index;
materialize positions only for their eligible layouts. Existing custom cell
geometries supported by 014 retain v1 rendering and editing; this phase authors
v2 for grid15/grid60/grid90 only and must not disable existing custom sizes.
A new group created while a custom size is active uses v1 there and v2 for the
three named sizes; disclose that conversion preview supports the named sizes.
All fresh-seed words remain reachable. A Cells change previews the move cost
and switches to saved per-layout coordinates; switching back is exact.

Page count is one plus the highest stored content page, with a minimum of one;
repeated anchors do not create pages. Empty intermediate pages remain, not
compacted. If removal empties the current last page, retain that page until
explicit navigation or reopen; then clamp to the last remaining page. No word
changes its page number when another word is removed.

### 3.3 Placement, editing, and replay

Membership edits apply to all supported layouts **within the selected group**.
Position edits affect only the active layout. Seed all eligible layout positions
when adding membership; don't lazily recompute them at render or density change.

For each layout, select a position in this order:

1. Explicit target in the active layout, if available. A stale occupied target
   refreshes the picker; local Add does not silently overwrite or swap.
2. That word's authored preferred coordinate in the target's seed layout, if
   free and not reserved. A manual re-add may use its own vacated seed-anchor
   coordinate as content; it does not acquire repetition/visibility behavior.
3. An existing placement in another group in this layout, ordered by stored
   group index then group ID, if eligible/free. This reads a preference only;
   it never modifies or subscribes to the other group.
4. Lowest available `(page, slot_index)` in this layout, growing pages as needed.

Moving onto an occupied cell explicitly swaps those two words. Converting an
anchor to content frees its repeated copies; no unrelated cell reflows. Global
masking stays separate from Remove from this board. Last-placement removal
leaves an active Library record; remove the implicit My Words relocation.

Multi-board add is one local transaction and one versioned op with the explicit
ordered destination IDs and chosen per-layout coordinates. None preselected.
Skip existing memberships; never move them. Failure rolls back all selected
adds. Its Undo removes only the memberships created by that action. Ordinary
Undo restores exact coordinates when still free; on a concurrent conflict use
the same deterministic free-cell fallback and say the restored word is in a
new spot. Never displace a later edit. Keep added_at stable for move/undo.
Undo snapshots include seed_role and every affected layout position; restoring an anchor role also requires its repeated
slot to be free on every affected page. On conflict restore as content at the
first free cell and report the changed position rather than hide an occupant.

Extend existing place/remove/move/swap ops with a payload version and layout
coordinates. Capture placement choices at edit time so replay cannot change
its preference because another group's index changed. Conflict resolution in
relay order preserves earlier occupants and picks the first free eligible cell;
unknown op versions fail explicitly. Missing/deleted destinations are skipped,
not redirected to My Words. No hidden global filing. Versioned multi-add replay
applies only still-existing selected groups and reports skipped destinations.

Include every new table/field in snapshots, restore, and replay baselines.
Migrate persisted `sync_baseline` JSON and legacy op payloads, not just live
SQLite. Convert old no-layout ops by their legacy visual coordinates for each
layout; new position ops name one layout. Fixtures must cover pending old ops
at upgrade and mixed historical ops after restore. Older clients must not
apply v2 payloads as v1; unsupported versions require updating before editing.

## 4. Installation and existing saves

Current call paths, verified from entrypoints:

- `importCatalog` in `public/shared/import.mjs` calls `seedGroups`, which currently
  inserts every missing seed cell. A removed word would reappear on reimport.
- `groups-ui.js` calls `groupPage`, which rewraps canonical 60-space via
  `canonPos`/`visualCell`. Merely widening a slot CHECK cannot provide these maps.
- `removeItem` refuses builtin sense removals and relocates last-group entities
  to My Words. Both must change with the new editor/replay contract.
- `speakSentence` in `public/board.js` calls `kbUi.setView('board')` after closing
  a sentence. Remove that navigation, preserving sentence/event/audio handling.
- `placeFromEnrichment` exposes automatic category filing; the existing entity
  policy authorizes it. Retire that write behavior, even if no production caller
  currently invokes it. Classification remains a suggestion.

Fresh profile: install the curated v2 seed once with all layout positions and
installation markers. New custom groups seed their local anchors once.
Reimport may update catalog identity metadata, but never installed memberships,
positions, visibility, ordering, or a family's label/image/voice overrides.

Existing profile: convert membership and materialize the current visible
coordinates for all sizes using the old geometry; mark those group layouts v1
and installed. Run the older zone/custom-group migration before this conversion;
its historical `group_item` table is not the new `group_membership` table. Preserve custom additions, removals, empty groups, hidden/masked
state, index order, and word records. Do not run 026's old destructive re-seed.
Do not auto-insert new occasion groups into occupied/familiar index positions.

Offer a one-time, dismissible setup action **Add meal boards** for an existing
profile. Preview the four new groups and their free index destinations, then
install them as v2 using explicit synced intent. Existing groups stay v1 until
an adult selects **Use new group layout** in that group's settings. Preview all
three layouts, preserve membership, and show every relocation caused by new
reserved slots; add the supplied anchors explicitly in the preview. Conversion
is one atomic, undoable op carrying the resulting maps. Custom words are never
dropped. Removing a tile locally is not grounds to restore it during conversion;
include previously removed anchors only if the adult explicitly selects them
in the preview. v1 compatibility uses its existing navigation reservations;
Speak-stays and local-removal rules apply to both versions. Conversion is not
required to keep using a saved board.

For legacy saves without reliable removal provenance, absence from the existing
group wins; migration never guesses that a missing seed word should come back.
The first v2 seed installation/adoption is the only placement-changing event;
subsequent catalog versions cannot reinterpret it. Fresh-device restore uses
the saved installation state before any seeding, including baseline replay.
Persist the original concrete seed installation as a versioned baseline (or
installation op containing all maps) before accepting edits. An op-only restore
must receive that base; it must not replay removals against today's seed. Keep
legacy seed payloads/version resolvers needed to reconstruct old operation logs.
If that base is unavailable, stop restore with an explicit recoverable error
rather than invent memberships. Test restoring after the shipped seed changes.

## 5. Smart bar and evidence

Fix `scripts/prediction/childes/door_starters.mjs`: read final compiled group
membership, find child turns in the same or previous-two-turn word context,
then count the **first analyzed token only**. If it is unmapped, do not promote
a later word to first. Do not count every home word in the turn. Retain one-word
responses. Emit aggregate candidate counts/support plus corpus/tokenizer/seed
provenance into `data/prediction/door_starters.en.json`; never ship transcripts.

Count all offerable initial words; normal runtime filtering removes masks,
retired words, and duplicates already visible in the active grid. Backfill after
filtering, with the current strip capacity/negation/expression-slot policy (017
and 025). Empty home-board behavior is unchanged. For custom groups without a
shipped prior, use pooled starts; group-specific child starts rank ahead by
count, tied by the shipped prior then sense ID. Use completed spoken sentences,
not clears, grouped by where the first pick occurred. Keep learning local under
the existing history policy. After the first pick, existing continuation ranking
owns suggestions. Missing priors leave the usable grid intact, never block it.

Read-only local analysis on 2026-09-27 covered 10,828 transcripts / 2,108,192
nonempty child turns. A proxy using current proposed food/drink/tableware words
in the child turn or two preceding turns selected 148,751 turns; 57,868 had one
normalized token and 97,451 at most three. Within that selection: want 5,881,
eat 3,899, like 3,196, more 2,339 turns. Actual mapped first words led with I
(11,632) and no (6,655); 47,423 first tokens were unmapped and were not skipped
forward. These are exploratory aggregate counts, not labeled mealtimes, AAC
outcomes, or measured interface gains. Raw-literal adjacency counts from a
separate 130,364-turn proxy were more→juice 275, more→milk 211, my→milk 177.
Do not mix the two denominators. Provenance/permission:
`data/prediction/permissions/2026-09-23_TalkBank_CHILDES.md`.

The old prototype's 42–52 occupied cells with top row ON is only a feasibility
observation. Its layout does not include all final anchors/members or editing;
its opener table counts words anywhere in turns. It is not launch proof.
A4 must record reproducible counts from the corrected script and final seed;
no product decision is blocked on repeating the exploratory analysis.

## 6. Ordered implementation slices

Every slice includes its focused tests, hunk cleanup, owner-doc status update,
and rendered proof where named. Paths in this table exist; extend their suites
instead of creating a parallel block subsystem. Install/verify the test guard
per `docs/operations/Testing.md` before tests. The full wall remains subject to
that document's per-run approval rule; it is not automatically authorized here.

| Slice | Deliverable and files | Depends on | Required proof |
| --- | --- | --- | --- |
| A1 — Seed/compiler and geometry | Update the two authoring inputs; resolve meanings/layout eligibility; emit group membership, per-layout cells/roles and seed version in `scripts/catalog/build_catalog.mjs`. Shared geometry in `public/shared/groups.mjs`. Finish 026 topic membership against actual capacities; update `preview_blocks.mjs` to consume compiler output. | — | `src/board/groups.test.mjs`: duplicate meaning, overlap, reserved slot, missing reachability, repeated-word mismatch, wrong layout bounds, one-page 60/90 seeds; demonstrate each rejection once. Check 15-cell pages and Dinner. |
| A2 — State, install, migration and replay | `src/board/schema.sql`, `src/board/catalog.mjs`, `public/shared/import.mjs`, groups/ops owners. Membership/position split, installation state, settings/hidden fields, versioned ops, legacy live/baseline conversion and explicit adoption; stable paged index extension. Audit every `group_cell` reader and snapshot allowlist. | A1 | `src/board/groups.test.mjs`, `src/board/sync_op.test.mjs`, `src/board/sync_merge.test.mjs`, `src/board/layout.test.mjs`: custom legacy saves, empty groups, remove→reimport, density round trip, page-2 anchor drag/swap/role Undo, manual anchor re-add, index overflow, offline concurrent same-slot adds, pending v1 ops, fresh-device restore, adoption/undo. |
| A3 — One group surface and local editor | `public/board/groups-ui.js`, `public/board.js`, `public/index.html`, relevant board styles. Home/Next/Add, anchor repetition, top-row switch, hides, fixed index/glow, local remove/move/swap, explicit multi-add and scope copy, setup/adoption preview. Disable automatic enrichment filing; update entity/word-card callers. | A2 | `src/board/groups_ui.test.mjs`, `src/board/keyboard_ui.test.mjs`, plus affected writer suites. Render all three layouts; execute the Works Test below, including identity sharing versus placement locality. |
| A4 — Stay after Speak and correct starters | Speech completion and `renderStrip` integration in `public/board.js`; corrected CHILDES builder/table; first-pick group history through existing local learner owners. Remove obsolete `meal_doors.proposed.json`/`preview_addresses.mjs` once no consumers remain. | A2; A3 for rendered proof | `scripts/prediction/childes/childes.test.mjs` distinguishes initial versus later words/unmapped starts; affected prediction/speech tests. Offline rendered speech, fresh-start both ways, expressive/transformed/canceled speech, later navigation, learned and cold-start suggestions. |
| A5 — Integrated launch proof and status | Final built catalog and previews from source, 026 visual work, all owner docs + SSOT + live index. No catalog audio swaps or bulk art generation. | A1–A4; 026 visuals | Works Test, focused suites below, `npm run check:fast`, doc routes/phase freshness. Record actual observed results and outstanding failures; mark built only when proven. |

### Works Test — owner-visible release proof

Use `npm run dev:agent`; never replace the founder's browse process. Run offline
as well as online. Inspect actual rendered cells and audible output, not a
layout helper's success report. This is our own acceptance check, not a request
for parents to trial an unfinished product.

1. Fresh grid60: open Breakfast; I/want/milk and more/milk are directly selectable
   without the Smart bar. Speak audibly and remain on the same group/page. Clear
   according to the chosen preference; Home and Groups work independently.
2. Open Lunch, Dinner, Snack, Fruit, Drinks; inspect repeated seed coordinates.
   Breakfast includes yogurt; Snack includes cup. Every launch word has a
   home/group route on the fresh seed. No overlapping or invisible occupied tile.
3. Remove chocolate milk from Breakfast; inspect its empty cell and unchanged
   Lunch/Drinks. Reopen, restart, reimport catalog, restore on another device;
   the removal persists. Remove the last placement of a personal word; verify
   active Library/keyboard recovery and no unsolicited My Words placement.
4. Move milk on Breakfast; only its active-layout placement changes. Undo.
   Add an existing word whose preferred slot is occupied; no occupant moves.
   Fill a page and add again; Next appears without relocating a word.
5. Add a personal drink to Breakfast offline; only Breakfast changes. Explicitly
   add it to Lunch/Snack, skip already-present destinations, then Undo that add.
   Change its photo/recording on the scoped word card; all occurrences update.
6. Toggle the top row off/on; content never moves, removed tiles stay removed,
   frame yes remains, customized positions remain visible, no duplicate yes.
7. grid15: verify the six authored first-page meal content cells, paging, repeated
   anchors and matching shared page/cell addresses. grid90: verify bounds and
   full vocabulary. Customize each, change Cells with preview, and switch back.
8. Existing saved profile: decline adoption and preserve the old layout; accept
   one group's preview and verify only the shown changes. Undo restores it.
9. Empty group sentence: observe eligible first-word suggestions; after a tap,
   continuations. Speak after manually navigating away during playback: no jump
   back. No prediction completion may move a board tile.

Focused command sets (run the suites affected by each slice, not the whole wall):

```sh
scripts/test.sh src/board/groups.test.mjs src/board/layout.test.mjs
scripts/test.sh src/board/sync_op.test.mjs src/board/sync_merge.test.mjs
scripts/test.sh src/board/groups_ui.test.mjs src/board/keyboard_ui.test.mjs
scripts/test.sh scripts/prediction/childes/childes.test.mjs
npm run check:fast
npm run lint:phase-freshness
```

## 7. Completion and deletion targets

- No runtime block tables, linked-edit operations, pin/hide overlay subsystem,
  make-it-match state, or category-driven automatic placement.
- No return-home-after-Speak path; no built-in removal veto or never-orphan
  re-filing; no repeated seed import restoring family removals.
- No stale within-turn counts labeled as starters; no old prototype presented
  as final proof. Remove retired prototype sources only after their consumers
  switch, and regenerate output from the final authoring owner.
- Product docs distinguish decided behavior from built behavior. At completion,
  retain the durable contract in Motor_Grid_And_Art, identity in Word_Library,
  sync in Sync_And_Web_Editing, geometry/storage in Language_And_Voice_Schema;
  retire this phase per the playbook rather than leave duplicate owners.

**Packet proof state (2026-09-27):** docs-only decision work. Runtime and data
are unchanged; all implementation Works Tests above remain to be built/run.
No product efficacy claim or clinical validation is asserted.

**Documentation closeout:** the 2026-09-27 packet received a read-only architecture
review covering layout, install/replay, local scope, migration, and recovery.
Its findings are incorporated above. Doc-route scan, phase freshness, and diff
whitespace checks pass. Runtime tests are not claimed: this task changed only
Markdown. Git staging/commit/handoff is intentionally left to the founder.
