# Phase 013 — Spotlight Practice Mode

**Status:** Preliminary (PROPOSED). Not yet implementation-ready; pedagogical and clinical framing.

**PROPOSED 2026-09-22** (founder direction on targeted practice sessions, AssistiveWare Focus Mode comparison, and teacher/clinician modeling).

Product truth this phase explores:

| Topic | Owner |
| --- | --- |
| Vocabulary Masking (Ghost-Cell Blanking) | `docs/product/Vocabulary_Masking_And_Safety.md` |
| Motor Grid stability & immutable coordinates | `docs/product/Motor_Grid_And_Art.md` § 1 |
| Visual tokens, halo states, and tile contrast | `docs/product/Design_System.md` |
| Parent & Clinician Corner gating (Biometrics/PIN) | `docs/product/Vocabulary_Masking_And_Safety.md` § 3 |
| Predictive strip candidate ranking | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` |

---

## Why this phase exists

AAC modeling and classroom instruction often focus on specific target vocabulary. For example:
* A classroom reading session focusing on core actions: `turn`, `look`, `more`.
* A speech therapy session targeting functional communication: `stop`, `go`, `help`.
* A social story focusing on emotions: `happy`, `sad`, `frustrated`.

Historically, educators and clinicians have faced a harmful dilemma when trying to focus a learner's attention:

1. **The Trap of Hard Masking for Teaching:** Many apps allow teachers to "mask" non-target buttons, hiding 90% of the grid. While this simplifies the screen, it turns the communication board into an empty wasteland of blank holes. It destroys peripheral visual familiarity, disrupts nascent motor automaticity, and prevents spontaneous communication if the child wants to say something unexpected.
2. **The AssistiveWare "Focus Mode" Insight:** AssistiveWare introduced Focus Mode in Proloquo (2022) using light and motion to guide visual attention to specific buttons without hiding or deleting the rest of the vocabulary. This proved popular with clinicians because it reduced cognitive search fatigue while maintaining motor memory.

### Pip AAC's Distinction: Safety Masking vs. Pedagogical Spotlight
Pip AAC explicitly separates two distinct concepts:

* **Vocabulary Masking (Ghost Cells):** Owned by `docs/product/Vocabulary_Masking_And_Safety.md`. This is durable, parental safety curation. Words that are inappropriate or developmentally harmful are rendered as quiet, blank background tiles. They cannot be tapped or vocalized.
* **Spotlight Practice Mode:** Owned by this phase. This is **transient pedagogical scaffolding**. Target words are visually highlighted with gentle prominence, while non-target words are softly dimmed. Crucially, **every word remains 100% accessible and vocal**.

---

## Core Invariants: The Spotlight Laws

```text
+-----------------------------------------------------------------------------------+
| [Spotlight: "Morning Routine" (3/3)]          [ ⌫ ] [ ⇄ ] [ Speak ] [ Clear ]     |
+-----------------------------------------------------------------------------------+
| Predictive Strip:  [ breakfast ]   [ bus ]   [ hurry ]   [ shoes ]  |🗂️Grp|⌨ KB|  |
+-----------------------------------------------------------------------------------+
|  [   I   ]  [  want  ]  [[ HELP ]]  [  stop  ]  [   go   ]  [  more  ]  [ ... ]   |
|   (dim)      (dim)       (BRIGHT)    (dim)       (dim)       (dim)                |
|                                                                                   |
|  [  eat  ]  [ drink  ]  [  play  ]  [[ ALL ]]   [  like  ]  [  yes   ]  [ ... ]   |
|   (dim)      (dim)       (dim)       (BRIGHT)    (dim)       (dim)                |
|                                                                                   |
|  [ feeling] [  good  ]  [  bad   ]  [[ DONE ]]  [  come  ]  [   no   ]  [ ... ]   |
|   (dim)      (dim)       (dim)       (BRIGHT)    (dim)       (dim)                |
+-----------------------------------------------------------------------------------+
       Target Words: "help", "all", "done" highlighted with glowing Pip halos.
       Surrounding cells softly dimmed (~30% opacity), but STILL FULLY TAPPABLE!
```

### 1. Non-Restrictive Communication Law (Never a Muzzle)
Under no circumstances does Spotlight Mode disable non-target buttons. 
* If a child taps a dimmed cell (e.g. `bathroom` during a `shapes` lesson), **it speaks immediately and appends to the sentence bar**.
* We reject prompt lockouts. Spotlight assists visual focus; it never restricts the user's autonomous voice.

### 2. Zero Layout Shift
Just as in `docs/product/Motor_Grid_And_Art.md`, no button moves, expands, or shrinks during Spotlight Mode. Coordinates `(col, row)` remain invariant so motor planning is preserved.

### 3. Visual Styling & Sensory Friendliness
* **Target Cells:** Render at 100% opacity with full Fitzgerald color role accents (`docs/product/Design_System.md`) and a subtle, pulsing Pip brand focus halo (`border-color: var(--pip-accent-gold)`).
* **Dimmed Cells:** Render at reduced contrast and opacity (e.g. `opacity: 0.32`), softly receding into the background without disappearing entirely.
* **Sensory Caution:** Avoid harsh flashing, rapid strobe animations, or loud audio cues that could trigger sensory sensitivities or seizures in neurodivergent learners.

---

## Session Management & Teacher Workflow

### 1. Session Presets in Parent/Teacher Corner
In the Parent & Teacher Corner (or during an authorized Edit session), an educator or parent can:
* Select 1 to 5 target words directly on the grid or via search.
* Save targets as a named preset (e.g. *"Storytime: Brown Bear"*, *"Snack Time"*, *"Core Target: Stop & Go"*).
* Set an optional session duration (e.g. 15 minutes), after which the board gently returns to normal illumination.

### 2. Discreet Session Banner
While Spotlight Mode is active, a subtle status chip appears in the top chrome:
`[🔦 Morning Circle (3 words) · Exit]`
Tapping `Exit` (or authenticating via Parent Corner) instantly restores standard board brightness.

### 3. Predictive Strip Reinforcement
During an active Spotlight session, the local prediction engine (`docs/strategy/Dual_Engine_Predictive_Intelligence.md`) can assign a modest prior boost to target words and their high-frequency collocations, helping the child practice building complete phrases around the spotlighted core concepts.

---

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| Spotlight, Spotlight mode, Spotlight session | Focus Mode (AssistiveWare trademark), Focus space |
| Target words, focus targets | Locked words, active keys |
| Dimmed cells, dimmed state | Inactive buttons, disabled buttons, masked cells |
| Session preset | Lesson folder, prompt lock |

---

## Proposed Slices (Preliminary)

### Slice 1 — Spotlight Presets & Storage (Local SQLite)
- Add `spotlight_preset` and `spotlight_target` tables in local SQLite.
- Allow creating, editing, naming, and deleting presets in Parent/Teacher Corner.

### Slice 2 — Board Renderer Spotlight State
- Implement CSS variables for `--tile-dimmed-opacity` and `--tile-spotlight-halo`.
- Update cell rendering logic in `public/board.js` to evaluate active spotlight targets.
- Verify that every dimmed cell retains full click/touch event dispatch, speech playback, and sentence appending.

### Slice 3 — Top Bar Spotlight Chrome & Quick Toggle
- Add the subtle spotlight indicator banner in the top chrome.
- Add quick-exit action and optional session timeout timer.

### Slice 4 — Predictive Strip Spotlight Prior
- Integrate active spotlight targets into the candidate shortlist scoring in `Dual_Engine_Predictive_Intelligence.md`.
- Ensure spotlight bias does not completely overpower user sentence intent.

---

## Open Questions & Clinical Invariants

1. **Accessibility Compliance (WCAG & CVI):** For users with Cortical Visual Impairment (CVI), dimming non-targets to 30% opacity is clinically beneficial because it eliminates visual clutter. However, we must ensure that high-contrast accessibility modes can adjust or customize the dimming ratio.
2. **Student Autonomy:** Should the student be able to turn off Spotlight mode, or should it require Parent/Teacher authorization? (Proposed: A teacher can toggle whether the student has access to an "All Done Practice" exit button).
