# Phase 018 — Core board v2 and groups

**Status:** Executing. Not started. **Start after** 017 step 29 is
committed: that step is changing the same catalog files
(`data/launch_lexicon.json`, `data/catalog/catalog.json`,
`scripts/catalog/build_catalog.mjs`, `public/index.html`).

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

### D4 — Groups open full screen

- A group, and the group list, fill the whole board. The Smart bar stays
  above. This supersedes the "keep the top two rows" idea from the same
  day: after a group word, a core word the bar doesn't already offer
  comes next only 4–14% of the time.
- **New rule: after Speak, the board returns home.** The sentence is
  done, and the next one starts at home.
- A word tapped inside a group speaks and stays in the group (browsing
  still works).

### D5 — Group tiles are doors, not words

- A group tile is **neutral gray** (the no-role color) with a
  **folder-tab edge** and a picture. The shape says "this opens", and the
  gray says "this isn't a word".
- The words inside keep their own color. Most groups hold one kind of
  word, so their pages are one color on their own (Food is all yellow).
- **Mixed groups** (occasions, a family's "Breakfast") lay their words
  out in the home board's band order: things, then actions, then little
  words, then describing. Pages fill top to bottom, and each kind starts
  a fresh column. A word a family adds goes to the next free spot in its
  kind's area, and nothing else moves.

### D6 — Group order is set once, then frozen

- It is never sorted by frequency (it would keep changing) or
  alphabetically (it doesn't help non-readers, and additions would shift
  the rest).
- Default order: My Words, People, Food, Drinks, Play, Animals, Places,
  Home, Body, Feelings, Clothes, Vehicles, Time, Numbers, Social, then
  Actions, Moving, Describing, Little words, More people, More doing,
  More where, More describing.
- Only a supporter changes it, by dragging (built, 009 slice 2). A new
  group takes the next free spot.

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

- **The Predict row only ever holds words:** likely words, the small
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
- **Open (founder):** a faster way into groups is still wanted. Any
  answer must keep this rule: the bar holds words, and one button opens
  groups.

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

1. **Board v2.**
   - The § 3 table in `Core_Coordinate_Map.md` becomes D1.
   - `Initial_Vocabulary_600.md`:
     - *is*, *mom*, *dad* become tier 1.
     - Questions become Purple.
     - *yes* and *help* become Red.
   - A `.r-Purple` role goes in `public/index.html` and
     `Design_System.md`.
   - `src/board/core_map.test.mjs` sectors and membership become D1–D3.
   - `npm run catalog:lexicon && npm run catalog:build`.
   - **Proof:** the updated `core_map.test.mjs`, plus a screenshot of the
     real board next to `public/preview-core60.html`.
2. **`grid90` and `grid15` re-derived** on the same bands. `grid90` keeps
   every root-core word, including *they* and *mine*.
3. **The child's people on the home board.** Setup's answers fill the
   *mom*/*dad* cells with those entities and photos (D1).
4. **Groups (D4–D6, D9).**
   - Return home after Speak.
   - The likely group glows in the group list (D9).
   - Group doors are neutral with a folder tab.
   - Re-seed the default `index_slot` order.
   - Mixed groups use the banded layout.
5. **Color from kind (D7).** A plain-words kind picker when adding a
   word, and a one-time Jev classification.

Each slice is proved on the real board (`npm run dev:agent`), not only
in unit tests.
