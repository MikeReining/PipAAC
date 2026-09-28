# Phase 018 — Core board v2 and groups

**Status:** All six decided slices done 2026-09-24 — the v2 board is the
default (`grid60` = D1, six color bands, Purple role shipped,
`is`/`mom`/`dad` root core, `grid15` re-derived, setup's people seated,
groups re-ordered and banded, personal words color by kind, the home
board edits by placement). Open items under D8–D10 stay open.

**DECIDED 2026-09-24** (founder: "this is all locked"). Reached in a
founder brainstorm the same day, with real-children measurements run
against the local CHILDES cache (017 R11; scratch scripts, numbers
below). Local preview of the decided board and group views:
`public/preview-core60.html` (uncommitted; delete at closeout).

Nothing has launched, so no user has muscle memory for today's board.
This is the one free moment to change it.

| Topic | Owner (update at closeout) |
| --- | --- |
| Which word sits in which cell | `docs/product/Core_Coordinate_Map.md` § 3 (the build reads its table) |
| Membership rule | `docs/product/Core_Grid_Membership.md` § 2 |
| Word colors and roles | `docs/product/Motor_Grid_And_Art.md` § 3; per-word values in `docs/product/Initial_Vocabulary_600.md` (the build reads it) |
| Hex values and tile anatomy | `docs/product/Design_System.md` § Palette, § Word tiles |
| Groups | `docs/product/Motor_Grid_And_Art.md` § Groups |

---

## Decisions

### D1 — The `grid60` board

| Row | Slots |
| --- | --- |
| 1 | I · you · want · like · go · in · out · more · what · yes |
| 2 | me · my · need · look · come · on · off · all · where · no |
| 3 | he · she · get · make · do · up · down · some · who · not |
| 4 | mom · dad · is · have · can · here · there · good · why · stop |
| 5 | this · that · put · open · turn · to · for · sad · when · help |
| 6 | it · we · eat · drink · play · with · and · all done · how · hurt |

- **Added (8):** *this*, *mom*, *is*, *have*, *we*, *dad*, *how*, *who*.
- **Off `grid60` (8):** *happy*, *bad* (Feelings, Describing); *big*,
  *little* (Describing); *give*, *take* (Actions); *at* (Little words);
  *please* (the Smart bar offers it at the end of a sentence; it stays in
  its group). All stay reachable and Smart-bar-eligible.
- ***they* and *mine*** leave the draft for *mom* and *dad*, and stay
  root core on `grid90`.
- ***is*, *mom*, *dad*** are promoted to root core (tier 1).
- ***mom* and *dad* sit side by side in one row.** They are the people
  this child calls for, filled from the setup question "Who does {name}
  call for?" (014 slice 10), with their photos. They default to the
  words *mom* and *dad* when setup is skipped.
- **One word per button.** Never merge (*I/me/my*, *is/am/are*). *am* and
  *are* come from the Smart bar (after *I* → *am*) and word forms (005).

### D2 — One band, one color, one kind of word

| Columns | Color | Kind |
| --- | --- | --- |
| 1–2 | Yellow | People & things (pronouns, people, nouns) |
| 3–5 | Green | Actions |
| 6–7 | Pink | Little words (place words, joining words) |
| 8 | Blue | Describing |
| 9 | **Purple (new role)** | Questions: what, where, who, why, when, how |
| 10 | Red | **The safety column:** yes, no, not, stop, help, hurt |

- **Color belongs to the word's meaning** and is the same everywhere: the
  board, groups, the Smart bar, and the sentence bar.
- **The safety column is red whatever the grammar.** A child in distress
  looks in one place, in one color. *help* (a verb) and *yes* (a social
  word) are red by this rule. *not* sits with *no* and *stop*, like the
  Smart bar's "no" slot (017 R21).
- Questions move from pink to their own color, so they no longer share
  pink with the little words.

### D3 — How the board was derived (provenance)

The board is Pip's own work, derived from public methods:

- **Fitzgerald Key (1929):** columns in sentence order (who → doing →
  where → describing) and color by kind of word.
- **Project Core Universal Core 36** and Pip's **self-report rule** (rule
  0): every Universal Core word stays (including *open*, *turn*,
  *all done*, and now *who*), and so do *hurt*, *sad*, *help*, *stop*,
  *no*.
- **Frequency in real children's speech** (CHILDES, held-out and
  aggregate counts only; R11) and **age of acquisition**.

Incumbent boards were looked at on 2026-09-24. Where they differ, Pip
deliberately differs: no merged buttons, no column tabs that expand, no
lists of related words or forms, and no column of group buttons on the
home board. Pip also uses its own palette, its own safety column, and a
prediction bar in place of the lists.

**Human stop:** an IP lawyer compares the finished board with the
incumbents before launch.

### D4 — Full-screen groups and speech

**AMENDED 2026-09-27; BUILT 2026-09-28:** 027 replaced the original return-home-after-
Speak behavior. Groups remain full screen with the Smart bar above; the home
board's top row shows on every group by default (a setting), with the
yes/no/stop/help frame always. Speak keeps the current group and
page; Home is explicit. Existing sentence fresh-start settings are unchanged.
Owner: `docs/product/Motor_Grid_And_Art.md` § Groups; implementation: 027 A3–A4.

### D5 — Group doors and starting layout

Neutral ink glyphs and a folder-tab shape identify a group. 026's neutral noun
frames mean gray alone no longer distinguishes a group from a word. 027 seeds
related meal vocabulary in coordinated clusters, then stores ordinary local
placements. Adding a word uses its explicit/preferred/free position, not a
mandatory grammar band. No runtime block membership or shared edit propagation.

### D6 — Group order stays fixed

027 owns the new-profile order: Breakfast, Lunch, Dinner, Snack, then My Words
and 026's topic order. Only adult editing changes installed positions; time and
history may highlight a door. A catalog update never reshuffles installed
groups. (027 ships as a clean break — no saved profiles to convert.)

### D7 — Color comes from the kind of word, never a color picker

- Catalog words already carry their kind and color. The 010 library
  (2,000 words) ships with them too.
- **Families choose what a new word is, in plain words:** a person or
  thing, an action, a describing word. People and things are yellow
  automatically.
- For anything else, **Jev classifies once, when the word is added** (017
  R14: meaning questions go to Jev). The adult sees the answer in plain
  words and can change the kind. Offline, it defaults to "person or
  thing". A word with two meanings (*play* the action vs. *a play*)
  takes the color of the meaning the adult picks.
- On the home board, Pip suggests the word's band. The family may still
  place it anywhere.

### D8 — No default group doors on the home board

No single group is big enough: Food is 1.5% of what children say,
Animals 1.6%, Time 1.9%. People, at 3.3%, is handled by D1. A family may
place any group door in any home cell, the same way it can place a word
or a person (014 slice 10).

### D9 — The Smart bar suggests words only; groups have one button

**DECIDED 2026-09-24** (founder: "consistency wins").

- **The Predict row holds words:** likely words, the small
  words from "one step up", and the "no" word in the last slot (017
  R21). It never holds a group door, so the bar always means one thing.
- **Groups have exactly one way in: the 🗂 Groups anchor,** always in the
  same place at the end of the Smart bar.
- **The likely group glows in the group list** when it opens (the sentence
  so far, the time of day, and this child's history). Nothing moves, and
  no slot is spent.
- Why (CHILDES): after *I want* / *I have* / *give me*, the next word is
  mostly a small word the bar already offers (*a*, *some*, *to*, *it*).
  The content word after it is spread across many groups, and no single
  group beats the bar's words by much. The best case, *I want a* → Food
  (7%) vs. the 4th word (1%), was a near-tie that is not worth breaking
  consistency for.
- **AMENDED 2026-09-27:** Add sits beside Groups in Edit mode only. Empty
  group sentences receive actual first-word suggestions (027 A4). The grid
  top row is available by default; word suggestions do not write placements.
  No Now cell or additional default group entrances at launch.

### D10 — Editing the home board: "what goes here?"

**DECIDED 2026-09-24** (founder). On the home board, editing is about
**placement**: what goes in this spot. Editing the word itself (its
picture, voice, hiding it) lives on the word card.

Why: the 60-cell board is full, so today there is no way to put a
different word in a spot. Tapping an empty cell opens the picker, but
there are no empty cells. Families also can't see which words get used,
so they can't tell what to take off.

**Edit mode toolbar:** ✓ (done) · 📊 (show counts).

- **📊** puts a count on every tile: how many times the child tapped it
  in the last 30 days. It counts the child's own taps only; an adult's
  modeling taps never count. No banner and no fading: the numbers are
  the explanation.

**Tap a tile → the placement sheet:**

```text
┌─────────────────────────────┐
│ [ this ]    33           ✎  │  the tapped tile, its count, edit word
│ 🔍                          │  search any word or person
│ cookie                  14  │  words NOT on the home board,
│ juice                    9  │  most-tapped first, with counts
│ milk                     8  │
│ …                           │
└─────────────────────────────┘
```

- **Tap a row → it goes in that spot.** The old word goes back to its
  group (`placeOnBoard`, 014 slice 10). Undo shows as a toast.
- **🔍** filters the list to what was typed: any word, or the family's
  people.
- **The empty-field list** is sorted by this child's use. On day one,
  with no history, it is sorted by the words children use most (the
  opening book's unigram). The list has no label and no section headers.
- **✎** opens the word card (built: picture, voice, hide).
- **Drag** still moves or swaps tiles. Tap means "what goes here", drag
  means "where it goes".

**No locks.** It's the family's app. Any spot, including the safety
column, can take any word. The only fixed thing is color: a word keeps
its own color wherever it's placed (D2, D7).

**Copy rule for edit mode:** icons, one field, one list, numbers. No
explaining sentences, and no user's name in the copy. A screen that
needs a sentence isn't finished. At closeout this rule moves to
`docs/product/Design_System.md`.

**Open:** whether group pages get the same 📊 counts (to drag the
most-used items onto page one), and whether "add a new word" should end
with an offer to place it on the home board. Neither is decided.

Preview: `public/preview-core60.html`, the "Edit mode — tap any tile"
section (sample counts).

## Evidence (CHILDES, 2026-09-24)

- Frequency, among all 680 Pip words children say: *this* #10, *mom*
  #16, *want* #18, *is* #19, *have* #34, *we* #35, *dad* #50, *how* #87,
  *who* #117. Off the board: *sad* #415 (kept by rule 0), *happy* #266,
  *bad* #242.
- Today's `grid60` covers 51% of the Pip words children say. The biggest
  gap is small grammar words (16%: *the*, *a*, *is*, *am*…), which D1
  (*is*) and the Smart bar's "one step up" (017 R21) aim at.
- After a group word, the next word is from the same group only 1–2% of
  the time. The sentence ends 38–73% of the time. A core word the bar
  doesn't offer comes next 4–14% of the time.

## Slices

1. **Board v2.** **DONE 2026-09-24.**
   - The § 3 table in `Core_Coordinate_Map.md` is D1; § 4 `grid90` is
     re-laid on the same bands (78 cells + 11 reserved + Groups).
   - `Initial_Vocabulary_600.md`: *is*, *mom*, *dad* tier 1; the eight
     released seats moved to their Tier-2 groups; questions Purple;
     *yes*/*help* Red; `don't` POS fixed to Verb at the source and the
     **Negation flag** list is doc-owned now (both were hand-edits to
     generated JSON that regen silently dropped).
   - `.r-Purple` (`#6f55b0`/`#ebe5f7`) in `index.html` +
     `Design_System.md`; the `sense.fitzgerald_role` CHECK gained
     `Purple`; schema comments that carried `;` inside DDL (they broke
     naive parsers) are reworded.
   - `core_map.test.mjs` pins the 60 cells, per-band role colors, the
     18 off-grid senses, UC36/rule-0 gates, and grid90's 78 cells +
     anchors. Scorer baselines re-measured (non-core −41k events).
   - **Proof:** `core_map.test.mjs` + `strip_order.test.mjs` +
     `move_cost.test.mjs` green through `loadBoard` — the same read
     path the renderer uses. Visual pass deferred: all three dev slots
     were hung workerd processes at closeout.
2. **`grid15` re-derived** on the same bands. (`grid90` was re-laid with
   slice 1 — both tables live in the same parsed file; it keeps every
   root-core word, *they* and *mine* included.) **DONE 2026-09-24** —
   columns re-derived as people & ask · doing · describing & ask ·
   answers · safety: *not* joins the red answers column (*yes*/*no*),
   *all done* and the `?` door shift up; membership unchanged. Map § 6
   and 014 § 5.1 amended; `?` anchor now slot 12.
   **Proof:** `layout.test.mjs` (§ 5.1 board + anchor), `family`,
   `core_move`, `core_place` green.
3. **The child's people on the home board.** Setup's answers fill the
   *mom*/*dad* cells with those entities and photos (D1).
   **DONE 2026-09-24** — `seatSetupPeople` in `coremove.mjs` seats the
   first two setup names on the *mom*/*dad* cells of every layout that
   has them (grid60 + grid90; grid15 has neither). The third name stays
   an entity in My Words; *mom*/*dad* words remain reachable in their
   group. Photos unchanged — they attach from each person's card.
   **Proof:** `core_place.test.mjs` — seats land on both layouts,
   displaced words keep group cells, op replay lands identical.
4. **Groups (D4–D6, D9).** **DONE 2026-09-24**
   - Return home after Speak — `speakSentence` calls `setView("board")`.
   - The likely group glows in the group list (D9) — `likelyGroups`
     (funnel.mjs) glows the group of the strip's top-scored candidate,
     behind spotlight and modeling glows.
   - Group doors are neutral with a folder tab — `.gcell.door` paints a
     tab edge over the existing no-role gray.
   - Re-seed the default `index_slot` order — `group_seed.json` (now `group_seed.topics.json`) reordered
     to the D6 list; new devices get it (adult order on existing devices
     is untouched — it lives in `board_group`, not the seed).
   - Mixed groups use the banded layout — `bandedFreeCell` in
     `placeItem`'s default path: kinds claim columns in band order,
     filled top to bottom; stored cells never move, so a late
     earlier-band kind lands after later kinds (stability over order).
   - **Deferred to slice 6:** D8's "a family may place a group door in a
     home cell" — `placeOnBoard` only takes `sense`/`entity` kinds today.
   - **Proof:** `groups.test.mjs` (D5 banded layout + migration seats),
     `strip_order.test.mjs` (D9 likely-group), `layout.test.mjs`. Speak-
     home is a one-line UI path; visual pass deferred with slice 1's.
5. **Color from kind (D7).** **DONE 2026-09-24** — `personal_entity
   .fitzgerald_role` stores the family's pick; the add form offers the
   six kinds in plain words (person or thing · action · little word ·
   describing · question · safety), and with sharing on Jev's one-shot
   `buildKindRequest`/`jevKind` prefills it — the word alone leaves the
   device, the answer only lands while the form is open and untouched,
   and the family's choice always wins. The word card edits the kind
   (`set_entity_role` op, syncs). Every reader paints the stored role:
   `coreCells`, `groupPage`, banded placement, entity matches, the
   strip, the sentence bar, the word card, and the Library queries.
   NULL renders Yellow — the offline default and every pre-D7 row.
   **Proof:** `entity_kind.test.mjs` — board/group/band reads, op replay
   onto a second DB, migrate grafts the column and rejects bad values.
6. **Edit the home board (D10).** **DONE 2026-09-24**
   - 📊 toggle beside ✓ Done — `.ucount` shows the child's own 30-day
     taps on every tile (`useCounts` reads `learner_event_log`;
     modeling taps write no event, so they never count).
   - Tap a tile → the placement sheet: the tile, its count, a ✎ to the
     word card, one 🔍 field, and `offBoardItems` — every word and
     person with no home cell, most-tapped first, the book's unigram
     on day one. A row tap is `placeOnBoard` + an Undo toast; drag
     still moves or swaps.
   - Truth owner added: `usecounts.mjs`. `placeOnBoard` now files a
     displaced word with no group into `grp_my_words` — an uncategorized
     core word (e.g. *I*) can no longer be stranded off every list.
   - **Proof:** `placement.test.mjs` — counts group the child's events,
     on-board words never list, the book orders day one, a tap places
     and Undo restores; `place-ui.js` + `index.html` paint it. Visual
     pass deferred with slice 1's (dev slots).

Each slice is proved on the real board (`npm run dev:agent`), not only
in unit tests.
