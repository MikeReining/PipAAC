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

**DECIDED 2026-09-22** (not built). Two drawing systems. Both are made in-house. Audio assets and layout stylesheets follow the same isolation rule: they are created for Pip AAC, not imported from an incumbent library.

### 4.1 Stick character (people, pronouns, actions)

One character, used everywhere a human figure carries the meaning.

- No hair, no gender markers, and no racial or ethnic cues.
- Bold, uniform monoline stroke.
- Rounded joint terminals.
- A floating, solid circular head.
- Torso filled with the Fitzgerald color for that button's grammar role. A green torso marks an action such as *run*. A yellow torso marks a pronoun such as *I* or *we*.
- Meaning comes from posture, action, and directional arrows. Faces stay simple. The character does not rely on a detailed expression to be understood.

The same character is the person on pronoun buttons and the actor on verb buttons. Do not introduce a second human style for a demographic group.

### 4.2 Objects and other fringe icons

Inanimate nouns (vehicles, food, household items, animals) use a warm illustrated style: soft rounded curves, solid fills, clean outlines. They do not use the stick body. An animal is drawn as that animal, not as the stick character in a costume.

Custom fringe entities (a family member, a pet, a place) may use a caregiver photo or an in-house icon. They still must not use a third-party symbol library.

---

## 5. Proposed build order

**PROPOSED.** Not scheduled. None of these exist in the repo.

1. Compile the primary core list from the open sources in section 1 and write Pip AAC's own coordinate map.
2. Lock character drawing rules and the Fitzgerald torso mapping before producing a symbol set.
3. Scaffold the motor grid and the strip, with a test that suggestion output cannot reorder core indices.
4. Feed the strip from the local ranker within the latency rule in the dual-engine doc.
