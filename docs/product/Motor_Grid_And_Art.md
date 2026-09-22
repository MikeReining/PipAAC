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

The initial compiled 599-word launch lexicon (75 Tier 1 Root Core + 524 Tier 2 Primary Fringe across 14 clinical categories) is cataloged in `docs/product/Initial_Vocabulary_600.md`.

The coordinate pass is written down as `docs/product/Core_Coordinate_Map.md`. A table extracted from another app is not an acceptable source, even if the words themselves came from a paper.

### Two stability rules

These are both in force. They answer different questions.

| Question | Rule | Decided |
| --- | --- | --- |
| Did this cell move during the session because prediction, a pragmatic lens, or a folder changed? | No. At a chosen density and orientation, core indices are immutable. | **DECIDED 2026-09-22** (not built) |
| Did the child change density, or rotate the device? | Sectors stay stable (pronouns, verbs, descriptors, spatial words). Absolute pixels may change. Copying one frozen incumbent template is not the method. | **DECIDED 2026-09-21** |

When a grid engine exists, a test must show that a suggestion model cannot reorder or swap primary core indices. That test is **PROPOSED**. It does not exist yet.

Category folders open as an in-place sub-zone. **DECIDED 2026-09-22** (not built). The sentence bar and navigation anchors stay put. Closing the sub-zone restores the same core indices as before.

The folder entry point is one `Groups` anchor cell on the board, which opens
the in-place index of the 14 sub-zones. **DECIDED 2026-09-22** (not built). A
dock row of category buttons is not the design: it does not scale to 14
categories, and it spends prime motor real estate on navigation instead of
language. The strip, not a folder tree, is the primary path to fringe words.

Each named layout (`grid60`, `grid80`) is its own map. Changing density swaps
the map; it does not move a cell within one. Assignments:
`docs/product/Core_Coordinate_Map.md`.

---

## 2. Predictive strip (layout only)

**DECIDED 2026-09-22** (not built). On the motor-grid view the stack is:

1. Sentence bar (words already chosen, plus speak and clear).
2. Predictive strip.
3. Fixed core grid.

```text
+------------------------------------------------------------------+
| [Back]  Sentence bar: "I want to go..."              [Speak/Clr] |
+------------------------------------------------------------------+
| [prediction] [prediction] [prediction] [prediction]  |⌨ KB|🌅Grp|
+------------------------------------------------------------------+
| Fixed core grid: indices do not move while this view is open     |
+------------------------------------------------------------------+
```

Layout rules:

- The strip sits directly under the sentence bar and directly above the core grid. **It never collapses.** Its height is fixed and rendered on first paint; an empty prediction state shows ghost cards, not a zero-height bar. A strip update must never shift the core grid's physical position — layout shift breaks motor planning.
- **8 + 2 geometry.** The strip spans the same 10 columns as the grid: columns 1–8 hold four prediction slots (2 columns each); columns 9–10 hold permanent utility anchors — `⌨ Keyboard` (type a word at any point) and `🌅 Groups` (zones/routines) — visible and tappable in every state.
- It shows at most four candidate tiles. Three or four is the whole set. A longer row is a scanning tax.
- Every tile shows the word and its stick or object icon (a 1:1 square on the left, label on the right). Text alone is not enough for emerging and non-literate communicators. A sense with no art yet renders a Fitzgerald-tinted swatch; an entity renders its photo.
- Idle state (empty sentence) shows conversational starters and routine anchors — greeting, food zone, the top personal entity, help — never a blank strip.
- Tiles in the strip are not core cells. Selecting one speaks or inserts that candidate. It does not rearrange the grid underneath.
- Core words that are already on the grid are emphasized in place (confidence halos). They are not copied into the strip. Ranking owner: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.

On the motor-grid view, the strip is where a suggestion may show a word that is not already a core cell. The Context River remains a separate situational surface. A specific food, place, person, or thing can show up in one tap instead of three or four folder levels.

---

## 3. Modified Fitzgerald Key

**DECIDED 2026-09-22** (not built). Button fields and stick-figure torsos use these roles. The torso is a grammar cue, not clothing.

| Color | Role |
| --- | --- |
| Yellow / orange | Pronouns, people, nouns |
| Green | Verbs, actions |
| Blue | Descriptors, adjectives, adverbs |
| Pink / magenta | Social phrases, prepositions, conjunctions |
| Red, or a black outline | Negation, stops, emergency words |

One word keeps one color role across the core grid, sub-zones, and the predictive strip.

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

### 4.4 Generation Prompt Architecture & Lessons

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



---

## 5. Proposed build order

**PROPOSED.** Not scheduled. None of these exist in the repo.

1. ~~Compile the primary core list~~ Done: `docs/product/Initial_Vocabulary_600.md` + `docs/product/Core_Coordinate_Map.md`.
2. Lock character drawing rules and the Fitzgerald torso mapping before producing a symbol set.
3. Scaffold the motor grid and the strip, with a test that suggestion output cannot reorder core indices.
4. Feed the strip from the local ranker within the latency rule in the dual-engine doc.
