---
name: art-generator
description: Canonical workflow, visual modalities, anatomy buckets, prompt invariants, and quality judge for Pip AAC clipart generation.
---

# Art Generator

The Art Generator produces vector-grade clipart symbols for Pip AAC motor-grid tiles (48×48px to 60×60px) and system screens. It enforces clinical legibility, lifespan dignity, and rapid iteration through explicit **Visual Modalities**, **Anatomy Buckets**, **Prompt Invariants**, and a strict **5-Invariant Image Judge**.

---

## 1. Lifespan Dignity & Visual Philosophy

* **An AAC symbol is a person's voice, not a kindergarten toy:** Communicators range from age 7 to non-speaking adults. Symbols represent their thoughts, choices, and autonomy in public (schools, restaurants, workplaces, doctors' offices).
* **Anti-Circus / Anti-Toy-Store:** No clown stickers, no hyperactive cartoon styles, no rainbow confetti, no babyish facial caricatures.
* **Calm, Mature Simplicity:** Bold black outlines, clean solid or vector-volume fills, calm visual fields, zero sensory overload.
* **Functional Color Coding:** Color carries grammatical semantics (Yellow = people/pronouns/nouns, Green = verbs, Blue = descriptors, Pink = prepositions/social, Red = negation/emergency). Never splash random colors or use "colorful" in prompts.

---

## 2. The Four Visual Modalities & Pipeline Routing

To avoid stylistic collision, every word routes to one of four visual engines:

| Modality | Flag / Mode | References Used | Target Vocabulary | Visual Rules |
| :--- | :--- | :--- | :--- | :--- |
| **`pip-v1`** | `--framing <face\|bust\|full>` | `assets/style-refs/pip-v1/` | Verbs, actions, emotions, pronouns, macro body poses | Monoline stick figure, bilateral shoulder origins, Fitzgerald colored torso. |
| **`object-v1`** | `--framing object` | `assets/style-refs/object-v1/` | Fresh produce, animals, tools, everyday objects, standalone organs | Warm storybook vector volume, natural 3/4 perspective, bold outline, zero background. |
| **`category_packshot`** | `--mode category_packshot` | **None** (Studio photo) | Formless pantry/grocery staples (`peanut butter`, `fruit snack`, `jam`, `cereal`, `flour`) | Commercial product photography, pure white background, subtle drop shadow. **Zero text/words; clean pictorial food graphic on front.** |
| **`cpg_brand`** | `--mode cpg_brand` | **None** (Brand photo) | Specific commercial brand goods (`7 Up`, `Frosted Flakes`, `Oreo`, `Cheerios`) | Authentic brand livery, real logo and trademark typography. Real-world recognition. |

---

## 3. The Three Anatomy Buckets

Human anatomy cannot be treated with a single modality. Stick figures lack fine organs, while standalone clipart fails for relative body parts. Every anatomical word routes to one of three buckets:

```text
Anatomy Routing
├── Bucket A: Standalone Iconic Organs (object-v1)
│   └── eye, ear, mouth, teeth, tongue, hand, foot
├── Bucket B: Macro Regions on Pip with ASL Anchors (pip-v1)
│   └── body (ASL chest touch), head (ASL temple touch), face (cheek framing)
└── Bucket C: Relational Body Parts (anatomy_relational)
    └── hair, neck, shoulder, tummy, back, elbow, knee, toes
```

1. **Bucket A (Standalone Iconic Organs — `organic_noun`):**
   * *Words:* `eye`, `ear`, `mouth`, `teeth`, `tongue`, `hand`, `foot`.
   * *Style:* Standalone vector volume (`object-v1`), 3/4 perspective, bold monoline outline. Universally recognizable without surrounding context.
2. **Bucket B (Macro Regions on Pip — `concept_action` with ASL Anchors):**
   * *Words:* `body`, `head`, `face`.
   * *Style:* Stick figure (`pip-v1`) with Fitzgerald yellow torso. Grounded in American Sign Language (ASL) anchors to ensure dignity, prevent childish caricatures, and maintain character continuity.
3. **Bucket C (Relational Body Parts — `anatomy_relational`):**
   * *Words:* `hair`, `neck`, `shoulder`, `tummy`, `back`, `elbow`, `knee`, `toes`.
   * *Style:* Simplified neutral context silhouette + bold clean black directional arrow pointing directly to the target. Prevents the "floating wig" or "isolated tube" ambiguity. Maximum contrast: hair uses bold black fill against the light face outline.

---

## 4. Key Prompting Invariants & Hard-Won Lessons

### A. The "Uncut" Invariant for Produce & Food
* **The Failure:** Prompting `"a whole watermelon with a cut slice in front"` causes diffusion models to interpret "cut" as both a noun and an incision verb—carving a bizarre jagged hole into the center of the main fruit.
* **The Rule:** Never use the word "cut" as an adjective/verb. Always state that the background item is intact:
  `A vibrant green striped whole uncut watermelon. Resting in front of it is a single triangular slice with rich red fruit, black seeds, and green rind.`

### B. The Close-Up Bust & Passive Arm Invariant (`pip-bust-v1`)
* **The Failure:** 
  1. Specifying only the active signing hand results in the **Amputee Bug** (the model draws one arm and omits the other completely, as seen on `see`).
  2. Saying "hands only" or over-describing the lower body causes the **Zoom Drift Bug**—the model zooms out, crops at the waist, leaves a weird dangling hand at the bottom, and decouples hand gestures from the face (turning an eye gesture into a floating peace sign).
* **The Rule:**
  * **Crop:** Prominent circular head filling ~50% of the tile height, neck, and upper chest/shoulders only (mid-chest cutoff).
  * **Both Arms Present:** Active arm performs the sign; passive arm curves from the shoulder and runs naturally straight down along the torso, exiting the frame cleanly at the mid-chest cut. Never leave an amputee; never draw an isolated dangling hand.
  * **Strict Facial Anchors:** In eye/ear/mouth gestures, anchor directly to facial bone: *"Fingertips placed directly on the cheekbone right beneath the eye in the ASL see sign."*

### C. Anti-Overprompting on Simple Physical Archetypes (Trust Muse First)
* **Default to One Clean Sentence:** For familiar physical objects (`carrot`, `apple`, `chair`, `couch`, `bed`, `lamp`), the default `hint` is **exactly one simple, natural English sentence** naming the archetype:
  `"A clean standalone wooden dining chair with a slatted backrest."`
* **Never Micromanage Camera Angles by Default:** Do NOT write `"in 3/4 perspective"`, `"front-facing straight-on view"`, or `"perfectly upright, symmetrical, centered, facing forward"` into default hints. Muse already knows the canonical viewing angle for physical objects. Micromanaging camera angles distorts geometry, skews screens, and breaks catalog consistency.
* **Never Add Negative Laundry Lists by Default:** Do NOT append `"no animals, no dogs, no pencils, no hands, no human face, no text"` to default prompts.
* **Hints are for Interventions, Not Defaults:** Elaborate hints, spatial adjustments, and negative constraints are strictly a **surgical re-roll tool**. Use them *if and only if* Muse fails on an initial roll (e.g., if a style-reference dog bleeds in or duplicate objects appear). Trust the model first.

### D. Banned Words & Perspective Rationale
* **Never use "flat", "no shading", or "solid colour".** In diffusion models, "flat" collapses 3D volume into lifeless cookie-cutter stickers, while "no shading" strips form curvature.
* **Natural Volume vs Angle Policing:** Form is naturally communicated through subtle volume (a cut edge, a slab thickness, the rim of a bowl). This describes how the model renders depth—it is **never** an invitation to inject `"in 3/4 perspective"` into prompt text.

### E. Lightweight Chat Galleries (The 20MB Rule)
* Multi-megabyte raw base64 PNGs embedded into `.html` galleries hit the chat's **20 MB hard ceiling**, causing rendering crashes.
* Always compress gallery preview thumbnails (to 256×256 WebP or compressed PNG, ~20 KB each) so the entire gallery file stays **under 100 KB** and renders inline instantly.

### F. The Relational Pointer Invariant (Less Is More)
* **The Failure:** Overprompting arrow geometry or micromanaging coordinates (*"arrow pointing straight down along the entire length of the leg from hip to ankle"*) forces the diffusion model to draw the arrow directly on top of the limb, fusing them together and amputating the leg.
* **The Rule:** **Less is more.** Trust the frozen style bundle for line weight and anatomy. Use simple, natural English:
  `A stick figure wearing a yellow shirt standing. A black arrow points at the right leg.`
  Never add coordinate micro-instructions or fluff adjectives ("clean", "minimalist"). Let the arrow naturally live in the negative space outside the limb.


---

## 5. The Strict 5-Invariant Image Judge

Judging evaluates **only** functional and clinical invariants, never subjective charm:

1. **Topological Limb Count & Bilateral Origin:** Exactly 2 arms on solo busts/figures, exactly 1 arm per shoulder. Zero amputees, zero extra collar strokes.
2. **Mechanical & Physical Plausibility:** Interlocking items actually mate; hands grip tools rather than float detached.
3. **Visual Noise & Artifacts:** Exactly 0 text characters or letters (except authentic brand names on CPG). Zero speed lines, motion streaks, or debris.
4. **Semantic Singularity:** Does not depict an opposing or ambiguous action (`come` ≠ goodbye; `get` ≠ dribble; `need` ≠ pray).
5. **Board Collision:** The visual metaphor is not already owned by another tile on the board (e.g., flexed bicep belongs to `strong`, not `can`).

---

## 6. Operating Rules & Cadence

1. **Zero Ceremonies During Art Sessions:** Never run test suites, test guards, or background lint gates during active art generation turns. Respect the 15–20 second feedback loop.
2. **Cadence: Strictly ONE Image at a Time:** Generate exactly 1 roll per word, inspect against the 5 invariants, report verdict (Pass/Fail + Why), and wait for founder feedback before proceeding.
3. **No Silent WIP:** Every approved image is copied into `assets/symbols/<word>.png` immediately at slice closeout.
4. **Shipping is the catalog build:** `npm run catalog:build` turns every canonical file in `assets/symbols/` into an approved `image` row + `sense.default_image_id` and copies the bytes to `public/symbols/` — `_rollN` alternates never ship. Approving a symbol requires no extra wiring.
