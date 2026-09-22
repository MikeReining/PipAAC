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

---

## 4. Keyboard Modes

**DECIDED 2026-09-22** (founder, keyboard review; not built). Execution:
`docs/phases/004_Keyboard.md`.

Whether someone can use a regular keyboard is a fact about that person, not
a choice to make on every tap. So the keyboard is a per-profile display
setting, like Label-Only mode. **The adult sets it once in the Parent
corner. The board never shows a toggle.** A toggle on the board is easy to
hit by accident, and a child who changes keyboards by mistake loses their
motor plan and cannot switch back.

| Setting | Values | Default | Stored on |
| --- | --- | --- | --- |
| Keyboard | **Pip keys** / **Device keyboard** | Pip keys | `learner_profile.keyboard_mode` |
| Letter order (Pip keys only) | **QWERTY** / **ABC** | QWERTY | `learner_profile.keyboard_order` |

### 4.1 What stays the same in every mode

- **The ⌨ anchor stays in the same place in the strip.** It opens whichever
  keyboard is set. While the keyboard is open it reads `Board` and closes
  it. There is no separate Done key.
- The sentence bar and strip never move. The keyboard renders in the grid
  area, in place, never as a modal (`docs/product/Motor_Grid_And_Art.md`
  § Strip).
- **A hardware keyboard always works**, whatever the setting. Pressing a
  letter or digit on the board opens keyboard mode and types that key.
- Typing never auto-replaces what the person typed. Corrections are offered
  in the strip, and the person chooses.
- The sentence bar capitalizes automatically (sentence start, `I`). There is
  no shift key and no caps mode, and speech is unaffected.

### 4.2 Pip keys (default)

Every key is one cell, except space (6 wide) and ⌫ (2 wide). Numbers and
punctuation are on the same page as the letters, with no folders. Keycaps
are lowercase, set in a literacy font with the single-story *a* and *g*.
The glyph fills at least half the key height.

```
 1   2   3   4   5   6   7   8   9   0        numbers (both orders)
 q   w   e   r   t   y   u   i   o   p   ┐
 a   s   d   f   g   h   j   k   l   '   │    letters (QWERTY shown)
 z   x   c   v   b   n   m   ,   .   ?   ┘
 !   -  [──────── space ────────] [ ⌫ ]       (both orders)
[ yes ][ no  ][wait, I'm][guess my][ oops ]    partner row (both orders)
               spelling    word
```

ABC order changes only the three letter rows (`a–j`, `k–t`,
`u–z ' , . ?`).

**Why QWERTY is the default:** its rows (`qwertyuiop`, `asdfghjkl`,
`zxcvbnm`) fit the 10-column grid almost exactly, and it is the same shape
as every phone and laptop keyboard the person will use later. ABC order
helps a child who knows the alphabet song find letters today, but it does
not carry over to any other device. Changing letter order moves every
letter, so the Parent corner warns: pick one and keep it.

**Partner row.** Typing is slow, and partners interrupt and guess. These
keys speak right away and **do not change the sentence or the word in
progress**. They are catalog senses (`docs/product/Initial_Vocabulary_600.md`
§ 3.14), not UI strings.

### 4.3 Device keyboard

For literate users who can use the system keyboard, with its autocorrect,
swipe typing, third-party keyboards, and external keyboards. The system
keyboard covers the bottom of the screen, so Pip shows the partner row and
a large text field at the top of the grid area. The bar, strip completions,
sentence model, and voice are the same as with Pip keys.

### 4.4 Forgiving completions (both modes)

While a word is in progress, the strip shows up to four completions, in
this order: exact match, then prefix match, then typo match, then
sound-alike match. Invented spelling still finds the word (`elfnt` →
*elephant*, `hws` → *house*). Correct spellers never lose a prefix match to
a guess. Matching is deterministic, on-device, and versioned
("pip sound key v1"). The gate is a hand-authored invented-spelling
fixture, not the matcher's own output.
