# Phase 004 — Keyboard 2.0

**Status:** Ready to execute. Not started.

**DECIDED 2026-09-22** (founder: "I fully agree", after the keyboard review in
the same session). This doc packs the whole phase for one developer to execute
end to end. Every slice is self-contained. Do them in order.

**Start after** Groups 2.0 slice 2 (`docs/phases/003_Groups_2.md`) is
committed. Both phases edit `public/board.js`, `public/index.html`, and
`src/board/schema.sql`. Rebase this phase's line references on that commit.

Product truth this phase implements:

| Topic | Owner |
| --- | --- |
| Keyboard modes, letter order, key map, who chooses | `docs/product/Profile_Presentation_Modes.md` § 4 |
| Strip geometry, the ⌨ anchor, zero layout shift | `docs/product/Motor_Grid_And_Art.md` § Strip |
| Vocabulary rows (partner phrases added in slice 4) | `docs/product/Initial_Vocabulary_600.md` § 3.14 |
| Speech lanes: bundled clip vs device TTS | `docs/product/Language_And_Voice_Schema.md` § 7 |
| Strip ranking outside keyboard mode (not changed here) | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.2 |

---

## Why this phase exists

Measured at `fb5a8d7` (`public/board.js` `buildKb`, `public/index.html`
`.kb-*` rules):

1. **Two keys take half the grid.** `space` spans 7 columns × 3 rows and
   `Done ✓` spans 3 × 3: 30 of 60 cells. Letters are squeezed into rows 1–3.
2. **Letters are small.** `.kb-key` uses `font-size: clamp(18px, 3.4vmin,
   34px)`. The size stops at 34px however big the key is. On an iPad the
   glyph is roughly a quarter of the key height (estimate from the CSS, not
   measured).
3. **No numbers.** Punctuation is only `.` `'` `?`, and it gets glued to the
   word: typing `hi.` then space commits the string `hi.`, which is not a
   catalog word, so it goes to device TTS.
4. **Done does the same job as the ⌨ anchor.** You open the keyboard from
   the anchor, so you should close it from the same spot.
5. **Completions only match from the first letter** (`kbCompletions`,
   `normalized_text LIKE prefix%`). New spellers write `elfnt` for
   *elephant* and get nothing.
6. **A hardware keyboard does nothing on the board.** The `keydown` handler
   returns early unless the keyboard view is already open
   (`if (!kbOpen) return;`).
7. **Typing an entity's name does not find the entity.** `commitKb` only
   looks up senses. Typing `cooper` + space speaks the string through TTS,
   without Cooper's photo, id, or log entry.

What incumbents do (reference only, never copy): Proloquo2Go's grid keyboard
uses 3 rows, leaves half the screen empty, and puts numbers, punctuation, and
upper case each one folder away. Its Typing View (system keyboard) is set in
Settings › Interaction › Keyboard Button, and there is also a second way in
through a Tools popup
(assistiveware.com/support/proloquo2go/basics/type, read 2026-09-22).

## The model in one paragraph

The keyboard is a **board mode**, not a modal: it renders into `#kb` in
the same 10×6 area, and the sentence bar and strip never move. The adult
chooses **Pip keys** (default) or **Device keyboard** once, in the Parent
corner. For Pip keys, the adult also chooses **QWERTY** (default) or **ABC**
letter order. Every key is a single cell except space. There is no Done key:
the ⌨ anchor toggles the keyboard on and off, and a hardware keyboard works
in any mode. Row 6 is the **partner row**, for talking to the partner about
the typing. Those keys speak right away and do not change the sentence.
While a word is in progress, the strip shows **forgiving completions**:
exact and prefix matches first, then typo and sound-alike matches, so
invented spelling still finds the word.

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| Pip keys, Device keyboard | grid keyboard, typing view, system keyboard mode |
| letter order (QWERTY / ABC) | layout (ambiguous with grid60) |
| partner row, partner key | quick phrases, fringe row |
| buffer (the word in progress, `kbText`) | draft, input |
| forgiving completions | autocorrect (we never auto-replace) |

---

## Geometry — Pip keys, fixed across all slices

60 slots, slot = `row * 10 + col`, zero-based. Rows 0, 4, and 5 are the
same in both letter orders. Only rows 1–3 change.

**QWERTY (default)**

```
row 0   1   2   3   4   5   6   7   8   9   0
row 1   q   w   e   r   t   y   u   i   o   p
row 2   a   s   d   f   g   h   j   k   l   '
row 3   z   x   c   v   b   n   m   ,   .   ?
row 4   !   -  [──────── space 42–47 ────────] [ ⌫ 48–49 ]
row 5  [ yes ][ no  ][wait, I'm][guess my][ oops ]
                      spelling    word
```

**ABC**

```
row 1   a   b   c   d   e   f   g   h   i   j
row 2   k   l   m   n   o   p   q   r   s   t
row 3   u   v   w   x   y   z   '   ,   .   ?
```

| Slots | Key | Kind | Span |
| --- | --- | --- | --- |
| 0–9 | `1`…`9`, `0` | char | 1 |
| 10–39 | letters and `' , . ?` per letter order | char | 1 |
| 40 | `!` | char | 1 |
| 41 | `-` | char | 1 |
| 42–47 | space | space | 6 |
| 48–49 | ⌫ | backspace | 2 |
| 50–51 | yes | partner | 2 |
| 52–53 | no | partner | 2 |
| 54–55 | wait, I'm spelling | partner | 2 |
| 56–57 | guess my word | partner | 2 |
| 58–59 | oops | partner | 2 |

Keycaps are lowercase. There is no shift key and no caps mode: the sentence
bar capitalizes automatically (slice 2).

Until slice 4 lands, slots 50–59 render as blank disabled cells
(`.gcell.empty:disabled` style). Nothing else moves in when they are blank.

---

## Slice 1 — Key map, big letters, no Done

Goal: The new key map renders, letters fill their keys, and the ⌨ anchor
opens and closes the keyboard.

Files: `public/shared/keyboard.mjs` (new), `public/board.js`,
`public/index.html`, `public/fonts/` (new), `keyboard.test.mjs`
(new).

1. **`public/shared/keyboard.mjs`** — a pure module with no DOM and no db.
   - `export const KEY_ORDERS = { qwerty: [...], abc: [...] }`: the 30
     characters for rows 1–3, in slot order.
   - `export function keyMap(order = "qwerty")` returns an array of
     `{ slot, span, kind: "char"|"space"|"backspace"|"partner", value }`,
     one entry per key (not per cell). For partner keys, `value` is the
     catalog lemma text (`"yes"`, `"no"`, `"wait, I'm spelling"`,
     `"guess my word"`, `"oops"`).
2. **Render** (`buildKb` in `board.js`): build from `keyMap(order)`. For now
   `order` is the constant `"qwerty"`; slice 5 wires it to the profile. Place
   each key with `grid-column: (slot%10)+1 / span N; grid-row:
   floor(slot/10)+1`. Delete the `kb-space` 7×3 and `kb-done` 3×3 rules.
   Delete the Done key.
3. **Anchor toggle.** While the keyboard is open, `#anchor-kb` shows glyph
   `▦` and label `Board`. Tapping it calls `closeKb()`. When closed, it goes
   back to `⌨ Keyboard`. Same element and same position; only its text
   changes. Escape still closes the keyboard.
4. **Letter size.** Each key's text goes in a child
   `<span class="kc">`. `.kb-key { container-type: size; }` and
   `.kc { font-size: min(70cqh, 80cqw); line-height: 1; }` (tune the numbers
   against the Works Test, not by eye). Utility keys (space, ⌫) use a smaller
   label: `min(34cqh, 22cqw)`. Partner keys use the `.cell` label size.
5. **Font.** Self-host Andika Bold (SIL Open Font License) as
   `public/fonts/andika-bold.woff2` with its `OFL.txt`. Add an
   `@font-face` with `font-display: block`, and a `<link rel="preload">`.
   Apply it to `.kb-key` only. Andika uses the single-story *a* and *g* that
   children learn to read. The app is offline-first, so never load the font
   from a CDN.
6. **Styles.** Char keys: white fill, `#8a8578` border. Space and ⌫: the
   existing `.kb-util` colors. Keep `:active` feedback. Space shows a `␣`
   glyph with a small `space` label under it.

Works Test (`keyboard.test.mjs`, node):
- For both orders: every slot 0–59 is covered by exactly one key (spans
  counted), `a`–`z` appear exactly once each, `0`–`9` exactly once each,
  and rows 0, 4, and 5 are identical in both orders.
- QWERTY row 1 is `qwertyuiop` in slots 10–19.

Works Test (manual, recorded): on `npm run dev:agent`, at 1180×820
(iPad Air landscape) and 820×1180 (portrait):
- From the console, for keys `k`, `g`, and `5`: measure the glyph ink with
  `canvas.measureText` using the key span's computed font
  (`actualBoundingBoxAscent + actualBoundingBoxDescent`), and compare it
  with `key.getBoundingClientRect().height`. **Pass: ink height ≥ 50% of
  key height for `k`, and the `g` descender stays inside the key rect.**
- The `#strip` and `#bar` rects are identical with the keyboard open and
  closed.
- Tapping ⌨ opens the keyboard and the anchor reads `Board`; tapping it
  again closes the keyboard.

Done when: both tests pass, `npm run check:fast` is green, and the
measured ratios are in the closeout.

---

## Slice 2 — Typing that behaves

Goal: Punctuation, digits, backspace, names, capitals, and hardware keys
all behave the way a person expects.

Files: `public/shared/keyboard.mjs`, `public/board.js`,
`keyboard.test.mjs`.

Rules (put the pure parts in `keyboard.mjs` so node can test them):

1. **Word characters** are letters, digits, `'`, and `-`. They append to
   the buffer.
2. **Sentence punctuation** (`,` `.` `?` `!`) first commits the buffer if
   it is non-empty, then attaches the mark to the last sentence item as
   `item.punct` (display only; one mark per item, and the new mark replaces
   the old one). With an empty sentence it does nothing. Punctuation never
   becomes part of a word and is never spoken as a word.
3. **Commit resolution order** (`commitKb`), on the normalized buffer:
   1. an exact catalog lemma → `tap(label, "sense", id)` (unchanged);
   2. an exact personal-entity `spoken_name` (normalized) →
      `tap(spoken_name, "entity", id)` (**new**);
   3. a whole number 1–10 → `tap("3", "sense", <id of "three">)`: the bar
      shows the digits, and speech uses the bundled clip for the number
      word (**new**);
   4. otherwise `tap(buffer, "typed", null)`, which speaks through device
      TTS (unchanged).
   Commit **never** replaces what was typed with a guess. Corrections are
   offered in the strip (slice 3); they are never applied automatically.
4. **⌫ with an empty buffer** reopens the last item, the way a real
   keyboard steps back over the space. If the item has `punct`, remove the
   mark first. Otherwise, pop the item and put its display text into the
   buffer, without deleting a character yet. The next ⌫ deletes a
   character. The top-bar ⌫ (`#clear`) keeps its current behavior of
   removing the whole last item.
5. **Auto-capitals, display only** — `displaySentence(items)` in
   `keyboard.mjs`: capitalize the first letter of the first item and of any
   item after one whose `punct` is `.`, `?`, or `!`. A standalone `i` and
   `i'm`, `i'll`, `i've`, `i'd` become `I…`. Entity names are shown as
   stored. `renderBar` uses it. Spoken text and stored `item.text` are
   unchanged.
6. **Hardware keys** (`keydown`):
   - Ignore the event when the target is an `input` or `textarea`, when any
     `.overlay.open` exists, or when `metaKey`, `ctrlKey`, or `altKey` is
     held.
   - Accept `/^[a-z0-9',.?!-]$/i`.
   - **If the keyboard is closed and the key is a letter or digit, open the
     keyboard and type that key.** No setting is needed: a physical keyboard
     just works.
   - Space commits. Backspace follows rule 4.
   - **Enter commits the buffer and speaks the whole sentence**
     (`speakSentence`), and the keyboard stays open. This replaces the old
     "Enter commits and closes" behavior.

Works Test (`keyboard.test.mjs`, node): table-driven cases for
`displaySentence` (`["i","want","juice"]` → `I want juice`; a `.` item
followed by `hi` → `Hi`; `i'm` → `I'm`) and for a pure
`applyKey(state, key)` reducer covering rules 1, 2, and 4. The reducer holds
`{ buffer, items }` without speech; `board.js` calls it and then does the
side effects.

Works Test (manual, recorded, `dev:agent`):
- Type `i want juice.` on screen. The bar reads `I want juice.`, and the
  clip for *juice* plays on space.
- Type `3` then space: the bar shows `3`, and the bundled *three* clip
  plays, not the TTS voice.
- Add Cooper through the existing flow, then type `cooper` + space: the
  item appears as the entity and the strip shows his photo on the next
  state.
- With the keyboard closed and a USB/Bluetooth keyboard attached (or the
  desktop browser), press `h`: the keyboard opens with `h` in the buffer.
  Press Enter: the sentence is spoken.

Done when: the node tests and the manual checks pass.

---

## Slice 3 — Forgiving completions

Goal: Invented spelling still finds the word. `elfnt` offers *elephant*,
`hws` offers *house*, `wtr` offers *water*.

Files: `public/shared/spelling.mjs` (new), `public/board.js`
(`kbCompletions`), `src/board/fixtures/invented_spellings.json` (new),
`spelling.test.mjs` (new, in the src/board folder).

**Write the fixture first, in its own commit, before any matcher code.**
The fixture is the instrument, and the matcher must not shape it.

### Fixture — `src/board/fixtures/invented_spellings.json`

```json
{
  "version": 1,
  "source": "Hand-authored from emergent-spelling stage patterns (letter-name, consonant skeleton, vowel substitution, phonetic substitution, flap t→d, doubled/dropped letters). Every intended word is a catalog lemma.",
  "pairs": [
    { "typed": "elfnt", "intended": "elephant" },
    { "typed": "lefnt", "intended": "elephant" },
    { "typed": "hws", "intended": "house" },
    { "typed": "bcuz", "intended": "because" },
    { "typed": "bnana", "intended": "banana" },
    { "typed": "wtr", "intended": "water" },
    { "typed": "wadr", "intended": "water" },
    { "typed": "joos", "intended": "juice" },
    { "typed": "kuke", "intended": "cookie" },
    { "typed": "bafrm", "intended": "bathroom" },
    { "typed": "skul", "intended": "school" },
    { "typed": "frend", "intended": "friend" },
    { "typed": "hape", "intended": "happy" },
    { "typed": "plez", "intended": "please" },
    { "typed": "tekr", "intended": "teacher" },
    { "typed": "dinasor", "intended": "dinosaur" },
    { "typed": "awtsid", "intended": "outside" },
    { "typed": "peza", "intended": "pizza" },
    { "typed": "tird", "intended": "tired" },
    { "typed": "hungre", "intended": "hungry" },
    { "typed": "gramu", "intended": "grandma" },
    { "typed": "trk", "intended": "truck" },
    { "typed": "wont", "intended": "want" },
    { "typed": "bubls", "intended": "bubbles" },
    { "typed": "cumputr", "intended": "computer" },
    { "typed": "favrit", "intended": "favorite" },
    { "typed": "butrfly", "intended": "butterfly" },
    { "typed": "plagrownd", "intended": "playground" },
    { "typed": "munkee", "intended": "monkey" },
    { "typed": "agen", "intended": "again" },
    { "typed": "wut", "intended": "what" },
    { "typed": "skard", "intended": "scared" },
    { "typed": "strawbre", "intended": "strawberry" },
    { "typed": "yogrt", "intended": "yogurt" },
    { "typed": "bruthr", "intended": "brother" },
    { "typed": "sistr", "intended": "sister" },
    { "typed": "tmoro", "intended": "tomorrow" },
    { "typed": "tuday", "intended": "today" },
    { "typed": "wer", "intended": "where" },
    { "typed": "hrt", "intended": "hurt" },
    { "typed": "musik", "intended": "music" },
    { "typed": "samich", "intended": "sandwich" },
    { "typed": "chruk", "intended": "truck" }
  ]
}
```

Grow it to at least 60 pairs before tuning. Add the entity case in the test
itself (Cooper typed as `kupr`), since entities are per-device. **Never
delete or edit a pair to make the gate pass.** The last two pairs are
expected to be hard; they stay in as honest misses.

### Matcher — `public/shared/spelling.mjs` (pure)

- `buildIndex(entries)`: `entries` are
  `{ kind: "sense"|"entity", id, text, freq }`. Precompute
  `norm` (normalizeV1, then remove `'`, `-`, and spaces) and `keys`
  (below). Build it once when the keyboard opens and cache it. Rebuild after
  an entity add. Do not run a SQL `LIKE` on every keystroke.
- `suggest(index, typed, cap = 4)` returns entries ranked by tier:

| Tier | Rule | Minimum typed length |
| --- | --- | --- |
| 0 exact | `norm === t` | 1 |
| 1 prefix | `norm.startsWith(t)`, or any word in a multi-word text starts with `t` | 1 |
| 2 typo | optimal-string-alignment distance between `t` and `norm.slice(0, L)` for `L` in `t.length-1 … t.length+1`, at most `k`, where `k = 1` for lengths 3–5 and `k = 2` for 6+ | 3 |
| 3 sound-alike | `soundKey(t)` is a prefix of one of the entry's `keys`, and `soundKey(t).length ≥ 2` | 3 |

  Within a tier, sort by `freq` descending (learner log counts), then edit
  distance ascending, then `|norm.length - t.length|` ascending, then `text`.
  Dedupe by `kind:id`, keeping the best tier. Cap at 4. A higher tier always
  ranks above a lower one, so correct spellers never lose a prefix hit to a
  guess.

- `soundKey(s)` — "pip sound key v1", a deterministic spelling-to-sound
  folding step. Changing the rules means a new version (same policy as
  normalizeV1):
  1. Lowercase and keep `a–z` only.
  2. Digraphs, in order: `tch→C`, `dge→j`, `ch→C`, `sh→s`, `th→t`,
     `ph→f`, `ck→k`, `qu→kw`, leading `kn→n`, leading `wr→r`,
     leading `wh→w`, `gh→` (drop) except at the start (`g`).
  3. Letters: `c` before `e/i/y` becomes `s`, otherwise `k`; `q→k`,
     `x→ks`, `z→s`.
  4. Keep the first character. For the rest, drop the vowels `aeiouy` and
     drop `h` and `w`.
  5. Collapse runs of the same character.
  6. If the first character is a vowel, write it as `a`.
- Entry `keys` = `[soundKey(norm), soundKey(norm) with a leading "a"
  removed]`. The second key catches letter-name spellings that skip a
  leading vowel (`lefnt` → *elephant*).

The rules are a starting point. Tune them only against the fixture and the
precision gate below.

### Wiring

`kbCompletions()` builds cards from `suggest(index, kbText)`. Its card shape
is unchanged (`{label, role, freq, onTap}` / `{entity, freq, onTap}`). Only
the matching changes.

Works Test (`spelling.test.mjs`, node; catalog loaded the same way
as `src/board/strip.test.mjs`):
- **Recall gate:** the intended word is in the top 4 for **≥ 85%** of
  fixture pairs. Print the misses.
- **Precision gate:** for **every** catalog lemma typed in full,
  `suggest(...)[0]` is that lemma (100%). For every lemma's first 3
  letters, every tier-1 hit ranks above every tier-2/3 hit.
- **Entity:** after adding Cooper, `kupr` returns Cooper in the top 4.
- **Speed:** `suggest` over the full catalog plus 50 entities takes
  < 5 ms median over 1,000 random 3–6 letter inputs (node `performance.now`).

Works Test (manual, recorded): on `dev:agent`, type `elfnt`. The strip
shows *elephant* with its art or swatch. Tap it: *elephant* is spoken and
added to the sentence, and the buffer clears.

Done when: all gates pass and the recall percentage and misses are in the
closeout.

---

## Slice 4 — Partner row

Goal: Row 6 lets the speller talk *about* the typing: yes, no, wait, guess,
oops.

Files: `docs/product/Initial_Vocabulary_600.md` (§ 3.14),
`data/launch_lexicon.json` (regenerated), `data/catalog/catalog.json`
(regenerated), `public/board.js`, `public/index.html`.

1. **Vocabulary source.** Add three rows to § 3.14 Social, and bump the
   section count from 27 to 30:

   | # | Word | Part of Speech | Fitzgerald Color | Visual Style |
   | --- | --- | --- | --- | --- |
   | 680 | wait, I'm spelling | Interjection | Pink | Stick Figure |
   | 681 | guess my word | Interjection | Pink | Stick Figure |
   | 682 | oops | Interjection | Pink | Stick Figure |

   Fill in Clinical Source and Visual Prompt the same way as neighboring
   rows. `yes` and `no` already exist (`sns_0073`, `sns_0072` at
   `fb5a8d7`).
   Then run `npm run catalog:lexicon` and `npm run catalog:build`. Never
   hand-edit the generated JSON.
2. **Audio.** Run the documented gap-fill
   (`node scripts/catalog/generate_missing_audio.mjs`), which needs the
   ElevenLabs key in `.env`. **High-risk stop:** if you do not have the
   credential, stop and ask the founder. Do not create or borrow one.
3. **Render.** Partner keys come from `keyMap()` and resolve by lemma
   (`senseByLemma`). The cell is 2 wide, shows the label (and art when
   available), and uses the sense's `fitzgerald_role` color class.
4. **Behavior: speak, don't compose.** A partner tap plays the clip (or
   falls back to device TTS if the clip is missing — never the 400 ms silent
   slot for these keys), calls `logSelection`, and flashes the key. It does
   **not** change `sentence` or the buffer. The partner hears the message,
   and the sentence being spelled stays intact.

Works Test (manual, recorded): type `ele`, then tap *wait, I'm spelling*.
The phrase is spoken, the bar still reads `ele▌`, and the strip still shows
the completions for `ele`. Tap *yes*: it is spoken and the bar is unchanged.

Done when: `npm run catalog:build:check` is green, the manual check passes,
and all three new clips play in the bundled voice.

---

## Slice 5 — Keyboard settings and ABC order

Goal: The adult chooses Pip keys or Device keyboard, and QWERTY or ABC, once
in the Parent corner.

Files: `src/board/schema.sql`, `public/shared/import.mjs` (only if the
profile insert needs the new columns), `public/board.js`,
`public/index.html`.

1. **Schema.** Add two columns to `learner_profile`:
   ```sql
   keyboard_mode TEXT NOT NULL DEFAULT 'pip' CHECK (keyboard_mode IN ('pip', 'device')),
   keyboard_order TEXT NOT NULL DEFAULT 'qwerty' CHECK (keyboard_order IN ('qwerty', 'abc'))
   ```
   `migrateSchema` in `public/db.js` rebuilds the table when the stored DDL
   differs, and copies the shared columns, so existing rows get the
   defaults. The profile row is `prf_local`.
2. **Parent corner** (`#menu` sheet): add two labeled segmented controls
   under the existing buttons:
   - **Keyboard:** `Pip keys` | `Device keyboard`
   - **Letter order:** `QWERTY` | `ABC`. Disabled while Device keyboard is
     selected. Hint text: "Pick one and keep it — changing it moves every
     letter."
   Each writes its column right away. There is no Save button and no
   `alert`/`confirm`.
3. **`buildKb`** reads `keyboard_order` and rebuilds when it changes
   (reset `kbBuilt`).

Works Test (manual, recorded): switch to ABC; the keyboard shows `a`–`j` in
row 2 and rows 1, 5, and 6 look the same as in QWERTY. Reload the page: ABC
is still selected. Check `SELECT keyboard_mode, keyboard_order FROM
learner_profile` in the console.

Done when: the manual check passes and the node key-map test still passes.

---

## Slice 6 — Device keyboard mode

Goal: A literate user gets the iPad keyboard (autocorrect, swipe typing,
third-party keyboards) while keeping Pip's strip, sentence, and voice.

Files: `public/board.js`, `public/index.html`.

1. When `keyboard_mode = 'device'`, `#kb` renders:
   - **row 1** (slots 0–9): the partner row, moved to the top because the
     system keyboard covers the bottom of the screen;
   - **row 2** (slots 10–19): a full-width `<textarea id="kb-device">`
     with `autocapitalize="sentences" autocorrect="on" spellcheck="true"
     enterkeyhint="go"`, and a large font;
   - rows 3–6 empty (the system keyboard covers them).
2. **Focus inside the gesture.** In the ⌨ anchor's click handler, call
   `$("kb-device").focus()` synchronously, with no `await` before it. iOS
   only shows the keyboard for a focus that happens inside the user gesture.
3. **One buffer model.** The field holds only the word in progress. On
   `input`: if the value contains whitespace or sentence punctuation, run
   each completed token and mark through the slice 2 rules (`applyKey`),
   then set the field to what is left. `kbText` mirrors the field, so the
   strip completions work unchanged. Enter: commit and `speakSentence()`,
   same as slice 2.
4. **Closing.** Tapping the anchor (`Board`) blurs the field and closes the
   keyboard view.

Works Test (manual, recorded, **on a real iPad** — the desktop browser does
not reproduce the system keyboard's size or how it resizes the page):
landscape and portrait, tap ⌨ and the iPad keyboard appears. The bar, strip,
partner row, and field stay visible above it. Swipe-type `want juice` and
the items commit and speak. The strip shows completions mid-word. Record a
screenshot of each orientation.

Done when: the device check passes in both orientations. If a device is not
available, the slice stays open. Do not waive it.

---

## Slice 7 — Next word while typing (needs a founder ruling first)

**PROPOSED.** Blocked on a decision.

The conflict: `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.2
says core continuations (`to`, `you`, `want`) are haloed on the grid and
never copied into the strip. In keyboard mode the grid is hidden, so a
keyboard user never sees them and has to spell `want` every time.

Proposed ruling: **in keyboard mode only**, when the buffer is empty and the
sentence is not, the strip may show core continuations, because the grid is
not visible. Outside keyboard mode, nothing changes.

Proposed mechanism, once ruled: a pure `keyboardContinuations(db,
sentence)` in `public/shared/funnel.mjs` that merges `stripCandidates` with
learner-log bigrams (consecutive `learner_event_log` rows less than 20 s
apart, keyed by the previous item) and the existing part-of-speech
invitation extended to `root_core` senses. Cap 4. Works Test: after logging
`I → want` five times, typing `i` + space offers *want* first.

Do not start this slice until the ruling is recorded in the Dual_Engine doc.

---

## Out of scope

- Letter sounds (phonics mode: tapping `b` says /b/). Vision § 4 "phonics
  bridge"; needs 26+ phoneme clips. Next phase.
- Vowel color-coding and dyslexia fonts as options.
- Word-level delete and long-press actions (holds are hard for motor-impaired
  users).
- Masked words in completions. Reuse the masking filter when phase 004
  masking (Roadmap) lands.
- Multi-language keyboards.

## Closeout checklist

- [ ] Slices 1–6 done. Slice 7 either ruled and done, or moved to
      `docs/backlog/`.
- [ ] `npm run check` green.
- [ ] `docs/product/Profile_Presentation_Modes.md` § 4 tags flipped from
      DECIDED to BUILT, with citations.
- [ ] The measured letter/key ratio and the spelling recall % are recorded
      here.
- [ ] Archive this doc per `docs/operations/Execution-Playbook.md` § Phase
      Archive.
