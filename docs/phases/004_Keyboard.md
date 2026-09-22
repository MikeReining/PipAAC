# Phase 004 — Keyboard 2.0

**Status:** Ready to execute. Not started.

**DECIDED 2026-09-22** (founder: "I fully agree", after the keyboard review in
the same session; locale amendments approved the same day: "Please do all of
the updates above"). This doc packs the whole phase for one developer to
execute end to end. Every slice is self-contained. Do them in order.

**Start after** the 003b language follow-up — complete 2026-09-22
(`docs/archive/phases/003b_Groups_Language_Followup.md`). That phase made the
runtime read the profile locale and voice. This phase builds on it and edits
the same files (`public/board.js`, `public/index.html`,
`src/board/schema.sql`). Line references are rebased on `5c971c4`.

**Built for every language, shipped in English.** Every rule here is keyed by
the profile locale. English is the only locale the catalog ships today. The
German, Spanish, and French key maps ship as data and are proven by tests, so
adding a market is content work, not a keyboard rewrite.

Product truth this phase implements:

| Topic | Owner |
| --- | --- |
| Keyboard modes, letter order, key maps per locale, who chooses | `docs/product/Profile_Presentation_Modes.md` § 4 |
| Strip geometry, the ⌨ anchor, zero layout shift | `docs/product/Motor_Grid_And_Art.md` § Strip |
| Vocabulary rows (partner phrases added in slice 4) | `docs/product/Initial_Vocabulary_600.md` § 3.14 |
| Speech lanes, locale resolution, "a miss is a miss" | `docs/product/Language_And_Voice_Schema.md` § 7, § 13 |
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
8. **English only.** The letters `a–z`, the accepted-key regex
   `/^[a-z.'?]$/i`, and the lookups are all English. German needs `ä ö ü ß`
   and QWERTZ, Spanish needs `ñ`, accents, and `¿ ¡`, and French needs
   AZERTY and `é è à ç`.

What incumbents do (reference only, never copy): Proloquo2Go's grid keyboard
uses 3 rows, leaves half the screen empty, and puts numbers, punctuation, and
upper case each one folder away. Its Typing View (system keyboard) is set in
Settings › Interaction › Keyboard Button, and there is also a second way in
through a Tools popup
(assistiveware.com/support/proloquo2go/basics/type, read 2026-09-22).

## The model in one paragraph

The keyboard is a **board mode**, not a modal: it renders into `#kb` in the
same 10×6 area, and the sentence bar and strip never move. The adult chooses
**Pip keys** (default) or **Device keyboard** once, in the Parent corner. For
Pip keys, the adult also chooses **standard** order (the locale's national
layout: QWERTY, QWERTZ, or AZERTY) or **ABC**. Key maps are **data per
locale**, and they share one skeleton: numbers on row 1, the locale's letters
on rows 2–4, locale punctuation plus space plus ⌫ on row 5, and the partner
row on row 6. There is no Done key: the ⌨ anchor toggles the keyboard, and a
hardware keyboard works in any mode. **Partner keys** speak right away and do
not change the sentence. While a word is in progress, the strip shows
**forgiving completions**: they ignore accents and match exact, prefix, typo,
and (where the locale has rules) sound-alike spellings.

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| Pip keys, Device keyboard | grid keyboard, typing view, system keyboard mode |
| letter order: standard / ABC | QWERTY as the setting name; "layout" (ambiguous with grid60) |
| key map (one per locale × order) | keyboard layout |
| partner row, partner key | quick phrases, fringe row |
| buffer (the word in progress, `kbText`) | draft, input |
| forgiving completions | autocorrect (we never auto-replace) |

---

## Geometry — Pip keys, fixed across all slices

60 slots. Rows and columns are counted from 1 (row 1 is the top row);
slot = `(row − 1) × 10 + (col − 1)`, so slots run 0–59.

**Skeleton — the same in every locale and order:**

| Row | Slots | Content |
| --- | --- | --- |
| 1 | 0–9 | `1 2 3 4 5 6 7 8 9 0` |
| 2–4 | 10–39 | the locale's letters in the chosen order; leftover cells hold the most-used punctuation |
| 5 | 40–47 | the locale's remaining punctuation from slot 40, then **space** filling the rest up to slot 47 (at least 4 wide) |
| 5 | 48–49 | **⌫** (2 wide) — never moves |
| 6 | 50–59 | partner row: five keys, 2 wide each |

Because ⌫, the space's right edge, the number row, and the partner row never
move, a bilingual child keeps most of the motor plan when the locale changes.

**Key maps shipped in this phase** (only `en` is reachable until a locale's
catalog ships):

| Locale | Order | Row 2 (10–19) | Row 3 (20–29) | Row 4 (30–39) | Row 5 punctuation | Space |
| --- | --- | --- | --- | --- | --- | --- |
| en | standard (QWERTY) | `q w e r t y u i o p` | `a s d f g h j k l '` | `z x c v b n m , . ?` | `! -` | 42–47 |
| en | ABC | `a b c d e f g h i j` | `k l m n o p q r s t` | `u v w x y z ' , . ?` | `! -` | 42–47 |
| de | standard (QWERTZ) | `q w e r t z u i o p` | `a s d f g h j k l ß` | `y x c v b n m ä ö ü` | `, . ? !` | 44–47 |
| de | ABC | `a b c d e f g h i j` | `k l m n o p q r s t` | `u v w x y z ä ö ü ß` | `, . ? !` | 44–47 |
| es | standard (QWERTY) | `q w e r t y u i o p` | `a s d f g h j k l ñ` | `z x c v b n m ´ , .` | `¿ ? ¡ !` | 44–47 |
| es | ABC | `a b c d e f g h i j` | `k l m n ñ o p q r s` | `t u v w x y z ´ , .` | `¿ ? ¡ !` | 44–47 |
| fr | standard (AZERTY) | `a z e r t y u i o p` | `q s d f g h j k l m` | `w x c v b n é è à ç` | `' , . ?` | 44–47 |
| fr | ABC | `a b c d e f g h i j` | `k l m n o p q r s t` | `u v w x y z é è à ç` | `' , . ?` | 44–47 |

Notes:
- **German umlauts go at the right end of the bottom letter row**, because
  QWERTZ plus `ü` is 11 keys wide. `ß` takes the cell after `l`, where
  English has `'`.
- **Spanish `ñ` sits after `l`,** exactly where it is on a Spanish keyboard.
  `´` is a **dead key**: tap `´` then a vowel to get `á é í ó ú`. Two taps
  in a fixed order, never a long-press. Tapping `´` twice cancels it, and
  `´` followed by a consonant types the consonant with no accent.
- **French gets `é è à ç` as their own keys** (the most frequent accents).
  Other accents (`ê â î ô û ë ï œ`) are reached through accent-insensitive
  completions (slice 3), and a typed word without them is still spoken.
- **Regional variants** (for example `de-CH`, which does not use `ß`) get
  their own map when that market ships. Key-map lookup is exact BCP 47 tag
  first, then the language subtag (`de-AT` → `de`).

**Partner row** (slots 50–59, all locales): *yes*, *no*, *wait, I'm
spelling*, *guess my word*, *oops*. Keys point to **sense ids**, never to
English text, so each locale shows its own label for the same sense. Until
slice 4 lands, slots 50–59 render as blank disabled cells
(`.gcell.empty:disabled` style), and nothing moves into them.

Keycaps are lowercase. There is no shift key and no caps mode. The sentence
bar applies the locale's capitalization rules (slice 2).

---

## Slice 1 — Key maps, big letters, no Done

Goal: The key maps render from per-locale data, letters fill their keys, and
the ⌨ anchor opens and closes the keyboard.

Files: `public/shared/keymaps.mjs` (new), `public/shared/keyboard.mjs`
(new), `public/board.js`, `public/index.html`, `public/fonts/` (new),
`keyboard.test.mjs` (new, in the src/board folder).

1. **`public/shared/keymaps.mjs`** — data only. `export const KEYMAPS = {
   en: { standardName: "QWERTY", alphabet: "abc…z", standard: {...},
   abc: {...} }, de: {...}, es: {...}, fr: {...} }`. Each order lists the 30
   characters for rows 2–4 and the row-5 punctuation, exactly as in the
   Geometry table. `alphabet` is the locale's full letter set (`de` includes
   `äöüß`, `es` includes `ñ`, `fr` includes `éèàç`). Partner keys are listed
   once as `PARTNER_SENSES = ["sns_0073", "sns_0072", "sns_0685",
   "sns_0686", "sns_0687"]` (*yes*, *no*, and the slice 4 phrases; sense ids
   are `sns_` + the zero-padded lexicon slot).
2. **`public/shared/keyboard.mjs`** — pure, no DOM, no db.
   - `resolveKeymap(locale)`: exact tag, then language subtag, else `null`.
     A locale with no key map falls back to Device keyboard mode and logs a
     console warning. It never falls back to English keys.
   - `keyMap(locale, order = "standard")` returns
     `{ slot, span, kind: "char"|"dead"|"space"|"backspace"|"partner", value }`
     per key (not per cell). Space's span is computed so it ends at slot 47.
3. **Render** (`buildKb` in `board.js`): build from `keyMap(locale,
   order)`. For now `order` is `"standard"`; slice 5 wires it to the profile.
   Place each key with `grid-column: (slot%10)+1 / span N; grid-row:
   floor(slot/10)+1`. Delete the `kb-space` 7×3 and `kb-done` 3×3 rules.
   Delete the Done key.
4. **Anchor toggle.** While the keyboard is open, `#anchor-kb` shows glyph
   `▦` and a label that says "Board" in the UI language. Tapping it calls
   `closeKb()`. When closed, it goes back to `⌨` and "Keyboard". Same
   element, same position; only its text changes. Escape still closes the
   keyboard.
5. **Letter size.** Each key's text goes in a child `<span class="kc">`.
   `.kb-key { container-type: size; }` and `.kc { font-size: min(70cqh,
   80cqw); line-height: 1; }` (tune the numbers against the Works Test, not
   by eye). Utility keys (space, ⌫) use a smaller label: `min(34cqh, 22cqw)`.
   Partner keys use the `.cell` label size.
6. **Font.** Self-host Andika Bold (SIL Open Font License) as
   `public/fonts/andika-bold.woff2` with its `OFL.txt`. Add an `@font-face`
   with `font-display: block`, and a `<link rel="preload">`. Apply it to
   `.kb-key` only. Andika uses the single-story *a* and *g* that children
   learn to read, and it covers `ä ö ü ß ñ é è à ç ´ ¿ ¡`. Check every
   character in `KEYMAPS` renders in Andika, not a fallback font. The app is
   offline-first, so never load the font from a CDN.
7. **Styles.** Char keys: white fill, `#8a8578` border. Space and ⌫: the
   existing `.kb-util` colors. The dead key uses the utility style and shows
   a latched state (inset border) while pending. Keep `:active` feedback.
   Space shows a `␣` glyph with a small label under it.

Works Test (`keyboard.test.mjs`, node) — **for every locale × order in
`KEYMAPS`:**
- every slot 0–59 is covered by exactly one key (spans counted);
- every character of `alphabet` appears exactly once, and `0`–`9` exactly
  once each;
- ⌫ is at 48–49, space ends at 47 and is at least 4 wide;
- rows 1 and 6 are identical across all maps;
- `standard` and `abc` of the same locale contain the same set of keys, so
  switching order never loses a key;
- `resolveKeymap("de-AT")` returns the `de` map, and `resolveKeymap("ja")`
  returns `null`.

Works Test (manual, recorded): on `npm run dev:agent`, at 1180×820 (iPad Air
landscape) and 820×1180 (portrait):
- From the console, for keys `k`, `g`, and `5`: measure the glyph ink with
  `canvas.measureText` using the key span's computed font
  (`actualBoundingBoxAscent + actualBoundingBoxDescent`), and compare it with
  `key.getBoundingClientRect().height`. **Pass: ink height ≥ 50% of key
  height for `k`, and the `g` descender stays inside the key rect.**
- The `#strip` and `#bar` rects are identical with the keyboard open and
  closed.
- Tapping ⌨ opens the keyboard; tapping it again closes it.
- With the locale forced to `de` from the console (build only, test catalog
  not required), the QWERTZ map renders and `ä ö ü ß` render in Andika.

Done when: both tests pass, `npm run check:fast` is green, and the measured
ratios are in the closeout.

---

## Slice 2 — Typing that behaves

Goal: Punctuation, digits, accents, backspace, names, capitals, and hardware
keys behave the way a person in that language expects.

Files: `public/shared/keyboard.mjs`, `public/board.js`,
`data/number_aliases.json` (new), `scripts/catalog/build_catalog.mjs`,
`keyboard.test.mjs`, `scripts/catalog/catalog.test.mjs`.

Rules (put the pure parts in `keyboard.mjs` so node can test them):

1. **Word characters** are the locale's `alphabet`, digits, `'`, and `-`.
   They append to the buffer.
2. **Dead key (`´`, es):** sets a pending accent. The next vowel appends its
   accented form (`a→á e→é i→í o→ó u→ú`). Any other key clears the pending
   accent and then acts normally.
3. **Sentence punctuation** (`, . ? !`) first commits the buffer if it is
   non-empty, then attaches the mark to the last sentence item as
   `item.punct` (display only; one mark per item, and the new mark replaces
   the old one). **Opening marks** (`¿ ¡`) commit the buffer and then attach
   as `item.lead` to the **next** item committed. Punctuation never becomes
   part of a word and is never spoken as a word.
4. **Commit resolution order** (`commitKb`), matching on the normalized
   buffer in the **profile locale**:
   1. an approved label, lemma or alias, for the locale → `tap(display,
      "sense", id)`. `display` is the lemma for a lemma hit and **the typed
      text** for an alias hit, so `3` stays `3` in the bar;
   2. an exact personal-entity `spoken_name` (normalized) →
      `tap(spoken_name, "entity", id)`;
   3. otherwise `tap(buffer, "typed", null)`, which speaks through device
      TTS with `lang` set to the profile locale (from 003b).
   Commit **never** replaces what was typed with a guess. Corrections are
   offered in the strip (slice 3) and never applied automatically.
5. **Digits are alias labels, not code.** New source
   `data/number_aliases.json`:
   ```json
   { "version": 1, "locales": { "en": { "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten" } } }
   ```
   `build_catalog.mjs` resolves each word to exactly one `Number` sense
   through that locale's lemma, and fails otherwise. It emits one `label`
   row per digit string: `kind = 'alias'`, `status = 'approved'`,
   `default_for_text = 1`, and `utterance_id` = the lemma's utterance, so
   the bundled clip for *three* plays. German later adds
   `"de": { "3": "drei", … }` and nothing else changes. This amends schema
   § 9 "no alias rows" for digit aliases only (recorded in schema § 13).
6. **⌫ with an empty buffer** reopens the last item, the way a real keyboard
   steps back over the space. If the item has `punct`, remove the mark
   first. Otherwise pop the item and put its display text into the buffer,
   without deleting a character yet. The next ⌫ deletes a character. The
   top-bar ⌫ (`#clear`) keeps its current behavior of removing the whole
   last item.
7. **Capitals, display only** — `displaySentence(items, locale)` in
   `keyboard.mjs`:
   - **all locales:** capitalize the first letter of the sentence, and the
     first letter after an item whose `punct` is `. ? !`. A leading `¿` or
     `¡` is skipped when finding that letter (`¿Qué`). Catalog labels and
     entity names are shown as stored, so German nouns keep their capitals
     (`Saft`) because the German label stores them that way;
   - **en only:** a standalone `i` and `i'm`, `i'll`, `i've`, `i'd`
     become `I…`;
   - **fr only:** insert a narrow no-break space (U+202F) before `? !`.
   Spoken text and stored `item.text` are unchanged.
8. **Hardware keys** (`keydown`):
   - Ignore the event when the target is an `input` or `textarea`, when any
     `.overlay.open` exists, or when `metaKey`, `ctrlKey`, or `altKey` is
     held.
   - Accept a single character that is in the active key map (compared
     lowercase) or is a digit. Composed characters from a real German or
     French keyboard (`ä`, `é`) arrive as one `e.key` and are accepted.
   - **If the keyboard is closed and the key is a letter or digit, open the
     keyboard and type that key.** No setting is needed.
   - Space commits. Backspace follows rule 6.
   - **Enter commits the buffer and speaks the whole sentence**
     (`speakSentence`); the keyboard stays open. This replaces "Enter
     commits and closes".

Works Test (`keyboard.test.mjs`, node): a pure `applyKey(state, key,
locale)` reducer holding `{ buffer, pendingAccent, items }` with no speech;
`board.js` calls it and then does the side effects. Table-driven cases:
- `en`: `i want juice.` → `I want juice.`; `i'm` → `I'm`.
- `es`: `´` `a` → `á`; `´` `´` `a` → `a`; `¿` `que` `?` → `¿Que?` displayed
  with a capital after `¿`.
- `fr`: `quoi` `?` displays `Quoi ?` with U+202F before `?`.
- `de`: an item stored as `Saft` mid-sentence stays `Saft`.
- ⌫ on an empty buffer after `hi.` removes `.`, then reopens `hi`.

Works Test (`scripts/catalog/catalog.test.mjs`): the `en` catalog has alias
labels `1`–`10`, each on the same sense as the matching number lemma, and a
seed word that resolves to zero or two senses fails the build (see it fail
once).

Works Test (manual, recorded, `dev:agent`):
- Type `i want juice.` on screen. The bar reads `I want juice.`, and the
  clip for *juice* plays on space.
- Type `3` then space: the bar shows `3`, and the bundled *three* clip plays,
  not the TTS voice.
- Add Cooper through the existing flow, then type `cooper` + space: the item
  is the entity, and the strip shows his photo on the next state.
- With the keyboard closed and a hardware keyboard attached (or the desktop
  browser), press `h`: the keyboard opens with `h` in the buffer. Press
  Enter: the sentence is spoken.

Done when: the node tests and the manual checks pass.

---

## Slice 3 — Forgiving completions

Goal: Invented spelling still finds the word. `elfnt` offers *elephant*,
`hws` offers *house*, `wtr` offers *water*. Accents are never needed to find
a word: `ecole` finds *école*.

Files: `public/shared/spelling.mjs` (new), `public/board.js`
(`kbCompletions`), `src/board/fixtures/invented_spellings.en.json` (new),
`spelling.test.mjs` (new, in the src/board folder).

**Write the fixture first, in its own commit, before any matcher code.**
The fixture is the instrument, and the matcher must not shape it. Each
locale gets its own fixture file (`invented_spellings.<locale>.json`) when
its sound rules are built.

### Fixture — `src/board/fixtures/invented_spellings.en.json`

```json
{
  "version": 1,
  "locale": "en",
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

- `foldKey(s)` — the **matching** key, shared by every locale: normalizeV1,
  then Unicode NFD, then remove combining marks (U+0300–U+036F), then
  `ß → ss`, then remove `'`, `-`, and spaces. `école → ecole`,
  `Straße → strasse`. This is not the uniqueness normalizer and does not
  change `normalize_v1`.
- `buildIndex(entries, locale)`: `entries` are
  `{ kind: "sense"|"entity", id, text, freq }`, with sense text from the
  profile locale's labels. Precompute `fold = foldKey(text)` and, if the
  locale has a sound key, `keys` (below). Build it once when the keyboard
  opens and cache it. Rebuild after an entity add or a locale change. Do not
  run a SQL `LIKE` on every keystroke.
- `suggest(index, typed, cap = 4)` compares `t = foldKey(typed)` and ranks by
  tier:

| Tier | Rule | Minimum typed length |
| --- | --- | --- |
| 0 exact | `fold === t` | 1 |
| 1 prefix | `fold.startsWith(t)`, or any word inside a multi-word text starts with `t` | 1 |
| 2 typo | optimal-string-alignment distance between `t` and `fold.slice(0, L)` for `L` in `t.length-1 … t.length+1`, at most `k`, where `k = 1` for lengths 3–5 and `k = 2` for 6+ | 3 |
| 3 sound-alike | only if the locale has a sound key: `soundKey(t)` is a prefix of one of the entry's `keys`, and `soundKey(t).length ≥ 2` | 3 |

  Within a tier, an entry whose text matches the typed text **with its
  accents** ranks first (so Spanish `papá` typed with the dead key beats
  `papa`). Then sort by `freq` descending (learner log counts), then edit
  distance ascending, then `|fold.length - t.length|` ascending, then
  `text`. Dedupe by `kind:id`, keeping the best tier. Cap at 4. A higher
  tier always ranks above a lower one, so correct spellers never lose a
  prefix hit to a guess.

- `SOUND_KEYS = { en: soundKeyEnV1 }`. Tiers 0–2 work in every language
  because they only compare letters. Tier 3 encodes how a language's
  spelling maps to sound, so it is per locale, versioned, and **skipped**
  for a locale with no entry. German, Spanish, and French rules are built
  with their own fixtures when those markets ship (see Out of scope).
- `soundKeyEnV1(s)` — "pip sound key en v1". Changing the rules means a new
  version (same policy as normalizeV1):
  1. Start from `foldKey(s)`; keep `a–z` only.
  2. Digraphs, in order: `tch→C`, `dge→j`, `ch→C`, `sh→s`, `th→t`,
     `ph→f`, `ck→k`, `qu→kw`, leading `kn→n`, leading `wr→r`, leading
     `wh→w`, `gh→` (drop) except at the start (`g`).
  3. Letters: `c` before `e/i/y` becomes `s`, otherwise `k`; `q→k`, `x→ks`,
     `z→s`.
  4. Keep the first character. For the rest, drop the vowels `aeiouy` and
     drop `h` and `w`.
  5. Collapse runs of the same character.
  6. If the first character is a vowel, write it as `a`.
- Entry `keys` = `[soundKey(fold), soundKey(fold) with a leading "a"
  removed]`. The second key catches letter-name spellings that skip a
  leading vowel (`lefnt` → *elephant*).

The rules are a starting point. Tune them only against the fixture and the
precision gate below.

### Wiring

`kbCompletions()` builds cards from `suggest(index, kbText)`. Its card shape
is unchanged (`{label, role, freq, onTap}` / `{entity, freq, onTap}`). Only
the matching changes.

Works Test (`spelling.test.mjs`, node; catalog loaded the same way as
`src/board/strip.test.mjs`):
- **Recall gate (en):** the intended word is in the top 4 for **≥ 85%** of
  fixture pairs. Print the misses.
- **Precision gate (en):** for **every** catalog lemma typed in full,
  `suggest(...)[0]` is that lemma (100%). For every lemma's first 3 letters,
  every tier-1 hit ranks above every tier-2/3 hit.
- **Accents, any locale:** with a test index of `école`, `papá`, `papa`,
  `Straße`: `ecole` → *école* first; `papá` → *papá* before *papa*;
  `strasse` → *Straße*. With locale `fr` (no sound key), tier 3 returns
  nothing and tiers 0–2 still work.
- **Entity:** after adding Cooper, `kupr` returns Cooper in the top 4.
- **Speed:** `suggest` over the full catalog plus 50 entities takes < 5 ms
  median over 1,000 random 3–6 letter inputs (node `performance.now`).

Works Test (manual, recorded): on `dev:agent`, type `elfnt`. The strip shows
*elephant* with its art or swatch. Tap it: *elephant* is spoken and added to
the sentence, and the buffer clears.

Done when: all gates pass and the recall percentage and misses are in the
closeout.

---

## Slice 4 — Partner row

Goal: Row 6 lets the speller talk *about* the typing: yes, no, wait, guess,
oops.

Files: `docs/product/Initial_Vocabulary_600.md` (§ 3.14),
`data/launch_lexicon.json` (regenerated), `data/catalog/catalog.json`
(regenerated), `public/board.js`, `public/index.html`,
`scripts/catalog/catalog.test.mjs`.

1. **Vocabulary source.** Add three rows to § 3.14 Social, and bump the
   section count from 27 to 30:

   | # | Word | Part of Speech | Fitzgerald Color | Visual Style |
   | --- | --- | --- | --- | --- |
   | 685 | wait, I'm spelling | Interjection | Pink | Stick Figure |
   | 686 | guess my word | Interjection | Pink | Stick Figure |
   | 687 | oops | Interjection | Pink | Stick Figure |

   Fill in Clinical Source and Visual Prompt the same way as neighboring
   rows. `yes` and `no` already exist (`sns_0073`, `sns_0072` at
   `fb5a8d7`). The new senses become `sns_0685`–`sns_0687`, matching
   `PARTNER_SENSES` in slice 1. Use the next free slots after the highest
   existing one (684 at `fb5a8d7`); never reuse a retired slot number,
   because the slot number is the sense id. If the highest slot has moved,
   update `PARTNER_SENSES` to match. Then run `npm run catalog:lexicon` and
   `npm run catalog:build`. Never hand-edit the generated JSON.
2. **Gate.** `catalog.test.mjs` asserts every id in `PARTNER_SENSES` exists
   and has an approved `en` lemma. When a second locale ships, the same
   assertion runs for it, so a market cannot launch with a silent partner
   key.
3. **Audio.** Run the documented gap-fill
   (`node scripts/catalog/generate_missing_audio.mjs`). It reads
   `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` from the gitignored
   `.env`, which is already set up. Generation is build-time only: the MP3s
   ship bundled in the catalog, and the app never calls ElevenLabs. **The
   key never goes into client code or the iOS app.** Any future runtime
   generation goes device → Cloudflare Worker (key held as a Worker secret)
   → ElevenLabs.
4. **Render.** Partner keys resolve their label by sense id in the profile
   locale. The cell is 2 wide, shows the label (and art when available),
   and uses the sense's `fitzgerald_role` color class. A locale with no
   label for a partner sense renders the key disabled, with no text from
   another language.
5. **Behavior: speak, don't compose.** A partner tap plays the clip (or
   falls back to device TTS in the profile locale if the clip is missing —
   never the 400 ms silent slot for these keys), calls `logSelection`, and
   flashes the key. It does **not** change `sentence` or the buffer. The
   partner hears the message, and the sentence being spelled stays intact.

Works Test (manual, recorded): type `ele`, then tap *wait, I'm spelling*.
The phrase is spoken, the bar still reads `ele▌`, and the strip still shows
the completions for `ele`. Tap *yes*: it is spoken and the bar is unchanged.

Done when: `npm run catalog:build:check` is green, the gate passes, the
manual check passes, and all three new clips play in the bundled voice.

---

## Slice 5 — Keyboard settings and letter order

Goal: The adult chooses Pip keys or Device keyboard, and standard or ABC
order, once in the Parent corner.

Files: `src/board/schema.sql`, `public/shared/import.mjs` (only if the
profile insert needs the new columns), `public/board.js`,
`public/index.html`.

1. **Schema.** Add two columns to `learner_profile`:
   ```sql
   keyboard_mode TEXT NOT NULL DEFAULT 'pip' CHECK (keyboard_mode IN ('pip', 'device')),
   keyboard_order TEXT NOT NULL DEFAULT 'standard' CHECK (keyboard_order IN ('standard', 'abc'))
   ```
   `standard` means the locale's national layout, so the stored value stays
   correct when the locale changes. `migrateSchema` in `public/db.js`
   rebuilds the table when the stored DDL differs and copies the shared
   columns, so existing rows get the defaults. The profile row is
   `prf_local`.
2. **Parent corner** (`#menu` sheet): add two labeled segmented controls
   under the existing buttons:
   - **Keyboard:** `Pip keys` | `Device keyboard`
   - **Letter order:** `<standardName>` | `ABC`, where `standardName` comes
     from the locale's key map (`QWERTY`, `QWERTZ`, `AZERTY`). Disabled while
     Device keyboard is selected. Hint text: "Pick one and keep it —
     changing it moves every letter."
   Each writes its column right away. There is no Save button and no
   `alert`/`confirm`.
3. **`buildKb`** reads `keyboard_order` and the profile locale, and rebuilds
   when either changes (reset `kbBuilt`).

Works Test (manual, recorded): switch to ABC; the keyboard shows `a`–`j` in
row 2, and rows 1, 5, and 6 look the same as in standard order. Reload the
page: ABC is still selected. Check `SELECT keyboard_mode, keyboard_order
FROM learner_profile` in the console.

Done when: the manual check passes and the node key-map test still passes.

---

## Slice 6 — Device keyboard mode

Goal: A literate user gets the iPad keyboard (autocorrect, swipe typing,
third-party keyboards, their own language's layout) while keeping Pip's
strip, sentence, and voice.

Files: `public/board.js`, `public/index.html`.

1. When `keyboard_mode = 'device'` (or the locale has no key map), `#kb`
   renders:
   - **row 1** (slots 0–9): the partner row, moved to the top because the
     system keyboard covers the bottom of the screen;
   - **row 2** (slots 10–19): a full-width `<textarea id="kb-device">` with
     `lang="<profile locale>" autocapitalize="sentences" autocorrect="on"
     spellcheck="true" enterkeyhint="go"`, and a large font. The `lang`
     attribute makes iOS autocorrect and spellcheck use the profile's
     language;
   - rows 3–6 empty (the system keyboard covers them).
2. **Focus inside the gesture.** In the ⌨ anchor's click handler, call
   `$("kb-device").focus()` synchronously, with no `await` before it. iOS
   only shows the keyboard for a focus that happens inside the user gesture.
3. **One buffer model.** The field holds only the word in progress. On
   `input`: if the value contains whitespace or sentence punctuation, run
   each completed token and mark through `applyKey` (slice 2), then set the
   field to what is left. `kbText` mirrors the field, so the strip
   completions work unchanged. Enter: commit and `speakSentence()`, same as
   slice 2.
4. **Closing.** Tapping the anchor ("Board") blurs the field and closes the
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

## Slice 7 — Next word while typing

**DECIDED 2026-09-22** (founder: "All approved, proceed"). Recorded in
`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 5.2.

Goal: After a word is committed in keyboard mode, the strip offers the
likely next words, **core words included**, so a speller never has to type
`want` again.

Why: the "core words never in the strip" rule exists so the child learns
each core word's grid position. In keyboard mode the grid is not visible,
so that reason does not apply. Core words make up most of what people say,
so leaving them out wastes most of the benefit. Word-prediction research
(Koester & Levine; Trnka et al.) finds that suggestions pay off for slow
typists, and one-key-at-a-time tapping on a touch grid is slow typing. The
4-card cap stays, to limit scanning.

Files: `public/shared/funnel.mjs`, `public/board.js` (`renderStrip`),
`src/board/fixtures/typing_sentences.en.json` (new),
`typing_sim.test.mjs` (new, in the src/board folder).

1. **When:** keyboard open, buffer empty, sentence not empty. Outside
   keyboard mode nothing changes. Mid-word, the strip keeps showing
   completions (slice 3), which already include core words.
2. **`keyboardContinuations(db, sentence, locale, now)`** in `funnel.mjs`,
   pure over the db. Candidates, all by id:
   - **bigrams:** items the learner picked right after the tail item before
     (consecutive `learner_event_log` rows less than 20 s apart, keyed by
     the previous row's `item_kind:item_id`). Ids only, so this works in
     every language;
   - **grammar invitation**, from the per-locale `GRAMMAR` table
     (003b slice 3), extended to `root_core` senses (English: a pronoun
     tail invites core verbs such as *want*, *like*, *go*, *need*);
   - **`stripCandidates`** (entities and fringe with evidence), unchanged.
   Rank: bigram count first, then invitation, then overall frequency, then
   recency. Dedupe. Cap 4. Masked words are excluded once masking exists.
3. **`renderStrip`:** in the state above, use `keyboardContinuations`
   instead of `stripCandidates`. Card shape is unchanged.

### Proof — a typing simulation, written before the code

**Fixture first, in its own commit:**
`src/board/fixtures/typing_sentences.en.json` — at least 30 short sentences
a child might type, every word a catalog lemma. Starter set (all verified in
the catalog at `2783d01`): *I want juice*, *I want to go outside*, *can I
have more*, *I need help*, *my turn*, *where is mom*, *I like the dog*, *he
is sad*, *we go to the park*, *I want to play with you*, *stop it*, *I feel
sick*, *what is that*, *give me the ball*, *look at this*, *I am hungry*.

**`typing_sim.test.mjs`** runs an "ideal user", the standard
keystroke-savings method: for each word, before each letter, if the target
word is on one of the 4 strip cards, tap it (1 tap); otherwise type the
next letter (1 tap) and, when the word is finished, space (1 tap). It counts
taps per word under three conditions on the same fixture:

| Condition | Strip while typing |
| --- | --- |
| A | nothing (letters and space only) |
| B | slice 3 completions only |
| C | completions plus continuations (this slice) |

Run each condition twice: with an empty event log, and after the whole
fixture has been entered once (so bigrams exist).

**Gates:**
- with history, C uses **fewer** taps per word than B;
- with an empty log, C is **never worse** than B;
- print keystroke savings (`1 − taps_C / taps_A`) for both runs and record
  them in the closeout.

The ideal user ignores the time spent reading the cards; that is the
known limit of this measure (Koester & Levine). So the cap stays at 4, and
the manual check below is required too.

Works Test (manual, recorded, `dev:agent`, empty history): open the
keyboard, type `i` + space. The strip shows core verbs (*want*, *like*,
*go*, *need* or similar). Tap *want*: it is added and spoken. Type `ju`:
the strip switches to completions and shows *juice*.

Done when: both gates pass, and the savings numbers and manual check are in
the closeout.

---

## Out of scope

- **Shipping German, Spanish, or French.** This phase ships their key maps
  and proves them with tests. A market launch also needs its catalog labels
  and voice, its digit aliases, a sound key with its own invented-spelling
  fixture (German: `sch`, `ie/ei`, `v→f`, `w→v`; Spanish: silent `h`,
  `b/v`, `ll/y`, `c/z/s`; French: silent endings, `eau/au/o`, `ou`, `gn`,
  `ch`), and the rulings in `docs/product/Language_And_Voice_Schema.md`
  § 13.
- Letter sounds (phonics mode: tapping `b` says /b/). Vision § 4 "phonics
  bridge"; needs phoneme clips per locale. Next phase.
- Vowel color-coding and dyslexia fonts as options.
- Word-level delete and long-press actions (holds are hard for
  motor-impaired users).
- Masked words in completions. Reuse the masking filter when masking
  (Roadmap) lands.

## Closeout checklist

- [ ] Slices 1–7 done.
- [ ] `npm run check` green.
- [ ] `docs/product/Profile_Presentation_Modes.md` § 4 tags flipped from
      DECIDED to BUILT, with citations.
- [ ] `docs/product/Language_And_Voice_Schema.md` § 13 keyboard rows flipped
      to BUILT.
- [ ] The measured letter/key ratio, the spelling recall %, and the
      typing-simulation savings are recorded here.
- [ ] Archive this doc per `docs/operations/Execution-Playbook.md` § Phase
      Archive.
