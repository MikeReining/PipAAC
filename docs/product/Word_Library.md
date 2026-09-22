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

Every incumbent (Proloquo2Go, TouchChat, TD Snap, LAMP) stores vocabulary
as buttons in folders. A button *is* its location. The same word in two
folders is two buttons that drift apart when one is edited.

Pip separates the word from where it shows up. A word is one record. A group
is a list of places it appears (many-to-many, **BUILT**
fb5a8d7…0555aa9). Occasions are a third, computed dimension
(`docs/phases/007_Occasions.md`). That model is stronger, but only if the
adult can answer three questions without learning it:

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
| Smart album | **Occasion**: breakfast, bedtime (computed, 007) |
| Info panel | **Word card** |
| Recently Added | Library → Added, newest first |

"Folder" stays out of the product vocabulary
(`docs/product/Motor_Grid_And_Art.md` § Groups).

## 3. The Word Library

**DECIDED 2026-09-22.** Parent Corner → **Words**. On the web editor it is
the home screen (`docs/product/Sync_And_Web_Editing.md` § 7).

Three tabs, one search field across all of them:

| Tab | Holds |
| --- | --- |
| **Added** | Everything the family added or changed: personal entities, library words they placed, words with a recording or picture override. Newest first. |
| **Suggested** | Words the device heard while listening and that the child does not have yet (§ 8). |
| **All** | Every word: the launch catalog, the extended picture library (§ 6), and the family's own. |

Tapping any row opens its **word card**. Search matches labels and spoken
names in the profile locale, prefix first.

Naming note: "My Words" is already the default group. The Library tab is
**Added**, so the two never share a name.

## 4. The word card

**DECIDED 2026-09-22.** One screen answers where the word is, how it sounds,
and what can change. It opens from the Library, from `+ Add` results, and
from a lifted item in Edit mode.

| Row | Personal entity (Cooper) | Catalog word (`cup`) |
| --- | --- | --- |
| Picture | Photo, or change it (camera, photos, library art) | Our art, or "Use my own picture" (§ 5) |
| Name | Editable. A rename supersedes the recording and the enrichment (schema § 6.2) | Not renamed. For another word, add it as a new word |
| Sound | ▶ plays what the board plays. **Record my own** / **Use the voice again** | Same |
| In groups | Chips, one per group. × removes, **+ Add to group** lists groups | Same. A seeded word cannot leave its built-in group; use Hide |
| Occasions | Read-only chips once 007 lands | Same |
| Show on board | Opens the group page with the cell highlighted | Same |
| Remove / Hide | **Remove** retires the entity (restorable, `docs/product/Vocabulary_Masking_And_Safety.md` § 3.2) | **Hide** masks it (same doc § 2) |

Rules:

- **The card may list groups.** The ban on asking "where should this go"
  applies to the add form, where the place already answered it
  (`docs/product/Personal_Entities.md` § Filing). On the card the adult is
  deliberately putting a word somewhere else, so a group list is the answer
  to the question they asked.
- **Never none.** Removing an entity's last group chip puts it in My Words.
  **BUILT** in `removeItem` (`public/shared/groups.mjs`).
- The card never writes the core map.

## 5. Adding words

**DECIDED 2026-09-22.** Five paths. They share one matcher and one save.

### 5.1 One field, own words first

`+ Add` inside a group, and the Library's `+`, open one text field. As the
adult types, matches appear in this order:

1. **The family's own words** (personal entities), with their photo and
   the groups they are already in. Picking one places *the same record* in
   this group. It creates nothing.
2. **Library words** (launch catalog, then the extended library), each
   with its picture.
3. **New: "…"**, which creates a personal entity.

**Current defect.** The matcher today searches catalog senses only
(`catalogMatches` in `public/shared/groups.mjs`). Typing "Cooper"
in a second group creates a second Cooper, so an entity cannot reach two
groups from the UI even though the model allows it. Fix: 009 slice 1.

### 5.2 Picture suggestions on add

A library match carries its art, so most adds need no photo. When the adult
creates a New word, the form offers library pictures whose labels are close
("trampoline" → our `trampoline`, if drawn), then camera and photos. Our
clipart comes first. A real-photo suggestion is not a default
(founder: "this tool is more clipart based").

### 5.3 Many photos at once

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

### 5.5 Suggested words

One tap from the Suggested tab (§ 8).

**Rejected 2026-09-22:** "save from the sentence" (founder: the child does
not type sentences). Also rejected: suggesting words the child typed on the
keyboard.

## 6. The extended picture library

**DECIDED 2026-09-22** (founder: "high leverage and high wow").
Execution: `docs/phases/010_Extended_Picture_Library.md`.

- **Two tiers.** The launch catalog (677 words) is seeded into built-in
  groups. The **extended library** (target 1,000–2,000 words and short
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
- **Growth signal.** **PROPOSED.** When no picture matches, the adult may
  tap **Draw it for me**. The word text goes to our server only on that
  tap. We draw the word, and request counts decide which words enter the
  extended library next. Typed names never leave the device silently: an
  entity's spoken name is otherwise sent only to enrichment
  (`docs/product/Personal_Entities.md` § Enrichment).

## 7. Voices and recordings

**DECIDED 2026-09-22.** Schema already owned by
`docs/product/Language_And_Voice_Schema.md` § 5.5, § 6.1, § 6.3, § 7.
Scheduled in 009.

- **Pick a voice.** Parent Corner → Voice. A list of catalog voices (our
  default, an adult male, a young girl, a young boy …), each with a
  sample. Every catalog and extended word has a clip in every voice. The
  profile's `preferred_voice_id` chooses one. Clips for a voice download
  when it is chosen. Which voices ship is a founder call (009 slice 5).
- **Record my own.** From the word card, the adult records the word.
  That recording is a `clip_override`. It wins over every voice for that
  word or name, until the adult taps **Use the voice again** (the override
  becomes `superseded`; the bytes stay). It can be a name said the family's
  way, a word in a grandparent's language, or a sound: a bark, a song.
- **PROPOSED, not scheduled.** Re-voice a recording into the profile voice
  (speech-to-speech), keeping the family's pronunciation in the child's
  voice. Only if families ask for it.

## 8. Suggested words from listening

**DECIDED 2026-09-22** (founder: "single words only … local only, on
device only"). Needs `docs/phases/008_Partner_Listening.md` slice 3. Built
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
| `+ Add` creates a second entity with a name the family already has | Add Cooper in Animals; in People type "Coo" and pick the match. `personal_entity` count stays 1; Cooper has two `group_cell` rows. |
| The add form asks where to file | Unchanged from `docs/product/Personal_Entities.md` § 4. |
| An extended word appears on a page or in the strip before the family adds it | After import, no `group_cell` row points at an extended sense; the strip never offers an unplaced extended sense. |
| A recording plays for the wrong word | The schema trigger holds: an override's `recorded_text` equals the spoken text. |
| A heard sentence is stored | After the stub hears a full sentence twice, the raw database bytes contain the one kept word and none of the other words in the sentence. |
| A suggestion leaves the device | Captured sync payloads and Jev bodies contain no suggestion rows. |
| The word card writes the core map | Snapshot compare, as in every customization slice. |
