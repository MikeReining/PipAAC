-- Pip AAC schema v1 — docs/product/Language_And_Voice_Schema.md is the owner.
-- Apply with PRAGMA foreign_keys = ON. Version carried in PRAGMA user_version.

CREATE TABLE IF NOT EXISTS sense (
  id TEXT PRIMARY KEY CHECK (id GLOB 'sns_*'),
  fitzgerald_role TEXT NOT NULL
    CHECK (fitzgerald_role IN ('Yellow', 'Green', 'Blue', 'Pink', 'Red')),
  art_archetype TEXT NOT NULL
    CHECK (art_archetype IN ('Stick Figure', 'Illustrated Object', 'Diagrammatic')),
  tier TEXT NOT NULL CHECK (tier IN ('root_core', 'primary_fringe')),
  -- For primary_fringe, category seeds the sense's built-in group. For
  -- root_core it is a group cross-listing: the word keeps its core cell
  -- and also appears inside that group (groups are views, not exclusive
  -- homes).
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

CREATE TABLE IF NOT EXISTS utterance (
  id TEXT PRIMARY KEY CHECK (id GLOB 'utt_*'),
  locale TEXT NOT NULL CHECK (length(locale) > 0),
  spoken_text TEXT NOT NULL CHECK (length(spoken_text) > 0),
  normalized_spoken_text TEXT NOT NULL CHECK (length(normalized_spoken_text) > 0),
  normalizer_version TEXT NOT NULL CHECK (normalizer_version = 'v1'),
  UNIQUE (locale, normalized_spoken_text)
);

CREATE TABLE IF NOT EXISTS label (
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

CREATE TABLE IF NOT EXISTS image (
  id TEXT PRIMARY KEY CHECK (id GLOB 'img_*'),
  sense_id TEXT NOT NULL REFERENCES sense(id),
  key TEXT NOT NULL CHECK (length(key) > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  sha256 TEXT NOT NULL CHECK (length(sha256) > 0)
);

CREATE TABLE IF NOT EXISTS voice (
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

CREATE TABLE IF NOT EXISTS clip (
  id TEXT PRIMARY KEY CHECK (id GLOB 'clp_*'),
  voice_id TEXT NOT NULL REFERENCES voice(id),
  utterance_id TEXT NOT NULL REFERENCES utterance(id),
  recorded_text TEXT NOT NULL CHECK (length(recorded_text) > 0),
  key TEXT NOT NULL CHECK (length(key) > 0),
  status TEXT NOT NULL CHECK (status IN ('ready', 'superseded')),
  sha256 TEXT NOT NULL CHECK (length(sha256) > 0),
  source TEXT NOT NULL CHECK (length(source) > 0)
);

CREATE TABLE IF NOT EXISTS core_cell (
  id TEXT PRIMARY KEY CHECK (id GLOB 'cel_*'),
  layout TEXT NOT NULL CHECK (length(layout) > 0),
  sense_id TEXT NOT NULL REFERENCES sense(id),
  slot_index INTEGER NOT NULL CHECK (slot_index >= 0),
  UNIQUE (layout, slot_index),
  UNIQUE (layout, sense_id)
);

CREATE TABLE IF NOT EXISTS learner_profile (
  id TEXT PRIMARY KEY CHECK (id GLOB 'prf_*'),
  locale TEXT NOT NULL CHECK (length(locale) > 0),
  preferred_voice_id TEXT NOT NULL REFERENCES voice(id),
  keyboard_mode TEXT NOT NULL DEFAULT 'pip' CHECK (keyboard_mode IN ('pip', 'device')),
  keyboard_order TEXT NOT NULL DEFAULT 'standard' CHECK (keyboard_order IN ('standard', 'abc')),
  -- Parent Corner: "Highlight likely next words" — halo up to 3 grid cells
  -- the ranker predicts. Default OFF (docs/product/Design_System.md § States).
  highlight_next INTEGER NOT NULL DEFAULT 0 CHECK (highlight_next IN (0, 1))
);

CREATE TABLE IF NOT EXISTS personal_entity (
  id TEXT PRIMARY KEY CHECK (id GLOB 'ent_*'),
  spoken_name TEXT NOT NULL CHECK (length(spoken_name) > 0),
  -- Retire, never delete (schema § 14.5): Remove on the word card flips
  -- this to 'retired'; the row, photo, recording and placements stay,
  -- and the entity renders nowhere until restored.
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
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

CREATE TABLE IF NOT EXISTS entity_enrichment (
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

-- Selection events feed the local funnel's recency and time-of-day
-- histogram (Dual_Engine §5.2). Ids only — never the English string.
CREATE TABLE IF NOT EXISTS learner_event_log (
  id INTEGER PRIMARY KEY,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('sense', 'entity')),
  item_id TEXT NOT NULL CHECK (length(item_id) > 0),
  selected_at INTEGER NOT NULL CHECK (selected_at > 0)
);

CREATE INDEX IF NOT EXISTS event_log_item ON learner_event_log(item_kind, item_id, selected_at);
CREATE INDEX IF NOT EXISTS event_log_time ON learner_event_log(selected_at);

CREATE TABLE IF NOT EXISTS clip_override (
  id TEXT PRIMARY KEY CHECK (id GLOB 'ovr_*'),
  utterance_id TEXT REFERENCES utterance(id),
  entity_id TEXT REFERENCES personal_entity(id),
  recorded_text TEXT NOT NULL CHECK (length(recorded_text) > 0),
  key TEXT NOT NULL CHECK (length(key) > 0),
  status TEXT NOT NULL CHECK (status IN ('ready', 'superseded')),
  CHECK ((utterance_id IS NULL) != (entity_id IS NULL))
);

-- Groups: one kind of container. The index is a coordinate map (slots
-- 10–59); items sit at fixed (page, slot) inside a group. Positions move
-- only in Edit mode. Owner: docs/product/Motor_Grid_And_Art.md § Groups.
CREATE TABLE IF NOT EXISTS board_group (
  id TEXT PRIMARY KEY CHECK (id GLOB 'grp_*'),
  kind TEXT NOT NULL CHECK (kind IN ('builtin', 'my_words', 'custom')),
  name TEXT CHECK (name IS NULL OR length(name) > 0),
  glyph TEXT,
  photo_key TEXT,
  index_slot INTEGER NOT NULL UNIQUE CHECK (index_slot >= 10 AND index_slot < 60),
  CHECK (kind != 'custom' OR name IS NOT NULL)
);

-- Catalog table: the built-in groups' display names per locale. Shipped
-- with the catalog, replaced on import, never edited on device. The
-- board_group.name column stays NULL for built-ins and My Words until a
-- caregiver renames one — a stored name is always the override.
CREATE TABLE IF NOT EXISTS group_label (
  group_id TEXT NOT NULL CHECK (group_id GLOB 'grp_*'),
  locale TEXT NOT NULL CHECK (length(locale) > 0),
  text TEXT NOT NULL CHECK (length(text) > 0),
  PRIMARY KEY (group_id, locale)
);

CREATE TABLE IF NOT EXISTS group_cell (
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

CREATE UNIQUE INDEX IF NOT EXISTS label_one_row_per_sense_text
  ON label(sense_id, locale, normalized_text);
CREATE UNIQUE INDEX IF NOT EXISTS label_one_approved_lemma
  ON label(sense_id, locale)
  WHERE kind = 'lemma' AND status = 'approved';
CREATE UNIQUE INDEX IF NOT EXISTS label_one_default_text
  ON label(locale, normalized_text)
  WHERE status = 'approved' AND default_for_text = 1;
CREATE UNIQUE INDEX IF NOT EXISTS voice_one_active_default
  ON voice(locale)
  WHERE status = 'active' AND is_default = 1;
CREATE UNIQUE INDEX IF NOT EXISTS clip_one_ready
  ON clip(voice_id, utterance_id)
  WHERE status = 'ready';
CREATE UNIQUE INDEX IF NOT EXISTS override_one_ready_utterance
  ON clip_override(utterance_id)
  WHERE status = 'ready' AND utterance_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS override_one_ready_entity
  ON clip_override(entity_id)
  WHERE status = 'ready' AND entity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS enrichment_one_ready
  ON entity_enrichment(entity_id)
  WHERE status = 'ready';

CREATE TRIGGER IF NOT EXISTS label_locale_matches_utterance
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

CREATE TRIGGER IF NOT EXISTS clip_matches_voice_and_utterance
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

CREATE TRIGGER IF NOT EXISTS override_recorded_text_matches
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

CREATE TRIGGER IF NOT EXISTS sense_default_image_same_sense
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

CREATE TRIGGER IF NOT EXISTS core_cell_root_only
BEFORE INSERT ON core_cell
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'core cell requires a root_core sense')
  WHERE NOT EXISTS (
    SELECT 1 FROM sense
    WHERE sense.id = NEW.sense_id AND sense.tier = 'root_core'
  );
END;

CREATE TRIGGER IF NOT EXISTS profile_voice_is_active_same_locale
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

CREATE TRIGGER IF NOT EXISTS voice_retire_blocks_if_preferred
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

CREATE TRIGGER IF NOT EXISTS utterance_rename_supersedes_audio
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

CREATE TRIGGER IF NOT EXISTS entity_rename_supersedes_override
AFTER UPDATE OF spoken_name ON personal_entity
FOR EACH ROW
WHEN NEW.spoken_name != OLD.spoken_name
BEGIN
  UPDATE clip_override
    SET status = 'superseded'
    WHERE entity_id = NEW.id AND status = 'ready';
END;

CREATE TRIGGER IF NOT EXISTS entity_input_change_supersedes_enrichment
AFTER UPDATE OF spoken_name, photo_key ON personal_entity
FOR EACH ROW
WHEN NEW.spoken_name != OLD.spoken_name
   OR NEW.photo_key IS NOT OLD.photo_key
BEGIN
  UPDATE entity_enrichment
    SET status = 'superseded'
    WHERE entity_id = NEW.id AND status IN ('ready', 'abstained');
END;

CREATE TRIGGER IF NOT EXISTS label_locale_matches_utterance_on_update
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

CREATE TRIGGER IF NOT EXISTS clip_matches_voice_and_utterance_on_update
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

CREATE TRIGGER IF NOT EXISTS profile_voice_is_active_same_locale_on_update
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

PRAGMA user_version = 4;
