# Motor Grid, Predictive Strip, and Symbol Art

**DECIDED 2026-09-22** (mentor intake; not built).
Clinical framing: `docs/strategy/Vision.md`.
How candidates are scored: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.
Fact map: `docs/product/SSOT.md`.
Intake record: `docs/founder/2026-09-22_Mentor_Grid_Prediction_Art.md`.

This file owns the motor-grid layout contract, the color and symbol rules, and
the visual contract of the predictive strip. It does not own ranking math, and
it does not own slot assignments — which sense sits in which slot lives in
`docs/product/Core_Coordinate_Map.md`.

---

## 1. Clean-room grid

**DECIDED 2026-09-22** (not built). The core coordinate map is original work.

Safe to use, because they are open method rather than someone else's board:

- Modified Fitzgerald color roles (section 3).
- Core-versus-fringe grammar: a small set of high-frequency words stays available; specific nouns and names are fringe.
- Left-to-right English syntax on the sentence bar.
- Fixed positions within a session so motor memory can form.
- Published vocabulary studies named below.

Do not copy into layouts, fixtures, stylesheets, or assets:

- An incumbent product's exact cell coordinates (which word sits at a given row and column).
- Symbol libraries that Pip AAC does not own, including SymbolStix and AssistiveWare vector sets.
- Another product's branded vocabulary engine or template pack.

Named incumbents that must not be transcribed: AssistiveWare Proloquo / Crescendo, PRC-Saltillo WordPower, Tobii Dynavox Core First. Studying published clinical principles is in scope. Tracing their button maps is not.

### Vocabulary seeding

**DECIDED 2026-09-22** (not built). The first motor-grid word list is compiled from open clinical sources, then placed by an independent coordinate pass:

- Banajee, DiCarlo, and Stricklin (2003), already in the vision bibliography.
- Center for Literacy and Disability Studies core-word studies.
- MacArthur-Bates Communicative Development Inventories.

**DECIDED 2026-09-21** still holds for lexicon size: the relational graph keeps about 200 high-frequency generative anchors. The mentor range of about 50 to 100 words is the first primary set that receives motor-grid coordinates, not a cut in the graph.

The initial compiled 677-word launch lexicon (83 Tier 1 Root Core + 594 Tier 2 Primary Fringe across 16 clinical categories) is cataloged in `docs/product/Initial_Vocabulary_600.md`.

The coordinate pass is written down as `docs/product/Core_Coordinate_Map.md`; the rule that decides which words earn `grid60` cells is `docs/product/Core_Grid_Membership.md` §2. A table extracted from another app is not an acceptable source, even if the words themselves came from a paper.

### Two stability rules

These are both in force. They answer different questions.

| Question | Rule | Decided |
| --- | --- | --- |
| Did this cell move during the session because prediction, a pragmatic lens, or a folder changed? | No. At a chosen density and orientation, core indices are immutable. | **DECIDED 2026-09-22** (not built) |
| Did the child change density, or rotate the device? | Sectors stay stable (pronouns, verbs, descriptors, spatial words) by default. Absolute pixels may change. Copying one frozen incumbent template is not the method. Amended 2026-09-22: a default design goal, not a law — the move cost is measured and shown, and the adult decides (`docs/phases/014_Grid_Density_And_Fit.md` § 4). | **DECIDED 2026-09-21**, amended **2026-09-22** |
| Did a parent or SLP move a core word on their child's board? | Allowed, per profile, in Edit mode: move or swap, never reflow. The app, prediction, lenses, and catalog updates never move a cell and never overwrite an adult move. | **BUILT** — `public/shared/coremove.mjs` (`move_core` op, `core_override` profile table shadows `core_cell`; regen-safe) |

When a grid engine exists, a test must show that a suggestion model cannot reorder or swap primary core indices. That test is **PROPOSED**. It does not exist yet.

### Groups — the backup path to every word

**DECIDED 2026-09-22** (founder review of the zones build; supersedes the
"sub-zone" / "zone" wording and the `zone_slot` + `custom_group` model from
earlier the same day). **BUILT** (fb5a8d7…0555aa9).

The strip is the primary path to fringe words. Groups are the guaranteed
path: **every seeded catalog word is reachable in at least one group**, one
level below the board. **Amended 2026-09-22:** the extended picture library
(tier `secondary_fringe`) is found through `+ Add` and the Word Library,
and is on no page until the family adds it (`docs/product/Word_Library.md`
§ 6).

- **One concept, one name: Group.** Built-in groups ship with the app
  (Food, Drinks, People, Animals…), **My Words** is the family's default
  group, and families make **custom** groups ("School", "Grandma's").
  They are all the same kind of container with the same rules. "Zone",
  "sub-zone", and "folder" are not product words. `category` is a catalog
  property (a word's home, the seed for built-in groups, the classifier's
  target). It is never a container.
- **In place, same geometry.** The group index and every group page render
  in the core grid's space at the profile's one Cells setting — the same
  cell size as the home board. A group has no size of its own; a big group
  pages. **Amended 2026-09-22** (founder; not built beyond 10×6 —
  `docs/phases/014_Grid_Density_And_Fit.md` § 3). The sentence bar and
  strip never move, and the strip keeps predicting inside a group. A word
  tapped inside a group speaks and stays in the group.
- **Fixed nav cells.** Slot 0 is always back (`← Board` / `← Groups`).
  Slot 1 is reserved for the Edit-mode action (`+ Group`, `+ Add`,
  `Delete group`; `Remove` today, the × badge after 009 slice 2) and is blank in use mode, so adult controls
  are never shown to the child and no item shifts between modes. On a
  group page, the last slot is reserved for `Next ›` paging and items fill
  the slots between. At `grid60`: slot 59 is `Next ›`, items sit in slots
  2–58 (57 per page), index slots 2–9 are reserved, and groups sit at
  10–59. At 15 cells: 12 items per page.
- **When Cells changes,** group items keep their saved order and are laid
  out again at the new size; moved items join the move-cost preview
  (`docs/phases/014_Grid_Density_And_Fit.md` § 4). **BUILT** (014 slice 1):
  `group_cell` and `board_group.index_slot` stay in canonical 60-space;
  renderers re-wrap the linear order into pages of N−3
  (`visualCell`/`posAtVisual`/`indexVisual` in `public/shared/groups.mjs`)
  — no row moves when Cells changes. The move-cost preview lands with the
  Cells picker (slice 4).
- **Motor-memory law inside groups too.** The index and every group page
  are coordinate maps (`board_group.index_slot`, `group_cell (page,
  slot_index)`). Built-in contents are seeded in vocabulary-doc order
  (meaning-clustered), never alphabetical. New items take the next free
  slot, and nothing shifts. A catalog update never moves or drops an item.
- **One level deep.** A group never contains a group. A built-in group
  that outgrows one page is split into sibling groups (Food → Food +
  Drinks, Actions → Actions + Moving), not nested.
- **Many-to-many.** An item can sit in several groups (`banana` in Food
  and in "Snack time"). Seeded senses cannot be removed from their
  built-in group, because that is the findability guarantee; hiding a word
  is masking (`docs/product/Vocabulary_Masking_And_Safety.md`). An entity
  removed from its last group returns to My Words and is never orphaned.
- **One Edit mode.** Parent Corner → `Edit groups`. The corner button
  reads `✓ Done` while editing. Built-in groups can be moved but not
  deleted or renamed. **BUILT** (009 slice 2): Edit mode works like the
  iPhone home screen, with one deliberate difference.
  - **Drag** an item to an empty slot to move it, or onto another item to
    swap the two. Only the dragged item (and a swapped partner) moves
    (`editPointer` in `public/board.js`; `moveItem`/`swapItems` in
    `public/shared/groups.mjs`). On the group index the same drag moves a
    group between index slots ≥ 10.
  - **Tap** an item to open its word card (`docs/product/Word_Library.md`
    § 4); tap a group to open it.
  - **×** badge on each removable item removes it from this group, with
    an Undo toast (`removeItemUndoable` restores the row byte-for-byte).
    A custom group's × deletes the group after a two-button ask.
  - **Tap an empty slot** to add straight into that slot (the slot is the
    picker, as the group is today).
  - **The difference from the home screen: removal never reflows.** The
    slot stays empty and no other item moves. "Remove and close the gap"
    is not a feature (founder: "users have learned where words are").
- **Add where you are.** `+ Add` inside a group opens one field. Typing
  offers every existing meaning of what was typed as pictures (the
  family's own words first, then catalog senses, ranked by this group),
  or "New: '…'" to create a personal entity with an optional photo.
  Picking an existing meaning places that same record here. One meaning,
  one record; the same spelling may repeat (`bat` 🦇 and `bat` ⚾).
  **DECIDED 2026-09-22; BUILT** (009 slice 1; `docs/product/Word_Library.md`
  § 5.1). The
  place is the picker; there is no folder picker. Filing rules for
  entities: `docs/product/Personal_Entities.md` § Filing.
- **Show me where.** When a non-core word arrives through the strip or
  the keyboard, the Groups anchor briefly shows the path (`Groups › Food`)
  with no layout shift. The shortcut teaches the motor plan of the backup
  route.

The entry point is one `🗂️ Groups` anchor in the strip's utility columns.
A dock row of category buttons is not the design: it does not scale past a
dozen groups, and it spends prime motor real estate on navigation instead
of language.

Each named layout (`grid60`, `grid90`) is its own default map. Changing
density swaps the map; it does not move a cell within one. A profile's board
is its default map plus any adult moves (row 3 of the stability table).
Assignments: `docs/product/Core_Coordinate_Map.md`.

---

## 2. Smart bar (formerly the predictive strip)

**DECIDED 2026-09-22** (not built). On the motor-grid view the stack is:

1. Sentence bar (words already chosen, plus speak and clear).
2. Predictive strip.
3. Fixed core grid.

```text
+------------------------------------------------------------------+
| [Back]  Sentence bar: "I want to go..."              [Speak/Clr] |
+------------------------------------------------------------------+
| [prediction] [prediction] [prediction] [prediction]  |🗂️Grp|⌨ KB|
+------------------------------------------------------------------+
| Fixed core grid: indices do not move while this view is open     |
+------------------------------------------------------------------+
```

Layout rules:

- The strip sits directly under the sentence bar and directly above the core grid. **It never collapses.** Its height is fixed and rendered on first paint; an empty prediction state shows ghost cards, not a zero-height bar. A strip update must never shift the core grid's physical position — layout shift breaks motor planning.
- **8 + 2 geometry, scaled to the board.** The strip spans the same columns as the grid. At ten columns: columns 1–8 hold four prediction slots (2 columns each); columns 9–10 hold permanent utility anchors — `🗂️ Groups` (the group index, § Groups) and `⌨ Keyboard` (type a word at any point; while the keyboard is open it reads `Board` and closes it — keyboard modes and key map: `docs/product/Profile_Presentation_Modes.md` § 4) — visible and tappable in every state. At five columns the strip holds two prediction slots and the same two anchors (**BUILT** 014 slice 1 — `stripSlots`/`sizeStrip` in `public/board.js`); a layout may also declare an in-grid `Groups` cell (grid90 slot 89).
- It shows at most four candidate tiles. Three or four is the whole set. A longer row is a scanning tax.
- Every tile shows the word and its stick or object icon (a 1:1 square on the left, label on the right). Text alone is not enough for emerging and non-literate communicators. A sense with no art yet renders a Fitzgerald-tinted swatch; an entity renders its photo.
- Idle state (empty sentence) shows conversational starters and routine anchors — greeting, the Food group, the top personal entity, help — never a blank strip.
- Tiles in the strip are not core cells. Selecting one speaks or inserts that candidate. It does not rearrange the grid underneath.
- Core words that are already on the grid are emphasized in place (confidence halos). They are not copied into the strip. Ranking owner: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.

**Listen key. DECIDED 2026-09-22** (not built). When the profile's
listening setting is on, a Listen key is on the board; when it is off, the
key does not exist and the microphone is never requested. Tap starts
listening, tap stops it. While listening, the key shows a live indicator
that cannot be missed. The key takes no grid cell and no strip slot
(`grid60` is frozen), and within a profile it sits in the same place in
every state, so turning listening on or off mid-conversation shifts
nothing. Changing the setting is an adult action in the Parent corner, like
a density change. Position in the top bar: founder call in
`docs/phases/008_Partner_Listening.md` slice 1. Behavior owner:
`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 6.

On the motor-grid view, the strip is where a suggestion may show a word that is not already a core cell. The Context River remains a separate situational surface. A specific food, place, person, or thing can show up in one tap instead of three or four folder levels.

### 2.1 Smart bar contract

**DECIDED 2026-09-22** (founder; not built). Renamed from "predictive
strip": prediction is one of its jobs, not the only one. Code and older docs
still say *strip*; it is the same surface.

**The grid never changes. The Smart bar is the one place that does.** Every
flexible behavior that would otherwise move a cell lands here instead.

**Modes.** One mode at a time, always caused by a visible action; after a
pick, the bar returns to Predict.

| Mode | Caused by | Shows | Order | Owner |
| --- | --- | --- | --- | --- |
| Predict | default | likely next words | ranked | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` |
| Expand | tapping a family tile (`?`, Pain, Hot/cold, Call) | that tile's family | **fixed** | this section; defaults in `docs/phases/014_Grid_Density_And_Fit.md` § 5 |
| Forms | the Forms key | forms of the last word | ranked by context | `docs/phases/005_Word_Forms.md` |
| Partner | the Listen key | the partner's words, one turn | as heard | `docs/phases/008_Partner_Listening.md` |

**Fixed-order rule.** A family's tiles always sit in the same slots on a
given profile, so "`?` then slot 2" becomes a motor plan the way a cell
does. Families are never ranked, reordered by a model, or trimmed by
context. Only an adult changes a family, and that change is shown like any
other move (`docs/phases/014_Grid_Density_And_Fit.md` § 4).

**Tile widths.** Predict tiles are two columns wide and at most four (a
ranked row is a scanning tax). Expand tiles are one column wide — never
smaller than a board cell on that profile — so a 5-column board shows 4 and
a 10-column board shows 8; fixed order means the child does not scan them.
A family longer than the bar ends in a fixed `more ›` tile that pages it.
The utility anchors (`🗂️ Groups`, `⌨ Keyboard`) stay put in every mode.

**Family tiles.** A family tile is a cell that opens its family in the bar
and speaks its own label (`Pain` speaks "I'm in pain"). Each family tile
the child taps speaks at once, so a partner hears the message build even if
the child stops partway. A family may lead to one more family (Pain → how
much → where); no deeper.

**Who may put what there.**

- **Predict:** the ranking engine only, choosing from words this profile
  has. A word an adult hid never appears.
- **Expand:** families. Pip ships defaults; a parent, SLP, or teacher may
  add, remove, or reorder a family's tiles and make a family tile from any
  word (Parent Corner → Smart bar).
- **Forms:** the catalog's word forms.
- **Partner:** listening, for one turn, only while the Listen key is on.
- **Nobody else.** No tips, prompts, promotions, notifications, or app
  messages ever appear in the bar.

---

## 3. Modified Fitzgerald Key

**DECIDED 2026-09-22** (not built). Button fields and stick-figure torsos use these roles. The torso is a grammar cue, not clothing.

The hex values, tile anatomy, and states are **BUILT** and owned by
`docs/product/Design_System.md`; this section owns which role a word gets.

| Color | Role |
| --- | --- |
| Yellow / orange | Pronouns, people, nouns |
| Green | Verbs, actions |
| Blue | Descriptors, adjectives, adverbs |
| Pink / magenta | Social phrases, prepositions, conjunctions |
| Red, or a black outline | Negation, stops, emergency words |

One word keeps one color role across the core grid, groups, and the predictive strip.

---

## 4. Symbol art

**DECIDED 2026-09-22**. Symbol art is created in-house using a frozen 3-image style reference bundle (`assets/style-refs/pip-v1/`) and a minimal prompt harness (`scripts/art/gen.mjs`). Audio assets and layout stylesheets follow the same isolation rule: they are created for Pip AAC, not imported from an incumbent library.

### 4.1 Stick character (people, pronouns, actions)

One character, used everywhere a human figure carries the meaning. Canonical style reference: `assets/style-refs/pip-v1/01-stick-persona.jpg`.

- No hair, no gender markers, and no racial or ethnic cues.
- Bold, uniform monoline stroke with soft rounded joint curvature.
- Friendly, warm circular head with simple dot eyes and a gentle smile (warmth and approachability for children; avoids the sterile, creepy look of a faceless mannequin).
- **The Single-Finger Mitten Hand Standard:**
  - *Resting Hand:* Simple, smooth neutral circle. Functions as a "visual null" so the child's visual processing focuses 100% on the active gesture rather than dividing attention. Avoids black pixel mud at 48×48px.
  - *Active / Pointing Hand:* Exactly **one distinct index finger** extended from a curled fist. Never 5 realistic fingers (prevents spider-line noise).
  - *Focal Scaling:* The active pointing hand is drawn slightly enlarged in perspective to establish immediate visual hierarchy on a motor grid tile.
- Clean silhouette with zero motion lines, speed streaks, or dust puffs (achieved through seed re-rolling, not prompt-policing).
- Torso filled with the Fitzgerald color for that button's grammar role. A green torso marks an action such as *run*. A yellow torso marks a pronoun such as *I* or *we*.
- Meaning comes from posture, action, and directional arrows.

Master symbol references:
- Active motion: `assets/symbols/run.jpg` (green torso, running posture, clean silhouette)
- Deictic pointing: `assets/symbols/you.png` (yellow torso, single-finger mitten, enlarged focal point)

The same character is the person on pronoun buttons and the actor on verb buttons. Do not introduce a second human style for a demographic group.

### 4.2 Objects and other fringe icons

Inanimate nouns (vehicles, food, household items, animals) use a warm illustrated style: soft rounded curves, solid fills, clean outlines. Canonical style reference: `assets/style-refs/pip-v1/02-object.jpg`.

- Pure objects do not use the stick body. An animal is drawn as that animal, not as the stick character in a costume.
- No background scenery: zero floors, walls, or rooms. Pure white background.
- Custom fringe entities (a family member, a pet, a place) may use a caregiver photo or an in-house icon. They still must not use a third-party symbol library.

### 4.3 Spatial diagrams & prepositions

Relational and positional concepts (*in*, *out*, *on*, *under*, *up*, *down*) use minimalist diagrammatic glyphs. Canonical style reference: `assets/style-refs/pip-v1/03-diagram.jpg`.

- Neutral solid container or surface with completely opaque sides (no transparent wireframes or clipping).
- Directional arrow carrying the Fitzgerald key accent (pink for prepositions).
- Opposites share identical geometry: *in* and *out* use the exact same container perspective, changing only the arrow trajectory.

### 4.4 Semantic Framing Lenses (The 48px Grid Legibility Law)

**DECIDED 2026-09-22**. On an iPad grid with 60 tiles, buttons render between 48×48px and 60×60px. A full-body stick figure for emotions (`happy`, `sad`) or oral/fine-motor actions (`eat`, `think`) fails clinically: the face or action shrinks to a 2-pixel blur while 60% of the tile is wasted on stick legs. Every symbol is assigned a framing lens before generation:

1. **Face (`--framing face`):** Emotions, sensory states, and facial expressions (`happy`, `sad`, `hurt`, `tired`, `sleepy`). Close-up circular head filling 80%+ of the frame. Head only; no body, no legs. Facial expression is 5× larger and immediately recognizable.
2. **Bust (`--framing bust`):** Oral actions, fine-motor manual actions, and deictic chest gestures (`eat`, `drink`, `taste`, `think`, `say`, `I`, `me`). Upper body, head, hands, and Fitzgerald torso collar. Eliminates dead leg space while preserving grammar torso color.
3. **Full (`--framing full`):** Gross-motor locomotion (`run`, `jump`, `walk`, `sit`, `stand`) and multi-person social actions (`help`, `play`, `hug`). Complete stick figure with torso, limbs, and stance where leg stride or elevation carries the meaning.
4. **Diagram (`--framing diagram`):** Spatial prepositions and relationships (`in`, `out`, `on`, `off`, `up`, `down`). Minimalist container/surface with bold Fitzgerald pink vector arrow, zero human figures.
5. **Object (`--framing object`):** Inanimate nouns (`apple`, `car`) and universal regulators (`stop`, `yes`, `no`). Standalone object or sign with bold monoline outline and solid fill, zero human figures.

Operational skill guide: `docs/operations/art-generator/SKILL.md`.

### 4.5 Generation Prompt Architecture & Lessons

Every symbol in Pip AAC is generated via `scripts/art/gen.mjs` using the locked 3-line base prompt:

```text
We are trying to teach a child the concept of: {word}.
Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.
Do not include any text in the image.
```

- **Plurals:** Automatically appends `Show more than one.`
- **Grammar Color:** Appends `The stick figure's torso is solid {color}.`
- **Abstract Concepts:** Appends a concise 5-to-10 word physical `sceneHint` rather than a full scene description.
- **The Re-roll Law:** Never police minor defects (stray lines, angle quirks) by bloating the prompt with negative rules or micro-constraints. The 3 reference images carry the hand; seed re-rolling is the lever. Full case study: `Art_Generation_Lessons.md`.

### 4.6 Pip the Bird — Canonical Mascot and System Poses

**DECIDED 2026-09-22** (locked brand suite).
Masters: `assets/brand/pip-sitting.png` (app icon mark / Pose 1) and the 6 system poses in `assets/brand/`.

#### The Core Architectural Division of Labor
- **The Stick Persona is Language:** Lives inside motor-grid tiles and on the sentence bar. Means words and actions (`you`, `run`, `help`). Speaks *for* the child.
- **The Bird is the System:** Lives outside the grid. Never appears inside a tile or button. Appears in onboarding, empty prediction states, offline status, caregiver mode, and the app icon. Speaks *to* the child.
- **Clinical Cognitive Anchor:** A child learns *"the bird talks to me, the figure talks for me."* This prevents confusion between app chrome / state indicators and AAC vocabulary targets.

#### Visual Geometry and Palette
- **Hand & Style:** Drawn by the same hand as the stick figure persona using the frozen style bundle (`assets/style-refs/pip-brand/`).
- **Head & Body:** Clean circular head geometry echoing the stick figure's head; plump songbird silhouette with smooth curved wing and perked wedge tail.
- **Color Palette:** Warm rich gold body (`#fdb826`), orange triangular beak cleanly fused with the head outline, solid black round dot eye matching the stick figure's eye weight, and black stick legs with orange three-toed feet. No green (avoids Duolingo / action-verb collision) and no cyan (avoids Twitter / descriptor collision).
- **Zero Noise:** Pure white canvas, bold black monoline stroke, flat solid fills, zero shading, zero motion lines, zero text.

#### The 6 System Poses (1024×1024 Master Suite)
1. **Pose 1: Sitting / Primary Mark** (`assets/brand/pip-sitting.png`, alias `pip-01-sitting.png`): Facing forward / three-quarters, wing resting, feet planted, calm and steady. Used for the app icon, favicon, primary brand mark, and first launch.
2. **Pose 2: Looking Up** (`assets/brand/pip-02-looking-up.png`): Seated/standing posture, head and body tilted back ~10°, eye directed upward toward the top of the frame. Curious and hopeful. Used for the empty prediction strip, empty sentence bar, and *"tap a word to start"*.
3. **Pose 3: Resting** (`assets/brand/pip-03-resting.png`): Body settled lower, eye closed as a single clean sleeping line (`◡`), feet tucked underneath. Calm and peaceful. Used for offline mode (*"Pip works offline, nothing's wrong"*), idle state, and sleep mode.
4. **Pose 4: Listening** (`assets/brand/pip-04-listening.png`): Facing three-quarters with head cocked ~15° to the side, one eye slightly higher than the other. Used for voice settings, voice preview, and caregiver modeling mode.
5. **Pose 5: Wing Out / Welcome** (`assets/brand/pip-05-welcome.png`): Standing with one smooth curved wing opened out forward like an open arm in a warm welcoming gesture. Used for onboarding, the marketing hero, and *"welcome back"*.
6. **Pose 6: Hopping In** (`assets/brand/pip-06-hopping.png`): Mid-hop with feet together lifted off the ground, small gap under the body, tail lifted, zero motion lines. Used for sync complete, *"new words added"*, and app update available.

---

## 5. Proposed build order

**PROPOSED.** Not scheduled. None of these exist in the repo.

1. ~~Compile the primary core list~~ Done: `docs/product/Initial_Vocabulary_600.md` + `docs/product/Core_Coordinate_Map.md`.
2. Lock character drawing rules and the Fitzgerald torso mapping before producing a symbol set.
3. Scaffold the motor grid and the strip, with a test that suggestion output cannot reorder core indices.
4. Feed the strip from the local ranker within the latency rule in the dual-engine doc.
