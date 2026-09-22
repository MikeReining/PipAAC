# Language and voice schema

**Status:** Proposed. For review. Not executing.

**PROPOSED.** The tables are not a founder ruling and nothing here is built.
Phase 002 stays the critical path (`docs/phases/002_Core_Board_And_Customize.md`).

**Confirmed in review 2026-09-22.** Playback in § 7: the bundled voice stays
silent where a clip is missing, a different speaker is heard only when the
profile selects that voice for the whole library, and a caregiver override
wins for that one item in every voice. This revision adds the locale miss,
the sentence-bar pause, and the constraints that keep those rules true
after slice 1 stores ids.

Studied against WorkbookBench's global media catalog: one language-independent
sense, localized labels, one shared picture, audio that does not cross
languages. Their catalog cannot offer two selectable recordings of the same
word in the same language. That is the gap this schema fills.

---

## 1. What we keep

| Law | What it means here |
| --- | --- |
| One sense per meaning | `bat` the animal and `bat` the sport are two senses and two pictures. A weak drawing replaces the picture. It does not mint a second sense. |
| Labels are not meanings | English `want` and a later Spanish label are two labels on one sense. The motor cell is the sense. |
| One default picture per sense | Every language shows that picture. A picture contains no readable letters, so it can travel. |
| Audio is the exact utterance | `apple juice` is one recording of the phrase. It is never the `apple` file followed by the `juice` file. |
| A miss is a miss | Lookup never borrows another language, and never stitches clips to fake a phrase. |
| Retire, never delete | A replaced picture or recording changes status. The bytes stay. |
| Text stays out of ids | Ids are opaque and prefixed. The English word lives on the label and the utterance. |

---

## 2. The gap

WorkbookBench hangs one selectable recording on the label. A second recording
of the same word may sit in the file, and playback ranks the pile down to
one. A second voice is a collision, not a choice. That path once stored
hundreds of second-voice takes that no screen could offer.

Pip AAC chooses a person for the whole library. One default English voice
ships first. A young voice or an adult voice is another voice row plus its
own clips. A caregiver recording is a sparse override of one utterance or
one personal name, not a second copy of the library.

Inside one voice, one speaker. Mixing two people inside the voice the child
has selected is the defect. A second person is a second voice.

---

## 3. One database

Runtime is one on-device SQLite file. Catalog rows and device rows live in
it together, so a profile can reference a voice with a real foreign key.

The shipped catalog is a JSON import of the catalog tables only: sense,
image, utterance, label, voice, clip, core cell. Import opens a connection
with `PRAGMA foreign_keys = ON` and inserts in the order in § 6. A file
that violates a constraint does not ship. JSON has no partial indexes.
SQLite is the enforcement.

Device tables (profile, personal entity, edges, overrides) are created
empty on first launch. They are never in the shipped JSON. Cooper's name
and a caregiver's recording stay on this iPad. Phase 002 already requires
the add to work with the network off and without an account
(`docs/product/Personal_Entities.md`).

Partner-microphone audio stays out of this file. That rule is
speech-to-text in memory
(`docs/strategy/Dual_Engine_Predictive_Intelligence.md`). It does not
describe the clips the device plays when a cell is tapped.

`created_at`, `updated_at`, and a `schema_version` table wait. They are
not needed to mint ids.

---

## 4. Ids and normalization

**PROPOSED.** Prefixes are fixed now so a JSON id and a SQLite id name the
same kind of row.

| Prefix | Row |
| --- | --- |
| `sns_` | sense |
| `img_` | image |
| `utt_` | utterance |
| `lbl_` | label |
| `voi_` | voice |
| `clp_` | clip |
| `cel_` | core cell |
| `prf_` | learner profile |
| `ent_` | personal entity |
| `ovr_` | clip override |

Every id is `GLOB '<prefix>*'` with at least one character after the
prefix. `GLOB` is case-sensitive. SQLite `LIKE` is not, so `LIKE` is not
the check.

### Normalization `v1`

Used for uniqueness only. The spoken string and the button text stay
verbatim, including the space in `apple juice`.

`normalize_v1(text)`:

1. Unicode NFC.
2. Trim the ends.
3. Unicode casefold.
4. Collapse every whitespace run to one U+0020 space.
5. Leave apostrophes and hyphens in place. Do not stem. Do not strip other punctuation.

The locale is not an input in v1. A later language that needs a different
fold is a new version, not a quiet edit of v1. Every normalized column
stores `normalizer_version = 'v1'`. A mixed version fails its check.
WorkbookBench refused to store the normalized form because a copy with no
version goes stale in silence. The version is what makes the column safe,
and the column is what the unique index actually enforces.

---

## 5. Catalog tables

**PROPOSED.**

### 5.1 Sense

Language-independent meaning. Fitzgerald color, tier, fringe category, and
the default picture point here. A coordinate does not.

```sql
CREATE TABLE sense (
  id TEXT PRIMARY KEY CHECK (id GLOB 'sns_*'),
  fitzgerald_role TEXT NOT NULL
    CHECK (fitzgerald_role IN ('Yellow', 'Green', 'Blue', 'Pink', 'Red')),
  art_archetype TEXT NOT NULL
    CHECK (art_archetype IN ('Stick Figure', 'Illustrated Object', 'Diagrammatic')),
  tier TEXT NOT NULL CHECK (tier IN ('root_core', 'primary_fringe')),
  category TEXT,
  default_image_id TEXT REFERENCES image(id),
  CHECK (
    (tier = 'root_core' AND category IS NULL)
    OR (tier = 'primary_fringe' AND category IN (
      'Food & Drink',
      'Body, Health & Hygiene',
      'Feelings, Emotions & Sensory States',
      'Daily Actions & Activity Verbs',
      'People, Family & Roles',
      'Places, Rooms & Community',
      'Toys, Play, Media & Leisure',
      'Home, Household Objects & Daily Tools',
      'Clothing & Accessories',
      'Animals & Nature',
      'Vehicles & Transportation',
      'Descriptors, Adjectives & Opposites',
      'Time, Calendar & Sequencing',
      'Social Etiquette, Pragmatic Interjections & Urgent/Safety'
    ))
  )
);
```

Those role and archetype tokens are the lexicon's own words.
`Yellow` is the yellow/orange Fitzgerald role, `Pink` is pink/magenta, and
`Red` is the red or black-outline role
(`docs/product/Motor_Grid_And_Art.md`). `category` is only the Tier 2
sub-zone. Root-core sectors stay on the coordinate map.

Picture insert order, because each side points at the other:

1. Insert the sense with `default_image_id` null.
2. Insert the image. Its `sense_id` can reference the sense now.
3. Update `sense.default_image_id`.

The update trigger in § 6 rejects an image that belongs to a different
sense. A spare approved image may exist. Only `default_image_id` is shown.
Personal photos are not rows in `image`.

### 5.2 Utterance

The exact thing that is spoken. Stable id. Clips and overrides point here,
not at a spelling that a rename can orphan.

```sql
CREATE TABLE utterance (
  id TEXT PRIMARY KEY CHECK (id GLOB 'utt_*'),
  locale TEXT NOT NULL CHECK (length(locale) > 0),
  spoken_text TEXT NOT NULL CHECK (length(spoken_text) > 0),
  normalized_spoken_text TEXT NOT NULL CHECK (length(normalized_spoken_text) > 0),
  normalizer_version TEXT NOT NULL CHECK (normalizer_version = 'v1'),
  UNIQUE (locale, normalized_spoken_text)
);
```

Two senses whose labels say `bat` share one English utterance. `sofa` and
`couch` do not. Changing `spoken_text` is a new pronunciation: the write
also updates `normalized_spoken_text`, and the trigger in § 6 supersedes
every ready clip and ready override for that utterance in the same
statement sequence. The id stays. Playback stays silent until a new
recording exists whose `recorded_text` equals the new `spoken_text`. The
old bytes remain, status `superseded`, and they are not played.

### 5.3 Label

The word on the button. It points at the utterance it speaks.

```sql
CREATE TABLE label (
  id TEXT PRIMARY KEY CHECK (id GLOB 'lbl_*'),
  sense_id TEXT NOT NULL REFERENCES sense(id),
  utterance_id TEXT NOT NULL REFERENCES utterance(id),
  locale TEXT NOT NULL CHECK (length(locale) > 0),
  text TEXT NOT NULL CHECK (length(text) > 0),
  normalized_text TEXT NOT NULL CHECK (length(normalized_text) > 0),
  normalizer_version TEXT NOT NULL CHECK (normalizer_version = 'v1'),
  kind TEXT NOT NULL CHECK (kind IN ('lemma', 'alias')),
  part_of_speech TEXT NOT NULL CHECK (part_of_speech IN (
    'Adjective', 'Adverb', 'Interjection', 'Noun', 'Preposition', 'Pronoun', 'Verb'
  )),
  default_for_text INTEGER NOT NULL CHECK (default_for_text IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved'))
);
```

`locale` is stored so the unique indexes can see it. The trigger in § 6
rejects a label whose locale disagrees with its utterance. That is the
same class of bug as a clip whose locale disagrees with its voice, which
is why clip does not carry a locale of its own.

Launch lemmas have `text` equal to `utterance.spoken_text`. The columns
are allowed to differ later, so a button can show `3` and speak the
utterance `three` by pointing at that utterance. They must not differ by
accident in the 599.

An alias speaks its own `utterance_id`. It does not fall through to the
lemma. If two labels should play one recording, they store the same
utterance id. A button that shows `couch` and says `sofa` is a wrong word.
v1 has no alias rows. Cells display the approved lemma.

### 5.4 Image

```sql
CREATE TABLE image (
  id TEXT PRIMARY KEY CHECK (id GLOB 'img_*'),
  sense_id TEXT NOT NULL REFERENCES sense(id),
  key TEXT NOT NULL CHECK (length(key) > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  sha256 TEXT NOT NULL CHECK (length(sha256) > 0)
);
```

### 5.5 Voice

A person for the whole library. One locale each.

```sql
CREATE TABLE voice (
  id TEXT PRIMARY KEY CHECK (id GLOB 'voi_*'),
  locale TEXT NOT NULL CHECK (length(locale) > 0),
  display_name TEXT NOT NULL CHECK (length(display_name) > 0),
  source TEXT NOT NULL CHECK (source IN ('bundled', 'device_tts')),
  engine_id TEXT,
  is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  CHECK (source != 'device_tts' OR engine_id IS NOT NULL),
  CHECK (source != 'bundled' OR engine_id IS NULL),
  CHECK (status != 'retired' OR is_default = 0)
);
```

The partial unique index in § 6 allows at most one active default per
locale. The catalog import rejects a locale that has an active voice and
zero defaults. Retiring the current default uses this order, in one
transaction: clear `is_default` on the old row, set `is_default` on the
replacement, repoint any profile that named the old id, then set the old
row `retired`. The retire trigger aborts if a profile still points at it.

The first catalog has one active default voice, locale `en`, source
`bundled`, display name `Default`. It may have zero clips when the board
first draws. A missing clip under that voice is silence. The device does
not fill the hole with another speaker.

A `device_tts` voice has no clip rows. The clip-insert trigger rejects
one. Choosing that voice speaks every utterance through `engine_id`. It
never patches a gap inside the bundled voice.

### 5.6 Clip

One recording of one utterance in one voice.

```sql
CREATE TABLE clip (
  id TEXT PRIMARY KEY CHECK (id GLOB 'clp_*'),
  voice_id TEXT NOT NULL REFERENCES voice(id),
  utterance_id TEXT NOT NULL REFERENCES utterance(id),
  recorded_text TEXT NOT NULL CHECK (length(recorded_text) > 0),
  key TEXT NOT NULL CHECK (length(key) > 0),
  status TEXT NOT NULL CHECK (status IN ('ready', 'superseded')),
  sha256 TEXT NOT NULL CHECK (length(sha256) > 0),
  source TEXT NOT NULL CHECK (length(source) > 0)
);
```

No `locale` column. The voice has the locale. The trigger rejects a clip
whose voice locale disagrees with the utterance locale, and a ready clip
whose `recorded_text` disagrees with `utterance.spoken_text`.

Among ready rows, `(voice_id, utterance_id)` is unique. A replacement
marks the old row `superseded` and inserts a new ready row. Both byte
strings remain.

### 5.7 Core cell

The motor index for one root-core sense. Layout law stays in
`docs/product/Motor_Grid_And_Art.md`: at a chosen density and orientation
the index does not move, and absolute pixels may change when density or
rotation changes. This table stores the index. It does not store pixels,
and it does not decide which sense sits in which slot. Slice 1 writes the
75 rows when that map exists.

```sql
CREATE TABLE core_cell (
  id TEXT PRIMARY KEY CHECK (id GLOB 'cel_*'),
  sense_id TEXT NOT NULL UNIQUE REFERENCES sense(id),
  slot_index INTEGER NOT NULL UNIQUE CHECK (slot_index >= 0)
);
```

The insert trigger rejects a sense whose tier is not `root_core`. A fringe
word, a personal entity, and a strip tile do not get a row. One sense, one
cell. Filling a slot does not move another.

---

## 6. Device tables, indexes, triggers

**PROPOSED.**

### 6.1 Profile

```sql
CREATE TABLE learner_profile (
  id TEXT PRIMARY KEY CHECK (id GLOB 'prf_*'),
  locale TEXT NOT NULL CHECK (length(locale) > 0),
  preferred_voice_id TEXT NOT NULL REFERENCES voice(id)
);
```

Created on first launch, pointing at the active default voice for `en`.
One local profile. No account table. The insert trigger rejects a voice
that is retired or whose locale disagrees with `profile.locale`.

Resolver, if a row is ever stale anyway: use `preferred_voice_id` when
that voice is active and the locales match; otherwise the active default
for `profile.locale`; otherwise silence for every slot. Never a third
voice, and never a voice from another locale.

### 6.2 Personal entity

The record in `docs/product/Personal_Entities.md` stays a record. It is
not a sense and not a catalog image. Edges store sense ids.

```sql
CREATE TABLE personal_entity (
  id TEXT PRIMARY KEY CHECK (id GLOB 'ent_*'),
  spoken_name TEXT NOT NULL CHECK (length(spoken_name) > 0),
  type TEXT NOT NULL CHECK (type IN ('animal', 'person', 'place', 'food')),
  pronoun TEXT,
  photo_key TEXT,
  CHECK (
    (type IN ('place', 'food') AND pronoun IS NULL)
    OR (type IN ('animal', 'person') AND pronoun IN ('he', 'she', 'they'))
  )
);

CREATE TABLE personal_entity_edge (
  entity_id TEXT NOT NULL REFERENCES personal_entity(id),
  sense_id TEXT NOT NULL REFERENCES sense(id),
  PRIMARY KEY (entity_id, sense_id)
);
```

Changing `spoken_name` supersedes that entity's ready override in the
same write. The old recording spoke the old name.

### 6.3 Override

A caregiver recording of one catalog utterance, or of one personal name.
It wins over every catalog voice for that item.

```sql
CREATE TABLE clip_override (
  id TEXT PRIMARY KEY CHECK (id GLOB 'ovr_*'),
  utterance_id TEXT REFERENCES utterance(id),
  entity_id TEXT REFERENCES personal_entity(id),
  recorded_text TEXT NOT NULL CHECK (length(recorded_text) > 0),
  key TEXT NOT NULL CHECK (length(key) > 0),
  status TEXT NOT NULL CHECK (status IN ('ready', 'superseded')),
  CHECK ((utterance_id IS NULL) != (entity_id IS NULL))
);
```

One ready row per utterance. One ready row per entity. A full custom
voice of the library is not a table. The need on the table is a preferred
person for the library, plus an occasional recording of a name or a word.

### 6.4 Indexes

```sql
CREATE UNIQUE INDEX label_one_row_per_sense_text
  ON label(sense_id, locale, normalized_text);

CREATE UNIQUE INDEX label_one_approved_lemma
  ON label(sense_id, locale)
  WHERE kind = 'lemma' AND status = 'approved';

CREATE UNIQUE INDEX label_one_default_text
  ON label(locale, normalized_text)
  WHERE status = 'approved' AND default_for_text = 1;

CREATE UNIQUE INDEX voice_one_active_default
  ON voice(locale)
  WHERE status = 'active' AND is_default = 1;

CREATE UNIQUE INDEX clip_one_ready
  ON clip(voice_id, utterance_id)
  WHERE status = 'ready';

CREATE UNIQUE INDEX override_one_ready_utterance
  ON clip_override(utterance_id)
  WHERE status = 'ready' AND utterance_id IS NOT NULL;

CREATE UNIQUE INDEX override_one_ready_entity
  ON clip_override(entity_id)
  WHERE status = 'ready' AND entity_id IS NOT NULL;
```

### 6.5 Triggers

```sql
CREATE TRIGGER label_locale_matches_utterance
BEFORE INSERT ON label
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'label locale must match its utterance')
  WHERE NOT EXISTS (
    SELECT 1 FROM utterance
    WHERE utterance.id = NEW.utterance_id
      AND utterance.locale = NEW.locale
  );
END;

CREATE TRIGGER clip_matches_voice_and_utterance
BEFORE INSERT ON clip
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'clip voice locale must match utterance locale')
  WHERE (
    SELECT voice.locale FROM voice WHERE voice.id = NEW.voice_id
  ) IS NOT (
    SELECT utterance.locale FROM utterance WHERE utterance.id = NEW.utterance_id
  );
  SELECT RAISE(ABORT, 'device_tts voice has no clips')
  WHERE EXISTS (
    SELECT 1 FROM voice
    WHERE voice.id = NEW.voice_id AND voice.source = 'device_tts'
  );
  SELECT RAISE(ABORT, 'recorded_text must equal utterance.spoken_text')
  WHERE NOT EXISTS (
    SELECT 1 FROM utterance
    WHERE utterance.id = NEW.utterance_id
      AND utterance.spoken_text = NEW.recorded_text
  );
END;

CREATE TRIGGER sense_default_image_same_sense
BEFORE UPDATE OF default_image_id ON sense
FOR EACH ROW
WHEN NEW.default_image_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'default image belongs to another sense')
  WHERE NOT EXISTS (
    SELECT 1 FROM image
    WHERE image.id = NEW.default_image_id
      AND image.sense_id = NEW.id
  );
END;

CREATE TRIGGER core_cell_root_only
BEFORE INSERT ON core_cell
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'core cell requires a root_core sense')
  WHERE NOT EXISTS (
    SELECT 1 FROM sense
    WHERE sense.id = NEW.sense_id AND sense.tier = 'root_core'
  );
END;

CREATE TRIGGER profile_voice_is_active_same_locale
BEFORE INSERT ON learner_profile
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'preferred voice must be active and match profile locale')
  WHERE NOT EXISTS (
    SELECT 1 FROM voice
    WHERE voice.id = NEW.preferred_voice_id
      AND voice.status = 'active'
      AND voice.locale = NEW.locale
  );
END;

CREATE TRIGGER voice_retire_blocks_if_preferred
BEFORE UPDATE OF status ON voice
FOR EACH ROW
WHEN NEW.status = 'retired' AND OLD.status != 'retired'
BEGIN
  SELECT RAISE(ABORT, 'repoint profiles before retiring this voice')
  WHERE EXISTS (
    SELECT 1 FROM learner_profile
    WHERE preferred_voice_id = OLD.id
  );
END;

CREATE TRIGGER utterance_rename_supersedes_audio
AFTER UPDATE OF spoken_text ON utterance
FOR EACH ROW
WHEN NEW.spoken_text != OLD.spoken_text
BEGIN
  UPDATE clip
    SET status = 'superseded'
    WHERE utterance_id = NEW.id AND status = 'ready';
  UPDATE clip_override
    SET status = 'superseded'
    WHERE utterance_id = NEW.id AND status = 'ready';
END;

CREATE TRIGGER entity_rename_supersedes_override
AFTER UPDATE OF spoken_name ON personal_entity
FOR EACH ROW
WHEN NEW.spoken_name != OLD.spoken_name
BEGIN
  UPDATE clip_override
    SET status = 'superseded'
    WHERE entity_id = NEW.id AND status = 'ready';
END;

CREATE TRIGGER label_locale_matches_utterance_on_update
BEFORE UPDATE OF utterance_id, locale ON label
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'label locale must match its utterance')
  WHERE NOT EXISTS (
    SELECT 1 FROM utterance
    WHERE utterance.id = NEW.utterance_id
      AND utterance.locale = NEW.locale
  );
END;

CREATE TRIGGER clip_matches_voice_and_utterance_on_update
BEFORE UPDATE OF voice_id, utterance_id, recorded_text ON clip
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'clip voice locale must match utterance locale')
  WHERE (
    SELECT voice.locale FROM voice WHERE voice.id = NEW.voice_id
  ) IS NOT (
    SELECT utterance.locale FROM utterance WHERE utterance.id = NEW.utterance_id
  );
  SELECT RAISE(ABORT, 'device_tts voice has no clips')
  WHERE EXISTS (
    SELECT 1 FROM voice
    WHERE voice.id = NEW.voice_id AND voice.source = 'device_tts'
  );
  SELECT RAISE(ABORT, 'recorded_text must equal utterance.spoken_text')
  WHERE NOT EXISTS (
    SELECT 1 FROM utterance
    WHERE utterance.id = NEW.utterance_id
      AND utterance.spoken_text = NEW.recorded_text
  );
END;

CREATE TRIGGER profile_voice_is_active_same_locale_on_update
BEFORE UPDATE OF preferred_voice_id, locale ON learner_profile
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'preferred voice must be active and match profile locale')
  WHERE NOT EXISTS (
    SELECT 1 FROM voice
    WHERE voice.id = NEW.preferred_voice_id
      AND voice.status = 'active'
      AND voice.locale = NEW.locale
  );
END;
```

Import order inside one transaction: sense, image, set
`default_image_id`, utterance, label, voice, clip, core cell. Then, on
device, profile. The import rejects the catalog if any locale has an
active voice and no active default. A statement-level "at least one
default" trigger is the wrong tool: the legal retire swap clears
`is_default` before setting it on the replacement, and that intermediate
state is empty on purpose.

---

## 7. Playback

**Confirmed in review 2026-09-22**, with the locale miss and the
sentence-bar pause written in.

`SILENT_SLOT_MS = 400`. A sentence-bar speak emits one timeline slot per
selected item. A slot that resolves to silence contributes 400 ms of
silence and keeps its place. Later words do not start early. The word
stays visible on the bar. Dropping the slot would turn `I want [missing]
juice` into `I want juice`.

### 7.1 Resolve the voice

1. `preferred_voice_id` when that voice is `active` and `voice.locale` equals `profile.locale`.
2. Otherwise the active `is_default` voice for `profile.locale`.
3. Otherwise every slot is silence. No other speaker.

### 7.2 Speak a sense

1. The approved lemma label for that sense whose `locale` equals `profile.locale`. If none: silence. Another locale is never used. English is not a fallback.
2. That label's utterance.
3. A ready override for that utterance whose `recorded_text` equals `spoken_text`: play it.
4. Else if the resolved voice is `bundled` and a ready clip exists for `(voice, utterance)` whose `recorded_text` equals `spoken_text`: play it.
5. Else if the resolved voice is `device_tts`: synthesize `spoken_text`.
6. Else silence.

A surface that displays an alias speaks that alias label's utterance, by
the same steps. It does not substitute the lemma.

### 7.3 Speak a personal entity

1. A ready override for that entity whose `recorded_text` equals `spoken_name`: play it.
2. Else if the resolved voice is `device_tts`: synthesize `spoken_name`.
3. Else silence. The bundled library does not contain Cooper.

### 7.4 Sentence bar

Each selected item is one slot, in order. Voiced slots play their result.
Silent slots last `SILENT_SLOT_MS`. The sequence is not stored as a clip
and is not a claim that a sentence was recorded. A real sentence
recording, if it ever exists, is its own utterance and its own clips,
with `spoken_text` equal to the whole sentence.

---

## 8. Worked examples

| Situation | Picture | What plays |
| --- | --- | --- |
| English `want`, default voice, clip present | The sense's default image | That voice's clip of the `want` utterance |
| Same cell, profile voice changed to a second English voice | Same image, same coordinate | The other voice's clip of that utterance |
| Profile locale has no approved label for this sense | Same image, same coordinate | Silence. The English clip is not played. |
| Spanish label added later on that sense, profile locale `es`, Spanish voice selected | Same image, same coordinate | The Spanish voice's clip of the Spanish utterance |
| `apple juice` | One picture | One clip whose spoken text is `apple juice` |
| `bat` animal and `bat` sport | Two pictures | One shared utterance, so one clip per voice |
| Bundled default voice, this word has no clip yet | Picture and label still show | Silence. On the sentence bar, a 400 ms slot. |
| Sentence `I` / `want` / `juice`, and `want` has no clip | All three stay on the bar | `I`, then 400 ms, then `juice` |
| Adult selects the device text-to-speech voice | Unchanged | Every utterance is synthesized. Bundled clips are not mixed in. |
| Caregiver records Cooper | The entity photo | That recording, in every voice, until the name changes or the override is superseded |
| Caregiver records only `want` | Unchanged | That override for the `want` utterance; every other word follows the preferred voice |

---

## 9. What the first build stores

The lexicon file is named `Initial_Vocabulary_600.md`. The catalog inside
it is 599 numbered rows: 75 root-core plus 524 fringe. 75 + 524 = 599.
The filename rounds. No 600th word was removed.

If this is accepted before slice 1 writes ids:

- 599 senses, 599 English utterances, and 599 approved English lemma labels, generated from that catalog. For each launch lemma, `label.text` equals `utterance.spoken_text`. The markdown list stays the human source. Ids are assigned at generation.
- 75 `core_cell` rows once the coordinate pass in `docs/product/Motor_Grid_And_Art.md` exists. This document does not assign the slot indexes.
- One default bundled voice, locale `en`, and zero clips until recordings exist.
- One profile pointing at that voice.
- No second locale, no alias rows, no voice picker, no override recorder, no device text-to-speech voice on screen.
- Personal entities, when slice 3 arrives, use sense ids on their edges. Overrides wait until a recorder exists.

The cell shows the English label and the Fitzgerald color from the sense.

### 9.1 History

The sketch in `docs/strategy/Dual_Engine_Predictive_Intelligence.md` stores
`selected_token` and `concept_id` as English strings (`no`, `pancakes`).
When that store is created, those columns hold a sense id or a personal
entity id. This proposal does not otherwise redesign prediction.

---

## 10. Out of scope

- Building recordings, a voice picker, or a recorder.
- Conjugations and the morphological flow in `docs/strategy/Vision.md`. A later inflected form is another label and, when it sounds different, another utterance.
- Phrase attributes, captions, and workbook-style paste.
- Accounts, sync, and a second device.
- Timestamps and a schema-version table.
- Rewriting the prediction math.

---

## 11. Bans

| Ban | Negative test |
| --- | --- |
| The English spelling is the primary key of a cell, an edge, or a history row | `core_cell.sense_id` and `personal_entity_edge.sense_id` are `sns_` ids. |
| A label column holds the one recording | `label` has no audio pointer. Two ready clips of one utterance differ by `voice_id`. |
| Two ready clips share `(voice_id, utterance_id)` | `clip_one_ready` rejects the second. |
| A clip's locale disagrees with its voice | `clip` has no locale column. The insert trigger aborts a voice/utterance locale mismatch. |
| A missing bundled clip plays a different voice | Preferred voice is the bundled default, clip absent: that slot is silence. |
| No label exists for the profile locale | Playback is silence. The English label is not selected. |
| A sentence-bar miss drops the word | Five selected items always produce five timeline slots. A silent item lasts 400 ms. |
| `apple juice` is assembled from `apple` and `juice` | The clip's utterance `spoken_text` is `apple juice`. |
| An alias speaks the lemma unless it points at the lemma's utterance | An alias with its own utterance plays that utterance. |
| A renamed utterance keeps playing the old bytes | The rename trigger sets those clips `superseded`. `recorded_text` no longer matches, so playback is silence. |
| A personal name is inserted as a sense | Saving Cooper leaves the sense count at 599. |
| An override is copied into the shipped catalog JSON | The import file has no `clip_override` rows and no Cooper audio. |
| A profile names a Spanish voice while `locale` is `en` | The profile insert trigger aborts. |
| A retired voice stays selected | The retire trigger aborts until profiles are repointed. |
| A second sense is minted because the first drawing was weak | One sense; the new picture becomes `default_image_id`. |
| Readable letters in a catalog picture | An approved image fails review if it contains text. |
| A fringe sense is inserted into `core_cell` | `core_cell_root_only` aborts. |

---

## 12. Where this stands

The playback rule is confirmed, including the locale miss and the 400 ms
sentence-bar slot. The tables, indexes, and triggers are the proposal to
accept before slice 1 stores a sense id. On accept, this contract moves to
a product doc. It does not move the critical path.
