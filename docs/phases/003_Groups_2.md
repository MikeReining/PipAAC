# Phase 003 — Groups 2.0

**Status:** Ready to execute. Not started.

**DECIDED 2026-09-22** (founder: "proceed", after the groups review in the
same session). This doc packs the whole phase for one developer to execute
end to end. Every slice is self-contained. Do them in order.

Product truth this phase implements:

| Topic | Owner |
| --- | --- |
| What a group is, layout law, nav cells, edit mode, "show me where" | `docs/product/Motor_Grid_And_Art.md` § Groups |
| Adding, filing, and classifier placement for personal entities | `docs/product/Personal_Entities.md` § Filing |
| Table shapes (updated by slice 2) | `docs/product/Language_And_Voice_Schema.md` §6.3b |
| Core slot assignments (never touched by this phase) | `docs/product/Core_Coordinate_Map.md` |

Supersedes the zone wording in `docs/phases/002_Core_Board_And_Customize.md`
(slice 2 "filed by context"). The Cooper proof still has to pass after this
phase, through the new add flow.

---

## Why this phase exists

The groups surface grew in stages, and each stage left a seam. Measured on
2026-09-22 at `3ee3c12`:

1. **Words are unreachable.** A group page holds 58 items and paging is not
   built (`public/board.js:651` only calls `console.warn`). Daily Actions
   has 64 senses and Food & Drink has 61, so their tail words cannot be
   tapped at all.
2. **Group pages have no coordinates.** The group index obeys the
   motor-memory law (`zone_slot`), but the words inside a group come from
   `ORDER BY l.text` (`public/board.js:644`). Adding one word shifts every
   word after it. Alphabetical order means nothing to a non-reader.
3. **Four names for one thing.** The UI says "Groups" (strip anchor) and
   "Zones" / "Arrange zones" (Parent Corner). The data says `category` and
   `zone_key`. The code has `custom_group`.
4. **Two container types with different rules.** Category zones hold
   catalog senses (alphabetical, not arrangeable). Custom groups hold only
   personal entities (stable order). A catalog word cannot go into a
   custom group.
5. **The Parent Corner "Add a word" files silently into My Words**
   (`public/board.js:348-352`). Nothing tells the adult where the child
   will find it.
6. **Duplicate and noisy controls.** Parent Corner "Zones" repeats the strip
   anchor. The anchor glyph is 🌅 with the title "Routines & groups".
   `+ Add` and `+ Group` are adult controls shown to the child.

## The model in one paragraph

A **group** is one kind of thing everywhere. It is a page of the same 10×6
geometry as the core board, holding items (catalog senses or personal
entities) at fixed slots. Some groups ship with the app (**built-in**),
one is **My Words**, and families make **custom** ones. An item can sit in
many groups. Groups are one level deep: a group never contains a group.
Positions move only in **Edit mode**. Adding happens inside the group
you are editing, so the location is the picker. `category` survives only
as a catalog property: a word's home, the seed for built-in groups, and
the classifier's target. It is never a container.

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| group, group index, group page | zone, sub-zone, folder, category (for the container) |
| built-in group, My Words, custom group | "zone key" |
| Edit mode | arrange mode |
| `board_group`, `group_cell` | `zone_slot`, `custom_group`, `group_item` (legacy tables, dropped in slice 2) |

---

## Geometry — fixed across all slices

**Group index** (60 slots, 10×6):

| Slot | Use mode | Edit mode |
| --- | --- | --- |
| 0 | `← Board` | `← Board` |
| 1 | blank (disabled) | `+ Group`; becomes `Delete group` while a custom group is lifted |
| 2–9 | reserved, blank | reserved, blank |
| 10–59 | groups at `board_group.index_slot` | same; tap to lift, tap to place or swap |

**Group page** (60 slots per page):

| Slot | Use mode | Edit mode |
| --- | --- | --- |
| 0 | `← Groups` | `← Groups` |
| 1 | blank (disabled) | `+ Add`; becomes `Remove` while an item is lifted (when removal is allowed) |
| 2–58 | items at `group_cell (page, slot_index)` | same; tap to lift, tap to place or swap on this page |
| 59 | `Next ›` with `1/2` badge when the group has >1 page; else blank | same |

57 items per page. Slots 0, 1, and 59 are reserved in both modes, so an
item never moves when the mode changes or the group grows past one page.

---

## Built-in groups — the seed

Hand-authored source: `data/group_seed.json` (new, slice 2). The build
validates it and emits groups into `data/catalog/catalog.json`. Order in
the file is the default index order: the first group gets `index_slot` 10,
the next 11, and so on.

| key | name | glyph | Members |
| --- | --- | --- | --- |
| `my_words` | My Words | ⭐ | empty at seed |
| `food` | Food | 🍎 | category `Food & Drink` except the Drinks words |
| `drinks` | Drinks | 🥤 | `water`, `milk`, `juice`, `apple juice`, `chocolate milk`, `tea`, `smoothie` |
| `body` | Body | 🧍 | category `Body, Health & Hygiene` |
| `feelings` | Feelings | 😊 | category `Feelings, Emotions & Sensory States` |
| `actions` | Actions | 🏃 | category `Daily Actions & Activity Verbs` except the Moving words |
| `moving` | Moving | 🤸 | `run`, `jump`, `walk`, `sit`, `stand`, `climb`, `dance`, `swim`, `ride`, `crawl`, `kick`, `throw`, `catch`, `push`, `pull`, `swing`, `slide`, `fall` |
| `people` | People | 👪 | category `People, Family & Roles` |
| `places` | Places | 🏠 | category `Places, Rooms & Community` |
| `play` | Play | ⚽ | category `Toys, Play, Media & Leisure` |
| `home` | Home | 🛋️ | category `Home, Household Objects & Daily Tools` |
| `clothes` | Clothes | 👕 | category `Clothing & Accessories` |
| `animals` | Animals | 🐶 | category `Animals & Nature` |
| `vehicles` | Vehicles | 🚗 | category `Vehicles & Transportation` |
| `describing` | Describing | 🎨 | category `Descriptors, Adjectives & Opposites` |
| `time` | Time | 🕐 | category `Time, Calendar & Sequencing` |
| `social` | Social | 💬 | category `Social Etiquette, Pragmatic Interjections & Urgent/Safety` |
| `little_words` | Little words | 🔤 | category `Function Words & Grammar` |
| `numbers` | Numbers | 🔢 | category `Numbers & Counting` |

Resulting sizes at `3ee3c12`: Food 54, Drinks 7, Actions 46, Moving 18.
Every built-in group fits on one page (≤ 57).

`group_seed.json` shape:

```json
{
  "version": 1,
  "groups": [
    { "key": "my_words", "name": "My Words", "glyph": "⭐" },
    { "key": "food", "name": "Food", "glyph": "🍎",
      "category": "Food & Drink", "except": ["water", "milk", "juice", "apple juice", "chocolate milk", "tea", "smoothie"] },
    { "key": "drinks", "name": "Drinks", "glyph": "🥤",
      "words": ["water", "milk", "juice", "apple juice", "chocolate milk", "tea", "smoothie"] }
  ]
}
```

A group has either `category` (with optional `except`) or `words`, never
both. `my_words` has neither.

**Member order** is lexicon slot order (`data/launch_lexicon.json`
`slot`), which is the vocabulary doc's meaning-clustered order (drinks,
breakfast, meals, snacks, fruit…). For `words` groups, order is the order
listed. Item *i* (0-based) lands at page `floor(i / 57)`, slot `2 + i % 57`.

**Build validation** (`scripts/catalog/build_catalog.mjs`, throw on
failure):

- every `words` / `except` entry resolves to exactly one approved lemma
  (via `normalizeV1`);
- every sense with a non-null `category` lands in at least one built-in
  group;
- every `except` word lands in some other group;
- no built-in group exceeds 57 members;
- keys are unique and match `^[a-z_]+$`; group ids are `grp_<key>`.

---

## Slices

### Slice 1 — One name, fewer buttons

Goal: The UI says "Groups" everywhere. Redundant and child-facing adult
controls are gone. No data-model change.

Files: `public/index.html`, `public/board.js`.

Do:

1. Strip anchor (`public/index.html`, `#anchor-groups`): glyph 🌅 → 🗂️;
   `title="Groups"`.
2. Parent Corner (`#menu`): delete `#browse-zones` and `#arrange-zones`.
   Rename `#add-mywords` text to **"Add to My Words"**. Add
   `<button class="btn secondary" id="edit-groups">Edit groups</button>`,
   wired to today's arrange entry (open the index with `arranging = true`).
   It becomes the real Edit mode in slice 3.
3. Rename every user-visible "zone" string: nav cell `← Zones` → `← Groups`.
4. Hide adult controls in use mode. On the group index, slot 1 (`+ Group`)
   renders only while `arranging`. On group pages, slot 1 (`+ Add`) renders
   only while `arranging`. Otherwise render a disabled blank in slot 1. Do
   not shift items: slot 1 stays reserved.
5. Rename identifiers in `public/board.js` (behavior-preserving):
   `openZoneIndex` → `openGroupIndex`, `openZone` → `openGroup`,
   `renderZoneIndex` → `renderGroupIndex`, `renderZonePage` →
   `renderGroupPage`, `zoneKey` → `groupKey`, `zoneContext` → `addTarget`,
   view values `zoneIndex`/`zone` → `groupIndex`/`group`, DOM id
   `#zonegrid` → `#groupgrid`, body class `zones` → `groups`, CSS
   `.zcell`/`.zlabel` → `.gcell`/`.glabel`. Keep `ZONE_SHORT`/`ZONE_GLYPH`
   for now (slice 2 deletes them).

Out of scope: data model, paging, add flow.

Truth owner: `docs/product/Motor_Grid_And_Art.md` § Groups.
Lie-prone layer: stray strings. A grep that passes while CSS classes or
aria titles still say "zone".
Works Test: `rg -n -i "zone" public/` returns nothing user-visible.
Allowed hits are only the table name `zone_slot` in SQL strings, and the
legacy migration list in `public/db.js`. Manual check: open
`npm run dev:agent`, tap 🗂️ Groups → no `+ Group` cell; Parent Corner shows
exactly "Add to My Words", "Edit groups", "Close".
Proof command: `scripts/test.sh src/board` (all green, no behavior change).
Done when: Works Test passes and the board behaves as before apart from the
listed changes.

### Slice 2 — Groups data model, stable positions, paging

Goal: One table pair holds every group and every item at fixed slots.
Built-in groups are seeded from `data/group_seed.json`. Every catalog word
is reachable. A device DB from before this slice migrates without losing a
caregiver's groups, entities, or arrangement.

Files:

- `data/group_seed.json` (new, hand-authored source; contents per § Built-in groups)
- `src/board/schema.sql` (add tables, drop legacy DDL)
- `scripts/catalog/build_catalog.mjs` (emit `groups`, `groupCells`; validation)
- `data/catalog/catalog.json` (regenerated, never hand-edited)
- `public/shared/groups.mjs` (new; the surface owner)
- `public/shared/import.mjs` (call the seed; delete `zone_slot` seeding)
- `public/db.js` (legacy migration; update `migrateSchema` table list)
- `public/board.js` (render from the new tables; paging; delete `ZONE_SHORT`/`ZONE_GLYPH`)
- `src/board/catalog.mjs` (`openSubZone` → `openGroup(db, groupId, page)` delegating to `groups.mjs`)
- `groups.test.mjs` (new, in `src/board/`; replaces `src/board/zones.test.mjs`, which is deleted)
- `src/board/core_map.test.mjs` (update the `openSubZone` call)
- `docs/product/Language_And_Voice_Schema.md` §6.3b (rewrite to the new tables)

Schema (`src/board/schema.sql`) — replace `zone_slot`, `custom_group`,
`group_item` with:

```sql
-- Groups: one kind of container. The index is a coordinate map (slots
-- 10–59); items sit at fixed (page, slot) inside a group. Positions move
-- only in Edit mode. Owner: docs/product/Motor_Grid_And_Art.md § Groups.
CREATE TABLE IF NOT EXISTS board_group (
  id TEXT PRIMARY KEY CHECK (id GLOB 'grp_*'),
  kind TEXT NOT NULL CHECK (kind IN ('builtin', 'my_words', 'custom')),
  name TEXT NOT NULL CHECK (length(name) > 0),
  glyph TEXT,
  photo_key TEXT,
  index_slot INTEGER NOT NULL UNIQUE CHECK (index_slot >= 10 AND index_slot < 60)
);

CREATE TABLE IF NOT EXISTS group_cell (
  group_id TEXT NOT NULL REFERENCES board_group(id),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('sense', 'entity')),
  item_id TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 0 CHECK (page >= 0),
  slot_index INTEGER NOT NULL CHECK (slot_index >= 2 AND slot_index <= 58),
  PRIMARY KEY (group_id, item_kind, item_id),
  UNIQUE (group_id, page, slot_index),
  CHECK ((item_kind = 'sense' AND item_id GLOB 'sns_*')
      OR (item_kind = 'entity' AND item_id GLOB 'ent_*'))
);
```

Built-in ids are `grp_<key>` (`grp_food`, `grp_my_words`). Custom ids stay
`grp_<uuid-hex>`, as today.

`public/shared/groups.mjs` — pure functions over the minimal db interface
already used by `import.mjs` (`exec`, `prepare(sql).run/all/get`). One body
of logic for node tests and the browser. Exports:

```js
export const ITEMS_PER_PAGE = 57;           // slots 2..58
export function seedGroups(db, catalog)      // called at the end of importCatalog
export function migrateLegacyGroups(db, catalog) // no-op when zone_slot is absent
export function groupIndex(db)               // [{ id, kind, name, glyph, photo_key, index_slot }]
export function groupPage(db, groupId, page) // [{ item_kind, item_id, slot_index, label, fitzgerald_role, photo_key }]
export function pageCount(db, groupId)       // max(page)+1, min 1
export function nextFreeCell(db, groupId)    // { page, slot_index }, page-major, lowest free
export function placeItem(db, groupId, kind, id) // append at nextFreeCell; no-op if already present; returns cell
export function moveItem(db, groupId, kind, id, page, slot) // to a free slot on any page
export function swapItems(db, groupId, a, b) // a/b = { item_kind, item_id }; DELETE both + INSERT both in one transaction
export function removeItem(db, groupId, kind, id) // see removal rules
export function createGroup(db, { name, photoKey }) // custom; lowest free index_slot; throws when index is full
export function deleteGroup(db, groupId)     // custom only; see rules
export function moveGroup(db, groupId, slot) // to a free index slot
export function swapGroups(db, a, b)         // same DELETE+INSERT pattern (UNIQUE index_slot)
```

`seedGroups` rules — the import is also the reconcile, so a caregiver's
edits always win:

1. For each catalog group: `INSERT OR IGNORE INTO board_group` at its
   seeded `index_slot`. If that slot is taken by another group (for
   example, a custom group sits where a new built-in seeds), insert at the
   lowest free index slot instead. Never overwrite.
2. For each seeded cell: if the PK `(group_id, item_kind, item_id)` already
   exists, skip (the caregiver may have moved it). Else, if the seeded
   `(page, slot_index)` is free, insert there. Else append at
   `nextFreeCell`. **A seeded item is never dropped.** Silently dropping
   it is the old `OR IGNORE` failure mode, and it is the bug this rule
   exists to prevent.

`migrateLegacyGroups` (called from `public/db.js` `bootDb` after
`importCatalog`, only when `sqlite_master` has `zone_slot`), in one
transaction:

1. Category → group key map: every `category` in the seed maps to its
   group. For a split category (`Food & Drink`, `Daily Actions & Activity
   Verbs`), the old zone position goes to the group that keeps the
   `category` field (`food`, `actions`).
2. Built-in positions: for each `zone_slot` row whose key is a category or
   `my_words`, move the mapped `board_group` to that `index_slot` (swap if
   occupied).
3. Custom groups: each `custom_group` row → `board_group` (`kind =
   'custom'`, same id, name, photo_key, `index_slot` from its `zone_slot`
   row, or the lowest free slot). Each `group_item` row → `group_cell` via
   `placeItem`, in legacy `slot_index` order.
4. Entities: every `personal_entity` with non-null `category` → `placeItem`
   into the mapped built-in group. Every entity with null `category` that
   is in no custom group → `placeItem` into `grp_my_words`.
5. `DROP TABLE group_item; DROP TABLE custom_group; DROP TABLE zone_slot;`

Also remove `zone_slot`, `custom_group`, and `group_item` from the
`migrateSchema` table list in `public/db.js` and add `board_group` and
`group_cell`.

Removal rules (`removeItem`), used by slice 3 but enforced here:

- A **sense** can be removed from `custom` and `my_words` groups, never
  from a `builtin` group. Built-in contents are the findability guarantee;
  hiding a word is the masking feature
  (`docs/product/Vocabulary_Masking_And_Safety.md`), not removal. Throw on
  a built-in sense removal.
- An **entity** can be removed from any group. If that leaves it in no
  group, `placeItem` it into `grp_my_words`. An entity is never orphaned.

`deleteGroup`: custom groups only (throw otherwise). Each entity whose
only group is this one → `grp_my_words`. Then delete its cells and the
group row.

Renderer (`public/board.js`):

- The group index renders from `groupIndex(db)`. Name and glyph come from
  the row (custom: photo if present, else 🗂️). Delete `ZONE_SHORT`,
  `ZONE_GLYPH`, and `CATEGORIES` if no longer referenced.
- A group page renders from `groupPage(db, groupId, page)`. Items sit at
  their stored `slot_index`, not in list order. Empty slots render as
  disabled blanks. Slot 59 renders `Next ›` with a `n/N` badge when
  `pageCount > 1` (wraps to page 0); else a blank. Track `groupPageNo` in
  view state; reset to 0 on `openGroup`.
- The add form files by `placeItem(db, addTarget.groupId, 'entity', id)`.
  Still write `personal_entity.category` when the target is a built-in
  group whose seed has a `category` (the entity's home category, a
  classifier input). Otherwise write null. Display never reads it.
- Idle strip "Food" card (`public/board.js:159`): `openGroup("grp_food")`.
- Delete the `SELECT ... WHERE s.category = ?` listing and the
  `console.warn` at `public/board.js:651`.

Out of scope: Edit-mode gestures beyond what arrange does today (slice 3),
the new add flow (slice 4), cross-page moves.

Truth owner: `board_group` + `group_cell` rows, written only by
`public/shared/groups.mjs`.
Surface owner: `public/shared/groups.mjs` (state); `public/board.js`
renders only.
Lie-prone layer: the seed/reconcile. An `OR IGNORE` that drops a new
catalog word when its slot is taken reports success and leaves the word
unreachable.
Works Test — `groups.test.mjs`, measured against the DB, not
against the functions' return values:

1. **Reachability gate.** After import, every sense with a non-null
   `category` has ≥ 1 `group_cell` row in a `builtin` group, and no
   built-in group has a cell on page ≥ 1. Must be seen failing: temporarily
   add one word to `Food & Drink`'s `except` without listing it elsewhere,
   and the build throws; a hand-inserted 58th `food` cell makes the
   page-count assertion fail.
2. **Stable order.** `grp_food` page 0 slot 2 is `bread` (the first
   non-drink Food & Drink sense), and slot order equals lexicon slot
   order.
3. **Seed never drops.** Import; move `grp_food`'s `bread` to slot 58;
   import a catalog with one extra Food sense seeded at slot 58; assert
   both exist and the new sense is at `nextFreeCell`.
4. **Caregiver edits survive re-import.** `swapItems` two Food cells and
   `swapGroups` two groups; re-run `importCatalog`; the moved positions are
   unchanged.
5. **Legacy migration.** Create the legacy tables by hand with a custom
   group (2 entities), a moved category zone (`Animals & Nature` at slot
   40), an entity with category `Animals & Nature`, and one with null
   category. Run `migrateLegacyGroups`. Assert: the legacy tables are gone,
   `grp_animals.index_slot = 40`, the custom group kept its id/name/slot
   and its 2 entities in order, the categorized entity is in
   `grp_animals`, the null one is in `grp_my_words`.
6. **Removal rules.** Removing a sense from `grp_food` throws. Removing an
   entity from its only group lands it in `grp_my_words`. `deleteGroup` on
   a built-in throws.
7. **Core map untouched.** `snapshotCoreCells` before and after every
   operation above is deep-equal.

Proof command: `npm run catalog:build && scripts/test.sh src/board scripts/catalog`,
then `npm run check`. Live: `npm run dev:agent`. Open Actions and confirm
`tickle` (the last Actions word) is visible. Open Food and confirm `fries`
is visible. Reload the page and confirm positions are unchanged.
Done when: all seven tests pass, `zones.test.mjs` is deleted, and the live
check passes.

### Slice 3 — One Edit mode

Goal: One mode, one gesture, everywhere. It replaces "arrange" and the
`+ Group` sheet as a separate concept.

Files: `public/board.js`, `public/index.html`, `groups.test.mjs`.

Behavior:

- **Enter:** Parent Corner → `Edit groups`. This sets `editing = true`
  (rename `arranging`), opens the group index, and adds `body.editing`
  (dashed cell borders via CSS). **Exit:** while editing, the topbar
  `#corner` button shows `✓ Done`; tapping it clears `editing` and
  `lifted`. Escape does the same. Navigation (`← Board`, `← Groups`,
  `Next ›`, opening a group) keeps Edit mode on.
- **The gesture is the same everywhere:** tap a cell to lift it (outline),
  tap the same cell to drop it, tap an empty slot to move, tap an occupied
  slot to swap. On the index this calls `moveGroup`/`swapGroups`; on a page
  it calls `moveItem`/`swapItems` (same page only).
- **Slot 1 while editing:**
  - Index, nothing lifted: `+ Group` → the existing `#groupform` sheet →
    `createGroup`.
  - Index, custom group lifted: `Delete group` → `deleteGroup`. Use an
    in-sheet two-button confirm ("Delete Sofia's snacks?" / "Keep"). No
    `window.confirm`.
  - Page, nothing lifted: `+ Add` (slice 4 replaces its sheet).
  - Page, item lifted: `Remove` → `removeItem`, rendered only when
    removal is allowed (not for a sense in a built-in group).
- Built-in groups can be moved but not deleted or renamed.

Out of scope: cross-page moves, renaming groups, hiding words (masking).

Truth owner: `group_cell` / `board_group` via `groups.mjs`.
Lie-prone layer: the renderer showing a moved cell before the write lands.
Always re-render from the DB after a write, never from local state.
Works Test (`groups.test.mjs`, DB-measured): a scripted sequence
through the same `groups.mjs` calls the handlers make. Lift/place a group,
swap two items, remove an entity from a custom group, delete a custom
group. After each step the rows equal the expected positions and the core
snapshot is unchanged. Manual on `dev:agent`: enter Edit, move Animals to
slot 59, swap two Food words, press Done, reload. Everything is where you
left it, and no `+ Add` / `+ Group` cells are visible out of Edit mode.
Proof command: `scripts/test.sh src/board`, then `npm run check`.
Done when: the "Arrange zones" code path and the `arranging` variable no
longer exist, and the Works Test passes.

### Slice 4 — One add flow: type, match, place

Goal: Adding a word is the same action everywhere. Type a name. If the
catalog has it, add that word (with its color and voice) here. If not,
make a personal entity here. The adult never picks a folder: they are
standing in it.

Files: `public/index.html` (`#addform`), `public/board.js`,
`public/shared/groups.mjs` (add `catalogMatches`), `groups.test.mjs`.

Sheet (`#addform`), title **"Add to {group name}"**:

1. One text input, placeholder "Type a word or a name".
2. As the adult types (debounce 0 ms, local), show up to 4 **match rows**
   from `catalogMatches(db, text, groupId)`. A row is an approved English
   lemma whose `normalized_text` starts with `normalizeV1(text)`, excluding
   senses already in this group. Rank exact match first, then
   `default_for_text DESC`, then lexicon slot. Each row shows the label and
   a Fitzgerald color swatch. Tapping a row → `placeItem(group, 'sense',
   id)`, close, re-render.
3. Below the matches, always: **"New: '{text}'"**. Tapping it reveals
   Photo (optional) and Hint (optional). Save creates the
   `personal_entity` and `placeItem(group, 'entity', id)`.
4. Parent Corner "Add to My Words" opens the same sheet with target
   `grp_my_words`.

Rules:

- Adding a catalog sense to a built-in group it is not seeded in is
  allowed. Built-ins are editable containers; only *removing* seeded
  senses is blocked.
- A save never performs a network call (existing ban,
  `docs/product/Personal_Entities.md` § Bans).
- No type, pronoun, category, or folder picker.

Out of scope: editing an existing entity's name or photo, adding from the
keyboard view.

Truth owner: `group_cell` rows. Lie-prone layer: a match list that
includes senses already in the group and then "adds" a duplicate the PK
silently ignores. Exclude them in the query, and assert on it.
Works Test (`groups.test.mjs`):

- `catalogMatches(db, "ban", "grp_my_words")` includes `banana`; after
  `placeItem` it no longer does.
- `catalogMatches(db, "wat", "grp_drinks")` excludes `water` (already
  there).
- Placing an entity into a custom group, then re-importing the catalog,
  leaves it at its slot.
- **Cooper proof, re-run:** with no network stub, Edit → Animals → `+ Add`
  → "Cooper" → New → Save. A `personal_entity` row exists, one
  `group_cell` in `grp_animals`, sense count unchanged, core snapshot
  unchanged.

Proof command: `scripts/test.sh src/board`, then `npm run check`. Live: add
`banana` to My Words; add "Cooper" with a photo to Animals; both are
visible in their groups and speak on tap.
Done when: the old name-only `#addform` handler is gone and the Works Test
passes.

### Slice 5 — Classifier placement (function only)

Goal: When enrichment eventually returns a `category_suggestion` for an
entity, the entity also appears in the matching built-in group. It is
additive only. Enrichment itself is not built; this slice ships the
placement function and its test so the wiring is one call later.

Files: `public/shared/groups.mjs` (`placeFromEnrichment`),
`groups.test.mjs`.

```js
// Reads the entity's latest ready entity_enrichment row. If
// category_suggestion maps (via the seed's category → group map) to a
// built-in group the entity is not in, placeItem it there. Never removes,
// never moves, never touches my_words or custom placements. Returns the
// group id placed into, or null.
export function placeFromEnrichment(db, entityId, catalog)
```

Rules: `abstained` or `superseded` rows do nothing. A category that maps
to a split group resolves to the group that keeps the `category` field.
Running it twice is a no-op.

Works Test: an entity in `grp_my_words` + a ready enrichment row
suggesting `Animals & Nature` → after the call it is in both `grp_my_words`
and `grp_animals`, and its My Words slot is unchanged. Abstained → no
change. Second call → no change.
Done when: the test passes. There is no UI in this slice.

### Slice 6 — "Show me where"

Goal: When the user gets a non-core word through the strip or the
keyboard, the device shows the path to that word's group, so the backup
route gets learned by use. Folder-only incumbents cannot do this.

Files: `public/board.js`, `public/index.html`.

Behavior:

- Trigger: a sense is appended to the sentence from a strip card or a
  keyboard commit, it has no `core_cell` in `grid60`, and it has a
  `group_cell` in a `builtin` group. For an entity, use its first group
  by `index_slot`.
- Show: for 1.5 s, a halo on the 🗂️ Groups anchor, plus a caption
  `Groups › Food` absolutely positioned *over* the strip's anchor area.
  **No layout shift:** the strip and grid bounding boxes must be identical
  before, during, and after.
- No sound, no blocking, no tap required. A new tap cancels it.

Out of scope: animating into the group, settings toggle (add later if
families ask).

Works Test (manual, recorded): on `dev:agent`, type "banana" on the
keyboard and commit. The halo and `Groups › Food` caption appear, then
clear. `getBoundingClientRect()` of `#strip` and `#grid` are equal before
and during, checked from the console. Tap a core word: no hint.
Done when: the manual check passes and is noted in the closeout.

---

## Phase closeout

- `npm run check` green.
- `rg -n -i "zone" public/ src/ docs/product/` shows only the legacy
  migration code, and the historical notes in this doc and
  `Language_And_Voice_Schema.md` §6.3b's change note.
- `docs/phases/README.md`: move this phase out of § Next and archive it per
  `docs/operations/Execution-Playbook.md` § Phase Archive.
- `docs/product/SSOT.md`: the groups row flips from "not built" to
  **BUILT** with the commit sha.
