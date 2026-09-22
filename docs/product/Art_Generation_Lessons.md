# Pip AAC — Empirical Art Generation Lessons

**DECIDED 2026-09-22.** Derived from empirical image-generation bakeoffs and failure-mode analysis on Pip AAC (`scripts/art/gen.mjs`, `assets/style-refs/pip-v1/`).

---

## 1. The Cardinal Law: Re-roll Over Prompt-Policing

When an AI image generation has a minor defect (a stray speed line, a warped edge, a clipping plane), agents and humans instinctively try to **police the defect with text instructions**. 

**This is the single most destructive mistake in AI art generation.**

### What Happened When We Policed the Prompt

| Target Concept | The Policing Clauses We Added | The Disastrous Consequence |
| :--- | :--- | :--- |
| **`run` (Stick Persona)** | Added: `blank circular head`, `no hair`, `rounded hands`, `no motion lines or effects` | The model followed the negative instruction literally: **it erased the face entirely**, leaving a creepy, sterile, featureless egghead mannequin. |
| **`in` (Spatial Preposition)** | Added: `completely solid opaque sides with no transparent walls` | The model fixated on the word "opaque" and walls, resulting in a **distorted, lumpy hump** along the back rim behind the arrow. |
| **`in` (Minimalist Attempt)** | Stripped down to `simple open box` without visual volume | Produced a flat, solid brown cube that wasn't open at all. |

### What Happened When We Trusted the References & Re-rolled

We stripped away every single negative clause and policing instruction, keeping only the 3-line base prompt and a natural 5-to-8 word description:

```text
We are trying to teach a child the concept of: run.
Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.
Do not include any text in the image.
A stick figure with a green torso running.
```

* **Roll 1:** Had the cute face, green torso, but retained minor motion dashes.
* **Roll 2 (Identical prompt, just a new seed):** **Flawless.** Preserved the warm smiling face, circular head, rounded mitten hands, solid green torso, and natural silhouette variance produced a pure white background with **zero motion lines**.

And for `in`:
```text
We are trying to teach a child the concept of: in.
Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.
Do not include any text in the image.
A bold pink arrow pointing down into an open box.
```
* **Result (Roll 1 & 2):** **Flawless.** Both rolls drew clean, straight square cardboard boxes with open flaps, completely solid sides, and a bold pink arrow entering the interior. Zero lumps, zero transparent walls, zero wireframes.

---

## 2. Why the 3 Reference Images Carry the Burden

1. **The reference images carry the hand, line weight, and character identity.**
   * A frozen bundle of 3 reference images (`assets/style-refs/pip-v1/`) communicates line thickness, curvature, and proportions directly to the model's vision backbone. 
   * Describing these in prompt prose is redundant at best, and actively destructive at worst.

2. **The prompt only carries the canvas frame and the subject.**
   * Frame clause: `pure white background, bold black outline, flat solid colour, no shading.`
   * Constraint: `Do not include any text in the image.`
   * Subject: A plain, natural phrase naming the actor, object, or directional vector.

3. **Within-prompt variance across random seeds is larger than any prompt tweak.**
   * Adding adjectives or negative clauses constrains the model's attention, shifting it away from the reference style and into weird latent edge cases.
   * If an image is 85% right but has a defect, **re-roll the seed**. Do not rewrite the prompt into a legal contract.

---

## 3. The Persona Stick Figure Rules

* **Warmth Over Sterility:** The character is not an emergency exit sign or a bathroom placard. It has a round head with a simple, friendly face (dot eyes, warm smile). A faceless head looks alienated and clinical.
* **No Demographic Markers:** Zero hair, no gender cues, no clothing details beyond the solid grammar fill.
* **Fitzgerald Torso Fill:** The torso is filled with the grammar role color (Green = action/verb, Yellow = person/pronoun, Blue = descriptor, Pink = social/question).
* **The Single-Finger Mitten Standard (Hand Anatomy):**
  * *The Deictic Problem:* A character with closed circle ball hands cannot communicate *you*, *me*, *there*, or *this*—a ball resting on a chest looks like a fist, and a ball extended outward looks like a punch. Pointing direction creates the word's semantic meaning.
  * *The Resting Hand (Visual Null):* The non-gesturing hand is a clean, featureless circle. It carries zero information, preventing the child's brain from dividing attention across two hands and avoiding black pixel mud at 48×48px.
  * *The Active Hand (Single-Finger Mitten):* When pointing, gesturing, or touching, exactly **one index finger extends from a curled fist**. Never draw five realistic fingers.
  * *Focal Scaling:* The active hand is drawn slightly larger in perspective to establish immediate visual hierarchy on a crowded motor grid.
* **Pose Over Speed Lines:** Action is communicated by the angle of the limbs and torso lean, never by speed dashes, wind puffs, or cartoon effects.

Master symbol references:
* Active motion: `assets/symbols/run.jpg`
* Deictic gesture: `assets/symbols/you.png`

---

## 4. The Spatial Diagram Rules

* **Concrete Containers, Not Abstract Geometry:** For prepositions (*in*, *out*), use a simple physical open box rather than wireframe geometric planes.
* **Opposite Pairs Share Geometry:** *in* and *out* must use the same container perspective, changing only the arrow's trajectory.
* **Fitzgerald Accent:** The directional vector arrow carries the Fitzgerald preposition color (pink/magenta).

---

## 5. Why This Matters for Scaling to 600 Words

A vocabulary catalog of 600 words (`docs/product/Initial_Vocabulary_600.md`) cannot be built if each word requires 15 minutes of bespoke prompt engineering and negative-constraint tuning. 

The only architecture that scales:
1. One canonical 3-line prompt template (`scripts/art/gen.mjs`).
2. One frozen 3-image style bundle (`assets/style-refs/pip-v1/`).
3. Clean, unpoliced 5-to-10 word descriptions for abstract words.
4. Fast 3-roll generation passes where human/agent review selects the best seed.

---

## 6. Case Study: Pip the Bird Mascot & Brand Suite

When designing the system mascot (Pip the Bird), the initial designer brief stuffed the prompt with negative constraints:
> *"No feathers, no big eyes, no blush, no side-profile flying pose, no green, no blue, pure white body with black beak..."*

### The Failure Mode
The resulting image was an unmemorable, lifeless, albino "egg" that failed the squint test at 16px. Over-policing stripped out all character and warmth.

### The Solution: Reference Anchoring + Warm Color + Minimal Positive Prompts
1. **Style Bundle Reference:** Seeded `assets/style-refs/pip-brand/` with the stick persona (`assets/symbols/you.png`) and pencil to lock line weight and curve feel.
2. **Warm Palette:** Shifted to a rich golden songbird body (`#fdb826`) with an orange triangular beak and orange three-toed feet, matching the warmth of the stick figure universe while avoiding Duolingo green and Twitter cyan.
3. **Clean Positive Prompts:** Swapped paragraph-long negative briefs for short 8-to-12 word natural descriptions (e.g. *"A cheerful golden songbird named Pip mid-hop with feet together lifted off the ground, tail lifted up, round dot eye"*).
4. **Seed Re-rolling:** In 2 to 3 rolls per pose, Muse delivered the full suite of 6 system poses with zero line artifacts and perfect stylistic coherence.
5. **Locked Masters (1024×1024):** All 6 poses archived in `assets/brand/` (`pip-01-sitting.png` through `pip-06-hopping.png`).

