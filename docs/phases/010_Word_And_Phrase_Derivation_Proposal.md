# Phase 010 — Extended Vocabulary & Phrase Derivation Proposal

**Status:** Proposed (ephemeral design doc). Feeds Phase 010 Slice 1.
Intake & parent phase: `docs/phases/010_Extended_Picture_Library.md`.
Foundational context: `docs/founder/2026-09-22_Customization_Library_Sync.md`, `docs/product/Word_Library.md` § 6.

> [!NOTE]
> **Ephemeral Document:** This proposal defines how the extended lexicon (target: ~2,000–3,000 words + 300–500 phrases) will be derived, ranked, and categorized. Once Phase 010 Slice 1 executes and produces the authoritative catalog in `docs/product/Extended_Vocabulary_Catalog.md`, this proposal document will be removed per project documentation rules (git history is the archive).

---

## 1. Executive Summary: Moving Beyond Academic Corpora to "The Child's World"

Pip AAC ships an evidence-based launch vocabulary of 677 words (680 catalog entries) bundled on-device (`docs/product/Initial_Vocabulary_600.md`, `data/launch_lexicon.json`). On 2026-09-22, the founder approved building an **Extended Picture Library** (`secondary_fringe` tier) to solve customization friction (`docs/phases/010_Extended_Picture_Library.md` Slice 0).

### 1.1 The Blind Spot of Academic Corpora

Standard linguistic corpora like Kuperman Age-of-Acquisition (`data/reference/aoa.csv`) and Fry Frequency lists (`data/reference/fry-rank-1000.txt`) are indispensable for syntactic connectors, core actions, and standard dictionary lemmas. 

**However, academic corpora completely miss the world children actually live in.**
In everyday life, non-speaking children and AAC users are motivated by tangible, high-preference referents:
* They rarely ask for a generic "carbonated beverage" or "soda" — they ask for **7UP**, **Coke**, **Sprite**, or **Capri Sun**.
* They do not ask for a generic "corn puff" or "cracker" — they ask for **Goldfish**, **Doritos** (Cool Ranch / Nacho), **Cheetos**, **Oreos**, **Skittles**, or **Pop-Tarts**.
* When communicating about play, comfort, and entertainment, they do not talk about a generic "superhero" or "animal" — they talk about **Spider-Man**, **Batman**, **Bluey**, **Chase from Paw Patrol**, **Elsa**, **Minecraft Creeper**, or **Pikachu**.

If our extended library relies solely on Fry words and AoA norms, it will deliver dictionary completeness while creating user disappointment.

### 1.2 The Competitor Reality vs. The Pip AAC "WOW"

Auditing real-world competitor usage (Proloquo2Go, TouchChat, and school boards) reveals that snacks, drinks, CPG items, and cartoon characters dominate custom folders:
1. **The Competitor Status Quo:** Families are forced into two bad options:
   * **Low-quality phone camera photos:** A parent snaps an iPhone photo of a wrinkled Cheetos bag, a cardboard box of Apple Jacks, or greasy chicken nuggets on a kitchen counter with bad lighting and glare. The resulting AAC board looks messy, distracting, and inconsistent.
   * **Mismatched generic clipart:** A generic gray cracker or yellow triangle that fails to communicate the child's exact intended snack (*"I want Cool Ranch Doritos, not generic chips"*).
2. **The Pip AAC "WOW":**
   * A caregiver or SLP types *"Goldfish"*, *"Doritos"*, *"Bluey"*, or *"7UP"* into `+ Add`.
   * **Instantly**, Pip AAC presents a crisp, clean, clinical illustration in our exact unified house style (monoline outline, solid color fill, white background).
   * Zero camera friction. Zero photo cropping. Zero visual discordance.
   * As the founder noted: generating a thousand vector clipart images costs ~$10. The leverage of having comprehensive real-world CPG and pop culture coverage built into the Library is massive.

---

## 2. Standing Architectural & Legal Invariants

1. **Tier 3 (`secondary_fringe`) Isolation:**
   - Extended words, brand symbols, characters, and phrases reside in the Library only.
   - They appear on **zero default pages** and are **never suggested by the predictive strip** until an adult or learner explicitly adds them to a group or layout (`docs/product/Word_Library.md` § 6).
2. **Strict Launch Catalog Non-Overlap:**
   - No extended entry may duplicate a lemma or sense already present in the 677-word launch catalog (`data/launch_lexicon.json`).
3. **Single Acoustic Utterance Law for Phrases:**
   - Every phrase is voiced as an exact, unified recording (`apple juice`, `I'm in pain`). Lookup never stitches individual word audio clips together (`docs/product/Language_And_Voice_Schema.md` § 8).
4. **Unified Visual System & Color Taxonomy:**
   - All items — whether a dictionary noun, a snack brand, or a superhero — are drawn strictly in the Pip AAC house vector style (`docs/product/Motor_Grid_And_Art.md` § 4, `docs/operations/art-generator/SKILL.md`).
   - Torso/outline colors strictly obey the Modified Fitzgerald Key (`docs/product/Design_System.md`).
5. **Assistive Communication & Trademark Policy (Nominative Fair Use):**
   - Major AAC vendors (SymbolStix, Boardmaker/Tobii Dynavox PCS, AssistiveWare) depict real-world brands, characters, and CPG items as standard practice.
   - **Legal Basis:** Under nominative fair use and accessibility exemptions (e.g., Section 121 of the US Copyright Act / Chafee Amendment), depicting real-world referents for non-verbal individuals to express their thoughts and needs is legally protected.
   - **Original Artwork Rule:** Pip AAC **never scrapes, copies, or distributes proprietary commercial logos or raster frames**. Every image is an original vector illustration created by our art generation pipeline, capturing the recognizable silhouette, color palette, and packaging cues of the concept as a communicative referent.

---

## 3. The Two-Pillar Extended Vocabulary Architecture (Target: 2,000–3,000 Items)

The extended library is built upon two distinct, complementary derivation pillars:

```text
                               +-----------------------------------------------------+
                               |         EXTENDED VOCABULARY LIBRARY (2,000–3,000)   |
                               +-----------------------------------------------------+
                                            │                                │
                     ┌──────────────────────┘                                └──────────────────────┐
                     ▼                                                                              ▼
+--------------------------------------------------------+     +--------------------------------------------------------+
| PILLAR 1: LINGUISTIC & DEVELOPMENTAL FRINGE (~1,500)   |     | PILLAR 2: REAL-WORLD EXPERIENTIAL FRINGE (~1,000)      |
+--------------------------------------------------------+     +--------------------------------------------------------+
• Age of Acquisition (aoa.csv ≤ 6.5–8.0)                       • CPG & Branded Foods/Snacks/Drinks (Goldfish, 7UP, Coke)
• Frequency floor check (fry-rank-1000.txt)                    • Beloved Characters & Cartoons (Spider-Man, Bluey, Elsa)
• Secondary actions, fine/gross motor verbs                    • Highly Motivating Media, Apps & Tech (YouTube, Roblox)
• Nuanced descriptors, sensory states, emotions                • Familiar Places, Community & Fast Food (Target, McD's)
• Classroom tools, school subjects, nature & animals           • High-preference toys, sensory items (Legos, slime)
```

---

## 4. Pillar 1: Linguistic & Developmental Fringe (~1,200–1,500 Words)

### 4.1 Derivation Method
1. **Candidate Pool:** Derived from `data/reference/aoa.csv` (41,900 English words).
2. **Deduplication:** Filter out all 677 launch senses in `data/launch_lexicon.json` and inflections governed by Phase 005 Word Forms (`-s`, `-ed`, `-ing`, `-er`).
3. **AoA Ceiling:** Sort ascending by AoA. Primary threshold $\le 6.5$ (Preschool & Kindergarten); secondary ceiling up to $\le 8.0$ for concrete nouns.
4. **Fry Floor Check:** Eliminate archaic or rare academic anomalies via `data/reference/fry-rank-1000.txt`.

### 4.2 Pillar 1 Category Quotas

| Category | Target Count | Description & Examples |
| :--- | :---: | :--- |
| **Secondary Actions / Verbs** | 250 | Fine & gross motor actions (*climb*, *whisper*, *scrub*, *fold*, *squeeze*, *carry*, *balance*, *slide*) |
| **Sensory, Emotions & Descriptors** | 250 | Nuanced physical & emotive states (*frustrated*, *excited*, *sticky*, *bumpy*, *freezing*, *bright*, *cozy*) |
| **Routines & Daily Living** | 200 | Household items, personal care, clothing (*toothbrush*, *pajamas*, *blanket*, *comb*, *shampoo*, *zipper*) |
| **School, Learning & Art** | 200 | Classroom items, art supplies, school spaces (*backpack*, *scissors*, *crayons*, *marker*, *recess*, *easel*) |
| **Nature, Outdoors & Animals** | 250 | Non-launch wildlife, marine life, insects, weather (*dolphin*, *squirrel*, *butterfly*, *thunder*, *rainbow*) |
| **Anatomy, Health & Body** | 150 | Body parts, medical tools, clinical symptoms (*bandage*, *knee*, *elbow*, *fever*, *cough*, *medicine*, *cast*) |
| **General Generic Foods** | 150 | Generic foods not covered at launch (*avocado*, *blueberry*, *burrito*, *spaghetti*, *lemonade*) |

---

## 5. Pillar 2: Real-World Experiential Fringe ("The Child's World") (~800–1,200 Items)

This layer represents the high-motivation items that children encounter daily in consumer packaging, entertainment media, and community outings.

### 5.1 Subcategories of the Real-World Fringe

#### 1. Consumer Packaged Goods (CPG) & Brand Foods/Drinks (~350–500 items)
Non-speaking children frequently use AAC to request specific food reinforcers. Generic icons fail when a child refuses generic crackers and specifically requests *Goldfish* or *Cheez-It*.
* **Drinks & Sodas:** 7UP, Coke, Diet Coke, Sprite, Dr Pepper, Mountain Dew, Capri Sun, Gatorade, Yoo-hoo, Horizon Organic Milk, SunnyD, Nesquik, Apple Juice Box, Chocolate Milk Carton.
* **Chips & Salty Snacks:** Goldfish (Cheddar, Colors), Cheetos (Puffs, Crunchy, Flamin' Hot), Doritos (Nacho Cheese, Cool Ranch), Pringles, Lay's, SunChips, Cheez-It, Fritos, Tostitos, Ritz Crackers, Saltines, Triscuit, Bamba, Pretzel Crisps, Bugles, Funyuns.
* **Cookies, Treats & Sweets:** Oreos (regular, Double Stuf), Skittles, M&Ms (plain, peanut), Snickers, Kit Kat, Reese's Peanut Butter Cup, Pop-Tarts (Strawberry, Brown Sugar), Fruit Roll-Ups, Fruit Gushers, Gummy Bears, Animal Cookies (Mother's frosted), Rice Krispies Treats, Marshmallows, Twix, Hershey Bar, Popsicle, Ring Pop, Twizzlers.
* **Cereals, Breakfast & Quick Meals:** Apple Jacks, Cheerios (Honey Nut), Froot Loops, Cinnamon Toast Crunch, Frosted Flakes, Lucky Charms, Eggo Waffles, Pop-Tarts, Kraft Mac & Cheese, Lunchables, Uncrustables, Hot Pockets, Dino Nuggets, McNuggets, Nutella, Pizza Rolls.

#### 2. Beloved Characters, Cartoons & Pop Culture (~250–350 items)
Children use character names for imaginative play, peer connection, and gestalt communicative scripts.
* **Superheroes & Action:** Spider-Man, Batman, Superman, Iron Man, Captain America, The Hulk, Wonder Woman, The Flash, Black Panther.
* **Modern Kids' Cartoons & Shows:** Bluey, Bingo, Bandit, Chilli, Paw Patrol (Chase, Marshall, Skye, Rubble, Zuma, Rocky), Peppa Pig, George Pig, Daniel Tiger, Doc McStuffins, Gabby's Dollhouse, CoComelon / JJ, Blippi, Blue's Clues.
* **Disney & Pixar Icons:** Elsa, Anna, Olaf, Mickey Mouse, Minnie Mouse, Donald Duck, Goofy, Buzz Lightyear, Woody, Lightning McQueen, Simba, Moana, Stitch.
* **Gaming & Digital Franchises:** Pikachu, Charizard, Pokémon Ball, Mario, Luigi, Sonic the Hedgehog, Minecraft Steve, Creeper, Enderman, Roblox Noob.
* **Classic Favorites:** Thomas the Tank Engine, SpongeBob SquarePants, Patrick Star, Barbie, Elmo, Cookie Monster, Big Bird, The Cat in the Hat.

#### 3. Community Destinations, Chains & Fast Food (~75–100 items)
* **Fast Food & Restaurants:** McDonald's (Golden Arches / Happy Meal), Starbucks (Frappuccino / green cup), Chick-fil-A, Wendy's, Subway, Burger King, Domino's, Taco Bell, Dunkin', Dairy Queen.
* **Stores & Venues:** Target, Walmart, Costco, Chuck E. Cheese, Disney World / Disneyland, trampoline park, movie theater, bowling alley, dentist office, doctor office, public library, playground.

#### 4. High-Preference Digital Tech, Gaming & Toys (~50–75 items)
* **Tech & Streaming:** iPad, Nintendo Switch, YouTube, YouTube Kids, Netflix, Disney+, Roblox, Minecraft, PlayStation, Xbox, headphones.
* **Sensory & Play Reinforcers:** Legos, Play-Doh, slime, fidget spinner, pop-it / bubble popper, kinetic sand, weighted blanket, bubble blower.

### 5.2 Derivation Sources for Pillar 2

Unlike dictionary words, Pillar 2 items are derived from objective empirical cultural data:
1. **Grocery Scanner & CPG Market Share Data:** The top 500 selling snack, beverage, and breakfast UPC items in US/UK/Australian retail grocery.
2. **Nielsen Kids Streaming & Box Office Ratings:** The top 100 most-watched kids TV shows, movies, and character franchises across Disney+, Netflix, YouTube, and linear channels.
3. **Clinical Reinforcer Assessment Inventories:** Common high-preference stimuli from Fisher et al. stimulus preference assessments used by pediatric SLPs and BCBAs.
4. **Competitor Customization Telemetry:** Analysis of the most frequently added custom food and character buttons in Proloquo2Go and TouchChat public boards.

---

## 6. Phrase Derivation Pipeline (Target: 300–500 Phrases)

Single words cannot meet the communication speed required during severe distress, rapid transitions, or gestalt language processing.

### 6.1 The Four Functional Clinical Domains

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
- **Clinical Lineage:** Hospital/aphasia boards, emergency department research, VidaTalk ICU communication study (PMC10833611).
- **Direct Link:** Directly feeds Phase 014 Slice 6 (Message tiles for the Urgent Needs starter board, `docs/phases/014_Grid_Density_And_Fit.md` § 5.2).
- **Core Messages:**
  - *"I'm in pain"*, *"my head hurts"*, *"my tummy hurts"*, *"I can't breathe"*, *"I feel sick"*, *"need medicine"*.
  - *"move me"*, *"turn me over"*, *"help me sit up"*, *"bathroom please"*, *"too hot"*, *"too cold"*, *"blanket on"*.
  - *"too loud"*, *"turn off lights"*, *"need a break"*, *"give me space"*, *"stop touching me"*, *"I want to go home"*.
  - *"call nurse"*, *"call mom"*, *"call dad"*, *"stay with me"*, *"don't leave me"*.

#### Domain 2: Daily Routines & Activities of Daily Living (ADLs) (150–200 phrases)
- **Clinical Lineage:** Functional Communication Training (FCT), Project Core daily routine sequences.
- **Core Messages:**
  - *"brush teeth"*, *"wash hands"*, *"put on shoes"*, *"put on coat"*, *"take off shoes"*, *"pack backpack"*, *"get dressed"*, *"pajamas on"*.
  - *"time to eat"*, *"wash table"*, *"drink water"*, *"wipe face"*, *"all done eating"*, *"clean up plate"*, *"pour milk"*.
  - *"buckle seatbelt"*, *"get in car"*, *"get out of car"*, *"wait in line"*, *"hold my hand"*, *"time for bed"*.
  - *"circle time"*, *"recess time"*, *"open book"*, *"sit on rug"*, *"raise hand"*.

#### Domain 3: Gestalt Language Processing (GLP) Stage 1 & 2 Scripts (100–150 phrases)
- **Clinical Lineage:** Natural Language Acquisition (NLA) framework (Blanc, 2012; Prizant et al., 2006).
- **Core Messages:**
  - *"look at that"*, *"check this out"*, *"come with me"*, *"let's do it"*, *"ready set go"*, *"I did it"*, *"watch this"*.
  - *"it's okay"*, *"don't worry"*, *"take a deep breath"*, *"we can do it"*, *"I'm so excited"*, *"this is scary"*.
  - *"let's get out of here"*, *"what's happening next"*, *"where are we going"*, *"it's time for lunch"*, *"let's go outside"*.
  - *"I love you"*, *"give me hug"*, *"hold you"*, *"I miss you"*.

#### Domain 4: Social Regulators & Conversational Pragmatics (50–75 phrases)
- **Clinical Lineage:** Light's communicative competence domains, pragmatic social scripts.
- **Core Messages:**
  - *"see you later"*, *"good morning"*, *"good night"*, *"have a good day"*, *"thank you so much"*, *"you're welcome"*.
  - *"no thank you"*, *"leave it alone"*, *"that's mine"*, *"not right now"*, *"I changed my mind"*, *"that's not fair"*.
  - *"my turn now"*, *"your turn"*, *"wait a minute"*, *"I don't know"*, *"tell me more"*, *"excuse me please"*.

### 6.2 Strict Phrase Constraints
- **Length:** 2 to 4 words maximum (under 30 characters).
- **Core Non-Redundancy:** Never duplicate a trivial 2-tap core sequence unless it serves an urgent, distress, or established GLP script function.
- **Single Acoustic Clip:** Every phrase is synthesized as a whole, standalone audio recording in each shipped voice (`scripts/catalog/generate_missing_audio.mjs`). Never stitched from individual words.

---

## 7. Engineering Architecture & File Schema

### 7.1 Authoritative Markdown Source: `docs/product/Extended_Vocabulary_Catalog.md`

All entries are authored in `docs/product/Extended_Vocabulary_Catalog.md` with full metadata:

#### Standard Word Format:
```markdown
| Slot | Word / Lemma | Part of Speech | Fitzgerald Color | Visual Archetype | Secondary Category | Selection Evidence | Art Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1001 | **trampoline** | Noun | Yellow | Illustrated Object | Toys & Recreation | AoA 3.92; Fry ≤800 | Clean round backyard trampoline with black safety netting and blue spring pad |
```

#### Real-World CPG / Brand Format:
```markdown
| Slot | Concept / Product | Part of Speech | Fitzgerald Color | Visual Archetype | Secondary Category | Selection Evidence | Art Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2050 | **Goldfish crackers** | Noun | Yellow | Illustrated Object | Food & Snacks (CPG) | Top 5 US Kid Snack UPC | Standalone smiling orange fish-shaped cracker beside a classic white snack pouch |
| 2051 | **7UP** | Noun | Yellow | Illustrated Object | Food & Drinks (CPG) | Top Soda Scanner Rank | Standalone emerald-green soda can with crisp red circle emblem, condensation droplets |
| 2501 | **Spider-Man** | Noun | Yellow | Stick Figure | Characters & Media | Nielsen Kids Top Rank | Clean stick figure wearing iconic red and blue webbed suit in an energetic crouch |
```

#### Phrase Format:
```markdown
| Slot | Phrase Utterance | Domain | Fitzgerald Color | Visual Archetype | Trigger / Context | Art Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 3001 | **I can't breathe** | Urgent Medical | Red | Stick Figure | Respiratory Distress | Stick figure holding both hands to chest with mouth open in distress |
```

### 7.2 Generated JSON: `data/extended_lexicon.json`

Extracted via `scripts/catalog/extract_extended_lexicon.mjs`:
```json
{
  "schemaVersion": 1,
  "source": "docs/product/Extended_Vocabulary_Catalog.md",
  "words": [
    {
      "slot": 2050,
      "tier": 3,
      "spokenText": "Goldfish crackers",
      "partOfSpeech": "Noun",
      "fitzgeraldColor": "Yellow",
      "visualStyle": "Illustrated Object",
      "category": "Food & Snacks (CPG)",
      "artPrompt": "Standalone smiling orange fish-shaped cracker beside a classic white snack pouch"
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

---

## 8. Works Test & Automated Verification Gates

1. **Zero Overlap Test:**
   Assert that none of the extended words, brands, or phrases match an existing `spokenText` or lemma in `data/launch_lexicon.json`.
2. **Metadata Completeness Test:**
   Assert 100% of rows have non-empty `partOfSpeech`, `fitzgeraldColor`, `visualStyle`, `category`, and `artPrompt`.
3. **Phrase Token Length Guard:**
   Assert every phrase entry contains between 2 and 4 whitespace-separated tokens and is under 30 characters.
4. **Deterministic Sync Guard:**
   `node scripts/catalog/extract_extended_lexicon.mjs --check` runs in `check:fast` to guarantee `data/extended_lexicon.json` matches the Markdown source.

---

## 9. Retiring this Proposal

When Phase 010 Slice 1 completes:
- The human-readable catalog is committed to `docs/product/Extended_Vocabulary_Catalog.md`.
- The JSON artifact is saved to `data/extended_lexicon.json`.
- `docs/phases/README.md` and `docs/phases/010_Extended_Picture_Library.md` update Slice 1 status to **Built**.
- This ephemeral file (`docs/phases/010_Word_And_Phrase_Derivation_Proposal.md`) will be deleted, preserving its history in git per project policy (`AGENTS.md` § Docs).
