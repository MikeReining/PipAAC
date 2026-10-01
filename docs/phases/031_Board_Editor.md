# 031 — The editor, rebuilt: the board is the editor

**Status:** **Slices A–G built 2026-09-29** (§ 13). Open: Works Test 1
(the first-timer stopwatch — needs a person who has never seen Pip) and a
real-tablet pass of the narrow layout (slice G was checked with the narrow
rules forced on a desktop browser, not on an iPad).
UI only. The data owners already exist (`public/shared/groups.mjs`,
`coremove.mjs`, `bulk.mjs`, `images.mjs`, `voice.mjs`); this phase changes
what the adult sees and touches, not how anything is stored.
**Replaces:** the layout of `public/board/editor-ui.js` and the `#editor`
markup in `public/index.html` (011 slice 7, `Sync_And_Web_Editing.md` § 7).
**Depends on:** `029_Add_A_Word.md` (the add flow and the word card — the
editor has no add UI or card of its own), `030` / `028` indirectly through
029.
**Truth owners:** the local database (every edit is an op through the
shared owners) and a first-time adult with a stopwatch (§ 9 Works Test 1).
**Words:** `docs/product/SSOT.md` § Words we use in the app — the child is the
**user** ("Maya"), adults are **supporters**, the **board** is the **main
board** plus its **groups**, and a **page** is only a screenful inside a
group.

---

## 1. What's wrong today (founder screenshot, 2026-09-29)

Traced from `mountEditor` (`public/board/editor-ui.js`) and the wide-screen
branch at the end of `public/board.js` (`min-width: 1100px` → Library and
word card reparented into `#ed-left` / `#ed-right`).

| # | Problem | Where |
| --- | --- | --- |
| 1 | **No main object.** Three panes compete; the loudest control on screen is the black **Add all** for a paste box the adult isn't using. | `#ed-left` (`#ed-paste`, `#ed-paste-add`) |
| 2 | **Three ways to add** (Library search, paste box + photo drop, "+ Add word"), each with its own UI. | `#ed-left`, `#ed-add`, Library |
| 3 | **A wall of 34 group chips** in four rows, no visible order, no link to the main board. | `renderEditorGroups` |
| 4 | **Opens on My Words**, a mostly empty group — never the main board, which the editor cannot edit at all (main-board editing lives only in the board view, 018). | `edTarget()` default |
| 5 | **The child's sentence bar sits on top** of the adult's editor. | shared header |
| 6 | **Word card overload:** kind dropdown, raw file input, "Sounds wrong" as a peer of "Record it", a large red Remove, and "Tap a word to open its card here" still showing while a card is open. | `#wordcard` in `#ed-right` |
| 7 | **Always-on ✕** on tiles; reserved main-board cells (I, you, want…) look editable in groups; a "Board" button with no clear meaning. | group painter with `gestures: true`; `#ed-board` |
| 8 | **Two editors:** the web editor, and "Edit the board" on the tablet — different layouts, different powers. | `editor-ui.js` vs board edit mode |

## 2. First principles

**Who:** a supporter — parent, grandparent, SLP, teacher — usually on a
laptop, sometimes on the tablet, often in a few spare minutes.

**What they come to do, most frequent first:**

1. Add a word Maya needs now.
2. Find a word and fix it (picture, voice, name, where it is).
3. Arrange: move words, decide what's on the main board, tidy groups.
4. Set up in bulk (first week: lists, family photos).
5. Check what Maya will see.

**So:**

1. **The board is the editor.** The center is Maya's real board at real
   size — the same painter, the same cells. You edit what she sees, in
   place. No abstract lists of settings.
2. **One way to do each thing.** One field adds *and* finds. One card edits
   a word. One list navigates groups.
3. **Tools appear where you are, when you need them.** Nothing selected →
   just the board. Select a word → its card. Hover an empty cell → "+".
4. **Nothing is lost.** Every change has Undo (toast and ⌘Z). Save status is
   always visible and honest.
5. **Plain words** (SSOT vocabulary). Maya's name, "Main board", "Food". No "grp", no "entity", no
   "personal word".
6. **One editor on every screen.** Wide screens get side room; narrow
   screens get a drawer and a bottom sheet. Same actions everywhere.

## 3. The layout

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ Maya ▾   ┌ Add or find a word…                 ⌘K ┐ ✓ Saved  ▶ Preview  Done │
├──────────┴─────────────────────────────────────────┴──────────────────────────┤
│ GROUPS         │  Main board › Food                   page 1 of 2   ‹  ›       │
│  ⌂ Main board  │ ┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐        │
│  🥣 Breakfast 12│ │ I  │you │want│like│ go │ in │out │more│what│yes │  ← dim: │
│  🍎 Food     24 │ ├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤  always │
│  🧃 Drinks    9 │ │🍎  │🍌  │🥣  │    │    │    │    │    │    │ no │  here   │
│  👪 People    6 │ ├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤  from   │
│  …             │ │    │    │ +  │    │    │    │    │    │    │    │  main   │
│  ▸ Occasions   │ └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘        │
│  ▸ Hidden      │                                                               │
│  + New group   │                                     (card slides in here      │
│  ─────────     │                                      only when a word is      │
│  All words     │                                      selected — § 6)          │
└────────────────┴───────────────────────────────────────────────────────────────┘
```

Three regions, one job each:

| Region | Job | Replaces |
| --- | --- | --- |
| **Top bar** | Who (Maya ▾), add/find, save status, Preview, Done | the child's sentence bar, "Board editor" title, "Board" button |
| **Groups** (left) | Where you are and where you can go | the 34-chip wall, Library tabs |
| **The board** (center) | The real main board or group — select, move, drop, add | unchanged painter, calmer states |
| **Card** (right, on demand) | Change one word | always-open word card + stale hint |

The paste box, **Add all**, the drop-photos hint, and **+ Add word** are
gone — their jobs move into the one field (§ 4) and the board itself (§ 5).

## 4. The one field: Add or find

A single field in the top bar, focused by `/` or ⌘K. It is 029's add sheet,
inline (same matching, same rows, same Make).

```text
┌ appl▍                                                     ┐
│ ON MAYA'S BOARD                                           │
│  🍎 apple        in Food · Snack                  Go to it │
│ FROM OUR LIBRARY                                          │
│  🥣 applesauce                                ▶   Add here │
│  🥧 apple pie                                 ▶   Add here │
│ NEW                                                       │
│  +  "appl" — picture and voice made for you         Make  │
└───────────────────────────────────────────────────────────┘
```

- **Find and add are one gesture.** A word already on Maya's board shows
  where it lives; **Go to it** opens that group and selects the tile (today's
  "Show on board" + `flashCell`). Anything else **adds to the group you're
  in** — "Add here" names it on hover ("Add to Food").
- **Empty field, focused:** shows **Suggested for Maya** (009 suggested
  words) and **Recently added**, so the field is also the "what next".
- **Paste several lines** → the dropdown becomes the list preview from 029
  § 5 ("Add 12 to Food · draws 3 new pictures"), one button. No separate
  paste box.
- Return takes the highlighted row, exactly as in 029.
- After Make/Add, the new tile is selected and its card opens (029 § 4).

## 5. The board (center)

The real main board or group page, painted by `groupsUi.paintGroupPage`
(groups) or the core painter (main board), at the profile's board size.

| Adult does | Result | Owner (exists) |
| --- | --- | --- |
| Click a word | Selects it; card opens (§ 6) | — |
| Shift/⌘-click | Multi-select; card shows "3 words" with Move to group · Remove from group | `moveItem`, `removeItemUndoable` |
| Drag a word | Moves or swaps; the cell under the pointer shows where it lands | `moveItem`, `swapItems`; main board: `moveCore`, `placeOnBoard` |
| Hover an empty cell | A faint "+"; click → the Add field opens anchored to *that* cell | `placeItem(…, cell)` |
| Drop photo files on the board | One word per photo, named from the file, on the next free cells | `createEntity`, `placeItem` (today's `dropPhotos`) |
| Drop photo files on a cell | Starts at that cell | same |
| Press Delete | Removes from this group, with Undo | `removeItemUndoable` |
| Arrow keys | Move the selection; ⏎ opens the card | — |

**Calm by default:** empty cells are faint and only outline while dragging;
✕ never shows on tiles (removal is Delete or the card's menu); **reserved
cells** (main-board words that appear in every group, `shownByReserved`) are
dimmed with a tooltip *"Always here — from the main board"* and refuse
drops. The header is a breadcrumb (Main board › Food) with page arrows when
a group has more than one page.

**The main board is editable here** — the same moves and placement rules as
018's main-board edit (`coremove.mjs`), so the tablet's Edit mode and the editor
share one set of powers.

## 6. The card (right, only while something is selected)

Exactly 029's word card (029 § 4), docked. Additions for editing an existing
word:

- **Name** edits inline in the card header (`renameEntity`; catalog words
  show their label read-only).
- **In these groups:** chips with ✕ (remove from that group) and
  **+ Another group** (`addToGroups`, 027 add to other groups).
- **"…" menu** holds the rare and the destructive: Hide this word (catalog,
  `setMask`), Remove everywhere (retire, `retireEntity`), Sounds wrong
  (028 flag). Nothing red on the card's face.
- Esc or clicking empty space closes it; the board gets the width back.

## 7. Groups (left)

- **Main board first**, then groups **in the order their doors sit**
  (`groupIndex` by `index_slot`), each with glyph, name, and word count.
- Collapsed sections: **Occasions** (027 occasion groups) and **Hidden**
  (`setGroupHidden`).
- Drag to reorder = moving the door (`moveGroup` / `swapGroups`).
- Row "…": Rename, Hide/Show, Delete (a family's own groups only, `deleteGroup`,
  with Undo). **+ New group** at the bottom (`createGroup`). Change icon:
  pick from our ink icon set (029 decision 10's owner, `group-glyph.js`).
- **All words** (bottom): Maya's whole vocabulary as a searchable table —
  picture, word, groups it's in, voice state (ready / making / recorded).
  Filters: Added by you · Suggested · Everything. Clicking a row selects
  that word and opens its card; "Go to it" jumps to its group. This replaces
  the Library pane's Added / Suggested / All tabs.

## 8. Top bar, preview, status

- **Maya ▾** — the user this editor is for; switching reuses the people
  switcher. First-time copy uses her name.
- **▶ Preview** — the board as Maya sees it, in place: sentence bar, taps
  speak, no adult tools. Esc or ▶ again returns. (This is where the
  sentence bar lives now.)
- **Done** — finished editing: Maya's main board, the editor forgets the
  place (same finish as the Preview pill's Done). Named *Done*, not ✕: the
  first-open line's ✕ sits just below and means "dismiss", and saving is
  automatic, so leaving is never "cancel". Esc stays one layer back, never
  a jump out — a double Esc to close the card must not eject the adult
  past the PIN (founder, 2026-09-30).
- **Save status — honest only** (Project Law: measure the actual thing):
  *Saving…* while the op is local only; **✓ Saved** once the relay accepted
  it; *Offline — will sync* when it can't. It says "on Maya's iPad" **only**
  if a device acknowledgement exists; none does today, so it does not say it
  (§ 11 decision 3).
- **Undo** toast on every change; ⌘Z / ⇧⌘Z.

**First open:** the main board, the field, and one dismissible line —
*"This is Maya's board. Click any word to change it, or type above to add
one."* No tour, no modal.

## 9. Works Tests

1. **First-timer, stopwatch (owner-visible).** Someone who has never seen
   Pip, on a laptop, gets four tasks: add "applesauce" to Food; move it to
   the first free cell of the top row; change its picture; check it in
   Preview. Record time, clicks, and every pause over 5 s — on today's editor
   and on the new one. Report both; no target invented.
2. **First-view controls.** A DOM script counts visible interactive
   elements on first load, before and after. Report both numbers.
3. **One add path.** In the editor there is exactly one text input that can
   create a word; the paste box, **Add all**, and **+ Add word** no longer
   exist (DOM query = 0).
4. **Find → go.** Typing an existing word shows "in Food"; Go to it opens
   Food and selects that tile.
5. **Paste is detected.** Pasting three lines into the field shows the list
   preview with one Add button, not a search for the joined text.
6. **Drop on a cell.** Dropping two photos on an empty cell places the first
   there and the second on the next free cell.
7. **Undo is real.** Snapshot the database; remove, move, rename, and reorder
   a group; undo each; deep-compare equals the snapshot.
8. **Reserved cells refuse.** Dragging onto a dimmed reserved cell leaves
   positions unchanged (snapshot compare).
9. **Status doesn't lie.** With the relay stubbed to accept after 2 s, the
   status reads *Saving…* until the accept arrives, then *✓ Saved*; with the
   relay unreachable it reads *Offline — will sync*.
10. **Preview is the child's view.** For the same group page, Preview's rendered
    grid equals the board view's (same painter; compare cell ids and
    labels).
11. **Main-board edits match the tablet.** A move on the main board in the editor produces
    the same `core_override` rows as the same move in the board's Edit mode.
12. **Narrow screen.** At 800 px wide, Groups is a drawer and the card a
    bottom sheet; tests 3–8 pass unchanged.

## 10. Slices (Claude leads design; each: route → owner + proof → focused proof → deslop → commit)

| # | Slice | Proof |
| --- | --- | --- |
| A | **Shell.** Top bar (Maya ▾, field placeholder wired to 029's sheet, status, Preview stub); Groups list replaces the chip wall; opens on the main board; sentence bar leaves the editor; left paste pane, **Add all**, drop hint and **+ Add word** removed (paste/drop keep working through § 4–5). Card hidden until selection. | WT 2, 3 |
| B | **The one field** inline (029 sheet): "On Maya's board / From our library / New" sections, Go to it, Add here, paste detection, Suggested + Recently added on focus. | WT 4, 5 |
| C | **The board:** selection, keyboard, hover "+", drag move/swap, drop on board/cell, reserved cells dimmed and refusing, no ✕; main board editable through `coremove.mjs`. | WT 6, 8, 11 |
| D | **The card** docked: inline name, In these groups, "…" menu, multi-select. | WT 7 (card actions) |
| E | **Groups management:** reorder = door order, rename, hide, new, delete, Occasions/Hidden sections; **All words** table. | WT 7 (reorder) |
| F | **Preview, status, undo:** Preview in place, honest status, ⌘Z everywhere, first-open line. | WT 9, 10, 1 |
| G | **One editor on the tablet:** "Edit the board" becomes this editor's narrow layout (drawer + bottom sheet). | WT 12 |

Slice A with 029 slice A removes most of what made the founder's first view
overwhelming.

## 11. Decisions (recommended defaults; founder may overrule)

1. **One editor on every screen (slice G).** Recommend yes — two editors
   with different powers is how the product drifts.
2. **The app always opens on the board — on every screen.** Founder
   2026-09-30 overruled "wide screens land in the editor": opening into an
   editor is not intuitive. The editor opens only from Settings → **Edit the
   board**; inside it, the main board is what Maya sees first.
3. **Device acknowledgement for "on Maya's iPad".** Not built. Recommend
   "✓ Saved" (relay accepted) now; a device ack is a later sync slice, and
   the status says only what it knows.

## 12. Out of scope

Settings, voices, people, devices, coach, progress (they stay in Settings);
the smart bar family editor (`family-editor.js`); new data owners or storage
changes; art and voice generation (030, 028).

## Related

- `docs/product/Sync_And_Web_Editing.md` § 7 — original editor spec (layout
  superseded here; sync and "live" behavior unchanged)
- `docs/phases/029_Add_A_Word.md` — the add flow and card this editor uses
- `docs/phases/018_Core_Board_V2_And_Groups.md` — main-board editing rules
- `docs/phases/027_Occasion_Boards.md` — occasion groups, add to other groups
- `docs/product/Design_System.md` — tokens, tiles

## 13. As built (2026-09-29)

| Slice | Where |
| --- | --- |
| A — shell | `#editor` in `public/index.html`; `public/board/editor-ui.js` (rewrite); `editor-ui.css` (rewrite). Opens on the main board; the child's bar, strip and keyboard leave the editor; paste pane, **Add all**, drop hint, **+ Add word**, the Board button and "Open the full editor" are gone. |
| B — the one field | `editor-ui.js` § the field + `public/board/editor-find.js` (`findSections`, `isList`, `fold`). On Maya's board → Go to it (+ Add to this group), From our library → Add to this group, New → Make; empty focus shows Suggested + Recently added; a pasted list opens 029's list preview for this group. Make/Add/Paste call the add flow's own `makeWord` / `placeWord` / `openBulkForm` (one path). |
| C — the board | The real `#grid` moves into the stage for the main board (`renderGrid` gives it editor gestures: tap selects, drag moves/swaps through `moveCore`/`placeOnBoard`); groups paint through `paintGroupPage`. Delete removes from the group; arrows walk the words; no ✕; faint empties with "+" on hover; reserved cells dimmed, "Always here — from the main board", refuse drops; photo drops land on the cell under them. |
| D — the card | 029's card docked right only while a word is selected (`:has(#wordcard.open)`); shift/⌘-click multi-select → a bar with Move to (a group) and Remove from this group. Main-board words show a "Main board" chip; "Show on board" hides in the editor. |
| E — groups | Main board, then groups in door order with icon and word count; Occasions and Hidden collapse; drag a row onto another swaps doors; row "…": Rename, Change icon (our ink set), Hide/Show, Delete (a family's own, with Undo); + New group inline; All words with search and Added by you / Suggested / Everything, voice state, Go to it. New owners: `renameGroup`, `setGroupGlyph` (`icon:<name>`), `deleteGroupUndoable`, with synced ops `rename_group`, `set_group_glyph`. |
| F — preview, status, undo | ▶ Preview shows the main board or the group on screen exactly as Maya sees it, with a pill: Back to editing (or Esc) / Done. Status reads the op log: *Saving…* while `sync_op.relay_seq IS NULL`, *✓ Saved* once the relay accepted, *Offline — will sync* when offline or the last flush failed (`syncHealth()` in `sync.mjs`), *Saved on this device* when the person isn't linked; never "on Maya's iPad". Every undoable toast also feeds ⌘Z (last 20). First-open line, dismissible. |
| G — one editor | Settings → **Edit the board** opens this editor on every screen. Below 960 px the groups list is a drawer (☰ Groups) and the card a bottom sheet. |

**Works Tests:**

| # | Result |
| --- | --- |
| 1 | **Open** — needs a first-time person with a stopwatch. |
| 2 | Same DOM script, fresh profile, 1920×968. Before: 67 visible controls — 13 tiles (a mostly empty My Words), 34 group chips, **20 tools**. After: the real main board (60 tiles), the group list, and **4 tools** (Maya, the field, Preview, the first-open ✕). The total rises because the main board is now on screen; the tools the adult must understand first fell from 20 to 4. |
| 3 | `src/board/editor_ui.test.mjs` — one field creates words; old ids gone. |
| 4 | `editor_ui.test.mjs` (Return on a word Maya has opens its group and selects it) + `editor_find.test.mjs`. |
| 5 | Both files: a pasted list hands over to the list preview for the group on screen. |
| 6 | `editor_ui.test.mjs` — two photos on empty cell 22: the first there, the second next free. |
| 7 | `editor_find.test.mjs` — delete group / reorder / rename / icon each undo to an identical snapshot; also checked in the browser (remove + ⌘Z). |
| 8 | `editor_find.test.mjs` — a reserved cell throws, snapshot unchanged. |
| 9 | `editor_find.test.mjs` — status measured on real ops: Saving until `confirmOps` marks the relay's acceptance, then Saved; offline and flush failure say so. |
| 10 | Browser: Preview of Treats showed the same 12 words as the editor. |
| 11 | Structural: the editor's main board is the same `#grid` and `renderGrid` code path as the tablet's Edit mode — same owners (`moveCore`, `placeOnBoard`). |
| 12 | Narrow rules checked with the media query forced on desktop; a real-tablet pass is open. |

**Preview keeps your place (founder, 2026-09-29).** Preview flashes the word
being worked on once (the same local flash as Show on board — nothing
syncs), then it is exactly Maya's view. Back to editing — or Esc — returns
to the same group, page, word and open card, even if the adult tapped
around in Preview. The place (group, page, selection, card) is kept for
the tab in `sessionStorage` (`pip-ed-place`), so a reload lands there too;
Done leaves the editor and forgets it. Before this, Preview's closing the
card cleared the selection, and a reload always landed on the main board.
Proof: `editor_ui.test.mjs` "Preview → Back / Esc / reload …" (seen failing
with the card restore disabled).

**Replace everywhere (founder, 2026-09-30).** Slices A–G made a tile
tap select the word, which left the placement sheet (018 D10) reachable only
from empty cells, so a filled tile couldn't be swapped for another word. A
word's card now has **Replace with another word** wherever the word holds a
cell. On the main board it opens the placement sheet for that cell and the
pick goes through `placeOnBoard` with Undo, same as before. In a group the
same button lists every word not already in the group
(`notInGroupItems` — a hidden word is never offered) and the pick calls
`replaceGroupItem`: the newcomer takes the tapped word's exact `{page,
slot_index}`, a remove_item + place_item op pair, Undo restores both. Proof:
`editor_ui.test.mjs` "a main-board word's card offers Replace…", "a group
word's card offers Replace…", "group Replace takes the tapped word's exact
cell; Undo puts it back"; browser check on a fresh profile: like → see, Undo
back to like; Done, then a tap on a tile speaks it.

**Not done / deferred:** ⇧⌘Z redo (⌘Z undo is built); the 📊 tap counts toggle
(018 D10) is not in the editor yet; hidden groups keep a Show action but the
board's group index is unchanged.
