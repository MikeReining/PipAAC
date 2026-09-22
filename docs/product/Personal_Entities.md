# Personal entities

**DECIDED 2026-09-22** (revised the same day; not built).
Layout of the grid, the strip, and symbol art: `docs/product/Motor_Grid_And_Art.md`.
Slot assignments: `docs/product/Core_Coordinate_Map.md`.
The 599-word launch lexicon: `docs/product/Initial_Vocabulary_600.md`.
Build order: `docs/phases/002_Core_Board_And_Customize.md`.
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

A second device, a QR introduction, and Cloudflare sync are **PROPOSED**. They
are out of the first build. Direction: `docs/phases/002_Core_Board_And_Customize.md`
§ Out of scope.

---

## 2. The record

**DECIDED 2026-09-22** (not built).

| Field | Rule |
| --- | --- |
| Spoken name | What the device says. Required. |
| Image | A photo from this device, or no photo. A missing photo shows the name and its Fitzgerald color. It does not borrow a competitor symbol. |
| Category | Where the record is filed. Set by where the add started (§ Filing), or by classification when the device is online, or null — the personal zone. The adult is never asked to pick a folder. |
| Hint | Optional free text ("our dog", "grandma", "his school"). Classification input only. Never required. |

There is no type picker, no pronoun picker, and no edge editor. "Type" is
jargon a parent or SLP should never meet; the earlier design that asked the
adult to confirm word relationships made the add harder than the incumbents'
and was removed 2026-09-22.

Color is derived from the Fitzgerald role for nouns (yellow / orange). The adult
does not pick a color. Owner of the color roles: `docs/product/Motor_Grid_And_Art.md`.

### Filing

- An add started inside a category sub-zone files the record into that
  category — the context already answered the question.
- Any other add files the record into **My Words**, the personal zone
  (`category IS NULL`).
- When the device is online, one classifier call may file or re-file the
  record into one of the 14 categories
  (`docs/product/Initial_Vocabulary_600.md` §3). Classification is a
  refinement, never a gate: an offline save never waits on it, and a
  save never performs a network call.

### Wiring — there is no edge table

The adult never links words, and no authored table links them either.
A lookup such as "animal → walk, eat, play" is determinism pretending to be
semantics: a fish does not walk, and four rows cannot hold what a puppy is.

Strip relevance is computed live instead. On-device: the sentence so far and
recency. Online: the classifier evaluates candidates against state in real
time (`docs/strategy/Dual_Engine_Predictive_Intelligence.md`). A personal
entity is reachable from the moment it is saved — through its zone, and
through the strip's recency input — before any classification exists.

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
  unenriched and works anyway — filed in its zone, spoken by name,
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
the communication log — the zero-PII rule for learner history
(`docs/strategy/Dual_Engine_Predictive_Intelligence.md`) is untouched.

The record is what the offline ranker reads when the classifier cannot
run: the cached judgment of a model that saw the picture.

---

## 3. What the child can do with it

**DECIDED 2026-09-22** (not built).

- Open the entity's zone — its category sub-zone, or My Words. The entity is
  there, photo and name. Closing the sub-zone restores the same core indices.
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
| A category open or a strip offer writes the core map | Same snapshot compare. |
| The save path performs a network call | With the network unavailable the save succeeds; no request is attempted. |
| The add form asks the adult something a model can infer | The form collects name, photo, and optional hint. No type, no pronoun, no edge UI. |
| Enrichment gates or blocks a save | Enrichment is a deferred background job; the entity is fully usable with none. |
| Enrichment silently rewrites the adult's facts | It never edits `spoken_name` or the photo; a rename or photo change supersedes it. |
| Entity data leaves the device outside enrichment | The only off-device transmission is the enrichment call itself, online only, entity fields only. |
