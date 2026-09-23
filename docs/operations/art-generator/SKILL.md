---
name: art-generator
description: Canonical workflow, framing lenses, prompt architecture, and quality audit for Pip AAC tile clipart generation.
---

# Art Generator

The Art Generator workflow produces high-clarity, vector-grade clipart icons for Pip AAC motor-grid tiles and system screens. It enforces clinical legibility at 48×48px iPad grid densities through explicit **Framing Lenses**, a frozen style bundle (`assets/style-refs/pip-v1/`), and an autonomous 2-re-roll quality gate.

---

## 1. The 5 Semantic Framing Lenses

Every word must pass through the **Framing Lens** before prompt generation. A common failure mode in AAC iconography is drawing a full-body stick figure for every concept; on a 60-tile iPad grid (where cells are ~48×48px to ~60×60px), a full-body stick figure shrinks facial features to a 2-pixel blur and wastes 60% of the canvas on stick legs.

| Framing Lens | Flag (`--framing`) | Target Concepts | What Is Drawn | Clinical / 48px Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Face** | `--framing face` | Emotions & feelings (`happy`, `sad`, `mad`, `hurt`, `tired`), sensory/head states (`sleepy`, `sick`) | Close-up circular head filling 80%+ of the frame. Head only; no body, no legs. | Facial expression is 5× larger; smile, frown, tears, or eye shape are instantly recognizable across the room. |
| **Bust** | `--framing bust` | Oral & fine-motor manual actions (`eat`, `drink`, `taste`, `brush`, `think`, `say`, `read`, `give`, `take`, `put`), deictic chest gestures (`I`, `me`) | Head, hands, and upper torso collar with Fitzgerald color fill. Upper body only; no legs. | Focuses 100% of visual resolution on the interaction between hands, face, and chest while preserving grammar torso color. |
| **Full** | `--framing full` | Gross-motor locomotion (`run`, `jump`, `walk`, `sit`, `stand`, `dance`, `fall`), multi-person social (`help`, `play`, `hug`) | Complete stick figure with torso, limbs, and stance. | Semantic meaning requires leg stride, jump elevation, or ground contact. |
| **Diagram** | `--framing diagram` | Spatial prepositions & relations (`in`, `out`, `on`, `off`, `up`, `down`, `under`) | Minimalist container/surface geometry with bold Fitzgerald pink directional arrow. No human figures. | Eliminates human distraction; opposite pairs (`in`/`out`) share identical box perspective. |
| **Object** | `--framing object` | Inanimate nouns (`apple`, `ball`, `car`) and universal regulators (`stop`, `yes`, `no`) | Standalone object or sign with bold monoline outline and solid fill. No human figures, no background. | Unambiguous icon recognition; pre-literate universal symbols (e.g. red octagon with white palm for `stop`). |

---

## 2. Decision Tree for New Words

```text
Is the word an inanimate noun, vehicle, food, or universal sign?
 ├── YES → Use --framing object (e.g., apple, car, stop)
 └── NO  → Does the word communicate a spatial relationship?
            ├── YES → Use --framing diagram (e.g., in, out, on, off)
            └── NO  → Does the word represent an emotion or facial state?
                       ├── YES → Use --framing face (e.g., happy, sad, hurt)
                       └── NO  → Does the action center on hands, mouth, or chest?
                                  ├── YES → Use --framing bust (e.g., eat, drink, think, I)
                                  └── NO  → Use --framing full (e.g., run, jump, help, play)
```

> [!NOTE]
> **Runtime Pre-Classification via TypeSafe Jev:**
> In the user-facing "Draw it for me" feature (`docs/product/Word_Library.md` § 6.1), TypeSafe Jev automates this decision tree on the backend: it pre-classifies the word and optional hint into one of the 5 framing lenses to dispatch a single, high-fidelity roll to Muse Image. Because image generation is an explicitly requested cloud service, Jev pre-classification is a mandatory cloud pipeline step (parents cannot disable Jev for Draw it for me). Offline developer scripts and batch generation use this decision tree directly or explicit CLI flags.

---

## 3. Prompt Architecture & Generation Laws

All generation runs through `scripts/art/gen.mjs` against the frozen style bundle (`assets/style-refs/pip-v1/`).

### Canonical Prompt Structure
1. **Teaching Framing:** `We are trying to teach a child the concept of: {word}.`
2. **Locked Style Clause:** `Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.`
3. **Constraint:** `Do not include any text in the image.`
4. **Framing Injection:** Derived automatically from `--framing <face|bust|full|diagram|object>`.
5. **Fitzgerald Torso:** Derived automatically from `--torso <green|yellow|blue|pink|red>` (omitted for `face`, `diagram`, and `object`).
6. **Plural Rule:** Derived automatically for plural nouns (`Show more than one.`).
7. **Optional Natural Hint:** Concise 4-to-8 word physical description if needed (e.g. `eating an apple`).

### The Cardinal Law: Re-Roll Over Prompt-Policing
* **Never add negative laundry lists** (`no feathers, no big eyes, no blush, no speed lines, no text`). Negative prompt-stuffing forces the model into latent edge cases and produces sterile, creepy mannequins.
* **The 3 reference images carry the style, line weight, and character identity.**
* If an image is 85% correct but has a minor artifact, **re-roll the seed**.

---

## 4. The 5-Point Quality Audit Checklist

Every generated roll is audited against five objective criteria before being presented to the user:

1. **WorkbookBench Stroke:** Bold, uniform monoline black outline with soft rounded joints; round head geometry matching `assets/style-refs/pip-v1/`.
2. **Hand Anatomy Standard:**
   * *Active gesture (pointing, touching, holding):* Clean single-finger mitten (curled fist with one extended pointer finger). Never 5 realistic spider fingers.
   * *Resting hand:* Smooth, featureless neutral circle ("visual null").
3. **Grammar Fill (Fitzgerald Key):**
   * Green: Action verbs (`eat`, `run`, `want`).
   * Yellow: Pronouns & people (`I`, `you`, `he`).
   * Blue: Descriptors & feelings (`happy`, `sad`, `big`).
   * Pink: Spatial arrows (`in`, `out`) and conjunctions.
   * Red: Regulators & urgency (`stop`, `no`, `not`).
4. **Zero Visual Noise:** Pure white canvas, zero background scenery, zero motion lines/speed streaks, zero text/letters.
5. **The 48px Squint Test:** Shrink the image or squint; the semantic concept must read unmistakably at tile resolution.

---

## 5. Autonomous Audit Protocol (Max 2 Re-rolls)

To maintain high agent autonomy and respect user time:
1. Agent generates **Roll 1** using the correct `--framing` and `--torso`.
2. Agent audits Roll 1 against the 5-point checklist.
3. If Roll 1 passes: Resize to 1024×1024 master, archive in `assets/symbols/<word>.png`, copy to brain directory, and present to user.
4. If Roll 1 fails (e.g. wrong posture, motion streaks, extra fingers): Agent adjusts seed or adds a minimal 3-word posture hint and re-rolls (**Roll 2**).
5. If Roll 2 still has an artifact: Agent performs one final re-roll (**Roll 3**).
6. Agent presents the best candidate to the user with an explicit audit note explaining the roll history.

---

## 6. CLI Usage Reference

```bash
# Emotions / Feelings (Face Only)
node scripts/art/gen.mjs --word happy --framing face --out assets/symbols/happy.png
node scripts/art/gen.mjs --word sad --framing face --out assets/symbols/sad.png

# Manual / Oral Actions (Upper Body / Bust)
node scripts/art/gen.mjs --word eat --torso green --framing bust --hint "eating an apple" --out assets/symbols/eat.png
node scripts/art/gen.mjs --word think --torso green --framing bust --hint "finger to temple" --out assets/symbols/think.png

# Gross Motor Actions (Full Body)
node scripts/art/gen.mjs --word run --torso green --framing full --out assets/symbols/run.png
node scripts/art/gen.mjs --word jump --torso green --framing full --out assets/symbols/jump.png

# Spatial Diagrams
node scripts/art/gen.mjs --word out --framing diagram --hint "bold pink arrow coming out of an open box" --out assets/symbols/out.png

# Standalone Objects & Universal Signs
node scripts/art/gen.mjs --word stop --framing object --hint "bold red octagonal stop sign with white hand" --out assets/symbols/stop.png

# Print prompt without generating (dry run)
node scripts/art/gen.mjs --word drink --torso green --framing bust --print-prompt
```
