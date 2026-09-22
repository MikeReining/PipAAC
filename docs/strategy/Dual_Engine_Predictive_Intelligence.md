# Pip AAC — Dual-Engine Predictive Intelligence Architecture & Clinical Pedagogy

**DECIDED 2026-09-21** (founder brief intake).
Owner: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.
Foundational vision: `docs/strategy/Vision.md`.
Durable facts map: `docs/product/SSOT.md`.
Design invariants: `docs/product/Design_Invariants.md`.

---

## 1. Executive Summary: The Two Pillars of Pip AAC

Transforming Augmentative and Alternative Communication (AAC) from an obsolete, stigmatizing tool into a fluent, joyful extension of human capability requires two foundational breakthroughs working in unison:

```text
+-----------------------------------------------------------------------------------+
|                                     PIP AAC                                       |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  PILLAR 1: THE BODY                                                               |
|  The Relational Language & World Graph ("The Airtable Jump")                      |
|  - Decouples language semantics from fixed 2D button matrices                     |
|  - Invariant spatial vector anchoring preserves motor planning across densities    |
|  - Multi-surface projections: Motor Grid, Context River, Visual Scenes, Co-Pilot  |
|  - Zero-friction living fringe: entities populate relations automatically         |
|                                                                                   |
|                                         +                                         |
|                                                                                   |
|  PILLAR 2: THE NERVOUS SYSTEM                                                     |
|  Dual-Engine Predictive Intelligence (TypeSafe Jev + Local-First Memory)          |
|  - Formulates next-word prediction as fast classification, not text generation    |
|  - Cloud Edge System One (TypeSafe Jev): sub-100ms semantic probabilities         |
|  - Local-First Private Database (SQLite/IndexedDB): encrypted on-device history    |
|  - Privacy-preserving multimodal partner input: on-device neural speech capture   |
|  - Clinical self-advocacy: proactive refusal, protest, and authentic preference   |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

Together, these two pillars solve the single most devastating metric in assistive communication: **the communication rate chasm**. 

While verbal conversation flows at **120 to 150 words per minute**, traditional AAC communicators are trapped at **2 to 15 words per minute**. More than 70% of that time is spent visually hunting through 4-level deep folder hierarchies or fighting clunky, context-blind auto-complete bars. 

Pip AAC closes this gap without violating motor automaticity, without invasive surveillance, and without putting words in the learner's mouth.

---

## 2. Why Traditional AAC Prediction Failed

AAC prediction has historically been crippled by a false dichotomy between two flawed paradigms:

| Metric | Legacy N-Gram Tables (1990s–Present)<br>*(Proloquo, TouchChat, iOS T9)* | Generative LLMs (2023–2025)<br>*(GPT-4, Claude, Gemini)* | **Pip AAC Dual-Engine**<br>*(TypeSafe Jev + Local-First Store)* |
| :--- | :--- | :--- | :--- |
| **Model Type** | Static statistical bigrams / trigrams | Autoregressive token generation | **System One Discrete Classification + Local Memory** |
| **Context Awareness** | **Zero.** Blind to time, environment, partner speech, or routines. | High, but prone to verbose hallucinations. | **Exact.** Contextual state (routine, partner speech, preferences). |
| **Output Shape** | Flat alphabetical or frequency word lists | Free-form conversational text | **Calibrated probability distribution over candidate tiles** |
| **Latency** | Instant (0ms) but semantically useless | High (500ms–2,000ms+ token stream) | **Ultra-Fast (<100ms cloud, <1ms local fallback)** |
| **Economics** | Free (baked into offline app) | Prohibitive (\$15–\$50/month per child) | **Negligible (\$0.042/Mtok, output free; <\$0.50/yr/child)** |
| **Motor Memory** | Jumps buttons around unpredictably | Incompatible with fixed grid layouts | **Stable spatial anchors with subtle confidence halos** |
| **Privacy / Safety** | Offline / Private | Requires sending student dialogue to LLM clouds | **Zero-PII. Raw logs stay 100% encrypted on device.** |

### The Core Mathematical Insight
Human speech generation in an AAC environment is **not an open-ended prose generation problem**. An AAC learner has a defined, personalized universe of words:
- ~200 core words (verbs, pronouns, spatial prepositions, negation).
- ~300 to 1,500 personal fringe entities (family members, pets, foods, games, places).
- A finite set of pragmatic communicative functions (protest, request, comment, ask).

The mathematical task is:
$$\arg\max_{w \in \mathcal{V}_{\text{candidate}}} P\bigl(w \;\big|\; \text{Context State}, \text{Partner Utterance}, \text{Learner Preferences}\bigr)$$

This is a **pure classification problem**. And TypeSafe's Jev is the first foundational model engineered specifically for low-latency, calibrated System One classification.

---

## 3. Engine 1: Cloud-Edge System One (TypeSafe Jev)

TypeSafe Jev acts as the real-time semantic classifier for Pip AAC. Rather than generating text, Jev evaluates a structured `state` against typed `Choice` questions in parallel.

### 3.1 Parallel Multi-Question Architecture
In a single API round-trip, Pip AAC evaluates four distinct linguistic dimensions across the candidate vocabulary without incurring context rot or added latency:

```mermaid
flowchart LR
    State["State: Partner Utterance + Routine + Context + Utterance Buffer"] --> Jev["TypeSafe Jev\n(System One Parallel Engine)"]
    Jev --> Q1["Choice: next_core_verb\n(P_verbs + confidence)"]
    Jev --> Q2["Choice: next_fringe_entity\n(P_nouns + confidence)"]
    Jev --> Q3["Choice: pragmatic_intent\n(Protest, Request, Comment, Inquire)"]
    Jev --> Q4["Choice: morphological_tense\n(Present, Past, Continuous)"]
```

### 3.2 State Structure (Zero PII by Design)
The `state` payload sent to Jev is compact, structured, and entirely scrubbed of personally identifiable information:

```json
{
  "model": "jev-latest",
  "state": {
    "partner_utterance": "Do you want pancakes or waffles?",
    "active_routine": "breakfast",
    "time_of_day": "08:20",
    "utterance_buffer": ["I"],
    "learner_profile_hints": {
      "refuses": ["pancakes"],
      "breakfast_favorites": ["waffles", "strawberries"]
    }
  },
  "questions": {
    "predicted_next_word": {
      "type": "choice",
      "instructions": "Given the partner's offer and the learner's preferences, which concept does the learner intend to select next?",
      "criteria": {
        "no": "Rejection or refusal of the offered item",
        "waffles": "Selection of favored breakfast item",
        "pancakes": "Acceptance of first offered item",
        "more": "Requesting continuation",
        "want": "Core auxiliary verb continuing sentence",
        "other": "None of the above"
      }
    },
    "pragmatic_intent": {
      "type": "choice",
      "instructions": "What is the primary communicative purpose of the next utterance?",
      "criteria": {
        "protest_refusal": "Rejecting an offered item or activity",
        "choice_making": "Selecting a specific preferred item",
        "commenting": "Sharing a reaction or feeling",
        "information_request": "Asking for clarification"
      }
    }
  }
}
```

### 3.3 Calibrated Confidence as a Protective UX Valve
TypeSafe provides a mathematically calibrated `confidence` metric ($0.0$ to $1.0$) reflecting the spread of probabilities. Pip AAC uses this confidence to enforce **communicator autonomy**:

- **High Confidence ($\ge 0.75$):** The top candidate tiles are gently highlighted with a soft, non-disruptive visual halo. They remain in their **exact, invariant motor positions**. Visual search time drops from seconds to milliseconds.
- **Moderate Confidence ($0.40 - 0.74$):** The top candidates are softly primed in the auxiliary Context River drawer.
- **Low Confidence ($< 0.40$):** **The system does nothing.** The grid remains in its neutral state. The system strictly obeys the clinical imperative: *Never guess or impose assumptions when the communicator's intent is uncertain.*

---

## 4. Engine 2: The Local-First Private Memory Store

While Jev provides broad semantic reasoning and linguistic fluency, **personal truth lives locally on the child's device**.

### 4.1 Strict Privacy Mandate (FERPA, HIPAA, COPPA)
Student communication logs, personal diaries, behavioral reactions, and daily patterns must **never** be stored on an unencrypted cloud server or used to train third-party models. 

Pip AAC mandates an **On-Device Local Database** (client-side SQLite via Origin Private File System / IndexedDB):
- All historical utterances, timestamps, routines, and response frequencies are stored locally in hardware-encrypted device storage.
- If the device is taken offline, disconnected from Wi-Fi, or used in a secure school environment, **all personal memory remains 100% operational**.

### 4.2 Local Behavioral Schema
```sql
-- On-Device SQLite: zero cloud exposure
CREATE TABLE learner_event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  routine TEXT NOT NULL,           -- e.g., 'breakfast', 'recess', 'speech_therapy'
  context_tags TEXT,               -- e.g., 'food_offered:pancakes,people:mom'
  selected_token TEXT NOT NULL,    -- e.g., 'no', 'waffles', 'go'
  pragmatic_act TEXT NOT NULL,     -- e.g., 'protest', 'request', 'comment'
  response_latency_ms INTEGER      -- speed of selection
);

CREATE TABLE learner_preference_stats (
  concept_id TEXT PRIMARY KEY,     -- e.g., 'pancakes', 'waffles', 'loud_noise'
  category TEXT NOT NULL,          -- e.g., 'food', 'sensory', 'social'
  total_accepted INTEGER DEFAULT 0,
  total_refused INTEGER DEFAULT 0,
  last_interaction DATETIME
);
```

### 4.3 Instant Local Resolution
When a routine is active or a partner speaks, the local engine queries historical frequencies in **$< 0.5\text{ms}$**:
```text
Context: Routine = 'breakfast', Offered = 'pancakes'
Query: SELECT total_refused, total_accepted FROM learner_preference_stats WHERE concept_id = 'pancakes'
Result: Refused = 18, Accepted = 1 (94.7% Refusal Rate)
Local Directive: Prime Refusal and Alternative Favorites ('waffles', 'strawberries')
```

---

## 5. The Hybrid Synthesis: Blending Cloud & Local Truth

Pip AAC combines Engine 1 (Jev Cloud Semantic Classifier) and Engine 2 (Local Behavioral Memory) through **Composite Bayesian Blending**:

$$\text{Score}(w) = \alpha \cdot P_{\text{Jev}}\bigl(w \;\big|\; \text{State}\bigr) + \beta \cdot P_{\text{Local}}\bigl(w \;\big|\; \text{History}\bigr) + \gamma \cdot \text{GrammarPenalty}(w)$$

Where:
- $\alpha = 0.55$: Weight assigned to Jev's semantic contextual understanding.
- $\beta = 0.35$: Weight assigned to the learner's personal historical preference on this device.
- $\gamma = 0.10$: Syntactic constraint penalty (e.g., preventing two consecutive finite verbs).

### Fallback Guarantee (Offline Resilience)
If network connectivity drops or latency exceeds $150\text{ms}$:
- The system automatically clamps $\alpha \to 0$ and $\beta \to 1.0$.
- The local on-device database handles prediction seamlessly using cached preference statistics and the local Relational Graph.
- Communication is an emergency lifeline; **it must never stall because of an API timeout**.

---

## 6. Privacy-Preserving Multimodal Partner Input

To feed natural conversational context into the predictive engine without turning the AAC device into an invasive "hot mic", Pip AAC implements four clear input modes:

```mermaid
flowchart TD
    subgraph Capture["Audio / Context Capture"]
        T1["Mode 1: Partner Push-to-Listen\n(Corner bezel button on tablet)"]
        T2["Mode 2: Caregiver Co-Pilot\n(Parent/SLP phone app sync)"]
        T3["Mode 3: Ambient Local VAD\n(Opt-in low-power Voice Activity)"]
        T4["Mode 4: Zero-Mic Sensor Context\n(Time, Geofence, Schedule, Buffer)"]
    end

    Capture --> STT["On-Device Local Neural STT\n(Apple Neural Engine / WebGPU Whisper)"]
    STT --> Scrub["Local RAM Text Filter\n(Scrub names/PII, extract intent string)"]
    Scrub --> Predict["Dual-Engine Predictive Pipeline\n(Jev State + Local SQLite)"]
```

1. **Mode 1: The Partner Push-to-Listen (Default Clinical Setting)**
   A discreet "Listen" target on the corner of the bezel. When an educator or parent asks a question (*"Do you want to paint or read a book?"*), they tap the button. Audio is transcribed in device RAM via Apple Silicon Neural Engine or local Whisper WebGPU. **Zero audio is recorded or stored.**
2. **Mode 2: The Caregiver Co-Pilot (Multi-Device Remote Modeling)**
   The adult speaks into their own device (iPhone, Android, Apple Watch, or desktop). Edge synchronization updates the child's screen instantly without requiring the adult to hover over the child or touch their tablet.
3. **Mode 3: Ambient Smart Ear (Opt-in Home Mode)**
   For private home environments, lightweight on-device Voice Activity Detection (VAD) activates only when speech directed at the learner is detected, transcribes the single phrase, and immediately returns to low-power sleep.
4. **Mode 4: Zero-Mic Fallback (Complete Audio Disable)**
   If microphones are prohibited by school policy, the predictive engine runs exclusively on time-of-day, active schedule, geofence, and user tap sequence.

---

## 7. The Pedagogical & Clinical Revolution

Integrating the Relational Language Graph (Pillar 1) with Dual-Engine Predictive Intelligence (Pillar 2) completely transforms clinical AAC intervention:

### 7.1 Proactive Self-Advocacy: The Power of "No"
In typical special education, learners are conditioned into passive compliance because requesting an alternative or protesting an activity requires navigating through layers of folders (`More` $\rightarrow$ `Feelings` $\rightarrow$ `Bad` $\rightarrow$ `Don't Like`). By the time the child navigates there, the unwanted item is already in front of them, frequently triggering a behavioral crisis.
- When Pip AAC knows a learner dislikes pancakes, noise, or crowded spaces, the moment that trigger is presented, **the self-advocacy tiles (`"NO"`, `"DON'T LIKE"`, `"STOP"`, `"DIFFERENT"`) illuminate instantly**.
- Communicating a boundary takes a single tap, fostering true autonomy and drastically reducing frustration-driven behaviors.

### 7.2 Frictionless Aided Language Stimulation (Modeling)
Research proves that children acquire AAC fluency only when adults model communication on the device (*Aided Language Input*). Yet adults rarely model because finding words in legacy apps is too slow and difficult.
- With Dual-Engine prediction, the caregiver's spoken words prime the exact motor paths on the screen in real time.
- Parents and therapists can model full sentences in seconds, transforming modeling from a chore into a natural conversation.

### 7.3 Eradication of the Customization Tax
Traditional AAC apps require families to spend 5 to 10 hours a week manually creating buttons, editing templates, and downloading ClipArt. When families burn out, the device is abandoned.
- Pip AAC's combination of the Relational World Graph and System One classification automatically wires new vocabulary into the child's world.
- Enter a single fact: *"We got a new puppy named Cooper."*
- Cooper is instantly classified, linked to `play`, `bark`, `soft`, `walk`, and contextually surfaced when animals or family pets are discussed.

---

## 8. Durable Claims & Engineering Roadmap

- **DECIDED 2026-09-21** (founder brief intake):
  - Architecture adopted: Dual-Engine Predictive Intelligence (TypeSafe Jev cloud-edge System One + On-Device Local SQLite Memory).
  - Privacy policy: Zero audio recordings stored; raw utterance logs remain strictly local on device (FERPA/HIPAA compliant).
  - Prediction interaction model: Stable spatial vector anchors preserved; candidate elevation via calibrated confidence halos, never button-swapping.
  - Multi-modal partner input: On-device local neural transcription + multi-device Caregiver Co-Pilot sync.
- **PROPOSED**:
  - Phase 1 Slice: Relational Language Graph schema + Local SQLite memory store stub + TypeSafe Jev proxy in `src/worker/index.js:12-14`.
  - Works Test: Automated benchmark testing classification latency ($<100\text{ms}$) and confidence-gated candidate selection against mock breakfast/recess state.

---

## 9. References & Technical Bibliography

1. **Beukelman, D. R., & Light, J. C. (2020).** *Augmentative & Alternative Communication: Supporting Children and Adults with Complex Communication Needs (5th ed.).* Brookes Publishing.
2. **Kahneman, D. (2011).** *Thinking, Fast and Slow.* Farrar, Straus and Giroux. (System 1 fast intuitive classification foundations).
3. **Light, J., & McNaughton, D. (2014).** *Communicative competence for individuals who require augmentative and alternative communication: A new definition for a new era of communication?* Augmentative and Alternative Communication, 30(1), 1–18.
4. **Sennott, S. C., Light, J. C., & McNaughton, D. (2016).** *AAC modeling intervention research review.* Communication Disorders Quarterly, 37(2), 105–115.
5. **TypeSafe AI (2026).** *System One Architecture & Jev Model Specification.* `https://docs.typesafe.ai/introduction`.
6. **von Tetzchner, S. (2018).** *Introduction to Augmentative and Alternative Communication.* In *Clinical Communication Disabilities*. Wiley.
