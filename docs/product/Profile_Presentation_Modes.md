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

**DECIDED 2026-09-22** (founder, keyboard review; locale amendments approved
the same day; not built). Execution: `docs/phases/004_Keyboard.md`.

Whether someone can use a regular keyboard is a fact about that person, not
a choice to make on every tap. So the keyboard is a per-profile display
setting, like Label-Only mode. **The adult sets it once in the Parent
corner. The board never shows a toggle.** A toggle on the board is easy to
hit by accident, and a child who changes keyboards by mistake loses their
motor plan and cannot switch back.

| Setting | Values | Default | Stored on |
| --- | --- | --- | --- |
| Keyboard | **Pip keys** / **Device keyboard** | Pip keys | `learner_profile.keyboard_mode` |
| Letter order (Pip keys only) | **standard** / **ABC** | standard | `learner_profile.keyboard_order` |

**Standard** means the national layout for the profile locale: QWERTY
(English, Spanish), QWERTZ (German), AZERTY (French). The stored value stays
correct when the locale changes. The Parent corner shows the layout's real
name.

### 4.1 What stays the same in every mode and language

- **The ⌨ anchor stays in the same place in the strip.** It opens whichever
  keyboard is set. While the keyboard is open it reads "Board" and closes
  it. There is no separate Done key.
- The sentence bar and strip never move. The keyboard renders in the grid
  area, in place, never as a modal (`docs/product/Motor_Grid_And_Art.md`
  § Strip).
- **A hardware keyboard always works**, whatever the setting. Pressing a
  letter or digit on the board opens keyboard mode and types that key.
- Typing never auto-replaces what the person typed. Corrections are offered
  in the strip, and the person chooses.
- No shift key and no caps mode. The sentence bar applies the locale's
  capitalization rules (sentence start everywhere; `I` in English; German
  nouns keep the capitals stored on their labels). Speech is unaffected.
- Everything language-specific is keyed by the profile locale:
  key maps, capitalization, spelling rules, partner-key labels, and the
  Device keyboard's language. There is never an English fallback
  (`docs/product/Language_And_Voice_Schema.md` § 1, "a miss is a miss").

### 4.2 Pip keys (default)

Every key is one cell, except space (at least 4 wide) and ⌫ (2 wide).
Numbers, letters, and punctuation are on one page, with no folders. Keycaps
are lowercase, in a literacy font with the single-story *a* and *g* that
covers every letter below. The glyph fills at least half the key height.

**One skeleton for every language:**

```
row 1   1   2   3   4   5   6   7   8   9   0            same everywhere
row 2   ┐
row 3   │  the locale's letters (30 cells); spare cells take punctuation
row 4   ┘
row 5   [locale punctuation][──── space ────][ ⌫ ]        ⌫ never moves
row 6   [ yes ][ no ][wait, I'm spelling][guess my word][ oops ]
```

English standard order, for example:

```
 1   2   3   4   5   6   7   8   9   0
 q   w   e   r   t   y   u   i   o   p
 a   s   d   f   g   h   j   k   l   '
 z   x   c   v   b   n   m   ,   .   ?
 !   -  [──────── space ────────] [ ⌫ ]
[ yes ][ no  ][wait, I'm][guess my][ oops ]
               spelling    word
```

| Locale | Standard letters | Extra keys | Row 5 punctuation |
| --- | --- | --- | --- |
| en | QWERTY | — | `! -` |
| de | QWERTZ | `ä ö ü ß` (umlauts at the right end of the bottom row) | `, . ? !` |
| es | QWERTY | `ñ` after `l`; `´` accent key (tap `´`, then the vowel) | `¿ ? ¡ !` |
| fr | AZERTY | `é è à ç` | `' , . ?` |

The full cell-by-cell maps live in `docs/phases/004_Keyboard.md` § Geometry
until built; after that the key-map data file is the owner. ABC order
changes only rows 2–4 and follows each language's alphabet (Spanish puts `ñ`
after `n`; German and French add their extra letters after `z`).

**Why standard order is the default:** it is the same shape as every phone
and laptop keyboard the person will use in their country. ABC helps a child
who knows the alphabet song find letters today, but it does not carry over
to any other device. Changing letter order moves every letter, so the Parent
corner warns: pick one and keep it.

**Partner row.** Typing is slow, and partners interrupt and guess. These
keys speak right away and **do not change the sentence or the word in
progress**. They are catalog senses referenced by id
(`docs/product/Initial_Vocabulary_600.md` § 3.14), so every locale shows
its own label for the same key. A locale cannot ship without labels and
clips for all five.

### 4.3 Device keyboard

For literate users who can use the system keyboard, with its autocorrect,
swipe typing, third-party keyboards, external keyboards, and their own
country's layout. The text field carries the profile locale as its `lang`,
so autocorrect and spellcheck use the right language. The system keyboard
covers the bottom of the screen, so Pip shows the partner row and a large
text field at the top of the grid area. The bar, strip completions,
sentence model, and voice are the same as with Pip keys. A locale with no
Pip key map uses Device keyboard automatically.

### 4.4 Forgiving completions (both modes)

While a word is in progress, the strip shows up to four completions, in
this order: exact match, then prefix match, then typo match, then
sound-alike match. Matching **ignores accents** (`ecole` finds *école*,
`strasse` finds *Straße*), so a child never needs an accent key to reach a
catalog word; a match that includes the typed accents ranks first. Invented
spelling still finds the word (`elfnt` → *elephant*, `hws` → *house*).
Correct spellers never lose a prefix match to a guess. Exact, prefix, and
typo matching work in every language. Sound-alike rules are per locale and
versioned ("pip sound key en v1"); a locale without them skips that tier.
The gate for each locale is its own hand-authored invented-spelling
fixture, not the matcher's own output.
