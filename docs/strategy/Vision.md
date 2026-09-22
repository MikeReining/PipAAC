# Pip AAC — Product Vision & Scientific Foundations

**DECIDED 2026-09-21** (founder brief intake).
Durable facts map: `docs/product/SSOT.md`. Roadmap: `docs/strategy/Roadmap.md`.
Design invariants: `docs/product/Design_Invariants.md`.

---

## 1. The Core Thesis: The "Airtable Jump" for AAC

The Augmentative and Alternative Communication (AAC) industry has been technologically and conceptually stagnant for over a decade. Landmark tools such as Proloquo2Go, TouchChat, LAMP Words for Life, and Snap Core First established critical clinical principles in the early iPad era, but their software architecture remains trapped in what can best be described as the **"Excel Era" of AAC**.

In Excel, a spreadsheet treats the 2D grid as both the data model and the user interface. Cells have static physical coordinates (`A1`, `B2`). If you need relationships, dynamic grouping, or alternate workflows, you are forced to hack them together through brittle formulas, macros, and endless manual cell formatting.

Legacy AAC apps operate on this exact constraint:
- Language is flattened into a static 2D matrix of buttons (`6x6`, `7x11`, or 23 handcrafted grid templates).
- Screen coordinates equal vocabulary slots.
- "Motor planning" is attempted by freezing pixels in place, forcing complex template swaps (such as swapping core verbs for nouns) whenever a user navigates to a fringe topic.
- Vocabulary organization is structured like a 1990s file directory (`Food` $\rightarrow$ `Breakfast` $\rightarrow$ `Cereal` $\rightarrow$ `Oatmeal`), requiring four navigational taps to speak a single word, followed by manual "snapback" or home navigation to find a verb.
- Personalization is a grueling manual maintenance chore: caregivers and Speech-Language Pathologists (SLPs) must enter an administrative "Edit Mode" to configure individual buttons, colors, and links.
- Grammar is shoehorned into modal popup dialogues that interrupt the rhythm of conversation.
- The software is locked behind \$250–\$300 one-time paywalls or recurring subscriptions on single, proprietary iOS tablets.

### The Paradigm Shift

**Pip AAC is the "Airtable of AAC."** 

Just as Airtable recognized that spreadsheets are fundamentally relational databases that can be projected into Grids, Kanbans, Galleries, Forms, and Calendars, Pip AAC recognizes that **human communication is a living relational graph**—not a grid of plastic buttons.

```text
+-----------------------------------------------------------------------------------+
|                        THE RELATIONAL LANGUAGE & WORLD GRAPH                      |
|  - Core Lexicon (~200 high-frequency generative anchors)                         |
|  - Living Personal Entities (People, Places, Toys, Routines, Interests)           |
|  - Pragmatic Communication Functions (Comment, Protest, Ask, Joke, Direct, Feel)  |
|  - Morphological Flow Engine (Agreement, Tenses, Phonics, Part-of-Speech)         |
+-----------------------------------------------------------------------------------+
                                          |
          +-------------------------------+-------------------------------+
          |                               |                               |
          v                               v                               v
+-------------------+           +-------------------+           +-------------------+
| 1. MOTOR ANCHOR   |           | 2. CONTEXTUAL     |           | 3. VISUAL SCENE & |
|    GRID VIEW      |           |    RIVER VIEW     |           |    STORY VIEW     |
| Rock-solid motor  |           | Dynamic fringe    |           | Interactive real- |
| vectors for fast, |           | surfaces with core|           | photo hotspots; no|
| fluent automatic  |           | anchors during    |           | separate Pictello |
| daily expression. |           | active routines.  |           | app required.     |
+-------------------+           +-------------------+           +-------------------+
          |                               |                               |
          +-------------------------------+-------------------------------+
                                          |
                                          v
                        +-----------------------------------+
                        | 4. CAREGIVER CO-PILOT VIEW        |
                        | Multi-device real-time modeling   |
                        | and vocabulary expansion without  |
                        | snatching the child's screen.     |
                        +-----------------------------------+
```

By decoupling the **underlying language model and personal world graph** from the **surface interface**, Pip AAC:
1. Preserves motor automaticity without freezing users into rigid, brittle grids.
2. Surfaces rich fringe vocabulary instantly in context without 4-level deep folder mazes.
3. Eliminates the customization tax that causes 30% to 50% of AAC adoptions to fail.
4. Unlocks multiple fluid views of the same child's world (Grid, Contextual River, Visual Scenes, and Caregiver Co-Pilot).
5. Provides universal access via modern, local-first web architecture across all operating systems and devices.

---

## 2. Scientific & Clinical Foundations

Pip AAC is grounded in decades of peer-reviewed clinical research and established Speech-Language Pathology (SLP) best practices. Every design decision in Pip AAC directly operationalizes verified clinical science:

### 2.1 Presuming Competence (Biklen, 1999; Rossetti, 2014)
- **Clinical Principle:** All individuals with Complex Communication Needs (CCN) must be presumed capable of thinking, learning, and developing language. Communicators must not be subjected to arbitrary prerequisite testing (e.g., proving they can master cause-and-effect toys or single-noun requesting before receiving a full language system).
- **Pip AAC Law:** Full language access is provided on day one. Pip AAC does not restrict learners to isolated noun-boards or "basic requesting" silos. Scaffolding is achieved by progressive visual disclosure and guided modeling—never by stripping away linguistic capability.

### 2.2 Pragmatic Communication Functions Beyond Requesting (Light, 1988, 1989, 2003)
- **Clinical Principle:** Dr. Janice Light established that communicative competence spans four primary social purposes of interaction:
  1. *Communication of Wants and Needs* (Requesting, demanding)
  2. *Information Transfer* (Sharing knowledge, answering, describing, storytelling)
  3. *Social Closeness* (Connecting, bonding, sharing feelings, humor)
  4. *Social Etiquette* (Greetings, manners, social rituals)
  Plus internal dialogue, self-advocacy, and protesting.
- **The Failure of Legacy AAC:** Traditional apps overwhelmingly bias toward Purpose 1 (Wants/Needs), creating an instructional trap where non-speaking children are treated as vending machines who only speak to request food or toys.
- **Pip AAC Law:** Pragmatic intents are first-class functional lenses. Communicators can seamlessly transition between protesting (*"no"*, *"stop"*, *"don't like"*, *"unfair"*), commenting (*"cool"*, *"weird"*, *"broken"*), asking (*"why"*, *"what if"*), and joking (*"silly"*, *"uh-oh"*), with vocabulary re-weighting dynamically around the chosen pragmatic intent.

### 2.3 Core Vocabulary Architecture (Baker et al., 2000; Banajee et al., 2003; Beukelman & Mirenda, 2013)
- **Clinical Principle:** Across age, gender, and demographic groups, approximately 200 to 400 "core words" account for ~80% of all spoken communication. Core vocabulary consists predominantly of verbs, pronouns, prepositions, determiners, adverbs, and negation. Core words are generative and context-independent.
- **The Fringe Complement:** "Fringe words" (specific nouns, unique names, specialized interests) provide the remaining ~20% of communication. While fringe words are essential for personal identity and topical specificity, they cannot produce syntax or novel utterances in isolation.
- **Pip AAC Law:** Core words remain universally accessible across all views. They are never hidden, replaced, or displaced by fringe vocabulary.
- **Pip AAC Law (Clean-room primary set):** **DECIDED 2026-09-22** (not built). The first words that receive motor-grid coordinates are compiled from open clinical lists — Banajee, DiCarlo, and Stricklin (2003), Center for Literacy and Disability Studies core-word studies, and the MacArthur-Bates CDI — and then placed on a coordinate map Pip AAC designs itself. About 50 to 100 of those words form the first primary motor set. That range does not shrink the ~200 anchors in the relational graph. Incumbent button maps are not a source. Owner: `docs/product/Motor_Grid_And_Art.md`.

### 2.4 Motor Planning & Automaticity (Ducharme, 2010; Halloran / LAMP)
- **Clinical Principle:** Neurologically, human speech is largely motor-automatic. When speaking via an AAC system, if a communicator must visually search the screen for every button, cognitive bandwidth is drained by visual-perceptual navigation rather than semantic expression. Consistent motor pathways enable fast, fluent retrieval.
- **The Failure of Legacy AAC:** Legacy systems attempt motor planning by freezing absolute `(x, y)` button coordinates. If a child changes grid density (e.g., moving from 15 buttons to 60 buttons), or if an app switches between portrait and landscape, the motor plan is destroyed.
- **Pip AAC Law (Spatial Vector Anchoring):** Motor memory is preserved through relative spatial vectors (e.g., pronouns anchored top-left, core verbs in the center-left cluster, descriptors and spatial prepositions in consistent directional sectors). As the grid density expands or contracts across screen form factors, the spatial vector trajectories remain structurally invariant.
- **Pip AAC Law (No motor disruption within a view):** **DECIDED 2026-09-22** (not built). Once a density and orientation are in use, core cells do not swap, hide, or shift to chase a prediction. Moving a target mid-session forces a visual search and is especially costly for communicators who reach or fixate with effort (apraxia, cerebral palsy, tremor). Layout owner: `docs/product/Motor_Grid_And_Art.md`.
- **Pip AAC Law (Prediction must not coerce the grid):** **DECIDED 2026-09-22** (not built). Likely next words, especially fringe words that are not already on the core view, appear in a strip of at most four tiles above the grid. They do not rearrange the main board around what the model expects. Ranking owner: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.

### 2.5 Aided Language Stimulation & Partner Modeling (Goossens', 1989; Sennott et al., 2016; O'Neill, Light, & Pope, 2018)
- **Clinical Principle:** Children learn spoken language because immersion surrounds them with speech for thousands of hours before they speak their first word. AAC communicators require identical immersion: communication partners (parents, SLPs, peers, educators) must model language *on the AAC system* while speaking naturally ("Aided Language Input").
- **The Failure of Legacy AAC:** Traditional AAC is trapped on a single physical iPad mounted to a wheelchair or held in the child's hands. When an adult models, they must invade the child's physical space, hover over their shoulder, or physically take the device away.
- **Pip AAC Law (The Caregiver Co-Pilot):** Pip AAC leverages real-time local-first multi-device edge sync. A parent or educator can pull up the Caregiver Co-Pilot on their own phone or laptop. As the adult models an utterance, the target words highlight softly on the child's device in real time, demonstrating aided language without physical intrusion.

### 2.6 Emergent Literacy & The Alphabet Bridge (Erickson & Koppenhaver, 2020; Light & McNaughton, 2012)
- **Clinical Principle:** True communication autonomy requires literacy. A symbol-based AAC system is fundamentally bounded by the symbols programmed into it; only the alphabet unlocks the freedom to say anything at any time. Non-speaking children must have unrestricted access to the alphabet from the first day of intervention to scribble, explore phonics, and bridge to literacy.
- **Pip AAC Law:** The alphabet is integrated into the core interaction surface. Symbol prediction, phonics feedback, and multi-modal typing are accessible alongside core symbols, treating literacy as an immediate continuum rather than a secondary phase.

### 2.7 Eradicating AAC Abandonment (Baxter et al., 2012; Moorcroft et al., 2019)
- **Clinical Evidence:** Between 30% and 50% of all AAC systems are abandoned. Research identifies the top causes:
  1. Excessive configuration burden on families and clinical staff.
  2. Cumbersome, slow navigation leading to communication breakdowns.
  3. Device fragility and single-device lock-in.
  4. Social stigma of clunky, outdated software and hardware.
- **Pip AAC Law:** Pip AAC attacks every single cause of abandonment through zero-friction capture, instant context-surfacing, universal hardware support, and modern design standards.

### 2.8 Symbol Art and Grammar Color

**DECIDED 2026-09-22** (not built). Full drawing rules: `docs/product/Motor_Grid_And_Art.md`.

- **One stick character** carries people, pronouns, and actions. No hair, no gender markers, and no racial or ethnic cues. Posture and arrows carry the meaning. The torso is filled with the word's grammar color, not with clothing.
- **Objects** (food, vehicles, household things, animals) use a separate warm illustrated style: rounded curves, solid fills, clean outlines.
- **Modified Fitzgerald Key** assigns the colors: yellow/orange for pronouns, people, and nouns; green for verbs; blue for descriptors; pink/magenta for social phrases, prepositions, and conjunctions; red or a black outline for negation, stops, and emergency words.
- **In-house assets only.** Images, audio, and layout styles are created for Pip AAC. Competitor symbol libraries are not a source.

---

## 3. The 4 Robust AAC Pillars Re-engineered

In their landmark guidance (*"4 things every robust AAC has"*), AssistiveWare outlined the four non-negotiable requirements of robust communication. Here is how Pip AAC transforms those requirements from 2015 constraints into next-generation capabilities:

| Robust Pillar | Traditional Implementation (Proloquo / TouchChat) | Pip AAC Next-Generation Implementation |
| :--- | :--- | :--- |
| **1. Communication Functions** | Static folder buttons or pre-scripted quick phrases (*"I need help"*, *"I want"*). | **Pragmatic Lenses:** Dynamic re-weighting of the lexicon for Protesting, Commenting, Joking, Inquiring, and Social Connection. |
| **2. Core Words** | Fixed button grids. Adding fringe vocabulary often requires displacing core words or building separate activity templates. | **Spatial Vector Anchoring:** Core vocabulary is permanently available with stable vector relationships that scale smoothly across screen densities. |
| **3. Fringe & Personal Vocabulary** | Hierarchical directory folders (`Food` $\rightarrow$ `Breakfast` $\rightarrow$ `Oatmeal`). Personalization requires manual cell editing in administrative menus. | **Living World Knowledge Graph:** Entities are relational nodes (People, Places, Routines, Favorites). Adding an entity once populates it across all relevant contextual moments automatically. |
| **4. Alphabet & Literacy** | An isolated QWERTY / ABC keyboard screen accessed via a navigation tab. | **Phonics-Linked Literacy Bridge:** Real-time symbol-to-text conversion, phonics sound exploration, and symbol-assisted word prediction. |

---

## 4. Architectural Highlights: Why Pip AAC is Far Better

### 4.1 Zero-Friction Living World (No More Manual Cell Editing)
In traditional AAC, adding a new family pet or a new classmate takes 10 to 15 minutes of an adult navigating menus, importing photos, picking colors, and selecting folders. In Pip AAC:
- A caregiver snaps a photo of their dog "Barnaby" or speaks: *"We went to the beach with Grandpa today."*
- Pip AAC registers the entity `Barnaby` as `Type: Pet/Dog`, and automatically binds the relevant relational verbs (`pet`, `walk`, `feed`, `play`, `bark`), adjectives (`fluffy`, `fast`, `big`), and pronouns (`he`).
- The entity is instantly accessible when discussing pets, outdoor activities, or family members—with zero manual folder plumbing.

### 4.2 Morphological Flow Engine vs. Modal Popups
In legacy apps, conjugating a verb requires holding a button down until a modal window pops up (e.g. Past, Present, Future, He/She/It), requiring another tap and closing the dialog. This breaks fluent rhythm.
- Pip AAC introduces an inline **Morphological Flow Engine**.
- If the communicator taps `Yesterday` $\rightarrow$ `I` $\rightarrow$ `go`, the engine intelligently surfaces or automatically infers `went`.
- The communicator retains complete agency: they can speak telegraphically (*"go store"*) or expand into grammatically complete syntax (*"I went to the store"*) with zero friction.

### 4.3 Multi-Surface Views (One Child, Many Contexts)
Instead of forcing the learner into a single rigid grid:
1. **Motor Anchor Grid:** The standard, high-speed daily driver for generative language. Under the sentence bar, a predictive strip of at most four icon-and-text tiles offers the likely next fringe word. The core cells underneath stay where they are. **DECIDED 2026-09-22** (not built). Spec: `docs/product/Motor_Grid_And_Art.md`.
2. **Contextual River View:** What is happening right now? (Dinner table, art class, playground). Relevant fringe entities dock gently alongside the core grid without page flips.
3. **Visual Scene & Story View:** Built-in photographic hotspot scenes (e.g., photo of the child's bedroom or playground), eliminating the need for fragmented companion apps like Pictello.
4. **Caregiver Co-Pilot View:** Multi-device partner modeling, monitoring, and vocabulary enrichment.

### 4.4 Local-First, Universal Web Standard
- **No Walled Garden:** Built as a modern, local-first Progressive Web Application (PWA).
- **Runs Everywhere:** iPads, low-cost Android tablets, Amazon Fire tablets, Chromebooks, laptops, and smartphones.
- **Offline-Always:** Communication is an essential lifeline. Pip AAC functions 100% offline with instant local storage, syncing state to Cloudflare edge Workers whenever connectivity is available.
- **Zero Loss:** Profiles and language graphs are encrypted and backed up seamlessly. If an iPad drops and cracks, opening Pip AAC on a \$40 phone instantly restores the child's exact voice and vocabulary.

### 4.5 Dual-Engine Predictive Intelligence
- **The Intelligence Breakthrough:** Blending ultra-low-latency System One semantic classification (TypeSafe Jev) with private, on-device behavioral memory (SQLite/IndexedDB).
- Full specification: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.

---

## 5. Durable Claims & Technical Alignment

- **DECIDED 2026-09-21** (founder brief intake):
  - Product identity: **Pip AAC** (repo: PipAAC).
  - Core architectural paradigm: Relational Language Graph decoupled from multiple surface views (Motor Grid, Context River, Visual Scene, Partner Co-Pilot).
  - Predictive intelligence: Dual-Engine system (TypeSafe Jev edge classification + On-device encrypted SQLite store; see `docs/strategy/Dual_Engine_Predictive_Intelligence.md`).
  - Platform strategy: Local-first, offline-always web architecture (Cloudflare edge sync + client-side persistence).
  - Clinical adherence: Absolute compliance with ASHA standards, Janice Light's 4 communication purposes, core vocabulary research, motor planning automaticity, and aided language stimulation.
- **DECIDED 2026-09-22** (mentor intake; not built). Owners: `docs/product/Motor_Grid_And_Art.md` and `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.
  - Clean-room motor grid: independent coordinates; vocabulary seeded from open clinical lists; no transcription of incumbent boards or symbol libraries.
  - Within a view, core indices do not move. Across densities, spatial-vector anchoring from 2026-09-21 still applies.
  - Predictive strip: at most four text-and-icon tiles between the sentence bar and the core grid. Suggestions do not reorder the grid.
  - Symbol art: one neutral stick character with Fitzgerald-colored torsos; illustrated objects for inanimate nouns; in-house assets only.
- **PROPOSED**:
  - Primary production domain: `pippaac.org`.
  - Phase 1 execution slice: Relational Core Schema + Spatial Vector Engine + Responsive Motor Grid View proof.

---

## 6. References & Scientific Bibliography

1. **Baker, B., Hill, K., & Devendorf, R. (2000).** *Core vocabulary is the same across environments and activities.* Augmentative and Alternative Communication.
2. **Banajee, M., DiCarlo, C., & Stricklin, S. B. (2003).** *Core vocabulary determination for toddlers.* Augmentative and Alternative Communication, 19(2), 67–73.
3. **Baxter, S., Enderby, P., Evans, P., & Judge, S. (2012).** *Barriers and facilitators to the use of high-technology augmentative and alternative communication devices.* Disability and Rehabilitation: Assistive Technology, 7(2), 93–103.
4. **Beukelman, D. R., & Mirenda, P. (2013).** *Augmentative and Alternative Communication: Supporting Children and Adults with Complex Communication Needs.* Brookes Publishing.
5. **Biklen, D. (1999).** *Presuming Competence.* Inclusion News.
6. **Binger, C., & Light, J. (2007).** *The effect of aided AAC modeling on the expression of multi-symbol messages by preschoolers.* Augmentative and Alternative Communication, 23(1), 30–43.
7. **Erickson, K., & Koppenhaver, D. (2020).** *Comprehensive Literacy for All: Teaching Students with Significant Disabilities to Read and Write.* Brookes Publishing.
8. **Goossens', C. (1989).** *Aided communication intervention before assessment: A case study of a child with cerebral palsy.* Augmentative and Alternative Communication, 5(1), 14–26.
9. **Johnson, J. M., Inglebret, E., Jones, C., & Ray, J. (2006).** *Perspectives of speech language pathologists regarding success versus abandonment of AAC.* Augmentative and Alternative Communication, 22(2), 85–99.
10. **Light, J. (1988).** *Interaction involving individuals using augmentative and alternative communication systems: State of the art and future directions.* Augmentative and Alternative Communication, 4(2), 66–82.
11. **Light, J. (1989).** *Toward a definition of communicative competence for individuals using augmentative and alternative communication systems.* Augmentative and Alternative Communication, 5(2), 137–144.
12. **Light, J., & McNaughton, D. (2012).** *The changing face of augmentative and alternative communication: Past, present, and future directions.* Augmentative and Alternative Communication, 28(4), 197–204.
13. **Moorcroft, A., Scarinci, N., & Meyer, C. (2019).** *Speech-language pathologist perspectives on the abandonment of AAC technologies.* Disability and Rehabilitation: Assistive Technology, 14(6), 570–581.
14. **O'Neill, T., Light, J., & Pope, L. (2018).** *Effects of interventions that include aided augmentative and alternative communication input on the communication of individuals with complex communication needs: A meta-analysis.* Journal of Speech, Language, and Hearing Research, 61(7), 1743–1765.
15. **Rossetti, Z. (2014).** *Presuming Competence: A Blueprint for AAC.* Perspectives on Augmentative and Alternative Communication.
16. **Sennott, S. C., Light, J. C., & McNaughton, D. (2016).** *AAC modeling intervention research review.* Communication Disorders Quarterly, 37(2), 105–115.
17. **Fenson, L., Marchman, V. A., Thal, D. J., Dale, P. S., Reznick, J. S., & Bates, E. (2007).** *MacArthur-Bates Communicative Development Inventories: User's guide and technical manual* (2nd ed.). Brookes Publishing.
18. **Center for Literacy and Disability Studies.** Core-word studies used as an open seeding source for the primary motor set. Named in `docs/product/Motor_Grid_And_Art.md`. Not a claim that a specific CLDS table has been transcribed into the product.
