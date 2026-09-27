# Phase 027 — Block doors

**Status:** DECIDED 2026-09-27 (founder: "we are close to something
dramatically better than what has existed before"). Not built. This doc
owns the door model, the edit rules, and the execution map (§ 5).
Prototype: `public/preview-blocks.html`, built by
`scripts/catalog/preview_blocks.mjs` from
`data/occasions/block_doors.proposed.json`.

| Topic | Owner |
| --- | --- |
| Door model, blocks, frame, door layout, edit rules | **this doc** |
| Which words sit in which topic group; noun frame color; object art; door icons | `docs/phases/026_Topic_Groups.md` |
| Groups are the backup path to every word | `docs/product/Motor_Grid_And_Art.md` § Groups (amended in slice A5) |
| Smart bar ranking | `docs/phases/017_Prediction_Hardening.md`; `renderStrip` in `public/board.js` |
| Occasion time windows learned per child | `docs/phases/007_Occasions.md` |
| Op log and replay | `docs/product/Sync_And_Web_Editing.md` § 4 |

## 1. Why

A child who wants breakfast needs the cereal, the milk, the banana, and
the spoon — which today live behind four different doors. Grid AAC apps
avoid repeating a word because each placement is a separate button to
keep in sync, so every word gets one home and the child hunts. Pip's
words are records, and a door is a view of them (the schema already says
so: "groups are views, not exclusive homes"). So a word can sit in every
door where someone might look — and still in the same place, so the
motor plan holds.

Topic boards failed for five reasons (AssistiveWare, "Don't limit
communication with topic boards"): you can only say what's on the board;
the words don't teach where they live in the main system; placement
differs board to board; context-only words don't generalize; boards take
hours to build. Block doors answer each: a door is one view inside the
full system; a word keeps its cell everywhere; words repeat across
contexts; the graph builds the doors.

Two prototypes got here. The first gave every word its own address across
doors; it scattered clusters (drinks all over the page), led Food with
treats, and packed doors with filler words the Smart bar already offers —
the founder found it unlovable. The second, block doors, kept clusters
whole and every repeated word in the same cell on every page, top row on
or off (§ 6).

## 2. Decisions

### B1 — Two kinds of door

- **Plain group** — an ordered list, exactly as groups work today
  (`group_cell` positions). Most topic doors stay plain: People, Animals,
  Clothes, Social, Little words, a family's custom group.
- **Block door** — a set of blocks (B2). Used where doors share words:
  meals and snacks, food and drinks. Blocks are optional; no group has to
  have them.

Both are doors in the same group index, with the same folder tab.

### B2 — Blocks

A block is an ordered list of words: breakfast foods, meals, vegetables,
snacks, treats, dishes, fruit, drinks. It fills top to bottom, then the
next column. It has **one column position per board layout, the same on
every door that holds it** — the block's address. A word lives in at most
one block (it may still sit in plain groups too).

Order inside a block: everyday first; treats are their own block and
never lead a page. Set once when the block ships; a word added later goes
to the end, so nothing reshuffles.

Occasion doors are several blocks — Breakfast = breakfast foods + dishes
+ fruit + drinks. A single-block door (Fruit, Drinks) is a topic door.

### B3 — The frame: yes, no, stop, help

On every door, plain or block, *yes, no, stop, help* sit in their home
cells — the home board's last column minus *not* and *hurt*. The rest of
that column stays empty. *Stop* and *help* are there for safety; *yes*
and *no* because a meal runs on offers ("do you want more?"). Nothing
else travels by default.

### B4 — Doors use the whole grid

So door cells can line up with the home board:

- **Back replaces Settings in the top-left** inside a door. Settings stays
  on the home board only.
- **Next takes the bottom-right cell only on a door with a second page.**
  That cell is *hurt*'s home cell, which B3 leaves free.
- **+ Add sits next to the Groups button, in Edit mode only.** 018 D9's
  "the bar holds words, one button opens groups" gains "and the Edit-mode
  controls".

### B5 — Filler words are the Smart bar's job

Doors carry no sentence starters. *I, want, is, the* come from the Smart
bar, which stays visible inside doors and already offers the small words
("one step up", 017 R21). CHILDES backs this: after a group word the
sentence ends 38–73% of the time, and a home word the bar doesn't offer
comes next only 4–14% (018 Evidence).

**Top row on every door** is a setting, **off by default**: the home
board's top row repeats on every door, Proloquo-style, for families who
want it.

### B6 — The Smart bar opens a door with sentence openers

Today, inside a group the bar ranks that group's words from the child's
own history, and an empty sentence shows an empty bar (founder,
2026-09-25). **Narrow exception: in a door, with an empty sentence, the
bar offers the door's openers** — ranked from CHILDES per door
(`data/prediction/door_starters.en.json`, built by
`scripts/prediction/childes/door_starters.mjs`; *I* ranks first or
second in every meal door). The child's own starts replace them as
history builds. A new user, with no history, gets a useful bar on day one.

### B7 — Occasion doors

First: **Breakfast, Lunch, Dinner, Snack**. After editing lands (§ 5,
phase D): getting dressed, bath & teeth, bedtime, car ride, park, store,
doctor, school day — the routines visual-schedule programs teach most.
Occasions sit first in the index; the likely door glows at its time of
day (018 D9's glow, built).

### B8 — Editing: the parent edits intent

| Parent does | Result |
| --- | --- |
| Moves a word inside a block | The block's order changes on **every door** that has it |
| Moves a block on one door | The block moves on **every door** (default) |
| Drags a word elsewhere on one door | A **pin** — this door only; other doors untouched |
| Adds a word | It joins a block (Pip suggests which) and shows on **every door** with that block, at the block's end — or "just here", as an extra on this door |
| Removes a word | "Just here" hides it on this door; "everywhere" takes it out of the block |

One question, only when it matters: **"Change it everywhere drinks
appear, or just here?"** — "everywhere" by default, with the existing undo
toast.

Two promises, each a test (§ 5, C1):

1. **An edit moves only the word or block being edited.** If a block grows
   into a neighbor, the new word takes the nearest free cell; nothing is
   pushed.
2. **Anything that moved on another door rings softly for 14 days** (014's
   `move_mark`, built for the highlight after a Cells change).

Pins and "just here" edits are allowed — the family knows best — but in
Edit mode a door that differs from its blocks shows a small marker with
**"make it match"**.

Which block a new word joins is a meaning judgment: Jev suggests it once
at add time, stored with provenance, shown to the adult in plain words,
changeable (Design_Invariants § 7; the 018 D7 pattern). Offline, the
word goes in as "just here".

### B9 — Occasions on by default (proposed)

One setting turns occasion doors off; topic doors always stay. **Open —
founder.**

## 3. What this supersedes

- 026 D4 ("a word goes where people look first") — words repeat wherever
  someone might look.
- 026 D10–D12 (word-level addresses, CHILDES starters inside every door) —
  replaced by B2, B3, B5. The word-level prototype page
  (`preview_addresses.mjs`) is retired; its lessons are in § 1.
  `meal_doors.proposed.json` stays only as the door list for
  `door_starters.mjs` until B-2 reads the block doors instead.
- 026 D2's Food and Drinks rows — food becomes blocks (breakfast foods,
  meals, vegetables, snacks, treats, fruit, drinks, dishes) and the Food
  mega-door goes (founder: "I wouldn't even have a food group").
- 018 D9 — the bar's wording (B4) and the empty-bar exception (B6).
- 007's "linking groups to times would be wrong" — occasion doors do link
  doors to times (B7); 007 keeps learning the windows.

## 4. Data model

Built on what exists: the catalog ships seed rows that are copied into the
user's database; adult edits are ops that carry intent and replay through
the same write owners (`public/shared/ops.mjs`), so every device lands on
the same cells.

**Catalog (shipped, never edited on device):**

- `block` (id, per-locale name) and `block_item` (block_id, position,
  sense_id).
- `group_block` (group_id, block_id, position) — which blocks a door holds.
- `block_place` (block_id, layout, col) — the block's address per layout,
  solved at build.

**User database (seeded from the catalog, edited through ops):** the same
three tables, plus

- `door_pin` (group_id, item, layout, slot) — pins and "just here" extras.
- `door_hide` (group_id, item) — "just here" removals.
- `board_group.kind` stays; a door is a block door when it has
  `group_block` rows.

**One layout function** — `doorCells(db, groupId, layout)` — returns the
cells of a block door from blocks, places, frame, pins, and hides. It is
pure and deterministic. The renderer calls it for block doors; plain
groups keep `groupPage` (`public/shared/groups.mjs`).

**Schema changes:** `group_cell.slot_index` is `2..58` today because
slots 0, 1, and 59 hold navigation (`src/board/schema.sql`); B4 frees
them, so the range becomes the whole grid, with the frame cells reserved.
New op kinds: move in block, move block, add to block, remove from block,
pin, unpin, hide, unhide, make it match.

**Build gates** (in `buildGroups` or next to it): every door fits one
page per layout — 56 cells on `grid60` (60 minus the four frame cells;
navigation has left the grid); no two blocks of one door overlap; frame cells stay
free; every word is reachable on every layout (026 D6). Each gate is seen
to fail once (Design_Invariants § 2).

## 5. Execution map

Order: foundation → meal doors as the proof → editing → the rest of the
occasions. Editing comes before the other occasions because it is where
the model is tested hardest; a model change is cheaper with four doors
than fifteen. The 026 track (topic-group remap, noun frame color, icons,
natural-color art) runs alongside.

### Phase A — Foundation (nothing visible changes except door layout)

| Slice | What | Depends on | Proof |
| --- | --- | --- | --- |
| **A1** | Door layout (B4): Back replaces Settings in doors, Next bottom-right only when paging, + Add by Groups in Edit mode; `group_cell` takes the whole grid; existing items on frame cells move to the nearest free cell with the soft ring | — | `groups.test.mjs` legs; saved-board replay; founder look on `npm run dev:agent` |
| **A2** | Builder: `word#slot`, `layouts`, reachability on every layout (was 026 slice 1); block tables in the catalog; block places solved at build; the § 4 gates | — | `buildGroups` legs in `src/board/groups.test.mjs`, each gate seen failing |
| **A3** | `doorCells` + renderer for block doors; the frame on every door | A1, A2 | Property tests: same word, same cell on every block door; frame present; no overlap — plus a rendered-page check like the prototype's |
| **A4** | Group index honors `layouts` (was 026 slice 3) | A2 | `layout.test.mjs` leg per layout |
| **A5** | Docs: `Motor_Grid_And_Art.md` § Groups (B1–B4), 018 D9 line, `Design_System.md` door anatomy | A1–A4 | — |

### Phase B — Meal doors (the proof)

| Slice | What | Depends on | Proof |
| --- | --- | --- | --- |
| **B-1** | Food blocks + Breakfast, Lunch, Dinner, Snack, Fruit, Drinks doors; settle the § 7 layout opens (single-block doors, stray columns) | A3, 026 seed swap | Founder on a device: open Breakfast, find cereal, milk, banana, spoon on one page, same cells as in Snack |
| **B-2** | Smart bar door openers (B6); `door_starters.mjs` reads the block doors, `meal_doors.proposed.json` and `preview_addresses.mjs` are deleted | A3 | Test: empty sentence in a door offers the door's openers; history replaces them. Founder look |
| **B-3** | "Top row on every door" setting (B5) | A3 | Setting leg; founder look with it on and off |
| **B-4** | Occasion doors first in the index; the time-of-day glow reaches them | B-1 | `strip_order.test.mjs` likely-door leg |

### Phase C — Editing

| Slice | What | Depends on | Proof |
| --- | --- | --- | --- |
| **C1** | Write owners + ops for every B8 edit; replay converges | A3 | Replay tests; the two promises as property tests (an edit moves only its word or block; moved words get `move_mark`) |
| **C2** | Editor: "everywhere / just here", pins, hides, add-to-block with Jev's suggestion (offline → just here) | C1 | Founder edits a door on a device; the other doors follow |
| **C3** | Drift marker + "make it match" | C2 | Test: a pinned door shows the marker; the action clears it |

### Phase D — More occasions

| Slice | What | Depends on | Proof |
| --- | --- | --- | --- |
| **D1** | Routines: getting dressed, bath & teeth, bedtime, car ride, park, store, doctor, school day — blocks + doors, founder review | C2 | Founder review, a door at a time |
| **D2** | Icons for occasion doors (026 D7 style) | — | Founder review, one at a time |

### Phase E — Other board sizes

| Slice | What | Depends on | Proof |
| --- | --- | --- | --- |
| **E1** | Block places for `grid90` and `grid15`. `grid15` (5 × 3) can't hold six-row blocks: blocks get their own shapes there, and doors page | A2 | Build gates per layout; founder look on `grid15` |

**Works Test (the phase):** on `grid60`, the founder taps 🗂️ → Breakfast
and says "I want cheerios" without leaving the door (the bar offers *I*,
*want*); flips to Snack and finds *milk* and *banana* in the same cells;
moves *juice* first in Drinks and sees it move on Breakfast, Lunch, and
Snack; pins *water* on Breakfast only and sees the "make it match"
marker.

## 6. Prototype results (2026-09-27)

Measured on the rendered pages (`preview_blocks.mjs`):

- Every repeated word sits in the same cell on every page, top row on or
  off.
- Occasion doors use 33–43 of 60 cells with the top row off (calm, real
  empty space), 42–52 with it on (Lunch nearly full).
- CHILDES openers per meal door, once one-word replies count: *I, is, it,
  and, you, no, that, in, want, to, have, get* — nearly the same for every
  meal door. *More* ranks 20–33 and *all done* is rare in child speech.

## 7. Open — founder

- **B9:** occasions on by default with one switch to turn them off?
- **Single-block doors** (Fruit, Drinks) sit at the right edge, left side
  empty, because shared blocks sit next to the frame. Flip shared blocks to
  the left (single doors look natural; meal doors lead with fruit and
  drinks) or keep.
- **Block sizes:** blocks that aren't a multiple of the column height leave
  a stray column (Fruit's 7th word). Size blocks to 6 or 12, or accept
  short columns.
- **The "Now" cell:** a fixed home cell that opens the current occasion
  (would amend 018 D8/D9).
- **More** and **all done** travel on meal doors despite the data?
- **`grid15`** block shapes (E1).

## 8. Risks

- **The editor is the hard part, not the database.** "Everywhere or just
  here" has to feel obvious to a tired parent.
- **Drift:** heavy "just here" use slowly makes doors disagree — the
  marker and "make it match" are the answer.
- **SLP pushback** ("one word, one place"): the home board keeps one
  location for every core word; doors repeat words only in the same place.
  The five-reasons table in § 1 is the argument.
