# Phase 010 — Extended Vocabulary & Phrase Derivation Proposal

**Status:** Proposed (ephemeral design doc). Feeds Phase 010 Slice 1.
Intake & parent phase: `docs/phases/010_Extended_Picture_Library.md`.
Foundational context: `docs/founder/2026-09-22_Customization_Library_Sync.md`, `docs/product/Word_Library.md` § 6.

> [!NOTE]
> **Ephemeral Document:** This proposal defines how the extended lexicon (target: ~2,000 words + 300–500 phrases) will be derived, ranked, and categorized. Once Phase 010 Slice 1 executes and produces the authoritative catalog in `docs/product/Extended_Vocabulary_Catalog.md`, this proposal document will be removed per project documentation rules (git history is the archive).

---

## 1. Executive Summary & Design Invariants

Pip AAC ships a clean-room launch vocabulary of 677 words (680 catalog entries) bundled on-device (`docs/product/Initial_Vocabulary_600.md`, `data/launch_lexicon.json`). On 2026-09-22, the founder approved building an **Extended Picture Library** (`secondary_fringe` tier) consisting of **2,000 words + 300 to 500 phrases** (`docs/phases/010_Extended_Picture_Library.md` Slice 0).

The extended library solves customization friction: when a parent or SLP types a concept into the app (e.g., *trampoline*, *waffles*, *brush teeth*, *I can't breathe*), Pip AAC provides a clinical-grade illustration and a professional studio voice recording out-of-the-box, eliminating the chore of finding photos or recording raw audio.

### Standing Invariants

1. **Tier 3 (`secondary_fringe`) Isolation:**
   - Extended words and phrases reside in the Library only.
   - They appear on **zero default pages** and are **never suggested by the predictive strip** until an adult or learner explicitly adds them to a group or layout (`docs/product/Word_Library.md` § 6).
2. **Strict Launch Catalog Non-Overlap:**
   - No extended entry may duplicate a lemma or sense already present in the 677-word launch catalog (`data/launch_lexicon.json`).
3. **Single Acoustic Utterance Law for Phrases:**
   - Every phrase is voiced as an exact, unified recording (`apple juice`, `I'm in pain`). Lookup never stitches individual word audio clips together (`docs/product/Language_And_Voice_Schema.md` § 8).
4. **Unified Visual System & Color Taxonomy:**
   - Visual archetypes strictly follow the house style: Stick Figure, Illustrated Object, or Diagrammatic (`docs/product/Motor_Grid_And_Art.md` § 4).
   - Torso/outline colors strictly obey the Modified Fitzgerald Key (`docs/product/Design_System.md`).
5. **Deterministic Source of Truth:**
   - The human-readable Markdown specification in `docs/product/` is the single source of truth.
   - Catalog JSON (`data/extended_lexicon.json`) is derived deterministically from the Markdown via a dedicated generator script (`scripts/catalog/extract_extended_lexicon.mjs`).

---

## 2. Derivation Pipeline for Words (Target: 2,000 Words)

Single-word selection cannot be hand-picked or subjective. It must follow the evidence-based lineage established during the launch catalog derivation (`data/reference/aoa-README.md`).

```text
  data/reference/aoa.csv (41,900 English words with empirical acquisition age)
                                │
                                ▼
  [ Filter 1: Lemma & Launch Catalog Deduplication ]
  Excludes all 677 launch lemmas and inflected forms handled by Phase 005 Word Forms
                                │
                                ▼
  [ Filter 2: Age-of-Acquisition (AoA) Primary Ranking ]
  Ranks candidates ascending by AoA (Kuperman norms: preschool ≤ 5.0, kindergarten ≤ 6.5, early elementary ≤ 8.0)
                                │
                                ▼
  [ Filter 3: Frequency Floor Check & Outlier Elimination ]
  Cross-checks with data/reference/fry-rank-1000.txt to reject archaic/rare words
                                │
                                ▼
  [ Filter 4: Category Quota Balancing ]
  Distributes candidates across balanced clinical & functional secondary-fringe categories
                                │
                                ▼
  [ Output: 2,000 Secondary Fringe Words ]
  Each with Part of Speech, Fitzgerald Color, Archetype, Category, and 1-Line Art Prompt
```

### 2.1 The Derivation Stages for Words

#### Step 1: Normalization and Deduplication
- Read `data/reference/aoa.csv` (~41,900 words).
- Normalize tokens (lowercase, strip whitespace and punctuation).
- Drop any candidate whose lemma matches a sense in `data/launch_lexicon.json`.
- Exclude inflections governed by Phase 005 Word Forms (e.g. plurals `-s`/`-es`, past tense `-ed`, progressive `-ing`, comparatives `-er`/`-est`): keep the dictionary base lemma.

#### Step 2: Primary Age-of-Acquisition (AoA) Ranking
- In child language development, adult word frequency is backwards: *situation* appears 20× more frequently than *marshmallow* in adult subtitle corpora, but children learn *marshmallow* at age 3.8 and *situation* at age 9.3 (`data/reference/aoa-README.md`).
- Primary target band: AoA between **2.5 and 6.5 years** (Preschool through Kindergarten).
- Secondary ceiling: AoA up to **8.0 years** strictly for concrete nouns (e.g. specialized animals, instruments, sports equipment, community locations). Words with AoA > 8.0 are rejected unless flagged for medical or emergency necessity.

#### Step 3: Frequency Floor Check
- Cross-reference candidates against `data/reference/fry-rank-1000.txt` and high-frequency child corpora.
- Prevents admitting low-frequency laboratory anomalies that happen to have early acquisition ratings but little pragmatic AAC utility.

#### Step 4: Category Distribution Quotas
To ensure balanced communicative breadth and prevent noun flooding, candidate words are bucketed into target categories with strict minimum and maximum quotas:

| Category | Target Count | Description & Examples |
| :--- | :---: | :--- |
| **Food & Drink (Fringe)** | 300 | Specific fruits, vegetables, snacks, meals (*avocado*, *blueberry*, *burrito*, *spaghetti*, *lemonade*) |
| **Toys, Play & Recreation** | 250 | Games, sports, toys, playground equipment (*trampoline*, *scooter*, *puzzle*, *sandbox*, *skateboard*) |
| **Routines & Daily Living** | 250 | Household tools, personal care items, clothing (*toothbrush*, *pajamas*, *blanket*, *comb*, *shampoo*) |
| **Emotions, Sensory & Descriptors** | 250 | Nuanced sensory states, physical descriptors (*frustrated*, *excited*, *sticky*, *bumpy*, *freezing*, *bright*) |
| **School, Learning & Art** | 200 | Classroom items, subjects, school tools (*backpack*, *scissors*, *crayons*, *marker*, *recess*, *library*) |
| **Nature, Outdoors & Animals** | 250 | Specific wild animals, sea life, insects, weather (*dolphin*, *squirrel*, *butterfly*, *thunder*, *rainbow*) |
| **Actions & Verbs (Secondary)** | 200 | Specific fine and gross motor verbs (*climb*, *whisper*, *scrub*, *fold*, *squeeze*, *carry*, *balance*) |
| **Places & Community** | 150 | Community destinations, public venues (*zoo*, *aquarium*, *dentist*, *supermarket*, *pool*, *church*) |
| **Body, Health & Medical** | 150 | Anatomy, medical equipment, clinical symptoms (*bandage*, *knee*, *fever*, *cough*, *medicine*, *cast*) |
| **Total** | **2,000 words** | |

#### Step 5: Visual Archetype and Metadata Enrichment
Every surviving word is assigned:
- **Part of Speech:** Noun, Verb, Adjective, Adverb, Interjection, etc.
- **Modified Fitzgerald Color:**
  - *Yellow/Orange:* People, pronouns, nouns.
  - *Green:* Verbs and action concepts.
  - *Blue:* Descriptors, sensory states, adjectives, feelings.
  - *Pink/Magenta:* Prepositions, social markers, conjunctions.
  - *Red/Black Outline:* Negation, danger, stops, medical urgencies.
- **Visual Archetype:**
  - *Illustrated Object:* Inanimate objects, tools, foods, vehicles, clothing, animals.
  - *Stick Figure:* Human figures, actions, interpersonal verbs, social gestures.
  - *Diagrammatic:* Spatial concepts, abstract relationships, vectors.
- **One-Line Art Prompt:** Compliant with `docs/product/Art_Generation_Lessons.md` (isolated subject, clean outline, flat color, pure white background, zero readable text).

---

## 3. Derivation Pipeline for Phrases (Target: 300–500 Phrases)

Single-word AoA and Fry rank do not evaluate multi-word units. Multi-word phrases in AAC serve distinct clinical, physical, and communicative needs that single core words cannot deliver quickly enough during distress, rapid transit, or cognitive overload.

### 3.1 The Four Functional Clinical Domains

Phrases are curated across four evidence-based domains:

```text
                            +-------------------------------------------+
                            |      EXTENDED PHRASE LIBRARY (300-500)    |
                            +-------------------------------------------+
                                  │          │           │          │
         ┌────────────────────────┘          │           │          └───────────────────────┐
         ▼                                   ▼           ▼                                  ▼
+───────────────────+             +────────────────+ +─────────────────────+      +──────────────────+
| 1. URGENT &       |             | 2. ACTIVITIES  | | 3. GESTALT LANGUAGE |      | 4. SOCIAL &      |
|    MEDICAL        |             |    OF DAILY    | |    SCRIPTS (GLP)    |      |    CONVERSATIONAL|
|    (50–75)        |             |    LIVING      | |    (100–150)        |      |    REGULATORS    |
|                   |             |    (150–200)   | |                     |      |    (50–75)       |
+───────────────────+             +────────────────+ +─────────────────────+      +──────────────────+
• Pain & location                 • Morning prep   • Holistic scripts      • Greetings & exits
• Breathing & crisis              • Mealtime steps • Emotional regulation  • Boundaries
• Positioning/physical            • Toileting/bath • Transitional scripts  • Pragmatic pivots
• Sensory overload                • School/transit • Connection bids       • Repair strategies
```

#### Domain 1: Urgent Needs & Medical Communication (50–75 phrases)
- **Clinical Lineage:** Emergency department and nonvocal ICU research (VidaTalk study, PMC10833611), hospital and aphasia AAC communication protocols (Lingraphica, Aphasia Institute).
- **Core Focus:** When a child or nonvocal patient is in distress, navigation through multi-folder core grids creates severe cognitive fatigue. Critical messages must be accessible in a single tap.
- **Feeds:** Phase 014 Slice 6 ("Message tiles" for the Urgent Needs starter board, `docs/phases/014_Grid_Density_And_Fit.md` § 5.2).
- **Phrase Targets:**
  - *Pain & Physical Distress:* "I'm in pain", "my head hurts", "my tummy hurts", "I feel sick", "I feel dizzy", "I can't breathe", "need medicine".
  - *Bodily Positioning & Care:* "move me", "turn me over", "help me sit up", "bathroom please", "too hot", "too cold", "blanket on", "take it off".
  - *Sensory Overload & Crisis Protests:* "too loud", "turn off lights", "need a break", "give me space", "stop touching me", "I want to go home".
  - *Assistance Calls:* "call nurse", "call mom", "call dad", "call doctor", "don't leave me", "stay with me".

#### Domain 2: Daily Routines & Activities of Daily Living (ADLs) (150–200 phrases)
- **Clinical Lineage:** Functional Communication Training (FCT), Project Core routine sequences, early intervention ADL protocols.
- **Core Focus:** 2- to 3-word functional routine milestones spoken repeatedly throughout the day.
- **Phrase Targets:**
  - *Hygiene & Self-Care:* "brush teeth", "wash hands", "dry hands", "comb hair", "cut nails", "go potty", "flush toilet", "take a bath".
  - *Dressing & Packing:* "put on shoes", "put on socks", "put on coat", "take off shoes", "pack backpack", "get dressed", "pajamas on".
  - *Mealtime Routines:* "time to eat", "wash table", "drink water", "wipe face", "all done eating", "clean up plate", "pour milk".
  - *Transitions & Transit:* "buckle seatbelt", "get in car", "get out of car", "wait in line", "hold my hand", "walk nicely", "time for bed".
  - *School & Classroom:* "circle time", "recess time", "open book", "pack up", "sit on rug", "raise hand".

#### Domain 3: Gestalt Language Processing (GLP) Stage 1 & 2 Scripts (100–150 phrases)
- **Clinical Lineage:** Natural Language Acquisition (NLA) framework (Blanc, 2012; Prizant et al., 2006).
- **Core Focus:** Autistic children and gestalt language processors acquire language in whole gestalt chunks, phrases, and scripts before breaking them down into single words. A single-word-only board disenfranchises GLPs (`docs/backlog/012_Playground_Canvas_Mode.md`).
- **Phrase Targets:**
  - *Joint Attention & Connection:* "look at that", "check this out", "come with me", "let's do it", "ready set go", "I did it", "watch this".
  - *Emotional Regulation & Safety:* "it's okay", "don't worry", "take a deep breath", "we can do it", "I'm so excited", "this is scary".
  - *Transitions & Agency:* "let's get out of here", "what's happening next", "where are we going", "it's time for lunch", "let's go outside", "I want to watch".
  - *Affection & Bonding:* "I love you", "give me hug", "hold you", "I miss you".

#### Domain 4: Social Regulators & Conversational Pragmatics (50–75 phrases)
- **Clinical Lineage:** Light's communicative competence domains, pragmatic social scripts.
- **Core Focus:** Quick pragmatic interjections that maintain the flow of peer interactions without forcing multi-word syntax construction.
- **Phrase Targets:**
  - *Social Exchanges:* "see you later", "good morning", "good night", "have a good day", "welcome back", "thank you so much", "you're welcome".
  - *Boundary & Assertion:* "no thank you", "leave it alone", "that's mine", "not right now", "I changed my mind", "that's not fair".
  - *Conversational Flow:* "my turn now", "your turn", "wait a minute", "I don't know", "tell me more", "what do you think", "excuse me please".

### 3.2 Candidate Extraction & Empirical Evidence for Phrases

To avoid arbitrary authoring, phrase candidates are extracted and scored from three empirical sources:

1. **CHILDES Spoken Multi-Word Utterances:**
   - Extract the highest-frequency 2-word, 3-word, and 4-word utterances from the English CHILDES developmental database (children aged 2–6).
   - Serves as the frequency and naturalness baseline.
2. **Clinical AAC Routine Inventories:**
   - Standard ADL communication phrase banks from clinical resources (Project Core, AAC Language Lab, PODD functional communication categories).
3. **Medical & ICU Research Datasets:**
   - VidaTalk communication inventory (PMC10833611) and inpatient AAC assessment protocols.

### 3.3 Strict Phrase Constraints

- **Length Limit:** Strictly **2 to 4 words** (maximum 30 characters). Anything longer becomes cumbersome on visual tiles and cognitive layout.
- **Core Redundancy Ban:** Do not add a phrase if it simply duplicates an effortless 2-tap Root Core combination (e.g. "I want" is 2 adjacent taps on `grid60` and does not belong as a fixed phrase), UNLESS the phrase serves an urgent, high-distress self-advocacy purpose or an established GLP gestalt script.
- **Acoustic Integrity:** Each phrase is a discrete synthesis job in `scripts/catalog/generate_missing_audio.mjs`. Audio clips must never be faked by concatenating existing word clips.

---

## 4. Engineering Architecture & File Schema

### 4.1 Single Source of Truth: Markdown Catalog Specification

Following the pattern of `docs/product/Initial_Vocabulary_600.md`, all 2,000 words and 300–500 phrases will be authored in a single source-of-truth document:
`docs/product/Extended_Vocabulary_Catalog.md`

#### Format for Word Entries:
```markdown
| Slot | Word / Lemma | Part of Speech | Fitzgerald Color | Visual Archetype | Secondary Category | Selection Evidence | Art Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1001 | **trampoline** | Noun | Yellow | Illustrated Object | Toys & Recreation | AoA 3.92; Fry ≤800 | Clean round backyard trampoline with black safety netting and blue spring pad |
```

#### Format for Phrase Entries:
```markdown
| Slot | Phrase Utterance | Domain | Fitzgerald Color | Visual Archetype | Trigger / Context | Art Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 3001 | **I can't breathe** | Urgent Medical | Red | Stick Figure | Respiratory Distress | Stick figure holding both hands to chest with mouth open in distress |
```

### 4.2 Derived JSON Artifact: `data/extended_lexicon.json`

A deterministic extraction script (`scripts/catalog/extract_extended_lexicon.mjs`) reads the Markdown catalog, validates schema constraints, and emits `data/extended_lexicon.json`:

```json
{
  "schemaVersion": 1,
  "source": "docs/product/Extended_Vocabulary_Catalog.md",
  "words": [
    {
      "slot": 1001,
      "tier": 3,
      "spokenText": "trampoline",
      "partOfSpeech": "Noun",
      "fitzgeraldColor": "Yellow",
      "visualStyle": "Illustrated Object",
      "category": "Toys & Recreation",
      "artPrompt": "Clean round backyard trampoline with black safety netting and blue spring pad"
    }
  ],
  "phrases": [
    {
      "slot": 3001,
      "tier": 3,
      "spokenText": "I can't breathe",
      "domain": "Urgent Medical",
      "fitzgeraldColor": "Red",
      "visualStyle": "Stick Figure",
      "category": "Medical",
      "artPrompt": "Stick figure holding both hands to chest with mouth open in distress"
    }
  ]
}
```

### 4.3 Catalog Ingestion (`build_catalog.mjs`)

When building the runtime catalog (`scripts/catalog/build_catalog.mjs`):
1. Launch senses are ingested with tier `root_core` (Tier 1) or `primary_fringe` (Tier 2).
2. Extended senses and phrases are ingested with tier `secondary_fringe` (Tier 3).
3. The catalog build verifies that every `secondary_fringe` sense has an approved image and an audio clip in all shipped voices.

---

## 5. Tooling & Execution Plan (Phase 010 Slices)

Execution proceeds according to `docs/phases/010_Extended_Picture_Library.md`:

```text
  Phase 010 Slice 1: The Word & Phrase List (This Proposal)
  ├── 1. Run derivation scripts to generate candidates (aoa.csv + fry + clinical inventories)
  ├── 2. Clinical/Founder curation pass to finalize 2,000 words + 300-500 phrases
  ├── 3. Commit docs/product/Extended_Vocabulary_Catalog.md
  └── 4. Implement scripts/catalog/extract_extended_lexicon.mjs and test against regressions

  Phase 010 Slice 2: The Art Pipeline
  ├── 1. Build fast contact-sheet review UI (50 images/sheet, 1-tap approve/re-roll)
  └── 2. Batch-generate images via scripts/art/gen.mjs into symbols/drawings/

  Phase 010 Slice 3: Catalog & Database Ingestion
  ├── 1. Add tier 'secondary_fringe' to src/board/schema.sql
  └── 2. Verify search/+ Add can discover extended items while default grids stay locked

  Phase 010 Slice 4: Audio Generation
  └── Run scripts/catalog/generate_missing_audio.mjs for all extended utterances
```

---

## 6. Works Test & Automated Verification Gates

The automated verification suite for Slice 1 must pass the following four deterministic tests:

1. **Zero Overlap Test:**
   Assert that none of the 2,000 words or phrases match an existing `spokenText` or lemma in `data/launch_lexicon.json`.
2. **Metadata Completeness Test:**
   Assert that 100% of rows have non-empty `partOfSpeech`, `fitzgeraldColor`, `visualStyle`, `category`, and `artPrompt`.
3. **Phrase Token Length Guard:**
   Assert that every phrase entry contains between 2 and 4 whitespace-separated tokens and is under 30 characters.
4. **Deterministic Sync Guard:**
   Run `node scripts/catalog/extract_extended_lexicon.mjs --check` in `check:fast` to ensure `data/extended_lexicon.json` never drifts from the Markdown documentation.

---

## 7. Retiring this Proposal

When Phase 010 Slice 1 completes:
- The human-readable catalog is committed to `docs/product/Extended_Vocabulary_Catalog.md`.
- The JSON artifact is saved to `data/extended_lexicon.json`.
- `docs/phases/README.md` and `docs/phases/010_Extended_Picture_Library.md` update Slice 1 status to **Built**.
- This file (`docs/phases/010_Word_And_Phrase_Derivation_Proposal.md`) will be deleted, preserving its history in git per project policy (`AGENTS.md` § Docs).
