# Personal entities

**DECIDED 2026-09-22** (revised the same day; not built).
Layout of the grid, the strip, and symbol art: `docs/product/Motor_Grid_And_Art.md`.
Slot assignments: `docs/product/Core_Coordinate_Map.md`.
The 599-word launch lexicon: `docs/product/Initial_Vocabulary_600.md`.
Build order: `docs/phases/README.md` (phase 002 is complete and archived).
Intake: `docs/founder/2026-09-22_Build_Order_Customize.md`.

A personal name — a pet, a person, a place, a food, a toy — is a record. It
is not a cell on the core grid. Saving one does not write the coordinate
map and does not add a word to the lexicon.

The adult supplies facts a model cannot know: the name, the photo, and at
most one optional line of context. Everything derivable is derived. Every
question the add form could ask and a model can answer is a tax on the add,
and this product does not collect it.

---

## 1. Who edits, in the first version

**DECIDED 2026-09-22** (not built). The adult uses the child's iPad. They open a
parent corner on that device. A code chosen on first use stays on the device
and gates the corner. There is no account, and the add works with the network
off.

A second device, a QR introduction, and Cloudflare sync are out of the first
build. **Amended 2026-09-22:** editing from a computer or a parent's phone is
now a decided direction with a proposed design:
`docs/product/Sync_And_Web_Editing.md`.

---

## 2. The record

**DECIDED 2026-09-22** (not built).

| Field | Rule |
| --- | --- |
| Spoken name | What the device says. Required. |
| Image | A photo from this device, or no photo. A missing photo shows the name and its Fitzgerald color. It does not borrow a competitor symbol. |
| Groups | Where the child finds it: one or more `group_cell` rows (§ Filing). Set by the group the add started in; classification may add one more. The adult is never asked to pick a folder. |
| Category | The record's home category, a classifier input only. Set when the add started in a built-in group seeded from a category, else null. Display never reads it. |
| Hint | Optional free text ("our dog", "grandma", "his school"). Classification input only. Never required. |

There is no type picker, no pronoun picker, and no edge editor. "Type" is
jargon a parent or SLP should never meet; the earlier design that asked the
adult to confirm word relationships made the add harder than the incumbents'
and was removed 2026-09-22.

Color is derived from the Fitzgerald role for nouns (yellow / orange). The adult
does not pick a color. Owner of the color roles: `docs/product/Motor_Grid_And_Art.md`.

### Filing

**DECIDED 2026-09-22** (amended by the groups review; replaces the
category-and-My-Words filing written earlier the same day). **BUILT**
(fb5a8d7…0555aa9). Group model:
`docs/product/Motor_Grid_And_Art.md` § Groups.

- **The place is the picker.** An add starts inside a group, in Edit mode
  via `+ Add`, and files the record into that group at the next free slot.
  The context already answered the question, so the form never asks it.
- **Parent Corner "Add to My Words"** is the one add that starts outside a
  group. It files into My Words, and the button says so. Nothing is filed
  silently.
- **One field, every meaning as pictures.** The add sheet is one text
  field. As the adult types, every existing meaning of the text is offered
  as a picture: the family's own entities with that name first (picking
  one places the same record here), then catalog senses (picking one adds
  the real word, with color, voice and picture, and creates no entity),
  ranked by the group the add started in. "New: '…'" is always offered and
  creates a personal entity: name, optional photo, optional hint. Two
  entities may share a name (Max the dog, Max the cousin). **Amended
  2026-09-22:** decided, not built. Today the sheet matches catalog words
  only, so re-typing an entity's name silently creates a second record.
  Rule and fix: `docs/product/Word_Library.md` § 5.1.
- **Many groups, never none.** An entity can sit in several groups. Removing
  it from its last group returns it to My Words. Deleting a custom group
  moves its only-there entities to My Words.
- **Find and change it later: the word card.** **DECIDED 2026-09-22**
  (not built). Every entity is listed in the Word Library, and its card
  shows its groups as chips, renames it, changes its photo, and records how
  its name sounds. The card may list groups because the adult is
  deliberately adding the word somewhere else, not filing a new add:
  `docs/product/Word_Library.md` § 3–4.
- **Classification only adds.** When enrichment returns a
  `category_suggestion`, the entity is *also* placed in the matching
  built-in group (founder ruling 2026-09-22: "proceed" on the groups
  review). It never moves or removes a placement the adult made, never
  touches My Words or custom groups, and does nothing on abstain.
  Classification is a refinement, never a gate: an offline save never
  waits on it, and a save never performs a network call.

### Wiring — there is no edge table

The adult never links words, and no authored table links them either.
A lookup such as "animal → walk, eat, play" is determinism pretending to be
semantics: a fish does not walk, and four rows cannot hold what a puppy is.

Strip relevance is computed live instead. On-device: the candidate funnel —
sentence position, recency, routine/time-of-day, and enrichment associations
once they exist (`docs/strategy/Dual_Engine_Predictive_Intelligence.md`
§ 5.2). Online: the classifier reranks the shortlist against state in real
time. A personal entity is reachable from the moment it is saved — through
the group it was added in, and through the strip's recency input — before any classification
exists.

### Enrichment — write-time, passive, never a gate

**DECIDED 2026-09-22** (not built). Once per entity, in the background, a
multimodal LLM reads the photo, the spoken name, and the hint, and writes
one semantic record: a description, a category suggestion, and related
sense ids. This is the model: **`meta/muse-spark-1.3-contributor`** (Meta
Muse Spark), called through the OpenRouter API.

The rules, same shape as the LocalFlyers classification cache:

- Runs once per entity; the result is stored with the model id and a
  prompt version. It is never re-asked for the same record.
- Deferred, never blocking. A save performs no network call; with the
  network off, enrichment queues and lands later.
- Abstention is a valid outcome. A record the model cannot describe stays
  unenriched and works anyway — in its group, spoken by name,
  strip-eligible by recency.
- Enrichment annotates; it never rewrites. `spoken_name` and the photo
  are the adult's facts. A name or photo change supersedes the record.
- The honest miss surface is relational, not object identity — a vision
  model will not call a dog an uncle, but it can guess *friend* where the
  truth is *brother*. So enrichment output is a ranking hint with
  provenance, not a fact; the caregiver can correct it from the record's
  edit surface.

This is the only path that sends an adult-supplied name or photo off the
device, and only while online, and only the entity's own fields. It is not
the communication log — learner history never leaves the device
(`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 4.1).

**DECIDED 2026-09-22** (not built). With Jev sharing on, an entity can
appear in a Jev request as a candidate or in the sentence so far. It goes
as an opaque key with its category and enrichment description ("family pet
dog"), never its spoken name or photo
(`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 3.2). Jev learns
*what* Cooper is, which is what ranking needs, without learning his name.
An unenriched entity goes with its category, or as "a personal word" when
it has none.

The record is what the offline ranker reads when the classifier cannot
run: the cached judgment of a model that saw the picture.

---

## 3. What the child can do with it

**DECIDED 2026-09-22** (not built).

- Open any group the entity is in (the one it was added in, My Words, or a
  group classification added). The entity is there, photo and name, at a
  fixed slot. Leaving the group restores the same core indices.
- The predictive strip may offer the entity. Layout cap and stack order stay
  in `docs/product/Motor_Grid_And_Art.md`. The first strip is local: the
  sentence so far and recency. Cloud classification is not required to add or
  to offer.

---

## 4. Bans

These are the negative tests for the customization slice.

| Ban | Negative test |
| --- | --- |
| An add writes the core coordinate map | Snapshot the map, save an entity, deep-compare. The map is unchanged. |
| An add inserts a lexicon row | Sense count is unchanged by the save. |
| A group open, an Edit-mode move, or a strip offer writes the core map | Same snapshot compare. |
| An entity ends up in no group | Remove it from its last group, or delete that custom group; it is in My Words. |
| Classification moves or removes an adult placement | After `placeFromEnrichment`, every prior `group_cell` of the entity is unchanged. |
| The save path performs a network call | With the network unavailable the save succeeds; no request is attempted. |
| The add form asks the adult something a model can infer, or where to file | The form collects a name (catalog match or new), and for a new entity an optional photo and hint. No type, pronoun, edge, category, or folder UI. |
| Enrichment gates or blocks a save | Enrichment is a deferred background job; the entity is fully usable with none. |
| Enrichment silently rewrites the adult's facts | It never edits `spoken_name` or the photo; a rename or photo change supersedes it. |
| An entity's name or photo leaves the device outside enrichment | The only off-device transmission of `spoken_name`, hint, or photo is the enrichment call. A captured Jev request body contains the entity's key and description, not its `spoken_name`. |
