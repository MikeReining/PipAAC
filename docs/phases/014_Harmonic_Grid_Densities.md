# Phase 014 — Harmonic Grid Densities

**Status:** Preliminary (PROPOSED). Not yet implementation-ready; architectural and clinical framing.

**PROPOSED 2026-09-22** (founder direction on physical motor access, dynamic grid densities, and the Proloquo locked-grid competitive wedge).

Product truth this phase explores:

| Topic | Owner |
| --- | --- |
| Spatial Vector Anchoring across densities | `docs/strategy/Vision.md` § 2.4 |
| Coordinate maps (`grid60`, `grid90`, and new lower densities) | `docs/product/Core_Coordinate_Map.md` |
| Sector order, stability rules, and tile geometry | `docs/product/Motor_Grid_And_Art.md` § 1 |
| Physical motor access vs. cognitive scaffolding | `docs/product/Vocabulary_Masking_And_Safety.md`, `docs/phases/013_Spotlight_Practice_Mode.md` |
| Predictive strip geometry per density | `docs/product/Motor_Grid_And_Art.md` § 2 |

---

## 1. Problem: The False Choice Between Motor Chaos and Physical Exclusion

The AAC industry has been polarized by two deeply flawed extremes regarding board density and button customization:

### Extreme 1: The "Arbitrary Reflow" Chaos (Proloquo2Go, 2009–2021)
Legacy apps allowed users to set almost any grid size (from 1×1 to 10×14). When a child began on a small 3×3 grid (9 buttons) and subsequently graduated to a 4×4 or 5×5 grid, the software **arbitrarily reflowed buttons across the screen**. 
* The word `more` that was learned in the bottom-right corner jumped to the center-top.
* Every vocabulary expansion wiped out the child's hard-won neuromuscular motor memory.
* This motor instability was a primary driver of the **30%–50% AAC abandonment rate**.

### Extreme 2: The "Locked Grid" Dictatorship (New Proloquo, 2022–Present)
In response to the abandonment crisis, AssistiveWare swung to authoritarian paternalism. In the new Proloquo (2022), they locked the board to a single, immutable **10×6 grid (60 buttons)** and prohibited customization:
* **The Clinical Exclusion:** Children with Cerebral Palsy, Rett Syndrome, ataxia, or severe tremors physically cannot isolate a ~1-inch button on an iPad screen. Telling their families *"It's 60 buttons or nothing"* physically disenfranchised and excluded them from using the app.
* **The Visual Exclusion:** Learners with Cortical Visual Impairment (CVI) or profound sensory overload were confronted with an overwhelming wall of 60 icons simultaneously.
* **Parental & Clinician Outrage:** AssistiveWare alienated thousands of caregivers and therapists by dictating what their children could access, refusing to allow essential accommodations.

---

## 2. The Opportunity: Pip AAC's Competitive Wedge

Pip AAC rejects both the **motor-destructive chaos** of Proloquo2Go and the **patronizing exclusion** of the new Proloquo.

Because Pip AAC was architected from day one as a **Relational Language Graph with Multi-Surface Projections** (`docs/strategy/Vision.md` § 1), we are uniquely equipped to deliver **dynamic grid densities without sacrificing motor automaticity**.

### The First-Principles Truths
1. **Physical Access Trumps Everything:** If a child's spasticity or fine motor tremor prevents them from hitting a 100pt button, theoretical motor planning on a 60-grid is meaningless. A communicator must have hitboxes large enough for their physical hands.
2. **The Problem Was Reflow, Not Density:** A 15-button board is not harmful. What was harmful in legacy apps was that moving from 15 to 60 buttons scrambled the spatial relationships.
3. **Relative Spatial Vectors Are Invariant:** Just as a typist navigates QWERTY on an iPhone screen, an iPad screen, and a desktop keyboard using identical relative spatial vectors (`T` is always above `G` and left of `Y`), an AAC communicator's brain memorizes **relative directional trajectories**, not absolute millimeter coordinates.

---

## 3. The Implementation: The Harmonic Density Ladder

Pip AAC introduces a family of **Harmonic Densities** where each level is a strict mathematical subsampling of our master coordinate field:

```text
+--------------------------------------------------------------------------------------------------+
| DENSITY LADDER                                                                                   |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
| [ grid15 ] (5 cols × 3 rows)   -> ~180pt hitboxes. Severe CP, tremors, switch scanning, toddlers|
|      |                                                                                           |
|      v                                                                                           |
| [ grid30 ] (6 cols × 5 rows)   -> ~130pt hitboxes. Intermediate motor progression                |
|      |                                                                                           |
|      v                                                                                           |
| [ grid60 ] (10 cols × 6 rows)  -> ~100pt hitboxes. Standard generative core launch default       |
|      |                                                                                           |
|      v                                                                                           |
| [ grid90 ] (10 cols × 9 rows)  -> ~75pt hitboxes. Dense power-communicator layout (all 83 core)   |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

### 3.1 Strict Harmonic Sector Topology
Across all four densities, the **grammatical sector order is mathematically invariant**:

| Sector | Directional Vector | Color Role | Anchors Present in All Densities |
| --- | --- | --- | --- |
| **Subject / Pronouns** | Top-Left Quadrant | Yellow | `I`, `you` |
| **Core Verbs** | Center-Left Band | Green | `want`, `go`, `like`, `stop`, `help` |
| **Prepositions & Spatial** | Center-Right Band | Blue | `in`, `on`, `up` |
| **Regulators & Negation** | Center / Top Edge | Orange / Red | `not`, `more` |
| **Descriptors & Social** | Right Quadrant | White / Purple | `good`, `bad`, `please` |
| **Groups Navigation** | Slot at Perimeter | Utility Neutral | `🗂️ Groups` anchor |

**The Motor Guarantee:** When a child learns the motor path from `I` (top-left) down-right to `want` (center-left) on `grid15`, that **exact same directional vector trajectory** applies on `grid30`, `grid60`, and `grid90`. Stepping up a density adds finer-grained intermediate words; it **never crosses sector borders or flips directional axes**.

### 3.2 The Access vs. Cognitive Scaffolding Law
Pip AAC provides clinicians and parents with clear, principled tools tailored to specific needs:

1. **For Physical / Motor Impairments (CP, ataxia, switch access, fine motor delays):**
   * Change the **Physical Density** (`grid15` or `grid30`).
   * Gives the child massive, accessible physical touch targets (~150pt–180pt) that work with physical keyguards.
2. **For Visual / Cognitive Needs (CVI, ADHD, sensory overload, 2-year-old beginners):**
   * Maintain the standard **`grid60` physical geometry**, but apply:
     * **Spotlight Mode** (`docs/phases/013_Spotlight_Practice_Mode.md`): Softly dim non-target cells to reduce visual search tax during lessons.
     * **Ghost-Cell Progressive Reveal** (`docs/product/Vocabulary_Masking_And_Safety.md`): Render non-introduced cells as blank ghost tiles. As words are revealed, they appear in their permanent 60-grid positions without altering surrounding buttons.

### 3.3 Dynamic Predictive Strip Proportions
The top predictive strip scales harmoniously with the chosen grid density:
* `grid15`: 5 columns $\rightarrow$ 2 prediction slots (2 cols each) + 1 Groups anchor.
* `grid30`: 6 columns $\rightarrow$ 2 prediction slots (2 cols each) + 1 Groups anchor + 1 Keyboard anchor.
* `grid60`: 10 columns $\rightarrow$ 4 prediction slots (2 cols each) + 1 Groups anchor + 1 Keyboard anchor (`8 + 2` geometry, `docs/product/Motor_Grid_And_Art.md` § 2).
* `grid90`: 10 columns $\rightarrow$ 4 prediction slots + 2 utility anchors.

---

## 4. Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| Harmonic densities, grid density (`grid15`, `grid30`, `grid60`, `grid90`) | Dynamic grids, custom sizes, arbitrary grids |
| Subsampled coordinates, vector-invariant layout | Reflow, responsive grid reflow |
| Physical motor access | Low-cognition layout |
| Progressive reveal, Spotlight | Button hiding (when referring to cognitive scaffolding) |

---

## 5. Proposed Slices (Preliminary)

### Slice 1 — Coordinate Maps for `grid15` and `grid30`
- Define the canonical 15 and 30 root-core senses following the sector topology rules.
- Add coordinate mappings in `docs/product/Core_Coordinate_Map.md`.
- Populate `core_cell` rows in `src/board/schema.sql` for `layout = 'grid15'` and `layout = 'grid30'`.

### Slice 2 — Grid Renderer Layout Scaler
- Update `public/board.js` and `public/index.html` CSS grid properties to dynamically render chosen layout densities without hardcoded 10×6 pixel assumptions.
- Ensure hitboxes scale up proportionally to fill the viewport.

### Slice 3 — Profile Density Selection in Parent Corner
- Add a Density Picker in Parent Corner with visual sector previews.
- Enforce PIN/Biometrics gating so communicators cannot accidentally alter their motor density.

### Slice 4 — Keyguard Physical Specifications
- Publish open-source 3D-printable keyguard STL/STEP files for standard iPad models corresponding to `grid15`, `grid30`, `grid60`, and `grid90`.

---

## 6. Open Questions & Clinical Invariants

1. **Keyguard Physical Tolerances:** Physical plastic keyguards are essential for users with tremors and cerebral palsy. The grid border widths and cell spacing in `grid15` and `grid30` must align with standard laser-cut and 3D-printed acrylic keyguard thicknesses.
2. **Switch Access & Auditory Scanning:** Lower-density grids are frequently accessed via single- or two-switch scanning. The scan pattern (row-column or sector-first) must follow the grammatical sector order.
3. **Preserving Autonomy:** A change in density must remain a deliberate caregiver/clinician setting in Parent Corner, protected by biometrics/PIN, so the child's motor world never shifts mid-conversation.
