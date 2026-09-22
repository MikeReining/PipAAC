# Language and voice schema

**DECIDED 2026-09-22.** Accepted the same day it was proposed, with the
amendments in § 12. Playback in § 7 was confirmed in review the same day.
Phase 002 stays the critical path
(`docs/phases/002_Core_Board_And_Customize.md`).

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

Device tables (profile, personal entity, overrides) are created
empty on first launch. They are never in the shipped JSON. Cooper's name
and a caregiver's recording stay on this iPad. Phase 002 already requires
the add to work with the network off and without an account
(`docs/product/Personal_Entities.md`).

Partner-microphone audio stays out of this file. That rule is
speech-to-text in memory
(`docs/strategy/Dual_Engine_Predictive_Intelligence.md`). It does not
describe the clips the device plays when a cell is tapped.

`created_at` and `updated_at` wait. The database carries its version in
`PRAGMA user_version`; a separate `schema_version` table is not needed to
mint ids.

---

## 4. Ids and normalization

Prefixes are fixed so a JSON id and a SQLite id name the same kind of row.

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
| `enr_` | entity enrichment |
| `ovr_` | clip override |

Every id is `GLOB '<prefix>*'` with at least one character after the
prefix. `GLOB` is case-sensitive. SQLite `LIKE` is not, so `LIKE` is not
the check.

Catalog ids are minted deterministically by the generator — `sns_`,
`utt_`, `lbl_` from the catalog slot number, `cel_` from layout and
slot_index — so the same source always produces the same ids and the
shipped JSON diffs cleanly. Device-row ids (`prf_`, `ent_`, `enr_`,
`ovr_`) are minted on-device.

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
    category IN (
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
      'Social Etiquette, Pragmatic Interjections & Urgent/Safety',
      'Function Words & Grammar',
      'Numbers & Counting'
    )
    OR (tier = 'root_core' AND category IS NULL)
  )
);
```

Those role and archetype tokens are the lexicon's own words.
`Yellow` is the yellow/orange Fitzgerald role, `Pink` is pink/magenta, and
`Red` is the red or black-outline role
(`docs/product/Motor_Grid_And_Art.md`). For `primary_fringe`, `category`
seeds the sense's built-in group. For `root_core` it is a group
*cross-listing*: the word keeps its core coordinate and also appears
inside that group — a group is a view, not an exclusive home — so `hurt`
sits on the board and inside Body, Health & Hygiene. Root-core sectors stay on the coordinate map
(`docs/product/Core_Coordinate_Map.md`).

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
    'Adjective', 'Adverb', 'Conjunction', 'Determiner', 'Interjection',
    'Noun', 'Number', 'Preposition', 'Pronoun', 'Verb'
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
accident in the 677.

An alias speaks its own `utterance_id`. It does not fall through to the
lemma. If two labels should play one recording, they store the same
utterance id. A button that shows `couch` and says `sofa` is a wrong word.
v1 has no alias rows. Cells display the approved lemma.

Homograph senses share one utterance row — `utterance` is unique on
`(locale, normalized_spoken_text)`. The launch catalog has three shared
rows: `orange` (fruit #131, color #509), `bathroom` (room #158, urgent
interjection #606), and `light` (weight #521, color #552). Exactly one label
per shared normalized text carries `default_for_text = 1` — the lowest
catalog slot — which is the label lookups and typed-word completions resolve
to. The non-default senses stay reachable through their groups and cells.

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

The shipped catalog has one active default voice, locale `en`, source
`bundled`, display name `Default`. It may have zero clips when the board
first draws. A missing clip under that voice is silence. The device does
not fill the hole with another speaker.

`voice` is a catalog table, but a `device_tts` row is minted on the device
and is never shipped in the catalog JSON — the engine id is
platform-specific. A `device_tts` voice has no clip rows. The clip-insert
trigger rejects one. Choosing that voice speaks every utterance through
`engine_id`. It never patches a gap inside the bundled voice.

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

The motor index for one root-core sense in one named layout. Layout law
stays in `docs/product/Motor_Grid_And_Art.md`; slot assignments live in
`docs/product/Core_Coordinate_Map.md`. At a chosen density and orientation
the index does not move. This table stores the index. It does not store
pixels, and it does not decide which sense sits in which slot.

```sql
CREATE TABLE core_cell (
  id TEXT PRIMARY KEY CHECK (id GLOB 'cel_*'),
  layout TEXT NOT NULL CHECK (length(layout) > 0),
  sense_id TEXT NOT NULL REFERENCES sense(id),
  slot_index INTEGER NOT NULL CHECK (slot_index >= 0),
  UNIQUE (layout, slot_index),
  UNIQUE (layout, sense_id)
);
```

`layout` exists because density switching is a decided product feature: a
sparser or denser board is a different map of the same senses, not a move
within one map. Slice 1 writes the `grid60` rows (60) and the `grid90`
rows (83) from `docs/product/Core_Coordinate_Map.md`.

The insert trigger rejects a sense whose tier is not `root_core`. A fringe
word, a personal entity, and a strip tile do not get a row. One sense, one
cell per layout. Filling a slot does not move another.

---

## 6. Device tables, indexes, triggers

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
not a sense and not a catalog image.

```sql
CREATE TABLE personal_entity (
  id TEXT PRIMARY KEY CHECK (id GLOB 'ent_*'),
  spoken_name TEXT NOT NULL CHECK (length(spoken_name) > 0),
  photo_key TEXT,
  category TEXT CHECK (category IS NULL OR category IN (
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
    'Social Etiquette, Pragmatic Interjections & Urgent/Safety',
    'Function Words & Grammar',
    'Numbers & Counting'
  )),
  hint TEXT
);
```

There is no `type` column, no `pronoun` column, and no edge table. The
adult supplies facts a model cannot know — the name, the photo, an
optional hint. Filing is a `group_cell` row in the group the add started
in — the place is the picker — or a second row from classification when
the device is online; an entity in no group sits in My Words
(`docs/product/Personal_Entities.md` § Filing).
Strip relevance is computed live: sentence position and recency
on-device, the classifier when online. The only stored semantics are the
enrichment rows below — cached model output with provenance, never an
authored table.

Changing `spoken_name` or `photo_key` supersedes that entity's ready
override and ready enrichment in the same write. The old recording spoke
the old name, and the old enrichment described the old input.

### 6.2b Entity enrichment

The cached output of the write-time enrichment call defined in
`docs/product/Personal_Entities.md` § Enrichment: Muse Spark
(`meta/muse-spark-1.3-contributor`, multimodal, via OpenRouter) reading
the entity's photo, name, and hint once per entity. A device row, never
shipped.

```sql
CREATE TABLE entity_enrichment (
  id TEXT PRIMARY KEY CHECK (id GLOB 'enr_*'),
  entity_id TEXT NOT NULL REFERENCES personal_entity(id),
  description TEXT,
  category_suggestion TEXT CHECK (category_suggestion IS NULL OR category_suggestion IN (
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
    'Social Etiquette, Pragmatic Interjections & Urgent/Safety',
    'Function Words & Grammar',
    'Numbers & Counting'
  )),
  associations TEXT,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'abstained', 'superseded'))
);
```

`associations` is a JSON array of `sns_` ids: the model's related-word
list resolved against `label` at write time. Entries that resolve to no
loaded sense are dropped, not stored. `category_suggestion` may be applied
to `personal_entity.category` only when that column is null — filing the
adult established by context is not overridden by inference. `abstained`
rows record a deliberate no-answer so the job is not retried forever.

### 6.2c Event log

Selection events feed the local candidate funnel's recency and
routine/time-of-day histogram
(`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.2). Ids only —
never the English string (ban: spelling is not a key).

```sql
CREATE TABLE learner_event_log (
  id INTEGER PRIMARY KEY,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('sense', 'entity')),
  item_id TEXT NOT NULL CHECK (length(item_id) > 0),
  selected_at INTEGER NOT NULL CHECK (selected_at > 0)
);

CREATE INDEX event_log_item ON learner_event_log(item_kind, item_id, selected_at);
CREATE INDEX event_log_time ON learner_event_log(selected_at);
```

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
The insert trigger enforces `recorded_text` matching the utterance's
`spoken_text` or the entity's `spoken_name` at write time — the same
invariant `clip` already enforces, not a read-time hope.

### 6.3b Group map

```sql
CREATE TABLE board_group (
  id TEXT PRIMARY KEY CHECK (id GLOB 'grp_*'),
  kind TEXT NOT NULL CHECK (kind IN ('builtin', 'my_words', 'custom')),
  name TEXT NOT NULL CHECK (length(name) > 0),
  glyph TEXT,
  photo_key TEXT,
  index_slot INTEGER NOT NULL UNIQUE CHECK (index_slot >= 10 AND index_slot < 60)
);

CREATE TABLE group_cell (
  group_id TEXT NOT NULL REFERENCES board_group(id),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('sense', 'entity')),
  item_id TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 0 CHECK (page >= 0),
  slot_index INTEGER NOT NULL CHECK (slot_index >= 2 AND slot_index <= 58),
  PRIMARY KEY (group_id, item_kind, item_id),
  UNIQUE (group_id, page, slot_index),
  CHECK ((item_kind = 'sense' AND item_id GLOB 'sns_*')
      OR (item_kind = 'entity' AND item_id GLOB 'ent_*'))
);
```

One container type: built-in groups (seeded from `data/group_seed.json`),
My Words, and caregiver custom groups are all `board_group` rows; items —
senses or entities — sit at fixed `(page, slot_index)` in `group_cell`.
The group index is a second coordinate map: `index_slot` gets the same
motor-memory law as `core_cell`. Index slots 0–9 are pinned nav cells;
groups occupy 10–59. On a group page, slots 0, 1, and 59 are pinned
(`← Groups`, the Edit-mode action, `Next ›`); items occupy 2–58 — 57 per
page. All writes go through `public/shared/groups.mjs`; the import doubles
as the reconcile, so a caregiver's moves are never overwritten and a
seeded item is never dropped.

**Change note (2026-09-22, phase 003):** these tables replace `zone_slot`,
`custom_group`, and `group_item`. A device DB persisted under that schema
is migrated by `migrateLegacyGroups` on boot — custom groups keep their
id, name, photo, and index position; legacy `group_item` order becomes
`group_cell` order; entities keep their groups.

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

CREATE UNIQUE INDEX enrichment_one_ready
  ON entity_enrichment(entity_id)
  WHERE status = 'ready';
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

CREATE TRIGGER override_recorded_text_matches
BEFORE INSERT ON clip_override
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'override recorded_text must equal utterance.spoken_text')
  WHERE NEW.utterance_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM utterance
    WHERE utterance.id = NEW.utterance_id
      AND utterance.spoken_text = NEW.recorded_text
  );
  SELECT RAISE(ABORT, 'override recorded_text must equal entity spoken_name')
  WHERE NEW.entity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM personal_entity
    WHERE personal_entity.id = NEW.entity_id
      AND personal_entity.spoken_name = NEW.recorded_text
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

CREATE TRIGGER entity_input_change_supersedes_enrichment
AFTER UPDATE OF spoken_name, photo_key ON personal_entity
FOR EACH ROW
WHEN NEW.spoken_name != OLD.spoken_name
   OR NEW.photo_key IS NOT OLD.photo_key
BEGIN
  UPDATE entity_enrichment
    SET status = 'superseded'
    WHERE entity_id = NEW.id AND status IN ('ready', 'abstained');
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
it is 677 numbered rows: 83 root-core plus 594 fringe. The filename
rounds; the 2026-09-22 amendments added the function-word layer
(auxiliaries, determiners, conjunctions, object pronouns, numerals) the
original list lacked, then cleaned compound spoken texts, merged the split
1–10 numerals into the word forms `one`–`ten`, and added 28 everyday fringe
words (slots 657–684).

The catalog generator emits:

- 677 senses, 674 English utterances, and 677 approved English lemma labels, generated from that catalog — homograph senses share one utterance row (§ 5.3). For each launch lemma, `label.text` equals `utterance.spoken_text`. The markdown list stays the human source. Ids are assigned deterministically at generation (§ 4).
- `core_cell` rows per `docs/product/Core_Coordinate_Map.md`: 83 for `grid90`, 60 for `grid60`. **Amended 2026-09-22:** the device import carries all 677 senses — labels only, no art required. An empty groups surface was a broken first-run experience (founder ruling); the earlier tier filter gated on illustrations, which labels do not need.
- One default bundled voice, locale `en`, and one clip per utterance: WorkbookBench recordings where the catalog has them, ElevenLabs (`eleven_v3`, the WorkbookBench voice id and settings) for misses.
- One profile pointing at that voice.
- No second locale, no alias rows, no voice picker, no override recorder.

One device-local `device_tts` voice (`engine_id` for the platform speech
synthesizer) may be created on-device so the board can speak during the
Cooper proof — without it, every tap including Cooper's name is silence.
It is a device row, never a catalog row, and it never mixes with bundled
clips (§ 5.5, § 7).

Personal entities store name, optional photo, optional hint, and a
nullable category (§ 6.2). Enrichment rows (§ 6.2b) are written by the
background job, once per entity, when the network is available. There are
no edge rows to write.

The cell shows the English label and the Fitzgerald color from the sense.

### 9.1 History

The sketch in `docs/strategy/Dual_Engine_Predictive_Intelligence.md` stores
`selected_token` and `concept_id` as English strings (`no`, `pancakes`).
When that store is created, those columns hold a sense id or a personal
entity id. This proposal does not otherwise redesign prediction.

---

## 10. Out of scope

- Building recordings, a voice picker, or a recorder.
- Conjugations and the morphological flow in `docs/strategy/Vision.md`. A later inflected form is another label and, when it sounds different, another utterance. **Amended 2026-09-22:** now scheduled; see § 13.5 item 2 and `docs/phases/005_Word_Forms.md`.
- Phrase attributes, captions, and workbook-style paste.
- Accounts, sync, and a second device.
- Timestamps and a `schema_version` table (`PRAGMA user_version` carries the version).
- Semantic edge storage. Strip relevance is computed — sentence position and recency on-device, the classifier when online. `entity_enrichment` is a cached model judgment consumed as a hint, not an authored link table.
- Rewriting the prediction math.

---

## 11. Bans

| Ban | Negative test |
| --- | --- |
| The English spelling is the primary key of a cell or a history row | `core_cell.sense_id` is an `sns_` id. |
| A label column holds the one recording | `label` has no audio pointer. Two ready clips of one utterance differ by `voice_id`. |
| Two ready clips share `(voice_id, utterance_id)` | `clip_one_ready` rejects the second. |
| A clip's locale disagrees with its voice | `clip` has no locale column. The insert trigger aborts a voice/utterance locale mismatch. |
| A missing bundled clip plays a different voice | Preferred voice is the bundled default, clip absent: that slot is silence. |
| No label exists for the profile locale | Playback is silence. The English label is not selected. |
| A sentence-bar miss drops the word | Five selected items always produce five timeline slots. A silent item lasts 400 ms. |
| `apple juice` is assembled from `apple` and `juice` | The clip's utterance `spoken_text` is `apple juice`. |
| An alias speaks the lemma unless it points at the lemma's utterance | An alias with its own utterance plays that utterance. |
| A renamed utterance keeps playing the old bytes | The rename trigger sets those clips `superseded`. `recorded_text` no longer matches, so playback is silence. |
| A personal name is inserted as a sense | Saving Cooper leaves the sense count unchanged. |
| The add form asks the adult what a model can infer | `personal_entity` has no `type`, no `pronoun`, and no edge table. |
| An authored edge table decides strip relevance | No such table exists; ranking inputs are sentence position, recency, cached enrichment, and live classification. |
| Enrichment gates or blocks a save | The save writes no enrichment row and attempts no network call; the job is deferred. |
| Enrichment silently rewrites the adult's facts | It never edits `spoken_name` or `photo_key`; a name or photo change supersedes its rows. |
| A stale enrichment survives a rename or re-photo | `entity_input_change_supersedes_enrichment` marks them `superseded`. |
| An override is copied into the shipped catalog JSON | The import file has no `clip_override` rows and no Cooper audio. |
| A profile names a Spanish voice while `locale` is `en` | The profile insert trigger aborts. |
| A retired voice stays selected | The retire trigger aborts until profiles are repointed. |
| A second sense is minted because the first drawing was weak | One sense; the new picture becomes `default_image_id`. |
| Readable letters in a catalog picture | An approved image fails review if it contains text. |
| A fringe sense is inserted into `core_cell` | `core_cell_root_only` aborts. |

---

## 12. Amendments on acceptance (2026-09-22)

Accepted in founder review the day it was proposed. The amendments:

1. `core_cell` gained `layout`. Density switching is a decided product
   feature; one column now avoids a UNIQUE migration later.
2. `personal_entity` lost `type`, `pronoun`, and the edge table. The add
   form collects name, photo, and an optional hint; filing comes from
   context or classification. Semantics are computed, not stored.
3. `clip_override` gained the write-time `recorded_text` trigger that
   `clip` already had.
4. A device-local `device_tts` voice is allowed in the first build so the
   proof board can speak. It remains a device row.
5. Catalog ids are deterministic (§ 4); `PRAGMA user_version` carries the
   schema version.
6. `entity_enrichment` added later the same day: the write-time
   enrichment layer (Muse Spark via OpenRouter, once per entity,
   abstention valid, superseded on name/photo change). Jev remains the
   read-time ranker; enrichment is the cached semantic record it — and
   the offline ranker — reads.
7. `learner_event_log` added when slice 3 needed it: selection events
   keyed by id (`item_kind`, `item_id`, `selected_at`) feeding the local
   funnel's recency and time-of-day histogram. DDL is applied with
   `IF NOT EXISTS` so boot is idempotent on an existing database;
   `PRAGMA user_version` still carries the schema version for future
   real migrations.

---

## 13. Locale readiness (review 2026-09-22)

Founder question: is the core built correctly for German, Spanish, and
French? Answer: **the schema is; the runtime and a few seams are not yet.**
Fixes are routed to `docs/archive/phases/003b_Groups_Language_Followup.md`
(complete) and `docs/phases/004_Keyboard.md`.

### 13.1 What is already right

**BUILT** (schema at `fb5a8d7`, `src/board/schema.sql`):

- `sense` has no text and no locale. Role, art, tier, and coordinates hang
  on the sense, so *want* and *quiero* are one button in one place.
- `utterance`, `label`, and `voice` carry `locale`. The triggers
  `label_locale_matches_utterance`, `clip_matches_voice_and_utterance`,
  and `profile_voice_is_active_same_locale` (plus their `_on_update`
  twins) reject every cross-locale mix at write time.
- `voice_one_active_default` allows one default voice per locale.
- `learner_event_log` stores ids only, so usage history survives a locale
  switch and works for bilingual profiles.
- Pictures carry no readable text (§ 1), so art travels.
- `core_cell.layout` is free text, so a per-locale layout can exist without
  a schema change.

### 13.2 Gaps and where they are fixed

| Gap | Status | Fix |
| --- | --- | --- |
| Runtime reads `learner_profile.locale`; `resolveProfile` implements § 7.1 and every label query and `clipKeyFor` bind the profile locale/voice; a check-fast gate bans the literals | **BUILT** (cfcd0a9) | `public/shared/profile.mjs`, `scripts/check_locale_literals.mjs` |
| `speak()` sets `u.lang` to the profile locale; `document.documentElement.lang` follows at boot | **BUILT** (cfcd0a9) | `public/board.js` |
| Built-in group names come from the `group_label` catalog table per locale; `board_group.name` is the caregiver override (NULL for built-ins); stored seed names are NULLed by `migrateBuiltinGroupNames` | **BUILT** (f203693) | `data/group_seed.json`, `public/shared/groups.mjs` |
| Strip grammar is per locale (`GRAMMAR` keyed by locale); the infinitival-*to* rule matches the tail's sense id, never the English text | **BUILT** (5c971c4) | `public/shared/funnel.mjs` |
| Keyboard letters, punctuation, capitals, and spelling rules are English | **DECIDED 2026-09-22** (not built) | 004: per-locale key maps, accent-insensitive matching, per-locale sound keys and fixtures |
| Digits have no language-neutral path to number senses | **DECIDED 2026-09-22** (not built) | 004 slice 2: digit **alias labels** per locale (below) |
| No inflected forms (*wants*, *went*, *played* are missing) | **DECIDED 2026-09-22** (not built) | `docs/phases/005_Word_Forms.md` |
| Audio file slugs keep only `a–z0-9` | **DECIDED 2026-09-22** (not built) | 005 slice 2 |

### 13.3 Amendment — digit aliases

**DECIDED 2026-09-22** (not built). § 9 "no alias rows" is amended for one
case: the build emits approved `alias` labels `1`–`10` per locale from
`data/number_aliases.json`, on the matching `Number` sense and pointing at
the lemma's utterance. Typing `3` then finds the *three* sense in any
locale. No other alias rows are added by this amendment.

### 13.4 Rules for every future language

**DECIDED 2026-09-22** (not built):

- **No English in code or device data.** Code references catalog content by
  sense id. Display text comes from locale-keyed catalog rows or from the
  caregiver. Build-time sources may use English lemmas as authoring keys
  only if the build resolves each to exactly one sense and fails otherwise.
- **`sense.category` is an internal key.** It is never displayed.
- **Locale tags are BCP 47.** Market variants that differ in content use a
  region subtag (`es-MX` *jugo* vs `es-ES` *zumo*; `de-CH` has no `ß`).
  Resolvers try the exact tag, then the language subtag, and never another
  language.
- **A locale ships complete or not at all** for: partner-row senses,
  built-in group names, digit aliases, and one active default voice. The
  build fails otherwise.

### 13.5 Rulings for the first second language

**DECIDED 2026-09-22** (founder: "All approved, proceed"; not built). Items
1, 3, 4, and 5 execute in the first non-English phase. Item 2 is its own
phase, built in English first: `docs/phases/005_Word_Forms.md`.

1. **Mirror shared meanings; give grammar words per-language slots.**
   - Each language's core list is built natively from that language's
     child-language research, never by translating English (Spanish: Soto &
     Cooper 2021; German: the Cologne Kernvokabular, Boenisch & Sachse).
   - A native core word that means the same as an existing sense maps to it
     and keeps that sense's coordinate in every layout (*want* / *quiero* /
     *will*). Bilingual children keep one motor plan.
   - Grammar words with no shared meaning (*der/die/das*, Spanish *a* and
     *para*, *se*) become locale-only senses. They go in a per-locale layout
     (`core_cell.layout = 'grid60.de'`) whose differing slots sit where the
     English grammar words sit. Every other slot is identical to `grid60`.
   - Gate: the build prints the percentage of slots identical to `grid60`
     and fails if a shared-meaning sense sits at a different slot. We push
     the percentage up, but never by dropping a word the language needs on
     its home page (AssistiveWare's Spain Spanish needed a larger grid to fit
     every subject pronoun).
   - German articles are separate core buttons in v1. Case forms (*den*,
     *dem*) come through word forms (item 2).
2. **Word forms: a tap gives the base form, one more tap shows the forms.**
   Forms are `label` rows of kind `form` with UniMorph `features` and their
   own utterance and clip in the same voice. A Forms key sits next to ⌫ in
   the top bar; the strip shows up to 4 forms ranked by per-locale context;
   the child chooses. No long-press, no modal, no automatic replacement
   (automatic agreement is a later per-profile option). This amends § 10:
   morphology is no longer out of scope. Each language supplies its own
   forms data; picking a dataset is a licensing decision for the founder.
3. **Normalizer v2 = Unicode full case folding** (CaseFolding.txt, status
   C + F: `ß → ss`), then NFC, then the v1 whitespace rules. JS has no full
   case fold, so the fold table is generated from the Unicode data file and
   committed. v2 applies to every locale at once. Normalized columns are
   catalog-only, and the catalog is replaced on import, so no device
   migration is needed.
4. **Split the lexicon source** as the first slice of the first
   non-English phase: `data/senses.json` (language-neutral: id, role, art,
   tier, category, art prompt) plus `data/labels/<locale>.json` (text, part
   of speech, keyed by sense id). The build fails on an unknown or duplicate
   id. `Initial_Vocabulary_600.md` becomes the English label source or a
   generated view. Also fix `slug()` in the audio scripts, which keeps only
   `a–z0-9` (see `docs/phases/005_Word_Forms.md` slice 2).
5. **Bilingual profiles:** one profile with a primary and a secondary
   locale (a voice each). A one-tap language switch at the left end of the
   sentence bar, shown only on bilingual profiles; unlike the keyboard
   setting, choosing a language is communication, so the child can reach it.
   Code-switching inside a sentence is allowed: each sentence item stores
   the locale it was chosen in and plays in that locale. The two voices
   should be the **same speaker** (ElevenLabs multilingual voices allow
   this), which keeps the "one voice, one speaker" rule in § 2.
