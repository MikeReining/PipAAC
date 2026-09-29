# 029 — Add a word: type it, tap once, it's finished (front end)

**Status:** **Slices A–D built 2026-09-29** (§ 10). Open: slice E — the
stopwatch on a real tablet with live 028 + 030 (needs the founder's
calibration save and a live draw run, both founder-gated in 030).
This doc owns the **experience** (sheet, card, states, copy). Claude leads
the design. The backends it calls are owned elsewhere:

| Need | Backend doc |
| --- | --- |
| A picture: find by meaning, apply, pick, draw once | `030_Picture_Finder_And_Drawing.md` |
| A voice: minted once in the board's voice | `028_Tile_Voice_Library.md` |

The front end can be built first against stubs of both contracts (030 § 9,
028 § 4.6); the dev Worker already stubs paid calls.
**Trigger:** founder test 2026-09-29 — typed "apple sauce" into Add to My
Words: the right action (the dashed "New" row) looked weakest on screen;
after tapping it the form asked unexplained questions (kind, photo, hint),
said nothing about sound or a picture, and nothing about where the word
goes.
**Truth owners:** the local database (the tile exists the moment it is
saved) and a stopwatch on a real tablet (§ 7).

---

## 0. Decisions (founder, 2026-09-29)

1. **Make saves at once; no form.** Everything after is optional editing on
   the new word's card.
2. **Pictures:** a close existing match is applied automatically, with 3
   alternatives to pick for free; otherwise we draw automatically. People
   and pets are never drawn automatically — the card leads with Add a photo
   (030 § 0).
3. **Allowance** counts image API calls only (new drawings, redraws).
   Existing pictures are always free, even with 0 left. Spending is
   automatic; the card shows the count.
4. **Redraw needs a description.** "Draw again" is disabled until the adult
   says what to change.
5. **Kind is inferred** (Jev, via 030 `find`) and shown as a color chip; the
   "What kind of word is it?" question goes away.
6. **"Hint" becomes "Describe it"** on the picture, with its purpose stated.
7. **Voice is always minted** in the board's chosen voice (028). Voices
   never count against anything the adult sees. No voice cloning — families
   choose among catalog voices (more coming soon).
8. **Paste a list** asks before drawing only when it needs more than 10 new
   drawings or more than are left.

## 1. The bar

> Type **applesauce**, press Return. Within seconds the tile is on the board
> with **a picture** and **the board's voice** saying it. No question was
> asked. Anything the adult wants to change is one tap away on the same
> card.

The adult supplies only what a model cannot know (Design Invariants § 7):
the word, and optionally a photo or a description. Color, picture, voice,
and filing default for them.

## 2. What's wrong today (code truth)

Traced from `public/board/add-flow.js` (`openAddForm` → `renderAddMatches` →
`#add-save` → `createEntity` + `placeItem`) and `public/index.html` § addform.

| # | Problem | Where |
| --- | --- | --- |
| 1 | The creating action is a dashed, low-contrast row; three full-width outlined buttons (Paste a list, Add photos, Cancel) outrank it. | `#add-new` vs `#add-bulk`, `#add-photos`, `data-close` |
| 2 | "New" opens a form instead of creating. Save is a second tap after three questions. | `#add-new` click only unhides `#add-newfields` |
| 3 | **Hint is stored and read by nothing.** Its intended consumer, entity enrichment, is not built. | `createEntity(... hint)` → `personal_entity.hint` |
| 4 | "What kind of word is it?" contradicts `Personal_Entities.md` ("No type … UI"); added in 018 D7 for tile color. | `#add-kind` |
| 5 | A new word **speaks with device TTS** (028 not built). | `resolveSlot` entity branch, `public/shared/voice.mjs` |
| 6 | A new word **has no picture** unless the adult uploads a photo (030 not built). | — |
| 7 | "applesauce" already has a drawing (`out/extended_art/applesauce.png`, unreviewed), but nothing can find it. | 010 slice 2; 030 |
| 8 | "apple sauce" (space) would not match "applesauce". | `catalogMatches` is string-based; 030 `find` fixes it |
| 9 | Destination is only the sheet title; other groups are offered in a toast after the sheet closes. | `offerOtherBoards` |
| 10 | No way to hear a match before adding it. | match rows have no ▶ |

## 3. Step 1 — Type (the sheet)

```text
┌──────────────────────────────────────────────┐
│ Add a word                   to My Words ▾  ✕ │
│ ┌──────────────────────────────────────────┐ │
│ │ apple sauce▍                             │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│  ┌──────┐  applesauce                    ▶   │  ← best match, highlighted;
│  │ 🥣   │  Food & Drink                 [Add]│    Return adds it
│  └──────┘                                    │
│  ┌──────┐  applesauce pouch              ▶   │
│  └──────┘                                    │
│  ┌──────┐  "apple sauce" — a new word        │  ← always last; becomes the
│  │  +   │  picture and voice made for you [Make]│  highlighted row when
│  └──────┘                                    │    nothing matches
│                                              │
│  Adding lots?  Paste a list · Add photos     │  ← quiet text links
└──────────────────────────────────────────────┘
```

- **One highlighted row; Return does it.** With a word match it's the match;
  with none, it's Make. Same visual weight as a real tile, never dashed.
- **Word matches stay local and instant** (today's `entityMatches` +
  `catalogMatches`). Pictures by meaning (030 `find`) are used on the card,
  not here — the sheet never waits on the network.
- **Destination chip** ("to My Words ▾") in the header; multi-select from
  the 027 add-to-boards list, set before adding.
- **▶ on every match row** plays that word's clip.
- **Paste a list · Add photos** as one quiet line. **Cancel** is ✕, Esc, or
  tap outside.

## 4. Step 2 — Make (the new word's card)

Make (or Return) **saves immediately** — `createEntity` + `placeItem`,
offline-first, name only — and the sheet becomes the word card for the new
tile (reuse `public/board/word-card.js`; one card, a "just added" state).

```text
┌──────────────────────────────────────────────┐
│  ✓ Added to My Words                    Done │
│                                              │
│        ┌────────────────┐                    │
│        │   [picture]    │  ← best match now, │
│        │                │    or "Drawing…"   │
│        │  apple sauce   │  ← tile, real size │
│        └────────────────┘    and real color  │
│                                              │
│  🔊  Making Eve's voice…   →   plays once     │
│                                              │
│  Other pictures  [▢] [▢] [▢]   📷 Photo       │
│  Not right?  [ Describe it… ] [Draw it again] │
│                          uses 1 of 295 left   │
│  Voice   ▶   🎙 Record your own               │
│  Kind    ● thing ▾        Also in  + group    │
└──────────────────────────────────────────────┘
```

### 4.1 Picture

Driven by 030 `find` (text only) the moment the card opens:

| `find` result | Card shows |
| --- | --- |
| `auto` set | That picture on the tile at once; the other 3 under **Other pictures**. Tapping one applies it and sends `pick`. |
| no `auto`, `scope: common`, drawings left | "Drawing…" on the tile, then the drawing (030 `draw`); the 4 candidates still shown as alternatives. Small line: "Used 1 drawing · 294 left". |
| no `auto`, `scope: personal` | Tile shows the initial and color; **Add a photo** leads; the candidates show under "Or use one of ours" (Cooper → our golden retriever); drawing only via Describe it. |
| no `auto`, 0 drawings left | Label + color; candidates as alternatives; **Add a photo**; "No drawings left" (top-ups when payments land). |
| offline / error | Label + color; "We'll find a picture when you're back online." Retries on reconnect. |

- **Describe it** (replaces Hint): placeholder *"What should it show? e.g.
  a bowl, not a jar"*. **Draw it again** is disabled until it has text; it
  sends `draw` with the description and shows "uses 1 of N left" beside it.
- Under the field, one quiet line: *"Your description helps us draw better
  pictures for everyone."* True as written: only the word and description
  are shared, never who wrote them (030 § 8).
- **Replacing our choice sends `reject`** (030 § 6.3) — once, when the
  adult swaps the picture we chose (the `auto` match or our automatic
  drawing) for an alternative, a photo, or a redraw. Replacing a picture the
  adult chose themselves sends nothing.
- **Nothing is lost on a redraw.** The picture it replaced moves into
  **Other pictures**, so switching back is one tap and free.
- The description is saved on the entity (`personal_entity.hint`, same
  column) so enrichment can read it later.
- An accepted picture is saved onto the entity like a photo (works offline,
  syncs).

### 4.2 Voice

- On open: 028 `voice_tile.ensure(text)` — "Making {voice}'s voice…", then
  it **plays once** so the adult hears it without asking. Cache hit = instant.
- Held / failed: 028 § 5.2 messages + **Record your own**. Never device TTS.
- **Handoff from 028 (founder 2026-09-29):** the shipped minting copy —
  "Making Eve's voice…", the tile badge, the word-card voice line, and
  "Try again" — is engineer prose, not designed UI. Slice C owns its
  visual treatment: where minting progress lives, how a "voice pending"
  tile reads on the board, and how Try again sits next to Record. The
  contract is the states (`minting | ready | held | withheld | budget |
  failed | offline | unavailable | denied` via `tileApi.status` /
  `onStatus`), not today's strings.

### 4.3 Kind and places

- **Kind chip** shows 030 `find`'s `kind` as the Fitzgerald color; tap to
  change (existing `setEntityRole`). Offline or null: Yellow until the
  result arrives; never overwrite a kind the adult set.
- **Also in + group** reuses the word card's add-to-boards.

### 4.4 Done

Closes. Closing any other way also keeps everything — nothing on the card
blocks or undoes the save.

## 5. Many at once

- **Paste a list:** the preview calls 030 `find-batch` and shows each row's
  picture thumbnail (tap to swap among its 4). Rows with no close match show
  "will draw". If that count is > 10 or > drawings left, the Add button reads
  *"Add 40 · draws 32 new pictures (uses 32 of 300)"* and asks once;
  otherwise it just adds. Voice mints for every row in the background with
  one progress line (028 § 5.3).
- **Add photos:** unchanged (photos are the picture); voices mint in the
  background.
- Words are usable (label + color) immediately; pictures and voices fill in.

## 6. The child never waits and never sees churn

Finding, drawing, and minting all happen on the adult's side. A tile whose
picture is still coming shows its label and color, then the picture fills in
once. It is never removed or hidden (memory: never interfere with the child).

## 7. Works Tests

1. **Stopwatch.** Real iPad, fresh profile, network on: type "applesauce" +
   Return → tile on the board with picture and voice playing. Record wall
   time for (a) existing picture + cached voice, (b) cold draw + cold mint.
   Report both; no target invented.
2. **Zero questions.** DOM test: Make with only `#add-name` filled creates a
   `personal_entity` and a placement; no other field is required or shown
   before the save.
3. **Offline add.** Network off: Make saves; tile shows label + color; card
   shows the offline lines; reconnect → picture and voice fill in; device
   TTS spy = 0.
4. **Close match applies, alternatives are free.** With a `find` stub
   returning `auto`, the tile gets that picture and zero `draw` requests are
   sent; tapping an alternative sends one `pick` and zero `draw`.
5. **Redraw needs words.** Draw it again is disabled with an empty
   description; with text it sends exactly one `draw` including it.
6. **People lead with a photo.** `find` stub with `scope: personal` → zero
   `draw` requests; Add a photo is the first action.
7. **Bulk asks only when it should.** Paste 12 rows where 11 need drawing →
   one confirmation naming the count; 5 rows needing 5 (with ≥ 5 left) → no
   confirmation.
8. **Child board untouched.** During a pending draw the child's grid never
   loses or moves the tile; the picture swaps in once.
9. **Overruling us is recorded once, and reversible.** With an `auto`
   picture applied: picking an alternative sends one `reject` (action
   `pick`) plus one `pick`; a photo sends one `reject` with no image data;
   a redraw sends one `reject` (action `draw`) and the old picture appears
   in Other pictures. Swapping between the adult's own choices afterwards
   sends no further `reject`.

## 8. Slices (front end; Claude leads design)

| # | Slice | Depends on |
| --- | --- | --- |
| A | Sheet (§ 3): highlighted row, Return, Make, destination chip, ▶ on matches, quiet links, ✕. Make saves at once and opens the card in its "just added" state with label + color only. Removes `#add-newfields`. | — |
| B | Card picture states (§ 4.1), `pick`/`reject` calls, and kind chip (§ 4.3) against the 030 contract (stubbed until 030 slice 1). | 030 slices 1, 3, 7 for real data |
| C | Card voice states (§ 4.2). | 028 slices 1–2 |
| D | Paste a list with thumbnails and the draw count (§ 5). | 030 `find-batch` |
| E | Stopwatch Works Test on a real tablet with live 028 + 030. | all |

Slice A alone fixes the confusion in the founder's screenshots.

## 9. Docs amended with this decision

- `010_Extended_Picture_Library.md` slice 6 and `Word_Library.md` § 6.1 →
  backend now owned by 030 (automatic, reuse first, redraw needs a
  description).
- `Clipart_Pipeline_And_Catalog_Growth.md` → reuse-first note, 030 pointer.
- `Personal_Entities.md` → hint is asked as "Describe it"; kind inferred.
- `018_Core_Board_V2_And_Groups.md` D7 → the kind question becomes an
  inferred chip.
- `Pricing_And_Packaging.md` § 4.2 → what a drawing counts.

## 10. As built (2026-09-29)

| Slice | Where | Proof |
| --- | --- | --- |
| A — sheet | `public/board/add-flow.js`, `#addform` in `public/index.html`, `add-flow.css` | `src/board/add_word.test.mjs` (WT2, spacing fold, highlight rule, already-here, arrows) |
| B — card pictures + kind | `public/board/word-card.js`, `public/board/picture-fill.js` (one path for card + paste), `public/shared/pictures.mjs` (client + pure rules) | `src/board/word_card.test.mjs` (WT4, WT5, WT6, WT9, never-overwrite, uncalibrated, calibrated draw); `src/board/pictures_client.test.mjs` |
| C — card voice | `word-card.js` voice line (028 `tileApi` states), plays once when ready | `word_card.test.mjs` "plays once" |
| D — paste a list | `add-flow.js` bulk preview (thumbnails, cycle, draw count, one confirm), background fill; editor paste routes through the same fill | `pictures_client.test.mjs` (confirm rule), `web_editor.test.mjs` (`newIds`) |

**Design calls made while building (Claude, design lead):**

- **Return's target.** A match is highlighted only when it *is* the typed
  word (spacing/hyphens folded: "pop corn" → popcorn); otherwise Make is.
  A longer word that merely starts the same ("pop" → popcorn) is offered
  but never steals Return.
- **Already here.** A word already on the destination page shows "Already
  in {page}" and opens its card instead of adding a duplicate.
- **Destination is single-select** on the sheet; more pages are one tap
  on the card ("+ Another page"). One path for multi-page, not two.
- **Adding a catalog match plays it** — the adult hears what was added.
- **Uncalibrated finder never auto-draws.** 030 `find` now returns
  `calibrated` (false while `auto_cutoff` is the 1.01 default); until the
  founder saves a cutoff the card shows ours + "Draw it" (no words needed
  for a first drawing), and paste shows "picture later".
- **"Ours" is remembered for the page's life**, so `reject` fires once per
  replacement of our choice in a session; a card reopened after reload
  sends no reject (no durable provenance column — acceptable signal loss).
- **Missing pictures vanish.** A candidate whose image can't load is
  dropped from Other pictures instead of showing an empty square.
- **"Describe it" is saved on the word** through a new synced op,
  `set_entity_hint` (`setEntityHint`, replayed in `ops.mjs`).

**Fixes found on the way:** on wide screens the card was stuck in the
editor's hidden right pane when opened from the board (now docks to the
page outside the editor); the shared group painter could interleave two
in-flight paints (a picture landing mid-rerender) — it now builds off-screen
and swaps once.

**Known, not this phase:** local dev's `EXT_ART` bucket is empty (the index
is remote), so extended-library candidates 404 locally and are dropped; in
production they resolve. The editor's own paste box and the stale "Tap a
word to open its card here" line go in 031 slice A.
