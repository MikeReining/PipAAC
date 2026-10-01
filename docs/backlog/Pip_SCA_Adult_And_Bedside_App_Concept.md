# Concept — Pip SCA (Supported Conversation for Adults & Bedside Care)

**Status:** Parked secondary app concept (founder decision, 2026-09-30).  
**Context:** Unbundled from Pip AAC to preserve Pip AAC's laser focus on pediatric generative language acquisition, while establishing a dedicated sister brand for adult neurogenic and acute care communication.

---

## 1. Executive Summary & Brand Thesis

Pip AAC was designed for developing children learning language, syntax, motor automaticity,
and literacy over years. 

Adults suffering from acute loss of speech (stroke/aphasia, ICU intubation, ALS/MND, TBI)
do **not** need to be taught grammar. They already have complete language models in their
heads—they need **conversational scaffolding, dignity, and a bridge to their spouse and care team**.

Trying to force both cohorts into one app creates a compromised "Swiss Army Knife":
- Parents of autistic toddlers would be confused by hospital buttons and stroke anomia tools.
- A 70-year-old stroke survivor and their spouse would feel insulted by preschool stick figures and kindergarten rainbow grammar colors.

**Pip SCA** will be an independent sister application built on the exact same technical
"bones" (local-first persistence, edge sync, real-time device channel, ElevenLabs TTS),
but with its own brand, website, and dedicated focus on adult neurogenic and hospital care.

---

## 2. Market & Clinical Sourcing

The adult neurogenic and acute care market represents a massive, underserved population:

1. **Stroke & Aphasia:**
   Each year, roughly **795,000 people in the United States have a stroke**
   ([CDC Stroke Facts](https://www.cdc.gov/stroke/facts.htm)). An estimated **2 million
   Americans live with aphasia**, with 25% to 40% of stroke survivors acquiring the
   condition ([National Aphasia Association](https://aphasia.org/)). Many experience
   acquired alexia (reading impairment) while visual comprehension of pictograms remains
   intact. Over 60% of stroke survivors report severe post-stroke depression and isolation.
2. **Mechanically Ventilated ICU Patients:**
   Over **1 million patients receive mechanical ventilation in US ICUs annually**, out of
   more than 4 million ICU admissions ([Wunsch et al., Crit Care Med, NIH](https://pubmed.ncbi.nlm.nih.gov/23385106/)).
   Intubation prevents vocal speech entirely, leading to panic, delirium, and severe
   communication breakdowns.
3. **Clinical Efficacy of Bedside & Home AAC:**
   Peer-reviewed ICU communication research ([VidaTalk study, PMC10833611](https://pmc.ncbi.nlm.nih.gov/articles/PMC10833611/))
   demonstrates that electronic visual/phrase communication significantly reduces patient
   anxiety, eases family caregiver burden, and clarifies urgent patient requests
   (repositioning, suction, pain, family contact).

---

## 3. The Unbundled Architecture: Same Bones, Bespoke Surface

Pip SCA reuses Pip's hardest, most reliable technical systems with zero reinvented wheels:

```text
+-----------------------------------------------------------------------------------+
|                            THE SHARED PIP ENGINE (CORE BONES)                      |
|  - Local-First Offline Persistence (IndexedDB / OPFS)                             |
|  - Cloudflare Edge Sync & Zero-Knowledge Relay                                     |
|  - Real-Time Device-to-Device Attention Pipe (Relay Pairing)                      |
|  - ElevenLabs Full-Sentence TTS & Voice Synthesis                                 |
+-----------------------------------------------------------------------------------+
                                          |
                +-------------------------+-------------------------+
                |                                                   |
                v                                                   v
+-----------------------------------+   +-------------------------------------------+
|          PIP AAC (APP 1)          |   |             PIP SCA (APP 2)               |
|  Target: Children & Development   |   |  Target: Adults, Stroke, ICU, Couples     |
|  - Motor Anchor Grids             |   |  - Spouse Co-Pilot (Supported Choices)    |
|  - Fitzgerald Grammar Coloring    |   |  - "My Life & Stories" Photo Memory Books |
|  - Stick Art & Core Words         |   |  - Anomia Sound Cueing (Word-Finding)     |
|  - Morphological Flow & Phonics   |   |  - High-Contrast Monochrome Pictograms    |
|  - Pedagogical Growth Over Years  |   |  - "Show the Nurse" Full-Screen Flash     |
+-----------------------------------+   +-------------------------------------------+
```

---

## 4. Core Modules of Pip SCA

### A. The Bedside Triage Mode (`/hospital`)
*Acute / ICU / Trauma / Post-Op Wedge (Free & Frictionless)*
- **60-Second Setup:** Boots immediately on an iPad or phone without requiring an account.
- **Fewer and Bigger:** 11 to 12 huge tiles at `grid15` (5×3) with always-anchored `Yes`,
  `No`, and `Help`.
- **Calm Phrasing:** *"Trouble breathing"* instead of *"I can't breathe"*; *"Pain"* with
  0–10 scale and 6-region body map.
- **30-Second Personalization:** Quick header setup sets nurse name (*"Call Sarah"*) and
  family contact (*"Call Maria"*).
- **"Show the Nurse" Full-Screen Flash:** Overcomes noisy ICU rooms by flashing a giant,
  80pt bold card with a pictogram across the screen so medical staff see the request from
  the doorway.
- **Bilingual Bridge:** Instant 1-tap Spanish / French / English toggle (speaks in patient's
  native language, displays English on the nurse overlay).
- **Legal Disclaimer:** Prominent notice stating that Pip SCA is a communication aid, not a
  regulated medical monitor or emergency alarm.

### B. "My Life & Stories" (Visual Memory & Photo Albums)
*Adult Identity & Connection at Home*
- Adults converse through personal shared history, not by requesting snacks.
- Family members upload photos of grandkids, vacations, pets, and hobbies with 1-sentence
  captions (*"This is my grandson Leo scoring a goal at his soccer game"*).
- When visitors arrive, tapping the photo speaks the story, allowing the survivor to be a
  proud conversational partner rather than a passive listener.

### C. The "Tip-of-My-Tongue" Anomia Assistant
*Neuroplastic Speech Recovery for Aphasia*
- Stroke patients often know the concept but experience lexical retrieval blockages.
- **Phonics / Initial-Sound Cueing:** Tapping a letter (e.g. `B`) plays the mouth sound
  `/b/`, providing the phonemic cue the brain needs to trigger spontaneous speech.
- **Quick Sketchpad:** Built-in drawing canvas for finger-sketching when words fail.

### D. The Spouse "Co-Pilot" (Supported Conversation for Adults)
*Ending Caregiver Burnout & Mind-Reading*
- The spouse opens Pip SCA on their phone.
- During meals or daily routines, the spouse types or selects a 2-choice prompt (*"Do you
  want to watch the baseball game or sit on the patio?"*).
- The choices appear cleanly across the room on the patient's tablet. The patient taps
  their choice with zero guessing or frustration.

### E. Cloned Personal Voice (Voice Banking)
- For ALS or early stroke patients, uploading a 30-second pre-injury home video clip or
  sibling sample clones their warm, personal adult voice via ElevenLabs, avoiding generic
  robotic speech.

---

## 5. Why This Sits in Backlog

1. **Protect Pip AAC Launch:** Pip AAC has a clear path to production (027 occasion
   review, 019 user testing readiness, 010 picture library). We will not divert engineering
   bandwidth to an adult product line until Pip AAC has launched and proven its core
   pediatric thesis.
2. **Dedicated Entity:** When executed, Pip SCA will launch with its own domain (e.g.
   `pipsca.org`), dignified visual branding, and direct outreach to adult rehabilitation
   facilities, stroke support groups, and acute hospital SLPs.
