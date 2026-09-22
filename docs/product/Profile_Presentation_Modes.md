# Profile Presentation Modes: Symbol+Text vs. Label-Only

**DECIDED 2026-09-22** (not built).
Intake: `docs/founder/2026-09-22_Customization_Pricing_VoiceCloning.md`.
Truth owner: `docs/product/Motor_Grid_And_Art.md`, `docs/product/Core_Coordinate_Map.md`.

---

## 1. The Clinical Need: Beyond Infant Clipart

In App Store reviews, adult communicators and individuals with acquired speech disorders (ALS, aphasia, traumatic brain injury, autism shutdowns) expressed severe frustration with existing AAC software:
> *"There should be a Label-only option... not everyone wants to see symbols shoved in their face."*
> *"Like 1,000 flash cards thrown on the floor. The interface is a mess of stick figures."*

Traditional AAC products assume every non-verbal person is a toddler who cannot read, forcing cartoon symbols onto every tile.

Pip AAC establishes that **presentation is a display filter over a stable coordinate map**. The exact same motor vectors and language graph can be rendered in distinct, dignity-preserving visual modes.

---

## 2. Supported Modes

```text
+-----------------------------------+   +-----------------------------------+
|  MODE A: SYMBOL + LABEL (Default) |   |  MODE B: LABEL-ONLY (Adult/Text)  |
|  [  (🏃)  ]  [  (🍪)  ]  [  (🛑)  ] |   |  [        ]  [        ]  [        ] |
|  [  run   ]  [ cookie ]  [  stop  ] |   |  [  RUN   ]  [ COOKIE ]  [  STOP  ] |
|  Icon + text label for emergent   |   |  Clean typography + color badge.  |
|  and pre-literate learners.       |   |  Zero clipart clutter for adults. |
+-----------------------------------+   +-----------------------------------+
```

### 2.1 Mode A: Symbol + Label (Default)
- Designed for emerging communicators, preschoolers, and non-literate individuals.
- Displays the in-house stick-figure or illustrated object icon ([`docs/product/Motor_Grid_And_Art.md:123-164`](file:///Users/mike/dev/PipAAC/docs/product/Motor_Grid_And_Art.md#L123-L164)) above the text label.
- Torso / icon accents match the Modified Fitzgerald Key color role.

### 2.2 Mode B: Label-Only (Text Mode)
- **Target Audience:** Literate autistic adults, teens, individuals with ALS, stroke/aphasia patients, and communicators transitioning to full orthographic reading.
- **Visual Design:**
  - Hides all symbol graphics entirely.
  - Centered, high-legibility bold typography (e.g., system sans-serif or OpenDyslexic).
  - Preserves the **Modified Fitzgerald Key color coding** as an elegant border accent or background tint (e.g., subtle green outline for verbs, yellow for nouns/pronouns).
  - Drastically reduces visual scanning fatigue and treats the user with age-appropriate dignity.

### 2.3 Mode C: High-Contrast & Vision-Assisted
- Designed for cortical visual impairment (CVI) or low-vision motor conditions.
- Deep solid black canvas, bold yellow/cyan high-contrast text borders, and amplified font sizes.

---

## 3. The Invariant: Coordinate Map Remains Identical

**DECIDED 2026-09-22** (not built).
* Switching from **Symbol + Label** to **Label-Only** changes the cell's internal CSS/SVG render tree.
* **It does NOT alter cell coordinates, grid density, or button positions.**
* A user who developed motor automaticity on the symbol board can switch to label-only mode without having to re-learn where words live on the screen.
