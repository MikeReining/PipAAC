# Word Library — find, add, and edit any word

**DECIDED 2026-09-22** (not built unless a line says BUILT).
Intake: `docs/founder/2026-09-22_Customization_Library_Sync.md`.
Execution: `docs/phases/009_Word_Library_And_Customize.md` (Library, word
card, add paths, recordings, voices, suggestions) and
`docs/phases/010_Extended_Picture_Library.md` (the bigger picture library).
Group rules stay in `docs/product/Motor_Grid_And_Art.md` § Groups. Entity
record and filing stay in `docs/product/Personal_Entities.md`. Tables stay in
`docs/product/Language_And_Voice_Schema.md`.

Customization is where incumbents are weakest and families burn out. Pip
wins it by being fast to add, easy to find again, and easy to change.

---

## 1. The problem, from first principles

Repeated word placements become expensive to maintain when their identity and
location are coupled. Pip keeps those responsibilities separate: changing a
picture can update the word everywhere while removing one placement stays local.

Pip separates the word from where it shows up. A word is one record. A group
is a collection of word placements (many-to-many, **BUILT**
fb5a8d7…0555aa9). Occasion groups are curated views with ordinary memberships
(027); learned occasion context is a separate prediction input (007). The adult
must be able to answer three questions without learning that model:

1. Where did the word I just added go?
2. How do I find it again?
3. How do I change it?

Before this doc, nothing answered them. The add filed the word into the
group it started in, and then the word had no home of its own.

## 2. The model: the Photos app

**DECIDED 2026-09-22** (founder: "completely agree").

Every iPhone owner already knows this model. A photo is always in the
**Library**. **Albums** are collections it appears in. Taking a photo out of
an album does not delete it. No one asks which folder a photo is in.

| Photos | Pip |
| --- | --- |
| Library | **Word Library**: every word the child can have, searchable |
| Album | **Group**: built-in, My Words, or custom |
| Prepared album | **Occasion group**: Breakfast, Lunch, Dinner, Snack (027); independent local memberships |
| Info panel | **Word card** |
| Recently Added | Library → Added, newest first |

"Folder" stays out of the product vocabulary
(`docs/product/Motor_Grid_And_Art.md` § Groups).

## 3. The Word Library

**DECIDED 2026-09-22; BUILT** (009 slice 3 — `#library` in
`public/index.html`, queries in `public/shared/library.mjs`). Parent
Corner → **Words**. On the web editor it is the home screen
(`docs/product/Sync_And_Web_Editing.md` § 7).

Three tabs, one search field across all of them:

| Tab | Holds |
| --- | --- |
| **Added** | Everything the family added or changed: personal entities, library words they placed in a custom group or My Words, words with a recording override. Newest first — `added_at` on `personal_entity` and `group_cell` carries the placement time. |
| **Suggested** | Held with listening (017 R20, § 8). Not shown. |
| **All** | Every word: the launch catalog, the extended picture library (§ 6), and the family's own. |

Tapping any row opens its **word card**. Search matches labels and spoken
names in the profile locale, prefix first. Every Library query is a
SELECT — the surface cannot write; edits happen on the card.

Naming note: "My Words" is already the default group. The Library tab is
**Added**, so the two never share a name.

## 4. The word card

**DECIDED 2026-09-22.** One screen answers where the word is, how it sounds,
and what can change. **BUILT** (009 slice 2): it opens by tapping an item
in Edit mode (`openWordCard` in `public/board.js`, `#wordcard` in
`public/index.html`). Openings from the Library and from `+ Add` results
are scheduled with those slices.

| Row | Personal entity (Cooper) | Catalog word (`cup`) |
| --- | --- | --- |
| Picture | Photo, or change it — **BUILT** (file input → `savePhoto`) | **BUILT** — **Use my own picture** (a photo) or another approved library image sets `image_override`; **Use our picture** restores (`public/shared/images.mjs`) |
| Name | Editable — **BUILT**. A rename supersedes the ready recording and enrichment (schema § 6.2; `renameEntity`) | Read-only — **BUILT**. For another word, add it as a new word |
| Sound | ▶ plays what the board plays — **BUILT** (`resolveSlot` in `public/shared/voice.mjs`: override → voice clip → TTS → silent slot). **Record it** / **Use the voice again** — **BUILT** (`MediaRecorder` → `blob:` key → `set_override` op) |
| In groups | Chips, one per group — **BUILT** (`entityGroups`/`senseGroups`). × removes from that group with Undo — **BUILT**. **Add to other boards** opens named destinations — **BUILT** (027) | Same — seeded words leave any group too; group removal is distinct from global Hide (027, **BUILT**). |
| Show on board | **BUILT** — opens the group page with the cell flashed; a core-mapped sense flashes on the board | Same |
| Remove / Hide | **Remove** retires the entity — **BUILT** (`retireEntity`, restorable; `docs/product/Vocabulary_Masking_And_Safety.md` § 3.2) | **Hide** masks it — not built (009 slice 9) |

Rules:

- **The card may list groups.** The ban on asking "where should this go"
  applies to the add form, where the place already answered it
  (`docs/product/Personal_Entities.md` § Filing). On the card the adult is
  deliberately putting a word somewhere else, so a group list is the answer
  to the question they asked.
- **Scope must be visible (027; BUILT 2026-09-28).** Picture, name, and
  recording changes say “Changes this word everywhere it appears.” Group ×
  says “Remove from [group]”; global Hide/retire is separately named. No ordinary
  placement action asks “here or everywhere?”
- **Zero placements is allowed (027; BUILT 2026-09-28).** Removing the last
  membership keeps the active word in the Library and keyboard lookup. Do not
  silently place it in My Words; this replaces the existing `removeItem`
  catch-all. Removing from My Words is also a local placement removal; retiring
  the word is a separate explicit action. A removed word can be added again.
- **Add to other boards (027; BUILT 2026-09-28).** Named destinations, none
  preselected; one save to only the selected groups. Already-present placements
  are skipped, never moved. Undo affects only memberships created by that save.
  The same optional action follows an ordinary successful add.
- The card never writes the core map.

## 5. Adding words

**DECIDED 2026-09-22.** Five paths and a first-run setup. They share one matcher and one save.

### 5.1 One field: every meaning, as pictures

**DECIDED 2026-09-22** (founder: "there should be no duplicate words …
Bat. I might be talking about the flying animal. Bat. I might be talking
about baseball … that's not a violation").

**The rule: one meaning, one record. The spelling may repeat.** The
schema already separates meaning from spelling ("`bat` the animal and
`bat` the sport are two senses",
`docs/product/Language_And_Voice_Schema.md` § 1), and the launch catalog
already has `orange` (fruit and color) and `light` (weight and color).
WorkbookBench solved the same problem for pasted word lists with rules we
adopt: the context disambiguates, items are deduplicated by meaning and
never by spelling, and alternatives are offered as pictures, never as a
question that interrupts.

`+ Add` inside a group, and the Library's `+`, open one text field. As the
adult types, every existing meaning of the text appears as a picture row:

1. **The family's own words** (personal entities) with that name, each
   with its photo and where it already is: *Max 🐕 (in Animals)*.
2. **Catalog senses** with that label (launch catalog, then the extended
   library), each with its picture: `bat` 🦇 and `bat` ⚾.
3. **New: "…"**, always present. Max the dog and Max the cousin are two
   people, and both are allowed.

**The group ranks, it never hides.** Inside Animals, 🦇 sorts above ⚾.
Inside Sports, ⚾ sorts first. Every meaning stays offered.

**What is forbidden:** the same record twice in one group, or an add that
silently creates a second record when the intended one already exists. The
current `group_cell` key enforces membership uniqueness; 027 moves that
constraint to `group_membership`.
**BUILT** (009 slice 1): `entityMatches` offers the family's own entities
first, `catalogMatches` ranks by the target group's seed category, and
picking a row places the same record (`public/shared/groups.mjs`,
`renderAddMatches` in `public/board.js`; proof `src/board/library_add.test.mjs`).

Pronunciation gap, recorded for later: words spelled the same but said
differently (`lead` the metal, `lead` the verb) share one recording in
the schema. WorkbookBench splits those recordings. See
`docs/product/Language_And_Voice_Schema.md` § 14.7.

### 5.2 Picture suggestions on add

A library match carries its art, so most adds need no photo. When the adult
creates a New word, the form offers library pictures whose labels are close
("trampoline" → our `trampoline`, if drawn), then camera and photos. Our
clipart comes first. A real-photo suggestion is not a default
(founder: "this tool is more clipart based").

### 5.3 Many photos at once

**BUILT** (009 slice 8): "Add photos" in the add form opens a multi-select
picker; each file becomes a draft row (thumb + name prefilled from the file
name). Save writes only named rows — a blank name is flagged "needs a name"
and skipped. `applyPhotoDrafts` in `public/shared/bulk.mjs` owns the writes
(`createEntity` + `placeItem` — ops sync like any add).

Pick several photos in one system picker, get one draft row per photo, type
names, save all into the current group. Enrichment may later suggest a name
for a generic object. It never names a person
(`docs/product/Design_Invariants.md` § 7).

**Not possible:** reading names from the iOS Photos People album. Apple
exposes no person or face-tag data to third-party apps through PhotoKit
([Apple Developer Forums](https://forums.developer.apple.com/forums/thread/126711)),
and a web page cannot see the Photos library at all. The system picker's
own search can still find "Mom" by Apple's labels and hand Pip the chosen
images. That is the closest honest version.

### 5.4 Bulk entry

A paste box: one word or short phrase per row. Each row resolves through
the same matcher (own word, library word with art, or new). A preview shows
each row's result and marks rows that "need a picture". **Add all** places
them in the current group, or My Words from the Library. Duplicate rows
collapse to one. The box works on the iPad. It is the headline feature of
the web editor on a computer (`docs/product/Sync_And_Web_Editing.md` § 7).

**BUILT** (011 slice 7 + 009 slice 7): `resolvePasteRows` /
`applyPasteRows` in `public/shared/bulk.mjs` — auto-resolution is
exact-match only, duplicates collapse, rows already in the group skip.
The iPad paste box is `#bulkform` (`public/board.js openBulkForm`) —
from the add form into the current group, from the Library into My
Words; the web editor has the same panel on wide screens.

### 5.5 Suggested words

One tap from the Suggested tab (§ 8).

### 5.6 First-run setup: "Tell us about their world"

**DECIDED 2026-09-22.** Adoption is decided in
the first ten minutes after install. After the board first draws, the
Parent Corner offers a guided pass with four short steps: **People** (many
photos at once), **Pets**, **Favorite foods** (bulk entry, answered by
library pictures), and **Places**. Each step files into the matching
built-in group, and any step can be skipped. Target: 30 personal words in
about ten minutes.

**BUILT** (009 slice 11): `#setupform` is the four-step wizard — People
(a face and a name per row; tap the face for a photo, several photos add
a row each; new people take a free mom/dad seat, 018 D1), Pets, Favorite
foods and Places as one-per-line lists through the § 5.4 resolve→apply
path, each line previewed with its picture. People opens on who is
already in the group (`setupPeople`), so a second pass from the Parent
Corner renames or re-photographs them instead of adding duplicates. `SETUP_STEPS` in `public/shared/setup.mjs` is the step→group
truth: `grp_people`, `grp_animals`, `grp_snack` (Food is retired —
Snack is the anytime food board), `grp_going_out`. Proof
`src/board/setup.test.mjs`; the parent-vs-Proloquo2Go stopwatch
comparison is still owed.

**Rejected 2026-09-22:** "save from the sentence" (founder: the child does
not type sentences). Also rejected: suggesting words the child typed on the
keyboard.

## 6. The extended picture library

**DECIDED 2026-09-22** (founder: "high leverage and high wow").
Execution: `docs/phases/010_Extended_Picture_Library.md`.

- **Two tiers.** The launch catalog (677 words) is seeded into built-in
  groups. The **extended library** (2,000 words and 300 short
  phrases such as "brush teeth" and "go potty") is drawn in the same house
  style, voiced in every catalog voice, and sits in the Library only. It is
  the "Tier 3: Secondary Fringe" the launch lexicon already names
  (`docs/product/Initial_Vocabulary_600.md` § 1); schema tier
  `secondary_fringe`.
- **An extended word is not on any page until the family adds it.** It is
  not seeded into a group, and the strip does not offer it before it has a
  group placement, because the strip must never offer a word the child
  cannot find again ("Show me where", `docs/product/Motor_Grid_And_Art.md`
  § Groups).
- **Cost.** Founder estimate: about $10 per 1,000 images with the existing
  pipeline (`scripts/art/gen.mjs`, lessons in
  `docs/product/Art_Generation_Lessons.md`).
- **Phrases** are single utterances (the schema already speaks
  `apple juice` as one clip, `docs/product/Language_And_Voice_Schema.md`
  § 8). They are never stitched from word clips.
- **Size.** **DECIDED 2026-09-22.** First pass: 2,000 words and 300
  phrases. Generation is cheap. The real limit is review speed, so review
  runs on a fast side-by-side contact-sheet page.

### 6.1 Draw it for me

**AMENDED 2026-09-29 (founder):** automatic, not a button. Every new word
first gets the closest picture we already own (free); we draw only when
nothing is close, never automatically for people and pets. A redraw needs a
description. Owners: `docs/phases/030_Picture_Finder_And_Drawing.md`
(backend), `docs/phases/029_Add_A_Word.md` (experience).

**DECIDED 2026-09-22** (founder: "a really killer idea … for people that
make the full payment, we should absolutely enable it").
Architecture & growth pipeline: `docs/product/Clipart_Pipeline_And_Catalog_Growth.md`.
Execution: `docs/phases/010_Extended_Picture_Library.md` slice 6.

When no picture matches (or the adult wants another), **Draw it for me**
draws the word in our house style.

- **Word plus an optional hint.** "Cooper: golden retriever" draws a
  golden retriever. People are still best as photos.
- **Two-stage Jev pre-classification (mandatory backend pipeline step).**
  Before image generation, TypeSafe Jev performs two checks:
  1. *Entity Scope:* Identifies if the term is a personal entity (person/pet name,
     private location) or a general communicative concept. Personal drawings are
     quarantined from the public catalog review queue.
  2. *Framing Lens:* Classifies into one of our 5 semantic framing lenses
     (`face`, `bust`, `full`, `diagram`, `object`) defined in
     `docs/operations/art-generator/SKILL.md`, and selects the Fitzgerald Key
     role color or plural rule.
  Because the user explicitly requested cloud image generation, Jev runs
  as an internal cloud pipeline stage; **parents cannot disable Jev
  for Draw it for me** (unlike conversational prediction sharing, which is
  toggleable).
- **Single image generation (66% cost savings).** With Jev pre-classifying
  framing and prompt constraints, Muse Image generates **one** clinical-grade
  vector icon instead of three. This cuts image generation API costs by
  two-thirds while reducing generation latency.
- **Re-roll & Hint on demand.** If the single image has an artifact or
  the user wants an alternative, the UI offers **Re-roll** (single tap)
  or the ability to add/edit a descriptive hint.
- **Worker asset archival.** The Cloudflare Worker directly archives the
  generated image in Cloudflare R2 storage alongside the prompt and metadata,
  enabling perpetual zero-marginal-cost reusability across all users.
- **Who gets it.** **DECIDED 2026-09-23** (amends the 2026-09-22 fair use):
  a free user gets 5 drawings as a taste; Pip Lifetime (\$49 once, per
  user) includes 300, once, not per year. Past that, top-up packs are an
  in-app purchase priced near cost
  (`docs/product/Pricing_And_Packaging.md` § 4.2).
- **No surprise cutoff.** At about 1¢ an image, a lifetime price cannot
  carry an unlimited yearly allowance. The remaining count shows once a
  user is within 10% of the allowance, the message offers a top-up, and no
  one is cut off silently in the middle of a setup. A per-user limit of 30
  a day (starting value) stays as an abuse guard.
- **Safety first.** The word and hint are checked before drawing, because
  this is a children's app. A refused request says so plainly.
- **What leaves the device.** Only the word and the hint, only on the
  adult's tap. Never the entity id, a photo, or anything from the child's
  history.
- **Growth loop ($k \ge 20$).** A common word (`scope: catalog_candidate`)
  drawn or requested for 20 or more boards enters the review queue for the
  extended library (`docs/product/Clipart_Pipeline_And_Catalog_Growth.md` § 4).
  Only the word text is counted. No board id is stored with the count, so
  a single family's word (a name) never becomes public.
- **Where the drawing lives.** A drawing for a New word is that entity's
  picture. A drawing chosen for a catalog word is a picture override
  (`docs/product/Language_And_Voice_Schema.md` § 14.1).

## 7. Voices and recordings

**DECIDED 2026-09-22.** Schema already owned by
`docs/product/Language_And_Voice_Schema.md` § 5.5, § 6.1, § 6.3, § 7.
Scheduled in 009.

- **Launch with one voice.** **DECIDED 2026-09-22** (founder: "we are
  starting with one default voice … we will rapidly add multiple voices
  after that"). The default voice ships. The picker is post-launch work.
- **Pick a voice** (after launch). Parent Corner → Voice. A list of
  catalog voices (our default, an adult male, a young girl, a young boy
  …), each with a sample. Every catalog and extended word has a clip in
  every voice. The profile's `preferred_voice_id` chooses one. Clips for a
  voice download when it is chosen (009 slice 5).
- **Record my own.** From the word card, the adult records the word.
  That recording is a `clip_override`. It wins over every voice for that
  word or name, until the adult taps **Use the voice again** (the override
  becomes `superseded`; the bytes stay). It can be a name said the family's
  way, a word in a grandparent's language, or a sound: a bark, a song.
- **PROPOSED, not scheduled.** Re-voice a recording into the profile voice
  (speech-to-speech), keeping the family's pronunciation in the child's
  voice. Only if families ask for it.

## 8. Suggested words from listening — HELD

**HELD 2026-09-24** (017 R20: no listening). Kept for history; not current.

**DECIDED 2026-09-22** (founder: "single words only … local only, on
device only"). Needs `docs/backlog/008_Partner_Listening.md` slice 3. Built
in 009.

When listening is on, the on-device speech text of each partner turn passes
through one filter. A word is kept as a suggestion only when all of these
hold:

1. It is a single word (no phrases, no sentences).
2. It is not a function word and not a root-core word.
3. The child does not have it yet: no group placement for a matching
   sense, and no entity with that spoken name.
4. The adult has not dismissed it.

What is stored, on the device only:

| Kept | Never kept |
| --- | --- |
| The normalized word, its matching sense id if any, a count, the day last heard | The sentence, the neighbouring words, the time of day, audio, who said it |

- Never synced (`docs/product/Sync_And_Web_Editing.md` § 2), never sent to
  Jev, never in a backup that leaves the device.
- Library → Suggested lists them by count, with "heard 5× this week". One
  tap adds (a library word comes with its picture). ✕ dismisses for good.
  **Clear suggestions** empties the table.
- A word unheard for 30 days drops off. The list holds at most 200 rows.
  Both numbers are starting values.
- Parent Corner toggle **Suggest words from what I hear**, on by default
  when listening is on (the founder's proportionate-privacy stance: on by
  default, easy to turn off).

## 9. Bans

| Ban | Negative test |
| --- | --- |
| `+ Add` hides a meaning the family already has | Add Cooper in Animals; in People type "Coo" and pick the match. `personal_entity` count stays 1; Cooper has two group memberships with per-layout positions (027: `group_membership`), not duplicate word records. |
| Same spelling is treated as a duplicate | In Animals type "bat": 🦇 and ⚾ are both offered, 🦇 first; in Sports ⚾ is first. Adding a New "Max" while an entity "Max" exists creates a second entity. |
| Removing an item changes another group or resurrects later | Remove slot 14 from a built-in group, restart/reimport/restore; other groups and remaining placements stay unchanged, removed placement stays absent (027). |
| The add form asks where to file | Unchanged from `docs/product/Personal_Entities.md` § 4. |
| An extended word appears on a page or in the strip before the family adds it | After import, no `group_cell` row points at an extended sense; the strip never offers an unplaced extended sense. |
| A recording plays for the wrong word | The schema trigger holds: an override's `recorded_text` equals the spoken text. |
| A heard sentence is stored | After the stub hears a full sentence twice, the raw database bytes contain the one kept word and none of the other words in the sentence. |
| A suggestion leaves the device | Captured sync payloads and Jev bodies contain no suggestion rows. |
| The word card writes the core map | Snapshot compare, as in every customization slice. |
