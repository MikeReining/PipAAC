# 033 — Bedside & Hospital Kit (/hospital)

**Status:** Proposed 2026-09-30 (founder brief).

## Founder intent (2026-09-30)

1. **Acute and adult care as a distinct wedge:**
   Children need a language system that grows over years. Adults with aphasia, ALS, or an
   acute ICU stay already have language—they need a voice *today* for pain, breath, and
   comfort. Traditional hospital patients are handed a laminated cardboard alphabet board
   and a call bell. Pip can provide an immediate, dignified bedside voice.
2. **Onboarding comes first, not last (60-second entry):**
   An ICU family member or bedside nurse has about 60 seconds and zero patience for
   settings or multi-step account creation. The entry URL (`pipaac.org/hospital` or
   `app.pipaac.org/?kit=hospital`) boots straight into a working board. Onboarding and
   settings share the exact same underlying component—never two diverging paths.
3. **Fewer and bigger (8 to 12 tiles at `grid15`):**
   A patient in acute physical distress cannot navigate 18+ small buttons. At Pip's
   large `grid15` (5×3) density, targets are large, effortless to touch with trembling
   hands, and stable for eye gaze. `Yes`, `No`, and `Help` remain permanently anchored,
   leaving 9 to 11 high-priority message tiles. Everything else sits behind a clean
   `🗂️ More needs...` door.
4. **Calm, accurate phrasing (no emergency drama):**
   Phrasing like *"I can't breathe"* sounds like a 911 telemetry alarm and creates
   unnecessary panic and regulatory liability. We use calm, accurate bedside phrasing:
   **"Trouble breathing"** or **"Hard to breathe"**.
5. **The 30-second personalization wedge:**
   Generic laminated boards say *"Call daughter"*. In 30 seconds, a supporter sets the
   names, turning tiles into **"Call Maria"** and **"Call Nurse Sarah"**.
6. **"Show the nurse" full-screen visual alert:**
   In noisy ICUs with beeping monitors, tablet speakers cannot be heard across a room or
   from the hallway. When an urgent tile is tapped, Pip briefly flashes a giant,
   high-contrast visual card across the entire display (e.g., bold black text on white
   with the pictogram: **TROUBLE BREATHING** or **PAIN: 8/10**). A nurse glancing
   through the doorway sees the patient's need immediately.
7. **Color-neutral pictograms (No Fitzgerald Key colors):**
   *"If you have a heart attack, you don't want to deal with our color coding. That's for
   pediatric language learning, not for what this is now."*
   Rainbow grammar fills (yellow nouns, green verbs, pink prepositions) are infantilizing
   and induce visual fatigue. Adult bedside boards use **clean, color-neutral monochrome
   stick pictograms** (slate/charcoal) and high-contrast typography. Red is reserved
   strictly for acute distress (pain, breathing).
8. **Bilingual bedside bridge (Spanish, French, Chinese):**
   Language barriers in hospitals are terrifying. A 1-tap language toggle lets a
   Spanish-speaking patient tap a Spanish tile (*"Me cuesta respirar"*), hear speech in
   Spanish, while the "Show the nurse" card flashes the English translation for medical
   staff.
9. **Separate Gestalt from hospital work:**
   Gestalt Language Processing (GLP) serves children acquiring language and belongs in a
   dedicated pediatric feature doc (`docs/backlog/Gestalt_Script_Capture.md`).

---

## Market & Clinical Sourcing

The need for immediate bedside communication is backed by established clinical data:

1. **Stroke & Aphasia:**
   Each year, roughly **795,000 people in the United States have a stroke**
   ([CDC Stroke Facts](https://www.cdc.gov/stroke/facts.htm)). An estimated **2 million
   Americans are living with aphasia**, with 25% to 40% of stroke survivors acquiring the
   condition ([National Aphasia Association](https://aphasia.org/)). Many experience
   acquired alexia (reading impairment) while visual comprehension of pictograms remains
   intact.
2. **Mechanically Ventilated ICU Patients:**
   Over **1 million patients receive mechanical ventilation in US ICUs annually**, out of
   more than 4 million ICU admissions ([Wunsch et al., Crit Care Med, NIH](https://pubmed.ncbi.nlm.nih.gov/23385106/)).
   Intubation prevents vocal speech entirely, leading to documented panic and acute
   delirium.
3. **Clinical Efficacy of Bedside AAC:**
   Peer-reviewed ICU communication research ([VidaTalk study, PMC10833611](https://pmc.ncbi.nlm.nih.gov/articles/PMC10833611/))
   demonstrates that providing nonvocal ICU patients with electronic picture/phrase
   communication significantly reduces patient anxiety, eases family caregiver burden,
   and clarifies urgent patient requests (repositioning, suction, pain, family contact).

---

## Regulatory & Liability Law (AGENTS.md High-Risk Stop)

Pip Bedside is a communication aid, **not a regulated medical device, telemetry monitor, or nurse call-bell replacement**.

To comply with FDA and Health Canada medical software guidelines:
- Phrasing avoids claiming to signal acute medical emergencies (e.g. *"Trouble breathing"* instead of *"I can't breathe"*).
- Every bedside screen and setup card displays the prominent, permanent disclaimer:
  > **Pip Bedside is a communication aid between patients, families, and care teams. It is not an emergency medical alert system or patient monitor. In a medical emergency, always use the hospital nurse call bell or call 911.**

---

## The Bedside Board (grid15)

The default home board uses Pip's 5×3 (`grid15`) layout:

```text
+-------------------+-------------------+-------------------+-------------------+-------------------+
|     (🚨 Red)      |     (🚨 Red)      |   (Slate/White)   |   (Slate/White)   |   (Neutral Blue)  |
|      PAIN ▸       | TROUBLE BREATHING |      SUCTION      |   MOVE / TURN ME  |       YES         |
+-------------------+-------------------+-------------------+-------------------+-------------------+
|   (Slate/White)   |   (Slate/White)   |   (Slate/White)   |   (Slate/White)   |   (Neutral Blue)  |
|    WATER / MOUTH  |  TOILET / BEDPAN  |    HOT / COLD ▸   |  I'M SCARED / TALK|        NO         |
+-------------------+-------------------+-------------------+-------------------+-------------------+
|   (Soft Green)    |   (Soft Green)    |   (Slate/White)   |   (Slate/White)   |     (🚨 Red)      |
|    CALL NURSE ▸   |    CALL MARIA ▸   |     THANK YOU     | 🗂️ MORE NEEDS...  |       HELP        |
+-------------------+-------------------+-------------------+-------------------+-------------------+
```

### Expanding Tiles (Inline Families in the Smart Bar)
1. **PAIN ▸:** Opens an inline 0–10 numeric pain scale, followed by a 6-region body map
   (`head · chest · belly · back · arm · leg`).
2. **HOT / COLD ▸:** Expands to `too hot · too cold · blanket · fan`.
3. **CALL NURSE ▸:** Defaults to *"Call nurse"*; personalized in setup to *"Call Sarah"*.
4. **CALL MARIA ▸:** Defaults to *"Call family"*; personalized in setup to *"Call Maria"*.
5. **🗂️ MORE NEEDS...:** Opens secondary group page: `glasses · TV on/off · lights · quiet · chaplain · dentures`.

---

## Technical Architecture

1. **Zero-Account Entry (`/hospital`):**
   Visiting `pipaac.org/hospital` boots an ephemeral local profile seeded with the
   Bedside kit. No sign-up, passkey, or email required. Works 100% offline via service
   worker once loaded.
2. **30-Second Bedside Setup Header:**
   The top bar features an unobtrusive `⚙️ Quick Setup` pill that slides open an inline
   2-field drawer:
   - Patient Name (e.g. "David")
   - Nurse Name (e.g. "Sarah")
   - Family Contact (e.g. "Maria")
   - Language (English / Español / Français / 中文)
   Closing the drawer immediately updates the board tiles.
3. **"Show the Nurse" Flash Overlay:**
   Tapping an urgent card (Pain, Breathing, Suction, Toilet) speaks the phrase via
   Pip's sentence TTS and triggers a 4-second full-screen high-contrast visual alert:
   - 80pt bold text centered on display.
   - Large monochrome pictogram.
   - For bilingual mode: Large English text on top, patient's native language below.
   - One tap anywhere dismisses immediately.
4. **iPadOS 18 Eye Tracking Compatibility:**
   Because `grid15` cells are massive (~200px × 150px on an iPad 10.9"), patients using
   iPadOS 18 native Eye Tracking with Dwell Control have effortless target acquisition
   with zero custom CV code required.

---

## Slices

| Slice | Scope | Output / Proof |
| :--- | :--- | :--- |
| **Slice A: Bedside Kit Data & Phrasing** | Catalog seed `public/shared/bedside_kit.mjs` containing the 12 primary tiles, families, and translations. | Unit tests verify tile definitions, bilingual text pairs, and 15-cell geometry. |
| **Slice B: Dignified Styling & Monochrome Pictograms** | CSS classes (`.tile--bedside`, `.tile--distress-red`) stripping Fitzgerald colors and applying slate/charcoal styling to stick figures. | Visual proof in `public/preview-bedside.html`. |
| **Slice C: "Show the Nurse" Visual Overlay** | Full-screen visual card component that displays upon speaking high-priority needs. | Interactive demo verifying overlay duration, dismiss tap, and bilingual text. |
| **Slice D: Bedside Quick Setup & Personalization** | 30-second inline header drawer to set Nurse name, Family contact, and Language. | Works test: changing names immediately re-labels and re-voices tiles. |
| **Slice E: Zero-Friction Route (`/hospital`)** | URL routing in worker and static app booting directly into Bedside mode without auth. | Clean URL test: navigating to `/hospital` loads working board in under 2 seconds. |
| **Slice F: Hospital SLP Review Gate** | Review session with 1–2 practicing acute care or rehabilitation SLPs. | Feedback documented; adjustments made before general announcement. |
