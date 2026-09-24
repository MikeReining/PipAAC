# Phase 009 — Word Library and customization

**Status:** Executing. Slices 1–4 built and proven (see their Works Test
notes).

**DECIDED 2026-09-22** (founder: "if we nail customization and really make
it dramatically better we can win a key area that's really hard and
frustrating for users today"). Intake:
`docs/founder/2026-09-22_Customization_Library_Sync.md`.

| Topic | Owner |
| --- | --- |
| Library, word card, add paths, suggestions | `docs/product/Word_Library.md` |
| Groups, Edit mode, pinned slots | `docs/product/Motor_Grid_And_Art.md` § Groups |
| Entity record and filing | `docs/product/Personal_Entities.md` |
| Tables, playback, overrides, voices | `docs/product/Language_And_Voice_Schema.md` (§ 6.3, § 7, § 14) |
| Hide a word | `docs/product/Vocabulary_Masking_And_Safety.md` § 2 |

Every slice keeps the standing customization bans: the core map snapshot
is unchanged, and no save performs a network call
(`docs/product/Personal_Entities.md` § 4).

---

## What exists (checked 2026-09-22)

**BUILT:** groups (many-to-many), Edit mode (tap to lift, tap to move or
swap; `+ Add`, `Remove`, `+ Group`, `Delete group`), the one-field add with
catalog matches, entity save with photo, never-orphan to My Words
(`public/shared/groups.mjs`; Edit mode in `public/board.js`).

**Missing:** own-word matching (silent second records), any way to edit an entity after
saving, any place to find a word except by opening groups, recordings, the
voice picker, picture overrides, bulk and multi-photo add, suggestions, and
hiding.

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| Word Library, Library | word bank, vocabulary manager |
| meaning (one record per meaning) | duplicate (for a repeated spelling) |
| word card | properties, inspector, button editor |
| Added / Suggested / All (Library tabs) | My Words (that is a group) |
| Record my own, recording | voice memo, custom audio |
| Hide | delete (for a catalog word) |

---

## Slice 1 — `+ Add` offers every meaning, as pictures (P1 defect fix)

**P1** (founder 2026-09-22: "duplicate words should be fixed … that's
already a core violation and bug").

Goal: typing a word offers every existing meaning of it as a picture row
(the family's own entities first, then catalog senses, ranked by the
current group) plus New. Picking an existing meaning places that same
record here. The same spelling may repeat; the same meaning may not be
created twice by accident.

Truth owner: `docs/product/Word_Library.md` § 5.1.

Lie-prone layer: a UI list that shows Cooper but saves through the New
path, or a "dedupe" that compares spellings and blocks the second `bat`.

Files: `public/shared/groups.mjs` (a matcher over `personal_entity` next
to `catalogMatches`, excluding records already in the target group; group
context ranks, never filters), `public/board.js` (`renderAddMatches`:
picture rows, entities first, "in Animals" subtitle),
`library_add.test.mjs` (new, in src/board).

Works Test:
1. Save Cooper from Animals. Open `+ Add` in People, type "Coo". The first
   row is the Cooper entity. Pick it. `personal_entity` has 1 row, and
   Cooper has `group_cell` rows in Animals and People. Typing "Coo" in
   People again offers no Cooper (already there).
2. Fixture catalog with two `bat` senses (animal, sport). In Animals,
   "bat" offers both, animal first. In a group seeded from the sport
   category, sport first. Adding both to one custom group gives two cells.
3. With an entity "Max", New "Max" is still offered and creates a second
   entity.
4. Core snapshot unchanged.

Done when: that passes and a person can put Cooper in two groups from the
board without making a second Cooper.

**BUILT 2026-09-22.** `entityMatches` + `catalogMatches` (seed-category
rank) in `public/shared/groups.mjs`; picture rows in `renderAddMatches`.
Proof: `src/board/library_add.test.mjs` (4 tests) + headless-Chrome drive
of the live sheet (Cooper offered first in People, one record, both
groups). Also fixed: `#add-newfields` ignored `hidden` (display:flex beat
the attribute).

---

## Slice 2 — Home-screen Edit mode and the word card

Goal: Edit mode works like the iPhone home screen, except removal never
reflows. Tapping an item opens its word card: picture, name, sound,
groups.

Truth owners: `docs/product/Motor_Grid_And_Art.md` § Groups (Edit mode,
**DECIDED 2026-09-22**), `docs/product/Word_Library.md` § 4 (card).

Scope:
- **Drag** to an empty slot moves; onto an item swaps. Replaces
  tap-to-lift, tap-to-place (both work during the change; tap-to-lift is
  removed when drag is proven on an iPad).
- **Tap** an item: the word card.
- **×** badge: remove from this group, Undo toast. The slot stays empty.
- **Tap an empty slot**: `+ Add` into exactly that slot.
- **Card:** picture and name change for entities (a rename supersedes the
  override and the enrichment; `docs/product/Language_And_Voice_Schema.md`
  § 6.2), ▶, group chips with × and **+ Add to group**, **Show on board**,
  **Remove** (retire with Undo; schema § 14.5). Recording is slice 4. Hide
  is slice 9.

Lie-prone layers: a rename that updates the card label but leaves the old
override playing (assert on what playback resolves), and a removal that
quietly compacts the page (assert on every other row).

Files: `public/board.js`, `public/index.html`, `public/shared/groups.mjs`
(`placeItem` gains an optional target slot; reuse `moveItem`, `swapItems`,
`removeItem`), `word_card.test.mjs` and `edit_mode.test.mjs` (new, in
src/board).

Works Test:
1. Remove the item at slot 14 with ×. Every other `group_cell` row of that
   group is byte-identical. Undo restores slot 14.
2. Tap empty slot 14 and add `cup`: it lands at slot 14, nothing else
   moves.
3. Drag slot 20 onto slot 5: exactly those two rows swap.
4. Rename Cooper to "Coop" from the card. `spoken_name` is "Coop". The
   ready override and ready enrichment are `superseded`. His `group_cell`
   rows are unchanged. Add him to Home through a chip, remove him from
   Animals and People: he is in Home only. Remove Home: he is in My Words.
5. Core snapshot unchanged throughout.

Done when: that passes and a person on an iPad can drag, remove, add into
a gap, and rename Cooper without anything else moving.

**Works Test (proven 2026-09-23):** `src/board/edit_mode.test.mjs` +
`src/board/word_card.test.mjs` — 9/9 pass covering 1–5
(`removeItemUndoable`, `placeItem` with a target cell, `renameEntity`
supersession, chip add/remove landing in My Words, retire/restore
invisibility in `groupPage`, strip candidates, keyboard index, and typed
resolution, core-map snapshot). Headless-Chrome drive on an agent copy
verified the rendered flow: one tap opens a group in Edit mode, tap opens
the card (chips `My Words` + `Animals×`), rename persists, chip-× toasts
and Undoes, a mouse drag moves a sense to the tapped empty slot, empty-slot
tap opens `+ Add`, and card Remove retires then Undo restores.

---

## Slice 3 — The Word Library

Goal: Parent Corner → Words lists every word with search. **Added** (newest
first), **Suggested** (empty until slice 10), **All**. Tapping a row opens
the card.

Truth owner: `docs/product/Word_Library.md` § 3.

Scope: an Added query (entities, and senses placed in a custom group or
My Words, plus words with an override), prefix search in the profile
locale, the Show on board jump.

Files: `public/shared/library.mjs` (new; read-only queries),
`public/board.js`, `public/index.html`, `library.test.mjs` (new, in
src/board).

Works Test: with Cooper, Grandma (entity) and `trampoline` added to My
Words, Added lists those three newest first. Search "gra" finds Grandma and
`grapes`. Show on board opens Grandma's group with her cell marked. The
queries run against a read-only connection, so the Library cannot write.

Done when: that passes and a person can find any word they added without
remembering its group.

**Works Test (proven 2026-09-23):** `src/board/library.test.mjs` — 5/5
(`swing` stands in for `trampoline`, not in the launch lexicon). Added
order is driven by `added_at` on `personal_entity` and `group_cell`;
read-only is proven under `PRAGMA query_only = ON`. Headless-Chrome drive:
Words opens on Added newest-first, "gra" returns Grandma (entity) then
grandma/grandpa/grapes/grass, a row tap opens the card, and Show on board
renders Grandma's People cell flashed.

---

## Slice 4 — Record my own

Goal: from the card, record a word or name. The board plays that recording
for that word in every voice, until **Use the voice again**.

Truth owner: `docs/product/Language_And_Voice_Schema.md` § 6.3 and § 7
(already decided; the table and triggers are **BUILT** in
`src/board/schema.sql`).

Scope: record, play back, save, re-record (the previous override becomes
`superseded`; the bytes stay), revert. Audio stored like photos (OPFS in
the browser). Any sound is allowed (a bark, a song): the adult is saying
"this is what `dog` sounds like here".

Lie-prone layer: a test that asserts the override row exists. Measure what
the player is asked to play.

Files: `public/board.js` (recorder UI), `public/db.js` (audio blob store),
the playback resolver, `override.test.mjs` (new, in src/board).

Works Test: with a stubbed audio player that records every key it is
asked to play, tap `want` and get the voice clip key. Record an override
for `want` (fixture audio). Tap `want`: the override key. Switch profile
voice: still the override key. Revert: the new voice's clip key. Speak the
sentence `I want juice`: three slots, the middle one the override.

Done when: that passes and a person can record "Cooper" the family's way
and hear it on the board.

**DONE.** `public/shared/voice.mjs` holds the write owners
(`setOverride`, `clearOverride`, `overrideFor`) and the § 7 slot resolver
(`resolveSlot`): sense → lemma utterance → ready override → the resolved
voice's ready clip → TTS when the voice is `device_tts` → silence;
entity → ready override → `spoken_name` synthesized; a `typed` item that
resolved to nothing synthesizes the typed text. The card's **Record it**
row uses `MediaRecorder`; on stop the bytes go through `savePhoto`
(content-addressed `blob:` key in OPFS) plus `syncUploadBlob`, and
`setOverride` records a `set_override` op. Re-record supersedes; **Use
the voice again** records `clear_override`. Proofs: `override.test.mjs`
measures the resolved key — override wins every voice, revert returns to
the voice, the sentence bar's middle slot plays the override, entity
rename supersedes, ops replay byte-identical. Headless-Chrome drive with
fake media: tap `want` plays `audio/want/….mp3`, Record → Stop saves a
9754-byte OPFS blob, the next tap plays `blob:` bytes, Use the voice
again restores the catalog clip.

---

## Slice 5 — Pick a voice (after launch)

**DECIDED 2026-09-22** (founder: "we are starting with one default voice
… we will rapidly add multiple voices after that"). Launch ships the
default voice only. This slice is the first post-launch voice work, not a
launch blocker.

Goal: Parent Corner → Voice lists catalog voices with a sample; choosing
one sets `preferred_voice_id` and downloads its clips.

Content dependency: each voice needs one clip per catalog and extended
utterance, generated with ElevenLabs like the default voice
(`docs/product/Language_And_Voice_Schema.md` § 9). Which voices and their
price are decided when this slice starts.

Lie-prone layer: a picker that changes the setting while playback still
reads the old voice. Measure the played key.

Works Test: switch to a second voice. Tapping `want` plays that voice's
clip key. A word with no clip in that voice is silence, not the default
voice (existing ban, schema § 11). While clips download, taps on
downloaded words play and the rest are silent. Nothing blocks speaking.

Done when: that passes and a person can hear the board in a second voice.

---

## Slice 6 — Use my own picture for a catalog word

Goal: from the card of a catalog word, choose a family photo (their cup)
or another library picture. The board shows it everywhere that word
appears.

Truth owner: `docs/product/Language_And_Voice_Schema.md` § 14.1
(`image_override`, **PROPOSED**, lands with this slice).

Files: `src/board/schema.sql`, the cell renderer, `public/board.js`,
`image_override.test.mjs` (new, in src/board).

Works Test: set an override for `cup`. The core cell, every group page
holding `cup`, and a strip tile for `cup` all render the override key. The
core map is unchanged. **Use our picture** supersedes it and all three
render the default image again.

Done when: that passes and a person can put their child's own cup on the
`cup` cell.

**DONE.** `image_override` landed in `src/board/schema.sql` (one ready
row per sense; an `image_id` must be an approved image of that sense —
the `image_override_same_sense` trigger). `public/shared/images.mjs`
owns the writes (`setImageOverride` / `clearImageOverride` /
`imageOverrideFor` / `libraryImagesFor`) and exports `SENSE_ART_SQL`,
the § 14.1 render-order expression every read site embeds: `metaFor`
(board cell, strip tile, bar chip), `groupPage`, `catalogMatches`, and
all four library queries. `blob:` art keys resolve through the photo
loader (`artInto`), so a family photo lazy-fetches its sealed copy like
an entity photo; it renders cover-fit (`.photo`). The card offers **Use
my own picture** (file → `savePhoto` → `syncUploadBlob` → `photo_key`
override), a thumbnail strip of the sense's other approved images, and
**Use our picture**. `set_image_override` / `clear_image_override` ops
sync; `image_override` joined the synced baseline tables. Proofs:
`image_override.test.mjs` measures what each surface's query resolves
(default → photo key → library key → default; core map byte-identical;
cross-sense `image_id` rejected by the trigger; replay byte-identical;
a replica missing the referenced image writes nothing). Headless-Chrome
drive: the card shows the uploaded photo's pixels, `cup`'s Home cell
renders the blob's pixels, Use our picture returns it to label+color.

---

## Slice 7 — Bulk entry

Goal: a paste box, one word or short phrase per row, resolved by the
slice 1 matcher, previewed, then **Add all** into the current group (or My
Words from the Library).

Truth owner: `docs/product/Word_Library.md` § 5.4.

Files: `public/shared/library.mjs` (a pure `resolveRows(text)` →
own/library/new per row), `public/board.js`, `bulk_add.test.mjs` (new, in
src/board).

Works Test: paste `Cooper`, `apple`, `trampoline`, `Nana`, `apple`, and a
blank line into Food. The preview shows Cooper (own word), apple (library),
trampoline (library, or new with "needs a picture" when not drawn), Nana
(new), and one `apple`. Add all: 1 new entity (Nana), no second Cooper, 4
placements in Food, no blank row. Core snapshot unchanged.

Done when: that passes and a person can add a list of 20 words in one
paste.

**DONE.** The iPad-side paste box (`#bulkform`) reuses the shared
`resolvePasteRows`/`applyPasteRows` — reachable from the add form
("Paste a list", files into the group the form targets) and from the
Library ("Add a list", files into My Words). Preview rows show
own/sense/new tags live; **Add N** places through the real owners and
clears the completion index. `src/board/bulk_add.test.mjs` measures the
spec's scenario end to end (paste → preview → apply: 2 created, 4
placed, dup + blank dropped, core map byte-identical); live probe
`scripts/probes/bulk_probe.mjs` drove the real sheet — preview resolved
correctly, "Add 3 to My Words" landed 2 entities + 1 sense placement.

---

## Slice 8 — Many photos at once

Goal: pick several photos in one picker, get one draft row per photo, name
them, save all into the current group.

Truth owner: `docs/product/Word_Library.md` § 5.3.

Files: `public/index.html` (`<input type=file multiple>`), `public/board.js`,
`multi_photo.test.mjs` (new, in src/board).

Works Test: offline, select 4 fixture photos in Family, name 3, leave 1
blank. Save creates 3 entities with photos in Family. The blank row is
not saved and is flagged. No network request is attempted.

Done when: that passes and a person can add a family's worth of people in
one pass.

---

## Slice 9 — Hide a word

Goal: from the card of a catalog word, **Hide**. The cell renders as a
blank ghost tile, cannot speak, and leaves the strip and keyboard
completions. **Show** restores it.

Truth owner: `docs/product/Vocabulary_Masking_And_Safety.md` § 2. The
biometric gate (§ 3.1) and the trash (§ 3.2) are not this slice.

Works Test: hide `stop`. Tapping its cell emits no audio and appends
nothing to the sentence bar. The core map is byte-identical. `stop` is
absent from strip candidates and keyboard completions. Show restores all
three.

Done when: that passes and a person can hide a word without moving any
other cell.

**DONE.** `sense_mask` (`src/board/schema.sql`, sync op `set_mask` in
`public/shared/ops.mjs`); `setMask`/`maskedSenseIds` in
`public/shared/groups.mjs`. The grid and group pages draw a `.cell.masked`
ghost (design tokens `--mask-*`; Edit-mode taps still open the card so a
caregiver can unhide in place). `stripScored`, `keyboardContinuations`,
`buildKbIndex`, and the idle starters all filter hidden senses. Card
control: `wc-hide`, catalog words only — entities keep retire/restore.
Works Tests: `src/board/mask.test.mjs` (byte-identical `core_cell` +
`group_cell`, funnel exclusion and restore, op replay) and
`scripts/probes/mask_probe.mjs` (hide → ghost → tap logs zero events and
appends nothing → Show restores). Note: core words are never strip
candidates (no-core rule), so the funnel leg proves itself on the fringe
word `juice`.

---

## Slice 10 — Suggested words

Starts after `docs/backlog/008_Partner_Listening.md` slice 3.

Goal: words heard while listening that the child does not have yet appear
in Library → Suggested, one tap to add.

Truth owner: `docs/product/Word_Library.md` § 8. Table:
`docs/product/Language_And_Voice_Schema.md` § 14.3 (`heard_word`,
**PROPOSED**, lands with this slice).

Lie-prone layer: a filter that "keeps one word" while the sentence
survives in a debug log or an impression's JSON. Measure the database
file bytes.

Files: `public/shared/listen.mjs` (the one call into the filter),
`public/shared/suggest.mjs` (new; the filter and upsert),
`src/board/schema.sql`, `public/board.js`, `suggest.test.mjs` (new, in
src/board).

Works Test: a stub engine hears "Are we going to the dentist today?"
twice and "the dentist is nice" once. `heard_word` has one row: `dentist`,
count 3. Read the raw database file bytes. They do not contain "going",
"today", "nice" or the sentence. With `dentist` placed in a group, it
leaves Suggested. Dismiss another word, hear it again, and it does not come
back. With the suggestions toggle off, nothing is written. A captured Jev
body contains no `heard_word` data.

Done when: that passes and a person sees "dentist — heard 3×" and adds it
in one tap.

---

## Slice 11 — First-run setup: "Tell us about their world"

Goal: after the board first draws, the Parent Corner offers four short,
skippable steps: **People** (many photos, slice 8), **Pets**, **Favorite
foods** (bulk entry answered by library pictures, slice 7), **Places**.
Each step files into the matching built-in group.

Truth owner: `docs/product/Word_Library.md` § 5.6.

Works Test (automated): run the four steps with fixtures offline. Entities
and senses land in People, Animals, Food and Places. A skipped step writes
nothing. Core snapshot unchanged.

Owner-visible proof: a stopwatch, not our own report. A parent adds the
same 10 words (4 people with photos, 2 pets, 4 foods) in Pip and in
Proloquo2Go. Record both times in this doc. Target: 30 personal words in
about ten minutes.

Done when: the test passes and the timed comparison is recorded here.

---

## Order

1 is **P1** (`docs/phases/README.md` § Next). 1 → 2 → 3 ship together as
"find and edit any word". 4, 6, 7, 8 and 9 are independent after 2. 11
follows 7 and 8. 10 waits on 008 slice 3. 5 is post-launch.

## Out of scope

Extended picture library (`docs/phases/010_Extended_Picture_Library.md`).
Editing from a computer (`docs/phases/011_Sync_And_Web_Editing.md`). Save
from the sentence and typed-word suggestions (rejected 2026-09-22). People
names from the iOS Photos app (not available,
`docs/product/Word_Library.md` § 5.3). Re-voicing recordings (PROPOSED,
not scheduled). Biometric Parent Corner gate and the trash.
