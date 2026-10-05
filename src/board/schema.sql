-- Pip AAC schema v1 — docs/product/Language_And_Voice_Schema.md is the owner.
-- Apply with PRAGMA foreign_keys = ON. Version carried in PRAGMA user_version.

CREATE TABLE IF NOT EXISTS sense (
  id TEXT PRIMARY KEY CHECK (id GLOB 'sns_*'),
  fitzgerald_role TEXT NOT NULL
    CHECK (fitzgerald_role IN ('Yellow', 'Green', 'Blue', 'Pink', 'Purple', 'Red', 'None')),
  art_archetype TEXT NOT NULL
    CHECK (art_archetype IN ('Stick Figure', 'Illustrated Object', 'Diagrammatic')),
  tier TEXT NOT NULL CHECK (tier IN ('root_core', 'primary_fringe')),
  -- For primary_fringe, category seeds the sense's built-in group. For
  -- root_core it is a group cross-listing: the word keeps its core cell
  -- and also appears inside that group (groups are views, not exclusive
  -- homes).
  category TEXT,
  default_image_id TEXT REFERENCES image(id),
  -- R21: catalog-owned "no" word flag for the Predict last-slot rule.
  negation INTEGER NOT NULL DEFAULT 0 CHECK (negation IN (0, 1)),
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
  kind TEXT NOT NULL CHECK (kind IN ('lemma', 'alias', 'form')),
  part_of_speech TEXT NOT NULL CHECK (part_of_speech IN (
    'Adjective', 'Adverb', 'Conjunction', 'Determiner', 'Interjection',
    'Noun', 'Number', 'Preposition', 'Pronoun', 'Verb'
  )),
  -- UniMorph-style tag for kind='form' (semicolon-joined: V PRS 3 SG). NULL otherwise.
  features TEXT CHECK (features IS NULL OR length(features) > 0),
  default_for_text INTEGER NOT NULL CHECK (default_for_text IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved')),
  CHECK ((kind = 'form') = (features IS NOT NULL)),
  CHECK (kind != 'form' OR default_for_text = 0)
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
  highlight_next INTEGER NOT NULL DEFAULT 0 CHECK (highlight_next IN (0, 1)),
  -- One Cells setting per profile (014 § 3): the layout the home board,
  -- every group page, and the strip all draw at. Names a coordinate-map
  -- layout (catalog.layouts) — anything unknown renders as grid60.
  board_layout TEXT NOT NULL DEFAULT 'grid60',
  -- Spotlight settings (013 § 4), synced: non-target dim percent, glow
  -- style (0 steady / 1 pulse), default session length in minutes
  -- (0 = until ended — midnight is always the latest bound).
  spot_dim INTEGER NOT NULL DEFAULT 45 CHECK (spot_dim BETWEEN 10 AND 90),
  spot_pulse INTEGER NOT NULL DEFAULT 0 CHECK (spot_pulse IN (0, 1)),
  spot_minutes INTEGER NOT NULL DEFAULT 0 CHECK (spot_minutes >= 0),
  -- Live modeling (013 § 4): silent by default — the adult's voice is
  -- the audio. 1 speaks the modeled word on the child's board too.
  model_speaks INTEGER NOT NULL DEFAULT 0 CHECK (model_speaks IN (0, 1)),
  -- "Help improve Pip" (016 § 6.3, decided 2026-09-23): the whitelisted
  -- daily totals to Pip. Default ON — off means nothing is sent, ever.
  share_research INTEGER NOT NULL DEFAULT 1 CHECK (share_research IN (0, 1)),
  -- The random research id, minted on first send and synced so every
  -- device reports under it. Never the user id, never a device id.
  research_id TEXT CHECK (research_id IS NULL OR research_id GLOB 'res_*'),
  -- Presentation mode (Profile_Presentation_Modes.md): which render the
  -- board shows. Reported in the research whitelist — the display filter
  -- itself lands with its own phase.
  presentation_mode TEXT NOT NULL DEFAULT 'symbol'
    CHECK (presentation_mode IN ('symbol', 'label')),
  -- After Speak (Design_System § Sentence bar): 0 keeps the spoken words
  -- and the next pick adds on, 1 lets the next pick start a fresh bar.
  -- Either way the words stay up for a repeat until that next pick.
  -- No semicolons in comments here: DDL readers stop at the first one.
  fresh_after_speak INTEGER NOT NULL DEFAULT 0 CHECK (fresh_after_speak IN (0, 1)),
  -- Grammar help (021): 1 shows each form-bearing word in the form the
  -- sentence calls for (want -> wants after he). 0 is today's lemma-only
  -- board. Default ON — the SLP turns it off to target endings herself.
  grammar_help INTEGER NOT NULL DEFAULT 1 CHECK (grammar_help IN (0, 1)),
  -- Expressive voice (025 § 6): 1 shows the happy/sad/angry faces in
  -- the smart bar's last slot. 0 speaks everything neutral. Default ON.
  expressive_voice INTEGER NOT NULL DEFAULT 1 CHECK (expressive_voice IN (0, 1)),
  -- Speaking speed (Settings → Talking, 2026-09-29): every word clip and
  -- sentence plays at this rate, pitch kept. Default normal.
  speech_rate TEXT NOT NULL DEFAULT 'normal' CHECK (speech_rate IN ('slower', 'normal', 'faster')),
  -- Groups (027 B6, B8): the home board's top row shows on every group page
  -- (off leaves those cells empty, still reserved), and the four occasion
  -- groups show in the index. Both default ON.
  group_top_row INTEGER NOT NULL DEFAULT 1 CHECK (group_top_row IN (0, 1)),
  occasions_visible INTEGER NOT NULL DEFAULT 1 CHECK (occasions_visible IN (0, 1)),
  -- The person's name (2026-10-02), synced and sealed like every edit so a
  -- restored or newly linked device knows who this is. The device's people
  -- list keeps a copy for the launch list, which reads it unopened.
  person_name TEXT CHECK (person_name IS NULL OR length(person_name) BETWEEN 1 AND 80),
  -- Sentence bar (038): which buttons the person sees, as a JSON list of
  -- shown control names (fix question past future backspace clear). NULL
  -- is Everything, the pre-038 bar. Play is never listed: it always
  -- shows. Synced, adult-set only.
  bar_controls TEXT,
  -- The person's photo (2026-10-03): a blob:<sha> photo key, synced and
  -- sealed like every edit. The bytes ride the sealed blob store, the
  -- same path as a family photo on a word.
  person_photo TEXT CHECK (person_photo IS NULL OR person_photo GLOB 'blob:*')
);

CREATE TABLE IF NOT EXISTS personal_entity (
  id TEXT PRIMARY KEY CHECK (id GLOB 'ent_*'),
  spoken_name TEXT NOT NULL CHECK (length(spoken_name) > 0),
  -- Retire, never delete (schema § 14.5): Remove on the word card flips
  -- this to 'retired' — the row, photo, recording and placements stay,
  -- and the entity renders nowhere until restored.
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  photo_key TEXT,
  -- When the family created it — drives Word Library → Added order.
  added_at INTEGER,
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
  -- 018 D7: the family's plain-words kind choice, stored as the role it
  -- paints. NULL renders Yellow (person or thing), the add form's
  -- offline default.
  fitzgerald_role TEXT CHECK (fitzgerald_role IS NULL OR fitzgerald_role IN
    ('Yellow', 'Green', 'Blue', 'Pink', 'Purple', 'Red')),
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
  sense_suggestion TEXT REFERENCES sense(id),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'abstained', 'superseded'))
);

-- One row per sentence the child builds. Ends when spoken or cleared;
-- a cleared sentence is a restart (not a training example).
CREATE TABLE IF NOT EXISTS sentence (
  id INTEGER PRIMARY KEY,
  started_at INTEGER NOT NULL CHECK (started_at > 0),
  ended_at INTEGER CHECK (ended_at IS NULL OR ended_at >= started_at),
  end_kind TEXT CHECK (end_kind IS NULL OR end_kind IN ('spoken', 'cleared')),
  tz_offset_min INTEGER NOT NULL,
  -- 025 § 5: the feeling a face tap spoke it in. NULL = neutral (▶ or
  -- clips) and every pre-025 row.
  spoken_feeling TEXT CHECK (spoken_feeling IS NULL
    OR spoken_feeling IN ('happy', 'sad', 'angry'))
);

-- Selection events feed the local funnel's recency and time-of-day
-- histogram (Dual_Engine §5.2). Ids only — never the English string.
-- sentence_id/position bind the pick to its sentence; source is the
-- input path; tz_offset_min is minutes east of UTC at the moment of the
-- tap, so the local hour = strftime('%H', selected_at/1000 +
-- tz_offset_min*60, 'unixepoch') survives travel and DST.
CREATE TABLE IF NOT EXISTS learner_event_log (
  id INTEGER PRIMARY KEY,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('sense', 'entity')),
  item_id TEXT NOT NULL CHECK (length(item_id) > 0),
  selected_at INTEGER NOT NULL CHECK (selected_at > 0),
  sentence_id INTEGER REFERENCES sentence(id),
  position INTEGER CHECK (position IS NULL OR position >= 0),
  source TEXT CHECK (source IS NULL OR source IN ('grid', 'strip', 'group', 'keyboard')),
  tz_offset_min INTEGER,
  -- 016: a Spotlight target glowed when tapped (§ 5 goals measure
  -- "on their own" vs "with the glow"). Device-local, never synced.
  spotlit INTEGER NOT NULL DEFAULT 0 CHECK (spotlit IN (0, 1)),
  -- 017-28: when a backspace pulled this pick out of its sentence
  -- (NULL = still seated). A fast strip-pick removal is a wrong pick.
  detached_at INTEGER,
  -- 021: which label spoke — the form the child actually said (wants,
  -- him). NULL on old rows and when Grammar help is off. Phrase history
  -- still reads item ids, so meaning-level ranking is untouched.
  label_id TEXT REFERENCES label(id),
  -- 027 § 5: the group open when this word was picked (NULL outside a
  -- group) — a spoken sentence's first pick is that group's own start.
  -- Device-local history, never synced.
  group_id TEXT
);

CREATE INDEX IF NOT EXISTS event_log_item ON learner_event_log(item_kind, item_id, selected_at);
CREATE INDEX IF NOT EXISTS event_log_time ON learner_event_log(selected_at);
CREATE INDEX IF NOT EXISTS event_log_sentence ON learner_event_log(sentence_id, position);

-- 032 E4: one row per press of a sentence button (✨ ❓ ⏪ ⏩) on a
-- bar with words — the move a Spotlight teaches, counted whether or not
-- the network answered (she still made the move). spotlit: the
-- button glowed when pressed (on their own vs with the glow). Counts only
-- reach stats_day; the raw events stay device-local, the day totals
-- sync via put_stats_day ops. The first-run tour and Try it never
-- write here.
CREATE TABLE IF NOT EXISTS transform_event (
  id INTEGER PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('fix', 'question', 'past', 'future')),
  pressed_at INTEGER NOT NULL CHECK (pressed_at > 0),
  tz_offset_min INTEGER NOT NULL,
  spotlit INTEGER NOT NULL DEFAULT 0 CHECK (spotlit IN (0, 1))
);

-- The user's own phrase history (smart bar v2): ctx is an ENDING of a
-- spoken sentence's prefix ('' = sentence start) as 'kind:id' joined by
-- ' ', and (item_kind, item_id) is what followed it. Plain counts, written
-- once when a sentence closes spoken — cleared bars never become
-- history. Derived from learner_event_log: rebuilt at each boot, then
-- kept current by closeSentence.
CREATE TABLE IF NOT EXISTS phrase_count (
  ctx TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('sense', 'entity')),
  item_id TEXT NOT NULL CHECK (length(item_id) > 0),
  n INTEGER NOT NULL CHECK (n > 0),
  PRIMARY KEY (ctx, item_kind, item_id)
);

-- One row per strip moment (017-5): what the ranker had, what it
-- showed, and what the child picked next (chosen_* fills on the next
-- pick). The instrument for §5.7 and the evidence base for whether an
-- outside ranker is ever worth bringing back. Ids and numbers only;
-- no label text, no partner words.
CREATE TABLE IF NOT EXISTS strip_impression (
  id INTEGER PRIMARY KEY,
  sentence_id INTEGER NOT NULL REFERENCES sentence(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  shown_at INTEGER NOT NULL CHECK (shown_at > 0),
  -- JSON array: [{"kind","id","src","her","kid","mask"}] in rank order —
  -- src is which table contributed it ('now' | 'all' | 'kids'), her is
  -- her best next-item count after the contributing ending, kid is the
  -- children ending's {share, total}, mask marks a hidden sense
  candidates TEXT NOT NULL,
  -- JSON array of the (kind:id) keys the gate painted, ≤ cap
  shown_local TEXT NOT NULL,
  -- JSON array of the keys actually on screen when the next pick
  -- happened — written by the painter, not the ranker — NULL until then
  shown_final TEXT,
  -- v2 rows carry 'phrase_history' — 'local_only'/'with_jev' stay in the
  -- CHECK only so pre-v2 rows survive a rebuild (replayImpression
  -- declines them).
  weight_set TEXT NOT NULL CHECK (weight_set IN ('local_only', 'with_jev', 'phrase_history')),
  -- picture | keyboard. Keyboard rows are metrics only.
  mode TEXT NOT NULL DEFAULT 'picture' CHECK (mode IN ('picture', 'keyboard')),
  -- the gate parameters the moment was judged under: {herMin,kidShare,kidMin}
  gate TEXT,
  shortlist_cap INTEGER CHECK (shortlist_cap IS NULL OR shortlist_cap > 0),
  chosen_kind TEXT CHECK (chosen_kind IS NULL OR chosen_kind IN ('sense', 'entity')),
  chosen_id TEXT,
  chosen_source TEXT CHECK (chosen_source IS NULL OR chosen_source IN ('grid', 'strip', 'group', 'keyboard'))
);

CREATE INDEX IF NOT EXISTS impression_sentence ON strip_impression(sentence_id, position);

CREATE TABLE IF NOT EXISTS clip_override (
  id TEXT PRIMARY KEY CHECK (id GLOB 'ovr_*'),
  utterance_id TEXT REFERENCES utterance(id),
  entity_id TEXT REFERENCES personal_entity(id),
  recorded_text TEXT NOT NULL CHECK (length(recorded_text) > 0),
  key TEXT NOT NULL CHECK (length(key) > 0),
  status TEXT NOT NULL CHECK (status IN ('ready', 'superseded')),
  CHECK ((utterance_id IS NULL) != (entity_id IS NULL))
);

-- Picture override (schema § 14.1): a family photo or another approved
-- library image shown for one catalog sense everywhere it renders.
-- Exactly one of photo_key / image_id is set; one ready row per sense.
CREATE TABLE IF NOT EXISTS image_override (
  id TEXT PRIMARY KEY CHECK (id GLOB 'imo_*'),
  sense_id TEXT NOT NULL REFERENCES sense(id),
  photo_key TEXT,
  image_id TEXT REFERENCES image(id),
  status TEXT NOT NULL CHECK (status IN ('ready', 'superseded')),
  CHECK ((photo_key IS NULL) != (image_id IS NULL))
);

-- Hidden words (Language_And_Voice_Schema § 14.4, Masking § 2): a hidden
-- sense keeps its core_cell and every group_cell — renderers draw a
-- ghost tile that cannot speak, and the word leaves strip candidates
-- and keyboard completions. Synced like every other caregiver edit.
CREATE TABLE IF NOT EXISTS sense_mask (
  sense_id TEXT PRIMARY KEY REFERENCES sense(id),
  status TEXT NOT NULL CHECK (status IN ('hidden', 'shown'))
);

-- Spotlight (013 §§ 3–4): a spotlight is a saved list of target words;
-- a session is a running glow — name, resolved targets, and the hard
-- end (timer or local midnight, whichever comes first). All synced so
-- either device can start or end it.
CREATE TABLE IF NOT EXISTS spotlight_list (
  id TEXT PRIMARY KEY CHECK (id GLOB 'spl_*'),
  name TEXT NOT NULL CHECK (length(name) > 0),
  created_at INTEGER NOT NULL,
  -- 016 § 5: a goal list's targets are tracked in stats_day — taps on
  -- their own vs with the glow, by week.
  is_goal INTEGER NOT NULL DEFAULT 0 CHECK (is_goal IN (0, 1)),
  -- 032 E: sentence buttons the list also lights, as a JSON array of
  -- names ('fix' = ✨, 'question' = ❓). Buttons are not words: they
  -- carry no tip and no per-word stats, so they live here, not in items.
  controls TEXT
);

CREATE TABLE IF NOT EXISTS spotlight_item (
  list_id TEXT NOT NULL REFERENCES spotlight_list(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sense', 'entity')),
  item_id TEXT NOT NULL,
  -- Coach view (013 § 5a): a one-line modeling tip an SLP may edit per
  -- list — NULL falls back to the shipped catalog.coachTips entry.
  tip TEXT,
  PRIMARY KEY (list_id, kind, item_id)
);

CREATE TABLE IF NOT EXISTS spotlight_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  -- JSON array of "kind:id" resolved at start — deleting the list
  -- mid-session does not change the running glow.
  targets TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  by_supporter INTEGER NOT NULL DEFAULT 0 CHECK (by_supporter IN (0, 1))
);

-- Coach tally (013 § 5a): one row per live-model tap the adult makes on
-- THIS device. Device-local by design — it is not in SYNCED_TABLES, so
-- the partner's tally never reaches the child's board.
CREATE TABLE IF NOT EXISTS coach_event (
  id INTEGER PRIMARY KEY,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('sense', 'entity')),
  item_id TEXT NOT NULL,
  modeled_at INTEGER NOT NULL CHECK (modeled_at > 0)
);
CREATE INDEX IF NOT EXISTS coach_event_time ON coach_event(modeled_at);

-- Adult placements (014 § 2 ruling 1 and § 9): a per-profile slot
-- override layered on the catalog's core_cell rows, which are never
-- rewritten — a catalog regeneration can never overwrite the adult's
-- placement. Polymorphic like group_cell: item_id is a sense for a
-- word, a personal_entity for a person. No FK — entities outlive the
-- sense table's reach.
CREATE TABLE IF NOT EXISTS core_override (
  layout TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('sense', 'entity')),
  item_id TEXT NOT NULL CHECK (length(item_id) > 0),
  slot_index INTEGER NOT NULL,
  PRIMARY KEY (layout, item_kind, item_id)
);

-- Transition highlight (014 § 4): after an accepted Cells change, the
-- words that moved glow softly until `until`, then the mark fades.
CREATE TABLE IF NOT EXISTS move_mark (
  sense_id TEXT PRIMARY KEY REFERENCES sense(id),
  until INTEGER NOT NULL
);

-- Smart bar families (014 § 5, Motor_Grid § 2.1 Expand mode): a family
-- tile opens its fixed-order item row in the bar. position is the whole
-- truth — families are never ranked or trimmed by context; only an
-- adult's edit changes the order, and that change is synced like any
-- other. An item may name another family (one level of chaining —
-- Pain → how much → where); the renderer caps the depth.
CREATE TABLE IF NOT EXISTS bar_family (
  id TEXT PRIMARY KEY CHECK (id GLOB 'bf_*'),
  name TEXT NOT NULL,
  glyph TEXT,
  speaks TEXT,
  builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1))
);
CREATE TABLE IF NOT EXISTS bar_family_item (
  family_id TEXT NOT NULL REFERENCES bar_family(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('sense', 'entity', 'family')),
  item_id TEXT NOT NULL,
  PRIMARY KEY (family_id, position)
);

-- Groups: one kind of container (docs/product/Motor_Grid_And_Art.md
-- § Groups, 027). The index is a coordinate map (canonical slots from 10,
-- no upper bound). A group holds words (group_membership); where each sits
-- is stored per board size (group_cell). Hidden groups keep membership,
-- positions, and index slot. Owner: public/shared/groups.mjs.
CREATE TABLE IF NOT EXISTS board_group (
  id TEXT PRIMARY KEY CHECK (id GLOB 'grp_*'),
  kind TEXT NOT NULL CHECK (kind IN ('builtin', 'my_words', 'custom')),
  name TEXT CHECK (name IS NULL OR length(name) > 0),
  glyph TEXT,
  photo_key TEXT,
  index_slot INTEGER NOT NULL UNIQUE CHECK (index_slot >= 10),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
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

-- A word in a group. Removing it removes that group's positions, never the
-- word record. added_at drives Word Library → Added order; moves, swaps
-- and Undo carry it over.
CREATE TABLE IF NOT EXISTS group_membership (
  group_id TEXT NOT NULL REFERENCES board_group(id),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('sense', 'entity')),
  item_id TEXT NOT NULL,
  added_at INTEGER,
  PRIMARY KEY (group_id, item_kind, item_id),
  CHECK ((item_kind = 'sense' AND item_id GLOB 'sns_*')
      OR (item_kind = 'entity' AND item_id GLOB 'ent_*'))
);

-- Where a member sits on one board size. Slots are real cells of that
-- size's grid; the reserved cells (top row, frame, Next) are never used —
-- groups.mjs owns that rule. A size gets its positions when a Cells change
-- asks for them (027 § 3.3).
CREATE TABLE IF NOT EXISTS group_cell (
  group_id TEXT NOT NULL,
  layout TEXT NOT NULL CHECK (length(layout) > 0),
  item_kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 0 CHECK (page >= 0),
  slot_index INTEGER NOT NULL CHECK (slot_index >= 0),
  PRIMARY KEY (group_id, layout, item_kind, item_id),
  UNIQUE (group_id, layout, page, slot_index),
  FOREIGN KEY (group_id, item_kind, item_id)
    REFERENCES group_membership(group_id, item_kind, item_id)
);

-- One row per seeded group, written when it is installed and kept after the
-- group is emptied or hidden. Any row stops that group seeding again,
-- whatever the catalog version (027 § 3.3). No FK: it outlives the group.
CREATE TABLE IF NOT EXISTS group_seed_install (
  group_id TEXT PRIMARY KEY CHECK (group_id GLOB 'grp_*'),
  seed_version TEXT NOT NULL
);

-- Catalog tables, replaced on import: each board size's shape and frame
-- cells (the reserved-cell source), the authored seed positions — the
-- placement rule's second choice when a word is re-added to its group —
-- and per-group catalog metadata: the sizes a built-in group shows on
-- (NULL = every size) and whether it is one of the occasions the
-- occasions_visible setting hides together (027 B8).
CREATE TABLE IF NOT EXISTS layout_shape (
  layout TEXT PRIMARY KEY CHECK (length(layout) > 0),
  cols INTEGER NOT NULL CHECK (cols > 0),
  rows INTEGER NOT NULL CHECK (rows > 0),
  frame TEXT NOT NULL CHECK (json_valid(frame))
);
CREATE TABLE IF NOT EXISTS group_meta (
  group_id TEXT PRIMARY KEY CHECK (group_id GLOB 'grp_*'),
  layouts TEXT CHECK (layouts IS NULL OR json_valid(layouts)),
  occasion INTEGER NOT NULL DEFAULT 0 CHECK (occasion IN (0, 1))
);
CREATE TABLE IF NOT EXISTS group_seed_cell (
  group_id TEXT NOT NULL,
  layout TEXT NOT NULL,
  item_kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  page INTEGER NOT NULL CHECK (page >= 0),
  slot_index INTEGER NOT NULL CHECK (slot_index >= 0),
  PRIMARY KEY (group_id, layout, item_kind, item_id)
);

-- Every adult edit lands here as an op (docs/product/Sync_And_Web_Editing.md
-- § 4, 011 slice 1). Ops carry intent (kind + JSON args); replaying them
-- through the same write owners rebuilds the synced tables. device_id is
-- the local placeholder until device keys land (011 slice 3).
CREATE TABLE IF NOT EXISTS sync_op (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT NOT NULL UNIQUE CHECK (op_id GLOB 'op_*'),
  device_id TEXT NOT NULL DEFAULT 'dev_local',
  kind TEXT NOT NULL,
  args TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- The relay's sequence number (§ 5). NULL = pending: applied locally,
  -- not yet confirmed. On drain the device rebases — restores the last
  -- confirmed baseline, applies confirmed ops in relay order, re-applies
  -- its pending ops on top.
  relay_seq INTEGER,
  -- 1 once this op's effects are folded into the stored baseline.
  -- Relay sequences are sparse (a deduped resubmit burns a seq), so
  -- replay tracks per-op application, not contiguous numbering: a drain
  -- applies every confirmed-but-unapplied op exactly once, and the
  -- baseline watermark is derived from the flags.
  applied INTEGER NOT NULL DEFAULT 0
);

-- The synced tables' last confirmed state, one JSON row — the rebase
-- point drainOps restores before replaying the ordered stream.
-- applied_seq is the durable checkpoint: the relay_seq the stored tables
-- provably contain. Only confirmed ops past it may apply again — a
-- baseline already holding an op's effects must never replay it (double
-- swaps, retired recordings). Living inside the database bytes, the
-- checkpoint can never split from the state it describes.
CREATE TABLE IF NOT EXISTS sync_baseline (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tables TEXT NOT NULL,
  applied_seq INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS label_one_row_per_sense_text
  ON label(sense_id, locale, normalized_text)
  WHERE kind IN ('lemma', 'alias');
CREATE UNIQUE INDEX IF NOT EXISTS label_one_form_per_features
  ON label(sense_id, locale, features)
  WHERE kind = 'form' AND status = 'approved';
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
CREATE UNIQUE INDEX IF NOT EXISTS image_override_one_ready
  ON image_override(sense_id)
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

CREATE TRIGGER IF NOT EXISTS image_override_same_sense
BEFORE INSERT ON image_override
FOR EACH ROW
WHEN NEW.image_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'override image belongs to another sense')
  WHERE NOT EXISTS (
    SELECT 1 FROM image
    WHERE image.id = NEW.image_id
      AND image.sense_id = NEW.sense_id
      AND image.status = 'approved'
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

-- Team names (2026-10-03): each supporter account's display name, set
-- by that supporter and synced sealed, so the Team list reads names
-- instead of emails. The relay never sees a name in the clear.
CREATE TABLE IF NOT EXISTS supporter_name (
  acct_id TEXT PRIMARY KEY CHECK (length(acct_id) > 0),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80)
);

-- Daily totals (016 § 6.2): one row per local day, computed on the
-- device from learner_event_log + sentence. Counts only — payload is
-- JSON of numbers keyed by item id (never label text). The row is the
-- unit that syncs to supporters while the raw log never leaves the
-- device.
CREATE TABLE IF NOT EXISTS stats_day (
  day INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  computed_at INTEGER NOT NULL CHECK (computed_at > 0),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  -- Device-local: has this device posted this row's whitelisted totals
  -- to /research (016 § 6.3). Never synced — replicas keep their own 0.
  reported INTEGER NOT NULL DEFAULT 0 CHECK (reported IN (0, 1)),
  PRIMARY KEY (day, device_id)
);

-- Which catalog fingerprint the row reconcile last applied (041 B2).
-- importCatalog reads this first: a match skips the ~20k-statement
-- replay — the reconcile only re-runs when the shipped catalog changed.
-- Device-local, never synced.
CREATE TABLE IF NOT EXISTS catalog_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fingerprint TEXT NOT NULL
);

PRAGMA user_version = 20;
