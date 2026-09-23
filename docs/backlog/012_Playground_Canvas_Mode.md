# Phase 012 — Playground (Canvas Mode)

**Status:** Preliminary (PROPOSED). Not yet implementation-ready; architectural and clinical framing.

> **HOLD — founder, 2026-09-22.** Parked in the backlog; not work. Why:
> gestalt language processors communicate in whole phrases and scripts,
> not word clusters, so they need phrase tiles rather than a canvas;
> "Speak Idea" has a model write and speak a sentence for the child, an
> authorship problem SLPs will reject unless the child confirms it;
> freeform dragging excludes the switch and eye-gaze users 014 serves.
> Unhold when: it is reframed (for example as the Visual Scene view in
> `docs/strategy/Vision.md` § 4.3) with an accessible input model and
> child-confirmed output.

**PROPOSED 2026-09-22** (founder direction on AssistiveWare Thinking Space comparison, relational language graph, and occasion-aware surface expansion).

Product truth this phase explores:

| Topic | Owner |
| --- | --- |
| Relational Language Graph ("The Airtable Jump") | `docs/strategy/Vision.md` § 1, `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 1 |
| Multi-Surface Projections (Motor Grid vs. Playground) | `docs/strategy/Vision.md` § 1 |
| Occasions as cross-cutting semantic priors | `docs/phases/007_Occasions.md`, `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.2 |
| Symbol art, Fitzgerald roles, and tile anatomy | `docs/product/Motor_Grid_And_Art.md`, `docs/product/Design_System.md` |
| Local SQLite storage and privacy boundaries | `docs/product/Language_And_Voice_Schema.md`, `docs/product/Design_Invariants.md` |

---

## Why this phase exists

Traditional AAC systems force communicators into a single, strict, linear syntagmatic mode: constructing sentences word-by-word from left to right along a sentence bar (`[I] [want] [eat] [apple]`).

While essential for syntactic speech generation, this linear pipeline fails several critical clinical populations and communication moments:
1. **Gestalt Language Processors (GLPs) & Associative Thinkers:** Many neurodivergent and autistic learners conceptualize meaning in visual *scenes*, *clusters*, and *thematic webs* rather than subject-verb-object linear sequences. Forcing immediate left-to-right grammar can lead to cognitive overload and task refusal.
2. **Pre-sentence Exploratory Play:** Early communicators need a low-stakes visual sandbox to place, cluster, compare, and play with words (e.g. grouping animals, pairing opposites, creating morning routines) without the pressure of speaking a formal sentence.
3. **Classroom & Therapy Visual Modeling:** Teachers and Speech-Language Pathologists (SLPs) frequently need dynamic "visual whiteboards" to support shared reading, lesson themes, or social stories.

### The AssistiveWare "Thinking Space" Precedent
AssistiveWare introduced "Thinking Space" in Proloquo (2022) as a freeform canvas where symbols can be moved anywhere and saved as photos. However, AssistiveWare's implementation is essentially a **passive digital sticker board**:
* It is disconnected from predictive intelligence or linguistic expansion.
* Words are static pictures; clustering them does not connect back to generative communication.
* It lives in isolation from their rigid button grid.

### The Pip AAC Leapfrog: "The Airtable Jump" on Canvas
Pip AAC's foundational architecture is not a flat button spreadsheet—it is a **Relational Language Graph** (`docs/strategy/Vision.md`). Words in Pip are multi-dimensional nodes with links to:
* **Categories & Core Roles** (Fitzgerald grammar roles, groups).
* **Occasions** (`docs/phases/007_Occasions.md`: breakfast, playground, doctor, bedtime).
* **Personal Entities** (family members, pets, favorite toys).
* **Semantic Neighbors & Opposites** (functional relationships: `dog` ↔ `bark`, `leash`, `park`, `run`).

In Pip AAC, the **Playground** is an interactive multi-surface projection of this relational graph.

---

## The Playground Architecture

```text
+-----------------------------------------------------------------------------------+
|  [← Board]   Playground Canvas: "At the Dog Park"                [Clear] [Share]   |
+-----------------------------------------------------------------------------------+
|  RELATIONAL STRIP:  [leash]       [bark]        [run]       [park]   |🗂️Grp| [Speak] |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|         [ 🐕 dog ] <------- semantic link -------> [ 🏃 run ]                     |
|                                                                                   |
|               \                                   /                               |
|                \-----> [ 🎾 ball ] <-------------/                                |
|                                                                                   |
|   (Freeform 2D canvas: drag, cluster, resize, and connect relational concepts)   |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

### 1. The Playground Relational Strip (Surfacing Related Items)
In the Motor Grid, the predictive strip predicts **next words in time** (syntagmatic prediction: `I` → `want` → `go`).

In the Playground, the strip transforms into a **Relational Expansion Strip**:
* **Contextual Association:** Instead of predicting next grammatical tokens, it surfaces **semantically and situationally related items** drawn from:
  1. The **Occasion Graph** (`docs/phases/007_Occasions.md`): If the canvas is tagged with or contains items from an occasion (e.g. "Park" or "Bedtime"), occasion-related words rise to the top.
  2. **Active Item Neighbors:** When a word on the canvas is selected or tapped (e.g. `dog`), the strip displays 4 high-affinity relational nodes (e.g., `leash`, `bark`, `run`, `treat`).
  3. **Visual & Symbolic Integrity:** Every surfaced candidate displays Pip's standard stick-figure or object art and Fitzgerald color tint (`docs/product/Design_System.md`). It is never plain text.
* **One-Tap Placement:** Tapping a card in the relational strip places that word directly onto the canvas near the active cluster.

### 2. Multi-Word Clustering & Grouping
* Children and therapists can freely drag words into clusters (e.g. "Things that are cold", "What we do at school").
* Spatial proximity defines conceptual clusters.
* Tiles retain their motor-grid symbol art and label anatomy so visual familiarity is reinforced.

### 3. Jev "Idea Speaker" (Generative Bridge from Thought to Speech)
A passive canvas leaves communicators stranded without a voice. Pip AAC bridges visual thought to spoken language:
* **Sequential Voice (Default):** Tapping any individual word on the canvas speaks that word using the profile's chosen voice.
* **Cluster Speaker:** Tapping a cluster speaks the items in spatial sequence.
* **The Jev Idea Bridge (Optional / Clinical):** Tapping the `Speak Idea` button sends the cluster's sense labels to Jev (`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 3) with a synthesis prompt:
  * Input: `[dog, park, run, happy]`
  * Synthesized Utterance: *"The dog loves to run at the park!"*
  * The synthesized sentence is presented in an optional sentence strip, allowing the child to hear their clustered thoughts expressed as full conversational speech without having to struggle through complex manual syntax assembly.

---

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| Playground, Canvas mode, Canvas surface | Thinking Space (AssistiveWare trademark), Whiteboard, Sticker board |
| Relational strip, associative expansion | Prediction bar (in canvas mode), Auto-complete |
| Word cluster, concept cluster | Mind map, folder |
| Idea speaker, cluster synthesis | Sentence generator bot, AI auto-talk |

---

## Proposed Slices (Preliminary)

### Slice 1 — Canvas Surface & Navigation
- Add `Playground` toggle anchor in the board navigation.
- Implement an unconstrained 2D pan/zoom canvas rendering existing word tiles.
- Switching between Motor Grid and Playground preserves the current Motor Grid sentence bar state.

### Slice 2 — Playground Relational Strip
- Adapt the strip UI component to Canvas mode.
- Connect the strip ranking to local relational graph neighbors and active occasion priors (`docs/phases/007_Occasions.md`), rather than bigram/trigram next-word prediction.
- Tapping a strip item instantiates a new tile on the canvas.

### Slice 3 — Canvas State Persistence (Local SQLite)
- Save canvas layouts per profile (`playground_canvas`, `canvas_item` tables).
- Support naming, saving, clearing, and exporting canvases (image export / printing for school IEPs and home schedules).

### Slice 4 — Cluster Audio & Jev Idea Synthesis
- Play individual word audio on tile tap.
- Implement "Synthesize Cluster" using Jev System One classification/ranking to produce an utterance suggestion from 2–5 clustered words.

---

## Open Questions & Clinical Invariants

1. **Motor Memory vs. Freeform Canvas:** The core motor grid must remain strictly coordinate-locked (`docs/product/Motor_Grid_And_Art.md`). The Playground is an intentional secondary projection surface; actions in the Playground must never move or alter cells on the primary motor grid.
2. **Offline-First Resilience:** The Relational Strip in the Playground must work 100% offline using local SQLite relational edges and occasion priors. Jev idea synthesis is an online enhancement, gracefully degrading to sequential speech when offline.
3. **Accessibility & Scanning:** Freeform 2D drag-and-drop can challenge switch-access and eye-gaze users. A grid-snapping mode or quadrant navigation will be required before this mode is promoted to full accessibility compliance.
