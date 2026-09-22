# Motor Grid, Predictive Strip, and Symbol Art

**DECIDED 2026-09-22** (mentor intake; not built).
Clinical framing: `docs/strategy/Vision.md`.
How candidates are scored: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.
Fact map: `docs/product/SSOT.md`.
Intake record: `docs/founder/2026-09-22_Mentor_Grid_Prediction_Art.md`.

This file owns the motor-grid layout contract, the color and symbol rules, and
the visual contract of the predictive strip. It does not own ranking math.

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

The coordinate pass must be written down as Pip AAC's own map. A table extracted from another app is not an acceptable source, even if the words themselves came from a paper.

### Two stability rules

These are both in force. They answer different questions.

| Question | Rule | Decided |
| --- | --- | --- |
| Did this cell move during the session because prediction, a pragmatic lens, or a folder changed? | No. At a chosen density and orientation, core indices are immutable. | **DECIDED 2026-09-22** (not built) |
| Did the child change density, or rotate the device? | Sectors stay stable (pronouns, verbs, descriptors, spatial words). Absolute pixels may change. Copying one frozen incumbent template is not the method. | **DECIDED 2026-09-21** |

When a grid engine exists, a test must show that a suggestion model cannot reorder or swap primary core indices. That test is **PROPOSED**. It does not exist yet.

Category folders open as an in-place sub-zone. **DECIDED 2026-09-22** (not built). The sentence bar and navigation anchors stay put. Closing the sub-zone restores the same core indices as before.

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
| Predictive strip: at most 4 tiles, text + in-house icon          |
+------------------------------------------------------------------+
| Fixed core grid: indices do not move while this view is open     |
+------------------------------------------------------------------+
```

Layout rules:

- The strip sits directly under the sentence bar and directly above the core grid.
- It shows at most four candidate tiles. Three or four is the whole set. A longer row is a scanning tax.
- Every tile shows the word and its stick or object icon. Text alone is not enough for emerging and non-literate communicators.
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
- Blank, solid circular head with balanced outline weight. No facial expression noise (avoids visual clutter at 48×48px).
- Soft rounded hand terminals capable of pointing and directional gestures.
- Clean silhouette with zero motion lines, speed streaks, or dust puffs (prevents misinterpretation by autistic communicators).
- Torso filled with the Fitzgerald color for that button's grammar role. A green torso marks an action such as *run*. A yellow torso marks a pronoun such as *I* or *we*.
- Meaning comes from posture, action, and directional arrows.

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

### 4.4 Generation Prompt Architecture

Every symbol in Pip AAC is generated via `scripts/art/gen.mjs` using the locked 3-line base prompt:

```text
We are trying to teach a child the concept of: {word}.
Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.
Do not include any text in the image.
```

- **Plurals:** Automatically appends `Show more than one.`
- **Grammar Color:** Appends `The stick figure's torso is solid {color}.`
- **Abstract Concepts:** Appends a concise 5-to-10 word physical `sceneHint` rather than a full scene description. Rerolling across seeds is preferred over prompt bloating.


---

## 5. Proposed build order

**PROPOSED.** Not scheduled. None of these exist in the repo.

1. Compile the primary core list from the open sources in section 1 and write Pip AAC's own coordinate map.
2. Lock character drawing rules and the Fitzgerald torso mapping before producing a symbol set.
3. Scaffold the motor grid and the strip, with a test that suggestion output cannot reorder core indices.
4. Feed the strip from the local ranker within the latency rule in the dual-engine doc.
