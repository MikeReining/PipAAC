# Clipart Pipeline, Jev Pre-Classification & Catalog Growth Loop

**DECIDED 2026-09-22** (founder ruling).
Truth owner for: "Draw it for me" generation lifecycle, TypeSafe Jev pre-classification, Cloudflare Worker asset retention, demand-ranked review queues ($k \ge 20$), and the perpetual catalog expansion growth loop.
Execution phase: `docs/phases/010_Extended_Picture_Library.md` Slice 6.
Parent spec: `docs/product/Word_Library.md` § 6.1.
Art standards: `docs/operations/art-generator/SKILL.md`.

**AMENDED 2026-09-29 (founder):** reuse first. Before any generation the
Worker searches every picture we own by meaning and applies a close match;
a drawing is keyed and stored once, so the same subject is never drawn
twice. The flow in § 2 runs only on a miss. Owner of find, draw ledger,
allowance and calibration: `docs/phases/030_Picture_Finder_And_Drawing.md`.

---

## 1. The Core Economic Principle: Generate Once, Benefit Forever

Traditional AAC apps burden families with 5 to 10 hours a week of manual cell creation, or charge recurring high subscriptions to pay for unbounded cloud image generation.

Pip AAC reverses this through a **one-time asset generation economics model**:
1. **Art is Generated Once:** When an adult requests an icon via **Draw it for me**, our Cloudflare Worker generates the clinical vector clipart. The image bytes are saved directly to cloud storage (Cloudflare R2).
2. **Audio is Synthesized Once:** When a missing word/phrase is promoted into the catalog, audio clips across our catalog voice suite are synthesized once (`scripts/catalog/generate_missing_audio.mjs`) and stored permanently.
3. **Perpetual Reusability:** Every approved word and graphic permanently enriches the **Extended Picture Library** (`secondary_fringe` tier). Future users who type that word get the pre-rendered clipart and voice clips immediately from catalog cache with **zero API generation cost**.

This drives the marginal cost per active user down toward zero as the catalog expands.

---

## 2. Two-Stage Jev Pre-Classification on Cloudflare Worker

When an adult requests **Draw it for me** with a word and optional hint, the request hits the Cloudflare Worker endpoint. 

Because TypeSafe Jev (`jev-1.13.0`) is a micro-cost structured choice model ($0.042 / million input tokens, or \~\$0.000002 per query), the Worker runs a two-stage pre-classification before touching the image generation API:

```text
+-----------------------------------------------------------------------------------+
| 1. Adult taps "Draw it for me" (word + optional hint)                             |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| 2. CLOUDFLARE WORKER: STAGE 1 — Entity Scope Classification (TypeSafe Jev)       |
|    Question: Is this a personal entity (person's name, pet, private address)     |
|              or a common communicative concept (common noun, verb, descriptor)?   |
|    - If PERSONAL: Tagged scope: personal (quarantined from public catalog).       |
|    - If COMMON:   Tagged scope: catalog_candidate (eligible for demand tracking). |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| 3. CLOUDFLARE WORKER: STAGE 2 — Semantic Framing Lens & Grammar (TypeSafe Jev)   |
|    Question: Which of the 5 framing lenses matches this concept?                  |
|    - Choices: object | face | bust | full | diagram                               |
|    - Deduces Fitzgerald Key torso color (green verb, yellow pronoun, etc.)        |
|    - Detects plural rule (Show more than one.)                                    |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| 4. SINGLE IMAGE GENERATION (meta/muse-image via OpenRouter)                       |
|    - Injects exact style reference bundle (assets/style-refs/pip-v1)              |
|    - Generates 1 vector-grade icon (66.7% API cost reduction vs 3 images)         |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| 5. WORKER ASSET ARCHIVAL & CLIENT DELIVERY                                        |
|    - Worker saves PNG bytes to Cloudflare R2: symbols/drawings/{hash}.png         |
|    - Worker logs metadata (word, hint, lens, scope, hash)                         |
|    - Client receives PNG and caches locally in SQLite/OPFS                        |
+-----------------------------------------------------------------------------------+
```

### Jev Cannot Be Disabled for "Draw it for me"
In conversational prediction (the live message strip), parents can toggle off Jev sharing in the Parent Corner if they choose a local-only prediction engine. 

**However, parents cannot disable Jev for Draw it for me.** Image generation is an explicitly requested cloud service. Jev pre-classification is an internal, non-optional pipeline component of that cloud service required to produce clinically legible 48px tile art and protect catalog taxonomy.

---

## 3. The 5 Framing Lenses & Prompt Injection

Jev classifies the candidate into one of the 5 semantic framing lenses defined in [`docs/operations/art-generator/SKILL.md:12-24`](file:///Users/mike/dev/PipAAC/docs/operations/art-generator/SKILL.md#L12-L24):

1. **`object`:** Inanimate nouns, food, vehicles, universal signs (`apple`, `ball`, `stop`). Standalone object, monoline outline, solid fill.
2. **`face`:** Emotions and facial/head states (`happy`, `tired`, `sick`). Circular head filling 80%+ of frame. No body, no legs.
3. **`bust`:** Oral & fine-motor manual actions (`eat`, `drink`, `think`), chest gestures (`I`, `me`). Upper torso with Fitzgerald color fill. No legs.
4. **`full`:** Gross-motor locomotion (`run`, `jump`, `walk`, `fall`), multi-person social (`help`, `play`). Complete stick figure with torso, limbs, and stance.
5. **`diagram`:** Spatial prepositions and relations (`in`, `out`, `on`, `under`). Minimalist container geometry with bold pink directional arrow.

Prompt injection is executed deterministically via `buildPrompt()` in [`scripts/art/gen.mjs:127-159`](file:///Users/mike/dev/PipAAC/scripts/art/gen.mjs#L127-L159).

---

## 4. Solving Personal Privacy via $k$-Anonymity & Dual Filtering

When families customize an AAC board, a large portion of custom words are personal entities:
* Relatives and caregivers: *"Uncle Dave"*, *"Grandma Rosa"*, *"Mrs. Gable"*
* Family pets: *"Cooper"*, *"Barnaby"*
* Private locations: *"104 Oak Lane"*, *"Dr. Chen's Office"*

Uploading and exposing personal names of children and families into a public library is unacceptable. We prevent this using a two-tier filter:

### Filter 1: Jev Semantic Scope Tagging
Jev identifies personal names and places at generation time and marks the drawing as `scope: personal`. Personal drawings are delivered to the requesting user's board, but their metadata is permanently excluded from the public review queue.

### Filter 2: The Demand Threshold ($k \ge 20$)
For words classified as `scope: catalog_candidate`:
* The Cloudflare Worker increments an anonymous global frequency counter: `word_frequency[normalized_label]++`.
* **Zero personal identifiers:** The counter stores only the text string and integer count. No board ID, profile ID, IP address, or timestamps are attached.
* Long-tail personal words that slipped past semantic classification will only ever reach a count of 1 or 2 globally.
* Common missing vocabulary items (*"boba"*, *"sensory swing"*, *"air fryer"*, *"slime"*) accumulate demand across multiple families.
* Only words reaching **$k \ge 20$ independent board requests** are surfaced to the catalog review queue.

---

## 5. Review Dashboard & Catalog Promotion Flow

```text
+-------------------------------------------------------------------------------+
| DEMAND-SORTED REVIEW QUEUE (Cloudflare Worker Dashboard)                      |
+-------------------------------------------------------------------------------+
| Rank | Term            | Demand Count | Pre-Generated Asset | Action          |
| :--- | :-------------- | :----------- | :------------------ | :-------------- |
| 1    | boba            | 142 requests | [View R2 PNG]       | [Approve] [Regen] [Reject] |
| 2    | air fryer       | 88 requests  | [View R2 PNG]       | [Approve] [Regen] [Reject] |
| 3    | sensory swing   | 53 requests  | [View R2 PNG]       | [Approve] [Regen] [Reject] |
+-------------------------------------------------------------------------------+
```

1. **Review Criteria:** The human reviewer audits the asset against the 5-point quality checklist from [`docs/operations/art-generator/SKILL.md:62-78`](file:///Users/mike/dev/PipAAC/docs/operations/art-generator/SKILL.md#L62-L78):
   * Stroke uniformity matching style reference bundle.
   * Hand anatomy (single-finger pointer mitten or neutral circle).
   * Fitzgerald Key color fill compliance.
   * Zero visual noise (pure white canvas, no text, no background).
   * 48px squint test legibility.
2. **One-Tap Approval:**
   * Moves image from `symbols/drawings/` to official asset repository `assets/symbols/`.
   * Enters catalog build as tier `secondary_fringe` (`scripts/catalog/build_catalog.mjs`).
   * Synthesizes audio clips across all shipped voices.
   * Instantly visible in `+ Add` for every Pip user globally.

---

## 6. The Privacy Firewall: Sacrosanct Boundaries

| Data Type | Treatment | Invariant |
| :--- | :--- | :--- |
| **Child's Spoken Sentences & Message Strip** | **STRICTLY ON-DEVICE** | **Zero cloud transmission.** Communicator utterances stay 100% local in device RAM/SQLite. Never logged, never uploaded, never reviewed. Essential for COPPA, FERPA (public schools), and HIPAA (speech therapy clinics). |
| **Word Demand Counters** | **ANONYMIZED TALLIES** | Only the normalized word string is tracked (`word_frequency["trampoline"] = 42`). No board IDs, user IDs, or device hashes. |
| **"Draw it for me" Payload** | **MINIMAL PAYLOAD** | Transmits strictly `{ word, hint }`. No child history, no board graph, no photos. |
| **Clipart Ownership** | **PIP PROPRIETARY ASSETS** | All generated clipart produced by Pip's Worker via Pip's prompts, styles, and compute remains Pip's intellectual property and can be curated into the shared global library. |
