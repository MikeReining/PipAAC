# Pip AAC — Dual-Engine Predictive Intelligence Architecture & Clinical Pedagogy

**DECIDED 2026-09-21** (founder brief intake). Revised **2026-09-22** (founder
review of blend, Jev sharing, listening, occasions:
`docs/founder/2026-09-22_Prediction_Blend_Privacy_Listening.md`).
Owner: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.
Foundational vision: `docs/strategy/Vision.md`.
Durable facts map: `docs/product/SSOT.md`.
Design invariants: `docs/product/Design_Invariants.md`.
Execution: `docs/phases/006_Prediction_Engine.md`, `docs/phases/007_Occasions.md`,
`docs/phases/008_Partner_Listening.md`.

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
|  Dual-Engine Predictive Intelligence (Local-First Memory + TypeSafe Jev)          |
|  - Formulates next-word prediction as fast classification, not text generation    |
|  - Local engine owns context: time, occasion, habit, phrase history, recency      |
|  - Jev owns meaning: does this word fit the sentence (and what the partner said)  |
|  - The blend learns each child's weights from their own taps, on the device       |
|  - Jev sharing is on by default (can be turned off); listening is off unless on   |
|  - Predictive strip: at most four fringe tiles; core cells never reorder         |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

Together, these two pillars solve the single most devastating metric in assistive communication: **the communication rate chasm**.

While verbal conversation flows at **120 to 150 words per minute**, traditional AAC communicators are trapped at **2 to 15 words per minute**. More than 70% of that time is spent visually hunting through 4-level deep folder hierarchies or fighting clunky, context-blind auto-complete bars.

Pip AAC closes this gap without violating motor automaticity and without putting words in the learner's mouth: a suggestion is an option the child may take, never an insertion.

---

## 2. Why Traditional AAC Prediction Failed

AAC prediction has historically been crippled by a false dichotomy between two flawed paradigms:

| Metric | Legacy N-Gram Tables (1990s–Present)<br>*(Proloquo, TouchChat, iOS T9)* | Generative LLMs (2023–2025)<br>*(GPT-4, Claude, Gemini)* | **Pip AAC Dual-Engine**<br>*(Local-First Store + TypeSafe Jev)* |
| :--- | :--- | :--- | :--- |
| **Model Type** | Static statistical bigrams / trigrams | Autoregressive token generation | **Learned on-device ranker + System One classification** |
| **Context Awareness** | **Zero.** Blind to time, environment, partner speech, or routines. | High, but prone to verbose hallucinations. | **Split by design.** Local: time, occasion, habit. Jev: meaning of the sentence and, when heard, the partner's words. |
| **Output Shape** | Flat alphabetical or frequency word lists | Free-form conversational text | **Probability over a shortlist, with an explicit "none"** |
| **Latency** | Instant (0ms) but semantically useless | High (500ms–2,000ms+ token stream) | **Local first paint <50 ms; Jev ~100 ms, never blocking** |
| **Economics** | Free (baked into offline app) | Prohibitive (\$15–\$50/month per child) | **Low.** Jev bills input tokens only (\$0.042/Mtok); estimate a few dollars per child-year at heavy use, not measured |
| **Motor Memory** | Jumps buttons around unpredictably | Incompatible with fixed grid layouts | **Core cells stay put. Halos mark words already on the grid. A strip of at most four tiles offers words that are not.** |
| **Privacy** | Offline / Private | Requires sending student dialogue to LLM clouds | **History never leaves the device.** Jev sharing (on by default, can be turned off) sends only the shortlist and the sentence being built (plus partner words when listening is on). |

### The Core Mathematical Insight
Human speech generation in an AAC environment is **not an open-ended prose generation problem**. An AAC learner has a defined, personalized universe of words:
- ~200 core words (verbs, pronouns, spatial prepositions, negation).
- ~300 to 1,500 personal fringe entities (family members, pets, foods, games, places).
- A finite set of pragmatic communicative functions (protest, request, comment, ask).

The mathematical task is:
$$\arg\max_{w \in \mathcal{V}_{\text{candidate}}} P\bigl(w \;\big|\; \text{Context}, \text{Sentence so far}, \text{Partner words (if heard)}\bigr)$$

This is a **classification problem**, and it splits cleanly: context is personal and local; meaning is general and is what Jev is good at.

---

## 3. Engine 1: Cloud-Edge System One (TypeSafe Jev)

**DECIDED 2026-09-22** (not built). Revises the 2026-09-21 state design.

### 3.1 Role: a meaning-only reranker

Jev answers one question: *given the words in this sentence (and what the
partner just said, if anything was heard), which of these candidates fits
next?* It does not know the time, the occasion, the child's history, or
anything said in an earlier sentence. Those belong to the local engine
(§ 4). Keeping the evidence apart is what lets the blend multiply the two
engines without counting anything twice (§ 5.1).

First build: one `Choice` question over the shortlist plus an explicit
`none` option. More questions (pragmatic intent, for example) ride the same
call only when code consumes the answer.

Jev constraints that shape this (TypeSafe docs, jev-1.13, read 2026-09-22):
text input only; English is the primary training language; weak at dates,
times, counting and arithmetic; reads instructions literally; accuracy
drops with irrelevant state. Keep instructions direct, keep state small, do
all arithmetic and time logic in code.

### 3.2 What Jev receives — and never receives

Jev sharing is a per-profile setting, **on by default**; a parent can turn
it off in the Parent corner. Off means no Jev call, ever; the strip runs on the
local engine alone. No zero-retention contract is assumed; the request is
anonymous by construction.

With sharing on, a request carries only:

| Field | When | Content |
| --- | --- | --- |
| Shortlist | every call | The candidates' labels in the profile language, plus `none`. A personal entity is an opaque key with its category and enrichment description ("family pet dog"), never its name or photo. |
| Sentence so far | every call | The labels of the current sentence, same entity rule. |
| Partner words | only when listening heard the partner this turn (§ 6) | The recognized text, as heard. |

Never sent: time, date, occasion, any earlier sentence, counts or
preferences, the learned weights, profile or device identifiers, photos,
audio.

No call is made when the sentence is empty and nothing was heard: there is
nothing for Jev to judge, and the idle strip is local.

The device never holds the TypeSafe key. Calls go through the Pip Worker,
which forwards the body and logs nothing about its contents.

Without partner words — listening off, or nothing heard:

```json
{
  "model": "jev-1.13.0",
  "state": {
    "sentence_so_far": "I want",
    "candidates_note": "Words a child using a picture-communication app could pick next."
  },
  "questions": {
    "next_word": {
      "type": "choice",
      "instructions": "Which word is the speaker most likely to choose next to continue the sentence in sentence_so_far?",
      "criteria": {
        "c1": "waffles",
        "c2": "juice",
        "c3": "family pet dog",
        "c4": "outside",
        "none": "None of these words fits as the next word"
      }
    }
  }
}
```

With partner words — listening on and the partner spoke:

```json
{
  "state": {
    "partner_said": "Do you want pancakes or waffles?",
    "sentence_so_far": "I want"
  }
}
```

The model id is pinned (not `jev-latest`) so thresholds tuned against one
version do not move when the alias does; the response's `model` field is
logged with each impression.

### 3.3 Confidence — replaced by the show gate in § 5.4

Jev's `confidence` measures how much of its probability sits on its
**single** top option. The strip shows up to four tiles, and good strip
moments often have two right answers ("pancakes or waffles?"), which
correctly produce low Jev confidence. So Jev's `confidence` is logged but is
not the gate. The gate is computed on the blended probabilities (§ 5.4).

### 3.4 Predictive Strip: Where Dynamic Candidates Live

**DECIDED 2026-09-22** (not built). Layout owner: `docs/product/Motor_Grid_And_Art.md`.

The strip is the dynamic surface. The core grid is not.

- After a core tap, the strip's first paint comes from the on-device ranker and resolves in under 50 ms, including the choice of which tiles to show.
- Jev may re-rank strip tiles when its answer arrives within 150 ms of first paint. Later answers are logged for learning and not shown, so tiles never reshuffle under a reaching hand. Jev never moves core cells.
- The strip shows at most four candidates. Each tile is a word plus its in-house icon. Putting a word in the strip does not swap a core cell.
- High-probability core words that already have a home on the grid are haloed in that home (§ 7.4). They are not relocated into the strip.
- Time of day, occasion, habit and recency bias the strip through the local engine only.
- Low-probability strip: show nothing. An empty strip is a valid state. Filling it with a guess is not.

---

## 4. Engine 2: The Local-First Private Memory Store

### 4.1 What stays on the device

**DECIDED 2026-09-22** (revises 2026-09-21). Everything the learner did —
the event log, sentences, strip impressions, occasion counts, the learned
weights — stays on the device. It works fully offline. Exactly two things
ever leave:

1. **Entity enrichment** (Muse Spark via OpenRouter): an entity's own name,
   hint and photo, once, online only (§ 5.6; `docs/product/Personal_Entities.md`).
2. **Jev requests**, only with sharing on, with the contents in § 3.2.

Partner audio never leaves and is never stored (§ 6).

### 4.2 Local schema

Owner: `docs/product/Language_And_Voice_Schema.md` § 6.2c–6.2e — event log
with sentence ids and local-time offset, sentences, strip impressions,
learned weights, and the profile's prediction settings. The 2026-09-21
sketch (`learner_preference_stats` with accept/refuse counts) is retired:
preferences are what the learned ranker infers from counts, not a
hand-labeled table.

### 4.3 Instant local resolution

The local engine is a handful of indexed SQLite reads per tap. Example: the
child has spoken *I want to go outside* many times on school mornings. After
*I want to*, the phrase feature for `go` is high, the occasion feature for
`outside` is high at 8:10 on a Tuesday, and the first paint offers them
before any network call.

---

## 5. The Blend: How the Two Engines Combine

**DECIDED 2026-09-22** (not built). Replaces the 2026-09-21 weighted sum
(`0.55·P_Jev + 0.35·P_local + 0.10·grammar`), which added numbers on
different scales and could not let either engine veto. Execution:
`docs/phases/006_Prediction_Engine.md`.

### 5.1 Separate evidence, multiplied

| Evidence | Owner |
| --- | --- |
| Meaning: does the word fit the sentence so far | Jev (+ local grammar invitation) |
| Partner words, when heard | Jev (meaning) + local echo (named items) |
| Time of day, day type, occasion | Local only |
| Phrase history, word pairs, frequency, recency | Local only |

Because Jev never sees context or history, the two engines are close to
independent evidence, so they combine by multiplication (adding logs). A
word wins only if both find it plausible: Jev can veto *I want **bath***;
local habit can veto *pancakes* for a child who never picks them.

### 5.2 The candidate funnel: retrieve locally, rank with Jev

The strip never asks "which of ~600 words". Stage 1 builds a shortlist
locally; stage 2 ranks it.

Stage 1 — local retrieval (SQLite, sub-millisecond, always runs). Sources,
most specific first:

- **Phrase recall.** Items this child picked after the same last one to three items in an earlier sentence (sentence-scoped, § 6.2c of the schema doc).
- **Word pairs.** Items picked right after the tail item, inside a sentence.
- **Occasion and time.** Items picked in the current occasion window and local-hour window, same day type (school day / weekend), plus the catalog occasion prior (`docs/phases/007_Occasions.md`).
- **Partner echo.** Items named in the partner's words, only when listening heard them (§ 6).
- **Sentence position.** The per-locale `GRAMMAR` invitation narrows parts of speech. Core continuations are haloed on the grid, not put in the strip (keyboard-mode exception below).
- **Recency and frequency.** A just-added entity is reachable before any enrichment exists.
- **Enrichment associations.** Cached Muse Spark records (§ 5.6).

Shortlist size starts at 16 and is measured, not assumed: TypeSafe advises
longer option lists are fine (Choice accepts up to 255), the 2026-09-22
spec assumed shorter is better. `docs/phases/006_Prediction_Engine.md`
slice 5 runs 8 / 16 / 32 on the simulation.

**Keyboard-mode exception.** **BUILT** (`9ca4653`). Decided 2026-09-22. While the keyboard is open the grid is hidden, so there is nothing to halo. In keyboard mode only, after a committed word, core continuations may take strip slots, ranked with learner pairs (ids only). Cap stays 4. Spec: `docs/archive/phases/004_Keyboard.md` slice 7.

Stage 2 — Jev rerank (sharing on, online, and something to judge): § 3.

### 5.3 Scoring: one log-linear model over the shortlist

For each candidate `w` in the shortlist `C`, code computes a feature vector
`x(w)`; the score is `s(w) = θ · x(w)`, and

$$P(w) = \frac{e^{s(w)}}{\sum_{v \in C \cup \{\text{none}\}} e^{s(v)}}$$

Features (all computed on device; counts decay with a 30-day half-life and
enter as `log(1 + count)`):

| Feature | Meaning |
| --- | --- |
| `phrase` | Continuations of the current last 1–3 items in earlier sentences (longest match wins) |
| `pair` | Times `w` followed the tail item inside a sentence |
| `occasion` | Times chosen in the current occasion window + catalog occasion prior |
| `hour` | Times chosen within ±1 local hour, same day type |
| `recency` | Decays over ~15 minutes since last pick |
| `freq` | Overall count |
| `invited` | Grammar invitation for this position (0/1) |
| `echo` | Named in the partner's words this turn (0/1; 0 when not listening) |
| `fresh` | Entity added in the last 24 h (0/1) |
| `jev` | `log P_Jev(w)`, only when Jev answered |

`none` has its own score: a learned bias, plus `log P_Jev(none)` weighted
when Jev answered. The `jev` feature is exactly the multiplication in § 5.1.

Two weight sets per profile: **`local_only`** (first paint; sharing off;
offline; Jev late) and **`with_jev`** (re-rank when Jev answers in time).
Offline is not "Jev removed" but its own tuned model.

Starting weights are the same for every child: tuned on the simulation
fixtures in 006 and shipped as catalog data. **BUILT** (006 slice 3):
`features()` + `scoreCandidates()` in `public/shared/funnel.mjs`; weights
in `data/prediction/defaults.json` → `catalog.prediction`, fitted offline
by `scripts/prediction/fit_defaults.mjs` on fixture days 1–10. The
`with_jev` set starts identical to `local_only` until an impression
carries a real `jev` feature.

### 5.4 The show gate

**BUILT** (006 slice 3): `showGate()` in `public/shared/funnel.mjs` —
τ live in `catalog.prediction.tau`, fitted with the weights.

- Show up to four tiles in rank order, each with `P(w) ≥ τ_tile`.
- If `P(none) ≥ τ_none`, show nothing (ghost cards).
- `τ_tile` and `τ_none` start from the simulation. The per-child `none`
  bias is learned (§ 5.5), so the gate adapts to how predictable the child
  is.

### 5.5 Learning from the child

Every strip moment writes an impression: the shortlist, each candidate's
features, what was shown, and whether Jev answered. The label is the **next
item the child actually picks** — from the strip, the grid, a group, or the
keyboard.

- Label in the shortlist: a training example for that label.
- Label not in the shortlist: a training example for `none`, and a
  shortlist miss.
- Sentence cleared without speaking (the child started over): its
  impressions are metrics only, not training examples — the target is
  unknown.

After each spoken sentence the device takes one gradient step per
impression on the log loss, with an L2 pull toward the shipped starting
weights. A child with little data behaves like the default; weights drift
as evidence accumulates. A routine-driven child ends up weighted toward
habit; a varied talker toward Jev. Nothing is configured by an adult.

Both sets learn: `with_jev` on impressions where Jev answered; `local_only`
on every impression (Jev terms dropped).

Feedback-loop guard: the strip can train toward what it already shows.
Labels come from every input path, and the independence report (§ 7.4)
tracks how much of each word's use comes through the strip.

### 5.6 The write-time lane: entity enrichment

**DECIDED 2026-09-22** (not built). A slower lane runs *once per personal entity*: **write-time enrichment** by Muse Spark (`meta/muse-spark-1.3-contributor`, Meta's multimodal model, via OpenRouter), which reads the entity's photo, name, and hint and writes a semantic record (description, category suggestion, related sense ids). Jev is text-only and cannot see the photo; enrichment is the one-time translation from pixels to text. The description is also what represents the entity in a Jev request (§ 3.2), so Jev learns *what* Cooper is without learning his name.

The record is cached with model and prompt version, abstention is a valid outcome, and it is a semantic signal the local ranker has when Jev cannot run. Contract: `docs/product/Personal_Entities.md` § Enrichment; storage: `docs/product/Language_And_Voice_Schema.md` § 6.2b.

**Privacy carve-out:** the enrichment call transmits the entity's own name, hint, and photo off-device (to OpenRouter), only while online, only once per entity. The save itself performs no network call.

### 5.7 Measuring it

The instrument is the child's own picks, not the ranker's report of itself:

- **Shortlist recall:** share of picks that were in the shortlist. Low → fix retrieval.
- **Strip hit rate:** share of picks shown in the tiles. Low with good recall → fix ranking.
- **False-show rate:** strip shown, pick not in it.
- **Taps per word** on the simulation fixtures (keystroke-savings method), before any child uses it.

---

## 6. Partner Listening

**DECIDED 2026-09-22** (not built). Replaces the four 2026-09-21 input
modes. Execution: `docs/phases/008_Partner_Listening.md`.

The device is not always listening. The family decides:

1. **Listening off (setting).** No Listen key, no microphone permission
   request, ever. Some families will never turn it on. Prediction loses
   partner echo and nothing else.
2. **Listening on (setting).** A Listen key appears on the board. Tap to
   start listening, tap to stop. Adults turn it on for a conversation and
   off when they do not want it.
3. **While listening.** A live indicator is always visible. Listening stops
   when the key is tapped, when the app leaves the foreground, and after a
   stretch with no speech.

What is heard:

- Speech becomes text **on the device**. No audio is recorded or stored.
  If a browser engine would send audio to a vendor server, it is not used;
  008 slice 2 decides the engine.
- The text is the **partner words for the current turn**. They feed the
  local `echo` feature and, with Jev sharing on, the Jev request (§ 3.2).
  They expire when the child speaks or clears the sentence, or after a
  short timeout. They are never written to the database; impressions keep
  only the 0/1 `echo` feature.
- **Amended 2026-09-22** (founder: "single words only … local only, on
  device only"). One exception: a single heard word that the child does
  not have yet may be kept as a Library suggestion (word, count, day). The
  sentence, the other words, the time and the speaker are not kept, and
  suggestions never sync and never reach Jev. Filter and storage:
  `docs/product/Word_Library.md` § 8.
- Nothing heard means Jev works from the shortlist and the sentence alone.

The Caregiver Co-Pilot (the partner speaks or types on their own phone,
§ 7.2) is a later, separate path and stays in `docs/strategy/Vision.md`.

---

## 7. The Pedagogical & Clinical Revolution

Integrating the Relational Language Graph (Pillar 1) with Dual-Engine Predictive Intelligence (Pillar 2) completely transforms clinical AAC intervention:

### 7.1 Proactive Self-Advocacy: The Power of "No"
In typical special education, learners are conditioned into passive compliance because requesting an alternative or protesting an activity requires navigating through layers of folders (`More` $\rightarrow$ `Feelings` $\rightarrow$ `Bad` $\rightarrow$ `Don't Like`). By the time the child navigates there, the unwanted item is already in front of them, frequently triggering a behavioral crisis.
- When an item is offered (heard through listening) that this child's history shows they refuse, **the self-advocacy tiles (`"NO"`, `"DON'T LIKE"`, `"STOP"`, `"DIFFERENT"`) are haloed in place**. The refusal history is local; only the partner's words and the sentence reach Jev.
- Communicating a boundary takes a single tap, fostering true autonomy and drastically reducing frustration-driven behaviors.

### 7.2 Frictionless Aided Language Stimulation (Modeling)
Research proves that children acquire AAC fluency only when adults model communication on the device (*Aided Language Input*). Yet adults rarely model because finding words in legacy apps is too slow and difficult.
- With listening on, the caregiver's spoken words prime the exact motor paths on the screen in real time.
- Parents and therapists can model full sentences in seconds, transforming modeling from a chore into a natural conversation.

### 7.3 Eradication of the Customization Tax
Traditional AAC apps require families to spend 5 to 10 hours a week manually creating buttons, editing templates, and downloading ClipArt. When families burn out, the device is abandoned.
- Pip AAC's combination of the Relational World Graph and System One classification automatically wires new vocabulary into the child's world.
- Enter a single fact: *"We got a new puppy named Cooper."*
- Cooper is instantly classified and contextually surfaced when animals or family pets are relevant — the relationship is evaluated by the model at decision time, not stored as a hand-authored link.

### 7.4 Prediction as a fading prompt

**DECIDED 2026-09-22** (direction; not built; no phase yet — opens after
006). The clinical objection to prediction ("don't spoon-feed") targets
prediction that bypasses the child's motor plan and substitutes an adult's
guess. Pip answers it by design:

- **Core words are prompted, not shortcut.** A likely core word is haloed
  in its home cell, which teaches the motor path. The halo fades as the
  child's independent use of that word grows, the way least-to-most
  prompting fades in therapy.
- **Fringe words get the strip shortcut** — the words a child would
  otherwise dig through groups for.
- **Always an option, never an insertion.** Nothing appears when unsure;
  the child always taps.
- **Independence report for the SLP:** share of each word's use through the
  strip vs. the grid, vocabulary diversity over time, taps per word. The
  spoon-feeding question gets a measured answer per child.
- **Per-profile prediction setting:** off, fringe only, or full (literate
  adults, ALS).

---

## 8. Durable Claims & Engineering Roadmap

- **DECIDED 2026-09-21** (founder brief intake):
  - Architecture adopted: Dual-Engine Predictive Intelligence (TypeSafe Jev cloud-edge System One + On-Device Local SQLite Memory).
  - Privacy policy: Zero audio recordings stored; raw utterance logs remain local on device.
  - Prediction interaction model: Stable spatial vector anchors preserved; candidate elevation via halos, never button-swapping.
- **DECIDED 2026-09-22** (mentor intake; not built):
  - On the motor-grid view, the predictive strip is where a suggestion may show a word that is not already a core cell. The Context River stays a separate situational surface. Maximum four strip tiles. Layout: `docs/product/Motor_Grid_And_Art.md`.
  - Strip first paint is on-device and under 50 ms. Jev refines asynchronously and must not block that paint or reorder core indices.
  - Two-model division: Muse Spark (`meta/muse-spark-1.3-contributor` via OpenRouter) enriches each personal entity once at write time; Jev ranks candidates at read time. Enrichment output is a cached hint with provenance, not stored truth.
- **DECIDED 2026-09-22** (founder review; not built):
  - Jev is a meaning-only reranker: it receives the shortlist and the sentence so far, plus partner words only when listening heard them. No time, occasion, or history (§ 3.2).
  - Jev sharing is a profile setting, on by default; a parent can turn it off, and off means no call. No zero-retention contract (§ 3.2).
  - Blend: one log-linear model over the shortlist with an explicit `none`; Jev enters as `log P_Jev`; weights learned per child on the device, in two sets (`local_only`, `with_jev`) (§ 5.3–5.5).
  - Show gate on blended probabilities, not Jev confidence (§ 5.4).
  - Sentences are tracked; a cleared sentence is a restart and not a training example (§ 5.5).
  - Listening: off in settings, or on with a Listen key that starts and stops it; on-device speech to text; partner words expire with the turn (§ 6).
  - Occasions are a dimension separate from groups; built by experiment first (`docs/phases/007_Occasions.md`).
  - Rate limits are parked until there are users.
- **BUILT** (`src/board/strip.test.mjs`): the local funnel's sentence position, recency, and same-hour frequency (`funnel.mjs:69`). Known defect: the same-hour term compares local to UTC hours (`funnel.mjs:80`); fix in 006 slice 1.

---

## 9. References & Technical Bibliography

1. **Beukelman, D. R., & Light, J. C. (2020).** *Augmentative & Alternative Communication: Supporting Children and Adults with Complex Communication Needs (5th ed.).* Brookes Publishing.
2. **Kahneman, D. (2011).** *Thinking, Fast and Slow.* Farrar, Straus and Giroux. (System 1 fast intuitive classification foundations).
3. **Light, J., & McNaughton, D. (2014).** *Communicative competence for individuals who require augmentative and alternative communication: A new definition for a new era of communication?* Augmentative and Alternative Communication, 30(1), 1–18.
4. **Sennott, S. C., Light, J. C., & McNaughton, D. (2016).** *AAC modeling intervention research review.* Communication Disorders Quarterly, 37(2), 105–115.
5. **TypeSafe AI (2026).** *System One docs: Choice, Confidence, Models, Jev 1.13 jaggedness.* `https://docs.typesafe.ai/llms.txt` (read 2026-09-22).
6. **von Tetzchner, S. (2018).** *Introduction to Augmentative and Alternative Communication.* In *Clinical Communication Disabilities*. Wiley.
7. **Koester, H. H., & Levine, S. P. (1996).** *Effect of a word prediction feature on user performance.* Augmentative and Alternative Communication, 12(3), 155–168.
