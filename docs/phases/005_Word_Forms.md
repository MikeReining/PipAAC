# Phase 005 — Word Forms

**Status:** Ready to execute. Not started.

**DECIDED 2026-09-22** (founder: "All approved, proceed", on the morphology
recommendation in the locale review). Built in English first; it is the
mechanism every later language plugs its data into. It does not block the
English launch, and it must ship before the first non-English launch.

**Start after** `docs/archive/phases/004_Keyboard.md` (complete). Slice 4 here changes
`commitKb` from that phase.

Product truth this phase implements:

| Topic | Owner |
| --- | --- |
| Label kinds, utterances, clips, uniqueness | `docs/product/Language_And_Voice_Schema.md` § 5.3, § 13.5 |
| Top bar, strip, zero layout shift | `docs/product/Motor_Grid_And_Art.md` § Strip |
| Per-locale grammar rules (context ranking) | `docs/archive/phases/003b_Groups_Language_Followup.md` slice 3 (`GRAMMAR`, built at `5c971c4`) |
| Inline morphology vision (suggest, never a modal) | `docs/strategy/Vision.md` § 4.2 |

---

## Why this phase exists

The catalog has one approved lemma per sense and no inflected forms. A child
can say *I want juice* but not *she wants water*, *I went home*, or
*yesterday I played*: `wants`, `went`, and `played` are not in the catalog
(checked at `2783d01`). English needs `-s`, `-ed`, and `-ing`. German,
Spanish, and French carry far more meaning in endings (person, tense,
gender, case), so without this mechanism those markets cannot launch.

What others do (reference only): Proloquo2Go shows forms on tap-and-hold;
TouchChat WordPower Spanish builds 42 verb forms from the root; MetaTalk
(German) makes every form reachable directly. Research on teaching
grammatical morphemes (Binger, Maguire-Marshall & Kent-Walsh 2011) shows
children learn endings when forms are **visible and chosen**, with models
and contrast.

## Decisions this phase implements

- **A tap gives the base form. One more tap shows the forms.** No
  long-press (holds are hard for motor-impaired users), no modal.
- **The Forms key lives in the top bar, next to ⌫.** Both act on the last
  word. `grid60` is full and frozen for launch
  (`docs/product/Core_Coordinate_Map.md` § 3), so the key takes no grid
  cell and no strip slot. It is always rendered (disabled when the last
  word has no forms), so nothing shifts.
- **Suggest, never auto-replace.** Context ranks the forms (after *he*,
  `wants` comes first), and the child chooses. Automatic agreement is a
  later per-profile option, not this phase.
- **Forms are catalog labels** of kind `form`, tagged with UniMorph
  features, each with its own utterance and clip in the same voice. The
  button always shows the lemma.
- **Each language brings its own forms data.** The mechanism does not
  change.

## Vocabulary for code and docs

| Use | Never use |
| --- | --- |
| form, word forms, Forms key | inflection popup, grammar popup, conjugation menu |
| features (UniMorph tag string, e.g. `V;PST`) | tense code, grammar code |
| forms state (the strip showing forms) | forms mode, grammar mode |

---

## Slice 1 — Forms in the catalog

Goal: The catalog carries English forms as labels, with features. The forms
are generated and cross-checked mechanically. **No person reviews forms or
tags**; a gate against an independent source does.

Files: `src/board/schema.sql`, `docs/product/Language_And_Voice_Schema.md`
(§ 5.3 DDL), `data/forms/en_irregular.json` (new),
`data/forms/en_countability.json` (new), `data/forms/en.json` (new,
generated), `forms_generate.mjs` and `forms_oracle.mjs` (new, in
scripts/catalog), `src/board/fixtures/forms_oracle.en.json` (new),
`scripts/catalog/build_catalog.mjs`, `scripts/catalog/catalog.test.mjs`.

1. **Schema** — `label`:
   ```sql
   kind TEXT NOT NULL CHECK (kind IN ('lemma', 'alias', 'form')),
   features TEXT CHECK (features IS NULL OR length(features) > 0),
   CHECK ((kind = 'form') = (features IS NOT NULL)),
   CHECK (kind != 'form' OR default_for_text = 0)
   ```
   Indexes:
   - `label_one_row_per_sense_text` becomes partial:
     `WHERE kind IN ('lemma', 'alias')`. (Forms can share text with their
     lemma or with each other: *put*/*put*.)
   - New: `CREATE UNIQUE INDEX label_one_form_per_features ON
     label(sense_id, locale, features) WHERE kind = 'form' AND status =
     'approved';`
   Bump `PRAGMA user_version`. Update the § 5.3 DDL in the schema doc in the
   same commit.
2. **Where each part comes from** (Design Invariants § 7: code owns
   structure, models own judgment):

   | Part | Owner | How |
   | --- | --- | --- |
   | Which tags a word gets (`V;PST`, `N;PL`, …) | code | fixed by part of speech and the scope list below; never judged |
   | Regular forms (`wants`, `played`, `dogs`, `bigger`) | code | spelling rules: `-s/-es/-ies`, `-ed/-d/-ied`, `-ing` with e-drop and consonant doubling, `-er/-est` |
   | Irregular forms (`went`, `children`, `better`) | data | `data/forms/en_irregular.json`, written by the implementing agent: only the exceptions (a few dozen for this catalog) |
   | Countable vs mass noun (`dogs` yes, `waters` no) | model | `data/forms/en_countability.json`: one model classification per fringe noun, stored with model id, prompt version, and date. Abstention allowed; an abstained noun gets no plural in v1 |

   `forms_generate.mjs` combines these into `data/forms/en.json`
   (generated output: never hand-edited; change a source and regenerate):
   ```json
   { "version": 1, "locale": "en", "tagSchema": "UniMorph",
     "forms": [ { "lemma": "go", "features": "V;PST", "text": "went" } ] }
   ```
   **English v1 scope:**
   - every Verb sense (29 root-core + 74 fringe at `2783d01`):
     `V;PRS;3;SG`, `V;PST`, `V;V.PTCP;PRS`. Modals take only what exists
     (`can` → `could` as `V;PST`);
   - gradable core adjectives `big`, `good`, `bad`, `happy`, `sad`:
     `ADJ;CMPR`, `ADJ;SPRL`;
   - fringe Nouns classified countable: `N;PL`.
3. **The check that replaces human review — an independent oracle.**
   `forms_oracle.mjs` asks a model (OpenRouter, `OPENROUTER_API_KEY` in
   `.env`) for the form of every `(lemma, features)` pair in scope. The
   model sees only the lemma, its part of speech, and the tag, never the
   generator's answer. Answers are saved once to
   `src/board/fixtures/forms_oracle.en.json` with model id, prompt version,
   and date, so tests stay offline and repeatable. Run it **before**
   writing the generator, so the generator cannot shape it.

   Gate (`catalog.test.mjs`): every generated form equals the oracle's
   answer. A mismatch fails the build unless it is listed in
   `data/forms/en_disagreements.json` with the chosen form, a one-line
   reason, and a dictionary URL. The implementing agent resolves
   mismatches; the founder never does. The list is expected to be short,
   since both sides would have to be wrong the same way to slip through.
4. **Build** — `build_catalog.mjs` resolves each `lemma` to exactly one
   sense through the locale's approved lemma (fail otherwise), and emits:
   - a `form` label (`default_for_text = 0`, `status = 'approved'`,
     `features` from the source);
   - its utterance. If the form's text equals the lemma's text **and**
     sounds the same (`put` → `put`), skip the row: the lemma covers it.
   - If the form's text equals another sense's utterance and sounds the
     same, reuse that utterance (schema § 5.3 already shares utterances
     between homographs).
   - **Heteronyms:** if the form's text equals an existing utterance in the
     locale but is **pronounced differently** (`read` past = "red"), skip it
     in v1 and list it in the build output as a known gap. The utterance
     model is keyed by text and cannot hold two pronunciations of one
     spelling. At `2783d01` the only core case is `read`.
5. **Build fails** on: an unknown lemma, a duplicate `(lemma, features)`,
   features outside the UniMorph dimensions used here, or a form on a sense
   whose part of speech doesn't match the tag's first field (`V`, `N`,
   `ADJ`).

Works Test (`scripts/catalog/catalog.test.mjs`):
- *go* has form labels `goes` (`V;PRS;3;SG`), `went` (`V;PST`), `going`
  (`V;V.PTCP;PRS`), all `default_for_text = 0`.
- `wants`, `went`, `played` exist as approved form labels.
- No form row exists for *put* `V;PST`.
- Each failure case above fails the build (see each fail once).
- The lemma count and `default_for_text` labels are unchanged from before
  the phase.

Done when: `npm run catalog:build:check` is green and the tests pass.

---

## Slice 2 — Audio for forms

Goal: Every approved form has a ready clip in the default voice.

Files: `scripts/catalog/import_wbb_audio.mjs`,
`scripts/catalog/generate_missing_audio.mjs`,
`scripts/catalog/coverage.mjs`, `data/catalog/*.json` (regenerated).

1. The audio pipeline is keyed by lexicon slot today. Key form utterances by
   their utterance id instead, and include them in import (WorkbookBench
   first, since it may already hold common forms) and in gap-fill.
2. Gap-fill runs at build time with `ELEVENLABS_API_KEY` and
   `ELEVENLABS_VOICE_ID` from `.env`, same voice id and settings as the
   lemmas. The key never ships to a client.
3. **File names:** the current `slug()` keeps only `a–z0-9`. Use the
   accent-folded text (`foldKey` from 004 slice 3) for the readable part,
   and keep the sha suffix, so later locales (`école`, `Straße`) get
   sensible paths.
4. **Coverage gate** in `coverage.mjs`: every approved `form` label has a
   `ready` clip for the default voice of its locale. Wire it into
   `npm run catalog:build:check`.

Estimate: about 600 new clips for English v1 (103 verbs × up to 3, about
10 adjective forms, and roughly 300 countable nouns). This is an estimate
from catalog counts; record the real number in the closeout.

Works Test: the coverage gate passes. Play `went`, `dogs`, and `bigger` from
the catalog in the dev browser and confirm the same speaker as `go`, `dog`,
`big`.

Done when: the coverage gate is green.

---

## Slice 3 — Forms key and forms state

Goal: Tap *I*, *go*, then Forms: the strip shows `went`, `goes`, `going`,
`go`. Tap `went`: the bar reads *I went*, and `went` is spoken.

Files: `public/index.html`, `public/board.js`, `public/shared/forms.mjs`
(new), `forms.test.mjs` (new, in the src/board folder).

1. **Sentence items carry the label.** `sentence` items become
   `{ kind, id, text, labelId }`. Speech for a sense uses the clip of that
   label's utterance (the lemma label when `labelId` is null). The event log
   still records the sense id.
2. **Forms key** — `<button id="forms" class="corner-btn" title="Word
   forms">⇄</button>` between `#bar` and `#clear`. Same size as ⌫.
   Always rendered; `disabled` when the last item is not a sense with
   approved forms in the profile locale. The top bar's height and the bar's
   width never change.
3. **Forms state.** Tapping Forms:
   - highlights the last word in the bar;
   - fills the 4 strip slots with `rankForms(...)` cards: the sense's art
     (or swatch) and the form text, ranked, with the lemma always included;
   - the Groups and Keyboard anchors stay where they are.
   Tapping a form card replaces the last item's `text` and `labelId`, speaks
   that form, and leaves forms state. Tapping Forms again, any grid cell, or
   any anchor leaves forms state (a grid tap then appends as normal).
4. **`public/shared/forms.mjs` (pure)** — `rankForms({ forms, sentence,
   locale })` returns at most 4 labels. Rules come from the per-locale
   `GRAMMAR` table (003b slice 3), keyed by **sense ids**, never text.
   English v1, first match wins for the top card:
   - the item before the verb is *he*, *she*, *it*, or an entity →
     `V;PRS;3;SG`;
   - the sentence contains *yesterday* → `V;PST`;
   - the item before is *am*, *is*, or *are* → `V;V.PTCP;PRS`;
   - the item before a noun is a number above *one*, or *some*, *all*, or
     *more* → `N;PL`.
   Then fill in fixed order: verbs `V;PRS;3;SG`, `V;PST`, `V;V.PTCP;PRS`,
   lemma; nouns `N;PL`, lemma; adjectives `ADJ;CMPR`, `ADJ;SPRL`, lemma.
   A locale with no `GRAMMAR` entry uses fixed order only.

Works Test (`forms.test.mjs`, node) — table-driven `rankForms`:
- *he* + *want* → `wants` first;
- *yesterday* + *I* + *go* → `went` first;
- *I* + *am* + *play* → `playing` first;
- *two* + *dog* → `dogs` first;
- *I* + *want* → fixed order, lemma last, never more than 4;
- locale `de` with no rules → fixed order.

Works Test (manual, recorded, `dev:agent`): *I*, *go*, Forms, `went` → bar
*I went*, the `went` clip plays. *she*, *want*, Forms → `wants` is first.
Forms is disabled after *yes* (no forms). The `#grid`, `#strip`, and
`#topbar` rects are identical before, during, and after forms state.

Done when: both tests pass.

---

## Slice 4 — Typed forms

Goal: Typing `went` on the keyboard finds *go* with the `went` form.

Files: `public/board.js` (`commitKb`), `keyboard.test.mjs`.

1. Commit resolution (004 slice 2, rule 4.1) also matches approved `form`
   labels in the profile locale. The display text stays what was typed;
   speech uses that form's clip.
2. If the typed text matches forms on more than one sense, do not guess:
   fall through to device TTS, as for any non-catalog word.
3. The Forms key works on typed items that resolved to a sense.

Works Test: type `went` + space → the item is sense *go* with the `went`
label and the `went` clip plays. Type `wents` → device TTS (not a form).

Done when: the test passes.

---

## Out of scope

- **Automatic agreement** (the engine inserts `wants` without asking): a
  later per-profile option.
- **German, Spanish, and French forms data.** Each needs a source. Choosing
  one is a **licensing decision**: UniMorph's language data is published
  under Creative Commons share-alike terms (check each language's repo), and
  other lexicons carry their own licenses. Ask the founder before adopting
  any dataset.
- **Heteronym forms** (`read` past): need an utterance model that can hold
  two pronunciations of one spelling.
- Irregular-plural and comparison art (the picture stays the lemma's).

## Closeout checklist

- [ ] Slices 1–4 done; `npm run check` green.
- [ ] `docs/product/Language_And_Voice_Schema.md` § 5.3 DDL matches
      `src/board/schema.sql`; § 13.5 item 2 flipped to **BUILT**.
- [ ] Real clip count recorded here.
- [ ] Archive this doc per `docs/operations/Execution-Playbook.md` § Phase
      Archive.
