# 033 — Curated Phrase Boards and Adult Kits

**Status:** Proposed 2026-09-30 (founder brief).

## Founder intent (2026-09-30)

1. **Pre-curated phrase and sentence boards for broader markets:**
   Add dedicated boards and groups populated with high-utility complete phrases and
   sentences (not only single words) tailored to critical non-pediatric and specialized
   cohorts: adult acquired conditions, stroke/aphasia, hospital/ICU, Gestalt language
   processors, and fast-paced social banter.
2. **Settings-driven discovery (never dumped at install):**
   Do not overwhelm a 4-year-old or early language learner with dozens of phrase buttons on day
   one. Keep default installation clean and generative. Make kits discoverable via
   **Settings** (and during initial onboarding setup) so users can specify their user
   type and activate the relevant kit cleanly.
3. **No Fitzgerald Key color coding on phrase and adult boards:**
   *"If you have a heart attack, you don't want to deal with our color coding.
   That's for pediatric language learning, not for what this is now."*
   A whole phrase (*"I can't breathe"*, *"Please call my daughter"*, *"Move me"*) is a
   complete syntactic utterance, not a single part of speech. Staining it in kindergarten
   grammar colors (yellow nouns, green verbs, pink prepositions) is both a category
   error and clinically infantilizing to adults. Adult and medical phrase tiles must use
   clean, dignified, high-contrast neutral styling with functional urgency accents
   (e.g., medical emergency red or warning amber), not grammar pastels.

## Market & Clinical Rationale

### 1. Market expansion (3x to 5x TAM)

Pediatric developmental AAC (autism, cerebral palsy, developmental speech delays) accounts
for ~1M–1.5M individuals in the US. Pre-curated phrase boards unlock:

- **Adult Acquired Conditions (+2.5M US):** Stroke survivors living with aphasia (~2M in
  the US), ALS/MND (~30k active; 80%+ lose speech), TBI, and Parkinson's. These users
  already possess full language models; composing word-by-word (*"I" $\rightarrow$ "want"
  $\rightarrow$ "water"*) causes severe physical fatigue. They need 1-tap situational
  phrases for immediate relief, repositioning, and care.
- **Hospital, ICU & Acute Care (+1.5M patients/yr US):** Conscious intubated,
  tracheostomy, or post-surgical patients currently handed laminated paper alphabet boards
  or call bells. A \$49 lifetime or free instant app on an iPad provides an immediate voice
  for pain, breathing, and comfort without 6-month DME insurance hurdles.
- **Gestalt Language Processors (GLP) in Autism (2x pediatric SLP adoption):**
  Clinical research (Blanc, Prizant) indicates that 50%–80% of autistic children process
  language in whole communicative scripts/gestalts (*"Let's go check it out!"*, *"I need a
  break"*) before mitigating them down to single words. Standard core-word apps force
  analytical word-by-word assembly, driving SLP frustration. Curated Gestalt kits turn
  pediatric SLPs into active advocates for Pip.
- **Senior & Memory Care:** Mild-to-moderate dementia and cognitive decline where
  generative syntax assembly breaks down, but familiar comfort phrases and social rituals
  remain intact.

### 2. The Visual Dignity Law: Dropping Grammar Colors for Phrases & Adults

- **The Problem:** The Modified Fitzgerald Key (yellow for nouns, green for verbs, blue
  for descriptors, pink for prepositions) exists solely as a pedagogical scaffold for
  developing children learning grammar. When an adult is in acute distress or recovering
  from a stroke, a screen full of bright rainbow tiles feels degrading and induces visual
  scanning fatigue.
- **The Syntactic Reality:** A phrase like *"Please adjust my pillow"* contains a polite
  marker, verb, pronoun, and noun. Forcing a single grammar color onto a phrase tile makes no
  linguistic sense.
- **The Design Bet:**
  - **Neutral Canvas:** Clean white / slate / dark cards, high-legibility bold typography,
    and crisp borders.
  - **Functional Urgency Accents Only:** Meaningful, intuitive signaling (emergency red for
    acute distress/pain, amber for physical assistance/toilet, neutral for comfort/social),
    never parts of speech.
  - **Dignified Presentation:** Works seamlessly with Pip's built-in **Words only** mode
    (`presentation_mode = 'label'`, `docs/product/Profile_Presentation_Modes.md`),
    eliminating cartoony clipart for adults.

## Architectural Fit & Laws

1. **The Motor Grid remains sacred:**
   Curated phrase boards do NOT reorder or displace core cells on the main board. They
   live either as **curated Groups** (behind topic doors under `🗂️ Groups`, built in 027)
   or as **Starter presets** (`docs/phases/014_Grid_Density_And_Fit.md` § 5.2 `Urgent needs`).
2. **Settings-driven toggle (Groups Kit Catalog):**
   Kits are cataloged in `data/phrase_kits.json`. In Settings $\rightarrow$ Groups (or Board
   Kits), a supporter can toggle any kit ON or OFF. Turning a kit ON mounts its group door
   in the user's Groups catalog.
3. **One Cells setting per profile:**
   Phrase groups obey the profile's cell density dial (`grid15`, `grid30`, `grid60`),
   flowing across pages with `Next ›` as specified in 014/027. For acute/motor-impaired
   adults, `grid15` (5×3) provides large, stable touch and eye-gaze targets.
4. **Eye-Gaze ready via iPadOS 18:**
   No custom camera CV code needed. Uses native iPadOS 18 Eye Tracking + Dwell Control.
   Pip's spacious `grid15` layout and neutral gutters prevent the "Midas Touch" (gaze
   fatigue triggering unintended selections).
5. **Full-Sentence TTS Engine:**
   Phrase tiles speak using Pip's existing high-quality sentence TTS pipeline (024/028),
   producing fluid prosody rather than concatenated robotic words.

## Proposed Curated Kits

### 1. Urgent Needs & Hospital (Acute / ICU / Post-Op)
*Target: ICU, acute trauma, stroke rehab, tracheostomy.*
*Styling: High-contrast neutral cards; emergency red highlight on distress tiles.*
*Sample Tiles:*
- **Acute / Pain:** *"I'm in pain"* (opens 0–10 scale + body location), *"I can't breathe"*, *"Suction please"*, *"Call the nurse"*, *"What is happening?"*, *"I feel sick"*.
- **Positioning & Body:** *"Move me / turn me"*, *"Sit me up"*, *"Lie me down"*, *"My mouth is dry"*, *"Need bathroom"*, *"Too hot / fan"*, *"Too cold / blanket"*.
- **Emotional & Connection:** *"I'm scared"*, *"Don't leave"*, *"Thank you"*, *"I love you"*, *"Call my family"*.

### 2. Adult Comfort & Living (ALS / MND / Stroke / Senior Care)
*Target: Home care, progressive illness, long-term rehab.*
*Styling: Dignified slate/white cards, optional text-only mode.*
*Sample Tiles:*
- *"Please adjust my pillow"*, *"Turn on the TV"*, *"I'd like to sleep now"*, *"I want some quiet"*, *"Glasses please"*, *"Headphones please"*, *"Water please"*, *"Check my phone"*, *"What time is it?"*, *"Leave me be for a bit"*.

### 3. Gestalt Language Scripts (Autism / GLP Stages 1 & 2)
*Target: Gestalt language processors, neurodivergent communicators.*
*Styling: Calming neutral with subtle category accent.*
*Sample Tiles (organized by communicative intention):*
- **Transition & Action:** *"Let's go check it out!"*, *"Time to get moving"*, *"Ready, set, go!"*, *"Where are we going?"*.
- **Regulation & Protest:** *"I need a break right now"*, *"It's too loud in here"*, *"That's not what I want"*, *"I'm feeling overwhelmed"*, *"Stop that, please"*.
- **Joy & Connection:** *"Look at that!"*, *"That is so cool!"*, *"We did it!"*, *"You're so silly"*, *"Come play with me"*.

### 4. Playground & Peer Banter (School-Age Social)
*Target: Fast-paced school, recess, siblings.*
*Styling: Dynamic, high-utility phrases.*
*Sample Tiles:*
- *"That's not fair!"*, *"My turn next!"*, *"Watch this!"*, *"No way!"*, *"Wait for me!"*, *"You're funny"*, *"Good job!"*, *"See you later"*.

## Slices

| Slice | Scope | Output / Proof |
| :--- | :--- | :--- |
| **Slice A: Phrase Kits Catalog & Data** | Curated starter kit definitions in `public/shared/phrase_kits.mjs` and seed definitions. | Data structure with id, title, audience, urgency, and phrase lists. Tests verify valid format and zero schema conflicts. |
| **Slice B: Dignified Styling (`.tile--phrase` / No-Fitzgerald)** | CSS rule for phrase and adult tiles: suppresses Fitzgerald color classes; applies neutral slate/dark tokens and urgency badges. | Visual proof on `public/preview-phrase-kits.html`. |
| **Slice C: Board Kits in Settings** | Settings page / section allowing supporters to browse available kits and toggle them into the profile's Groups. | Toggle adds/removes kit door from Groups without touching the main board. |
| **Slice D: Onboarding Profile Prompt** | First-run welcome question expanded: "Words First" (kids/generative) vs "Messages First" (hospital/adult recovery) vs "Gestalt Scripts". | Sets profile starter and pre-activates the chosen kit cleanly. |
| **Slice E: Validation & Preview** | Preview harness `public/preview-phrase-kits.html` to review all phrases, voice playback, and density reflow. | Works Test: all kits render across 15, 30, and 60 densities and speak via TTS. |
