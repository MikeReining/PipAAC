---
name: art-generator
description: Canonical workflow, framing lenses, hand taxonomy, Proloquo physical anchors, TypeSafe Jev pre-classification, and quality judge for Pip AAC tile clipart generation.
---

# Art Generator

The Art Generator workflow produces high-clarity, vector-grade clipart icons for Pip AAC motor-grid tiles and system screens. It enforces clinical legibility at 48×48px iPad grid densities through explicit **Framing Lenses**, a discrete **Hand Lens**, **Proloquo Physical Anchors**, pre-classification via **TypeSafe Jev**, and a strict **Image Judge** protocol that checks hard invariants without over-policing artistic charm.

---

## 1. The 6 Semantic Framing Lenses

Every word must pass through the **Framing Lens** before prompt generation. A common failure mode in AAC iconography is drawing a full-body stick figure for every concept; on a 60-tile iPad grid (where cells are ~48×48px to ~60×60px), a full-body stick figure shrinks facial features to a 2-pixel blur and wastes 60% of the canvas on stick legs.

| Framing Lens | Flag (`--framing`) | Target Concepts | What Is Drawn | Clinical / 48px Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Face** | `--framing face` | Emotions & feelings (`happy`, `sad`, `mad`, `hurt`, `tired`), sensory/head states (`sleepy`, `sick`) | Close-up circular head filling 80%+ of the frame. Head only; no body, no legs. | Facial expression is 5× larger; smile, frown, tears, or eye shape are instantly recognizable across the room. |
| **Bust** | `--framing bust` | Oral & fine-motor manual actions (`eat`, `drink`, `taste`, `brush`, `think`, `say`, `read`, `give`, `take`, `put`), deictic chest gestures (`I`, `me`), object interactions (`play`, `make`) | Head, hands, and upper torso collar with Fitzgerald color fill. Upper body only; no legs. | Focuses 100% of visual resolution on the interaction between hands, face, and chest while preserving grammar torso color. |
| **Full** | `--framing full` | Gross-motor locomotion (`run`, `jump`, `walk`, `sit`, `stand`, `dance`, `fall`), multi-person social (`help`, `come`, `go`) | Complete stick figure with torso, limbs, and stance. | Semantic meaning requires leg stride, jump elevation, or ground contact. |
| **Diagram** | `--framing diagram` | Spatial prepositions & relations (`in`, `out`, `on`, `off`, `up`, `down`, `under`) | Minimalist container/surface geometry with bold Fitzgerald pink directional arrow. No human figures. | Eliminates human distraction; opposite pairs (`in`/`out`) share identical box perspective. |
| **Object** | `--framing object` | Inanimate nouns (`apple`, `ball`, `car`) and universal regulators (`stop`, `yes`, `no`) | Standalone object or sign with bold monoline outline and solid fill. No human figures, no background. | Unambiguous icon recognition; pre-literate universal symbols (e.g. red octagon with white palm for `stop`). |
| **Contrast** | `--framing contrast --torso <role>` | Words that mean a relation between a target and a reference (`big`, `little`, `tall`, `short`, `more`, `some`, `all`, `this`, `that`, `first`, `last`) | Two of the same thing. The target is filled with the tile's grammar color; the reference has the same outline and a pale grey fill. No arrow. | Color is seen before shape (pre-attentive pop-out), so the eye lands on the target without tracing an arrow. See § 1.1. |

Opaque function words take no lens: they get a hand-drawn glyph (§ 1.2).

### 1.1 Contrast: fill the target, ghost the reference

**DECIDED 2026-09-23** (founder). BUILT: `buildPrompt` contrast clause, `scripts/art/gen.mjs:189`.

- **Target** is filled with the tile's own grammar color (`--torso`), not always blue. `big` is blue because it is a descriptor; `this`/`that` take yellow.
- **Reference** keeps the same shape and black outline with a pale neutral grey fill (`#dddad3`). Never hollow: a hollow ball reads as a ring, a hole, or zero. Grey still separates from the fill on a black-and-white print.
- **Colorblind & CVI Accessibility (3:1 Luminance Ratio):** Contrast must never depend on hue alone. Target and reference must maintain at least a **3:1 relative luminance ratio** (WCAG AAA value contrast): saturated roles (blue `#2f6fd0`, green `#31a44b`, red `#e3242b`) pair with pale grey (`#dddad3`); high-luminance light roles (like yellow `#fecc2a`) pair with dark charcoal grey (`#555555`). This ensures the target pops out instantaneously even in pure monochrome/achromatopsia or photocopied printouts.
- **No arrow.** Fill and size already point; a pink arrow on a blue tile also breaks "hue means grammar." Arrows stay for motion and direction (`in`, `out`, `go`, `come`).
- **Pairs are minimal pairs.** `big` and `little` use identical composition; only the fill swaps. The child learns one contrast, not two pictures.

### 1.2 Opaque words: a glyph, not a picture, not a blank

**DECIDED 2026-09-23** (founder). BUILT: registry `data/art/glyph_words.json`; `generateToFile` refuses these words (`scripts/art/gen.mjs:362`).

Symbols are transparent (guessed on sight: `apple`, `eat`), translucent (learned once: `help`, `all done`), or opaque (any picture is arbitrary: `can`, `to`, `and`, `the`). Children learn opaque core words from adults modeling them at a fixed grid location, not from the picture. An opaque tile's art therefore has two jobs: be a distinct, stable landmark, and never teach a wrong literal meaning.

- **Never** a homonym (tin can for `can`, eye for `I`, bee for `be`) or a metaphor that another word owns (bicep = `strong`, checkmark = `yes`, thumb = `good`/`like`).
- **Never text-only.** The label strip already prints the word on every tile, so text-only is just an empty art box — and a column of blank tiles is indistinguishable to a pre-reader.
- **Glyphs are hand-drawn SVG**, ink outline plus role color, from a small closed set. Not generated: a wrong ASL handshape is worse than no picture.
- **Glyph source order:** (1) a symbol the child will meet anyway (`and` = `+`, `is` = `=`); (2) the ASL sign, where one exists, so adults can sign while tapping (`can` = two fists moving down); (3) arrow-and-dot geometry (`to` = arrow ending at a dot). ASL has no signs for `the`, `a`, or `is`, so it cannot be the only source.

#### Glyph grammar

**DECIDED 2026-09-23** (founder). BUILT: 21 glyphs at `assets/symbols/<word>.svg`, one spec line each in `data/art/glyph_words.json`; palette and file presence are checked by `scripts/art/gen.test.mjs`.

Glyphs are a small visual language, so a child who learns one family can guess the next. They use one canvas (`viewBox 0 0 100 100`), ink `#111111` at stroke 4.5 with round joins, and the art palette: green `#31a44b`, pink `#f16b93`, person yellow `#fecc2a`, reference grey `#dddad3`, plus the role's pale tint.

| Convention | Meaning | Words |
| --- | --- | --- |
| Role color = the word; grey = context (§ 1.1) | The filled part is what the word adds | all |
| Subject + green `=` | a form of *be*; the subject shows who: one ball, three balls, yellow person | `is`, `are`, `am` |
| Rewind badge ◀◀ in a white pill | past tense of the glyph under it | `was`, `were` |
| Fast-forward ▶▶ | future | `will` |
| Dashed outline, pale fill | maybe, not certain | `would` |
| Red slashed circle over the glyph | negative contraction | `can't`, `won't` |
| Same layout, different highlight | minimal pair | `because`/`so` (first vs last domino), `to`/`for` (dot vs person), `a`/`the` (spotlight) |

- **Spellings of one word share one glyph** (`a` = `an`). Everything else passes the Board Collision check (§ 6, invariant 5).
- **Placement:** each glyph's ink (outlines included) is centered and stays 6 units inside the edge — BUILT: the pixel check in `scripts/art/gen.test.mjs` renders every glyph and fails on a breach or an off-center drawing.
- **Breathing room:** separate pieces (an arrow and its target, a subject and its `=`, blocks in a row) keep at least 6 units of clear white between them — BUILT: each glyph's `parts` count in `data/art/glyph_words.json` is checked by that same render; touching pieces merge and fail the count. Pieces meant to touch (falling dominoes, ▶▶) count as one part.
- **People** in glyphs are Pip's character: head on a neck, rounded shoulders (`assets/symbols/you.png`), never a floating avatar head.
- **To change a glyph,** edit the SVG by hand, keep its `spec` line accurate, and look at it in a real tile at 48px before committing.

### 1.3 Pronouns vs people

**DECIDED 2026-09-23** (founder).

- **Noun = a person. Pronoun = the same person + a pointing hand** (`pointing_mitten`, entering from the tile edge). `he`/`she`/`it` are deictic, like `I` and `you`; in ASL, he/she/it *is* a point toward the referent. `it` points at a neutral object.
- **Gender cue lives in the head silhouette only**, and only on words whose meaning is gender (`he`, `she`, `boy`, `girl`, `man`, `woman`): `she` / `girl` / `woman` have hair that breaks outside the head outline (ponytail or shoulder-length); `he` / `boy` / `man` have short hair inside it. Interior details (pigtail bands, lashes) vanish at 48px.
- **No dress or skirt.** Bust framing crops it out, full framing is rejected at 48px, and it encodes a stereotype.
- **Child vs adult** is proportion: children have a bigger head relative to the body; adults are taller.
- A parent or SLP may replace the referent with a photo of a real person (sibling, teacher).

---

## 2. The Hand Lens (Discrete Hand Taxonomy)

Hands must never be drawn as realistic 5-finger spider hands (visual noise at 48px), nor should they be glued-on featureless meatballs when interacting with objects. Use explicit hand modes:

| Hand Mode | Flag (`--hand`) | Posture & Appearance | Target Actions / Concepts |
| :--- | :--- | :--- | :--- |
| **`resting_ball`** | `--hand resting_ball` | Featureless smooth white circle ("visual null") | Passive arms at sides, swinging stride in locomotion (`run`, `walk`). |
| **`pointing_mitten`** | `--hand pointing_mitten` | Curled fist + single extended index pointer finger | Deictics & pointing (`I`, `you`, `he`, `she`, `it`, `look`). |
| **`asl_v`** | `--hand asl_v` | Two extended fingers in a clear 'V' shape (ASL V / peace sign) | Visual perception, directed eye gaze (`see`). Clinically grounded; avoids collision with single-finger deictics. |
| **`grip_mitten`** | `--hand grip_mitten` | Thumb opposed to curled mitten palm wrapping around object | Grasping toys or tools (`play` car, `drink` cup, `hold`). |
| **`pincer_grasp`** | `--hand pincer_grasp` | Thumb tip meeting index fingertip | Precision fine motor (`pinch`, `pick`, `small`, `coin`). |
| **`open_palm_up`** | `--hand open_palm_up` | Two cupped palms extended forward/upward | Receptive gestures (`need`, `give`, `help`, `want`). |
| **`press_down`** | `--hand press_down` | Flat palm or pointer finger pressing downward | Direct activation (`stop`, `do` button, `push`, `squish`). |

---

## 3. Reverse-Engineering Proloquo: Physical Anchors & Creative Visual Metaphors

Abstract verbs fail when represented solely by stick figure posture. Naked posture leads to ambiguous gestures (e.g. waving hello for `come`) or static poses (hands on hips for `do`). Proloquo and industry-standard AAC solve this using **Physical Anchors, Familiar Props, and Creative Visual Metaphors**:

1. **Directional Vector (`directional_arrow`):**
   * *`come` vs `go`:* `go` is walking to the right with a forward arrow. `come` is walking toward the viewer/home with an inward arrival arrow. Naked waving is prohibited.
2. **Action Switch (`action_button`):**
   * *`do`:* Hand pressing a prominent round green pushbutton (the universal action trigger) or a finger ticking a checkmark. Hands on hips is prohibited.
3. **Retrieval Anchor (`shelf_retrieval`):**
   * *`get`:* Reaching onto an elevated surface or shelf to retrieve an object with an inward green retrieval vector. Dribbling a ball on the floor is prohibited.
4. **Mechanical Mating (`interlocking_blocks`):**
   * *`make` / `build`:* Two distinct toy blocks snapping together with geometrically matching studs and sockets. Flat-to-socket misfits are prohibited.
5. **Receptive Cupping (`receiving_palms`):**
   * *`need`:* Two cupped palms held outward to receive. Vertical prayer hands are prohibited.
6. **Cognitive / Mental Cloud (`thought_cloud`):**
   * *`think`:* A classic puffy thought cloud / bubble floating overhead above the figure. Completely eliminates gesture collisions with temple/ear/face touches. Instant recognition at 48×48px.
7. **Relatable Everyday Reward Anchors (`relatable_target`):**
   * *`want` / `get`:* Highly relatable, child-centric goal objects (e.g. cookies on a plate, cookie jar). Children understand wanting/getting real treats instantly; abstract reaching in a vacuum is ambiguous.
8. **ASL as a First-Principles Disambiguation Anchor:**
   * When two related verbs or gestures threaten to collide at 48×48px (e.g. `see` vs `look`, or `tell` vs `sing`), consult American Sign Language (ASL). In ASL, `see` uses a two-finger 'V' handshape pointing at or from the eyes. This provides real clinical grounding, avoids artificial poses, aids signing therapists/parents, and creates an unmistakable silhouette distinct from `look` (visor brow).

---

## 4. TypeSafe Jev Pre-Classification Pipeline

In both production (`Word_Library.md`) and CLI development, **TypeSafe Jev** (`https://api.typesafe.ai/v1/systemone` using `TYPESAFE_API_KEY`) pre-classifies any new word across four axes:
1. `framing`: `face` | `bust` | `full` | `diagram` | `object` | `contrast`
2. `social_scale`: `zero` (diagram/object) | `solo` (1 actor) | `pair` (2 actors: 1-on-1 handoff/deictic) | `group` (3+ actors: collective/plural)
3. `hand_mode`: `resting_ball` | `pointing_mitten` | `grip_mitten` | `pincer_grasp` | `open_palm_up` | `press_down`
4. `proloquo_anchor`: `directional_arrow` | `action_button` | `interlocking_blocks` | `shelf_retrieval` | `receiving_palms` | `none`


This eliminates blind trial-and-error before the first pixel is drawn.

---

## 5. Prompt Architecture & Generation Laws

All generation runs through `scripts/art/gen.mjs` against the frozen style bundle (`assets/style-refs/pip-v1/`).

### Canonical Prompt Structure
1. **Teaching Framing:** `We are trying to teach a child the concept of: {word}.`
2. **Locked Style Clause:** `Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.`
3. **Constraint:** `Do not include any text in the image.`
4. **Framing Injection:** Derived automatically from `--framing <face|bust|full|diagram|object|contrast>`. For `contrast`, `--torso` is the target's fill color.
5. **Fitzgerald Torso:** Derived automatically from `--torso <green|yellow|blue|pink|red>` (omitted for `face`, `diagram`, and `object`).
6. **Hand Mode Injection:** Derived automatically from `--hand <mode>`.
7. **Physical Anchor / Hint:** Explicit physical crutch or scene description.

### The Cardinal Law: Give It a Clear, Simple Prompt and Get Out of the Way
* **Over-prompting is the enemy of anatomy:** Stacking micro-anatomical directives (e.g., commanding a specific finger curl, wrist rotation, and palm orientation while simultaneously describing a complex prop interaction) overwhelms the diffusion model. The model contorts itself trying to satisfy contradictory micro-constraints, resulting in catastrophic defects like sprouting two arms from the same shoulder.
* **Trust the model with a single, crisp action:** State the concept, the framing lens, the torso color, and **one concise natural action sentence**. Let the action naturally dictate the pose and grip.
* **Creative Visual Metaphor Beats Strained Posture:** When simple stick figure posture alone is ambiguous, difficult to render cleanly, or collides with an existing neighbor on the board, use a clean visual metaphor (a thought cloud above the head, cookies on a plate, or an established ASL handshape). These are instantly decoded by children and keep the prompt short and crisp.
* **Feedback ≠ Prompt Bloat:** Giving feedback on what felt wrong does *not* mean dumping all that critique into the prompt. Keep the prompt minimal and clean; re-rolling a clean prompt beats over-specifying every time.
* **No negative prompt laundry lists:** Negative prompt-stuffing forces the model into latent edge cases and produces sterile, creepy mannequins.
* **The 3 reference images carry the style, line weight, and character identity.**

### Color Discipline & Sensory Over-Stimulation Law
* **Ban on "Colorful":** Never use the word "colorful" or "multi-colored" in prompts unless explicitly teaching color concepts (e.g. `colors`, `rainbow`, `paint`). Saying "colorful" triggers diffusion models to splash a 6-hue rainbow confetti across the tile, causing sensory overload and visual fatigue for autistic and neurodivergent learners.
* **Preserve Semantic Grammar Coding:** In Pip AAC, color is functional grammar code (Yellow = people/pronouns, Green = verbs, Blue = descriptors, Pink = prepositions/social, Red = negation/emergency). Spattering arbitrary rainbow colors across objects destroys the child's subconscious grammar cueing.
* **Contrast Words Use Target Fill:** Size, amount, and near/far words (`big`/`little`, `more`, `tall`/`short`, `some`/`all`, `this`/`that`) use the Contrast lens (§ 1.1): target in the role color, reference in pale grey. Never multiple hues.
* **Natural Object Color Is Allowed:** Natural objects can have their real-world color (an apple is red, a banana is yellow, a tree is green). But secondary props must never compete with primary semantic focus or grammar vectors.

---

## 6. The Strict Image Judge Protocol (Hard Invariants Only)

Automated judging must NEVER police subjective warmth, charm, smile shape, or whimsical tilt. It must strictly check **5 Hard Invariants**:

1. **Topological Limb Count & Bilateral Shoulder Origin:**
   * `bust` (solo): Strictly 2 arms. **Bilateral origin is mandatory:** exactly one arm must anchor to the left shoulder, and exactly one arm must anchor to the right shoulder. Two arms sprouting from the same shoulder is an automatic failure. Zero extra strokes descending from collar, neck, or chest (the `play` defect).
   * `bust` (pair): Strictly 2 stick figures side-by-side or in 2D profile. Exactly 4 arms total, each figure having bilateral shoulder attachments (1 arm per shoulder).
   * `full`: Strictly 2 arms, 2 legs. Bilaterally anchored to shoulders and pelvis.
   * `face`, `diagram`, `object` (`zero`): Strictly 0 human limbs.
2. **Mechanical & Physical Plausibility:**
   * Interlocking items must actually mate (e.g. Lego studs fit sockets; hands grip handles rather than float detached).
3. **Visual Noise & Artifacts:**
   * Exactly 0 text characters or letters.
   * Zero speed lines, motion streaks, speech bubbles, or floating debris.

4. **Semantic Singularity:**
   * Does not depict an opposing or ambiguous action (e.g., `come` must not look like goodbye; `get` must not look like dribbling a ball; `need` must not look like praying; `take` must not look like `put`).

5. **Board Collision:**
   * The main image or metaphor is not already another word's on the board (a flexed bicep is `strong`, not `can`; a checkmark is `yes`, not `did`).

---

## 7. Cadence: Strictly ONE Image at a Time

To maintain clinical economics and prevent runaway re-rolling:
1. **Pre-Classify:** Query TypeSafe Jev (or cite established classification).
2. **Formulate Prompt:** Combine framing lens, hand lens, and Proloquo physical anchor.
3. **Generate Image:** Run exactly **ONE** roll (`scripts/art/gen.mjs`).
4. **Judge Audit:** Review the generated image against the 5 Hard Invariants.
5. **Report to Founder:** Present the image, state the Judge's verdict (Pass/Fail + Why), state whether the agent agrees, and recommend the next step (Accept into `assets/symbols/` or make a specific targeted tweak).
6. **Wait for Approval:** Do NOT re-roll or proceed to the next word without founder feedback.

---

## 8. CLI Usage Reference

```bash
# Emotions / Feelings (Face Only)
node scripts/art/gen.mjs --word happy --framing face --out assets/symbols/happy.png

# Manual Actions with Hand Lens (Upper Body / Bust)
node scripts/art/gen.mjs --word eat --torso green --framing bust --hand grip_mitten --hint "holding red apple to mouth" --out assets/symbols/eat.png
node scripts/art/gen.mjs --word look --torso green --framing bust --hand pointing_mitten --hint "hand shading eyes like a visor brow" --out assets/symbols/look.png

# Abstract Actions with Proloquo Physical Anchors
node scripts/art/gen.mjs --word do --torso green --framing bust --hand press_down --hint "pressing a large round green pushbutton action switch" --out assets/symbols/do.png
node scripts/art/gen.mjs --word come --torso green --framing full --hand resting_ball --hint "walking toward the viewer with a bold green arrival arrow" --out assets/symbols/come.png

# Contrast pairs (target fill in the role color, reference pale grey)
node scripts/art/gen.mjs --word big --framing contrast --torso blue --hint "two balls, one huge and one tiny; the huge one is the target" --out assets/symbols/big.png

# Automated Pre-Classification via TypeSafe Jev
node scripts/art/gen.mjs --word come --classify --torso green --hint "walking toward the viewer with green arrival arrow" --out /tmp/come.png
```

