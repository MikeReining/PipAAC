# 021 — Grammar Help: present tense, everywhere, from data

**Status:** ready to execute (opened 2026-09-25). Start after
`020_Prediction_Data_Fix.md` is committed; the form table is built from the
same cleaned CHILDES text.
**Truth owner:** what people actually say in CHILDES (child and caregiver
lines), measured on held-out sentences. Not hand-written grammar, not JEV.
**Why this phase exists:** founder tests, 2026-09-25: *She need*, *He have*,
*He is go*, *He is get*. The bar predicted the right meaning, but every word
stayed in its base form, and *has* is not even on the board. The founder's
goal: when she taps *he*, the board already says **needs** and **has**. Same
cell, same picture, same meaning; only the word and its sound change.

## Founder decisions (2026-09-25)

1. **The board, the smart bar and the sentence all show the form that fits.**
   After *he*, the *need* cell reads and speaks **needs**. After *he is*, *go*
   reads **going**. After *he wants to*, *get* is **get** again. No tile
   moves; no meaning changes. Showing *has* in the bar while the board says
   *have* is ruled out: one word, one form, everywhere.
2. **Present tense only:** base, -s, -ing. Past tense, and *am/is/are* as
   one word, are later conversations. Do not build them.
3. **No grammar rules and no JEV.** The data picks the form. It is measured
   to be right far more often than today (below), long sentences included.
4. **A word already in the sentence keeps its form, with one exception:**
   the word right before the new tap may change its form when the new word
   decides it (*what do* + *he* → *what **does** he*). Only that word, and
   only between present forms.
5. **Setting name: "Grammar help"** (On by default). Supporter-facing line:
   *"Words change to fit the sentence: he needs, she is going."* Off = every
   word shows its base form, as today. It is not called "word endings":
   later steps (*I am* / *he is*) change more than endings.
6. **Missing voice clips are authorized.** Pull from WorkbookBench first,
   generate only what is missing (slice 2).

These replace, for present tense, three decisions in
`005_Word_Forms.md`: "the button always shows the lemma", "suggest, never
auto-replace", and slice 3's hand-written `rankForms` rules (017 R14; the
`GRAMMAR` table was deleted in `4627601`).

## Rules for this work

- Build it, then prove it with the two scripts in slice 3 and slice 5. No new
  unit tests. We are iterating; tests come once the behavior is worth
  protecting.
- Measure the actual thing: the proof compares against what people really
  said in held-out CHILDES, and against the founder-reviewed examples below.
  Never against a copy of our own logic.
- If a number or an example disagrees, print the counts and explain. Do not
  add a threshold, a special case or a word rule to make it pass.

## Why data can do this (measured 2026-09-25)

Held-out CHILDES lines. For every present-tense verb use (base, -s, -ing;
past skipped; the first word of a line skipped, since its form never
changes), the form was picked from the words before it and compared with
what the speaker actually said.

| | Adults (446,748 verb uses) | Children (134,265) |
| --- | --- | --- |
| Today: always the base form | 81.6% right | 82.0% right |
| **Data picks the form** | **93.3% right** | **90.3% right** |

Wrong forms drop from about 18% to about 7%. Long sentences are not
harder, because the form depends on the last 1–3 words:

| Words before the verb | 1 | 2 | 3 | 4 | 5 | 6+ |
| --- | --- | --- | --- | --- | --- | --- |
| Adults, right | 93% | 96% | 94% | 92% | 92% | 92% |

A version that only changed the form when 80%+ sure scored slightly lower
(92.5%), so there is no threshold: the data's top form wins.

What's in the remaining ~7%:
- Questions where the subject comes after the verb (*what does he* vs *what
  do you*). The form depends on the next word. Decision 4 covers it.
- Names (*Leo needs*). Handled in slice 3 item 5.
- Rare subjects the data barely saw. The base form shows, as today.

The same data shows the split between meaning and form. *she* + *need* is
**needs** 86% (children) / 90% (adults); *does she* + *need* is **need**
100%; *they* + *need* is **need** 95%. But *she* + *go* splits went 49% /
goes 40%. That split is tense, which is her meaning, so past forms never
take part in the automatic choice.

---

## The design in one page

- **A tile is a meaning; the words before it pick its form.** Prediction
  stays on meanings, exactly as today (`stripRanked`, sense ids, the 5%
  cutoff). Her grammar mistakes therefore never break the bar.
- **One function decides the form** for any verb sense in any place:
  `formFor(sentence, senseId)` in `public/shared/forms.mjs`. The board
  cells, the smart bar tiles and the sentence all call it. Nothing else
  picks a form.
- **When it runs:** after every change to the sentence (tap, backspace,
  clear), before the next paint. Labels change before she taps, never after,
  except the one word allowed by decision 4.
- **What a form is:** a catalog label of kind `form` with its own utterance
  and clip (the schema planned in 005 slice 1). A sentence item carries
  `{ kind, id, text, labelId }` and speaks its label's clip.

---

## Slice 1 — Present-tense forms in the catalog

Use 005 slice 1's schema exactly: `label.kind` gains `'form'`, a `features`
column, the two indexes, a `user_version` bump, and the schema-doc DDL in
the same commit. Changes from 005 slice 1:

1. **Scope:** every Verb sense gets `V;PRS;3;SG` (-s) and `V;V.PTCP;PRS`
   (-ing). No `V;PST`, no plurals, no adjectives in this phase.
2. **Skip words that don't change.** Modals and negatives (*can, will,
   would, don't, can't, won't…*) and anything else never said with -s or
   -ing get no forms. Decide this from the data, not a list: a form ships
   only if CHILDES contains it as a word that `toLemma` maps back to that
   verb (e.g. *needs* → *need*, *getting* → *get*).
3. **Source and check without a paid model run:** generate forms with 005's
   spelling rules plus a small irregular list (*has, does, goes*; *am / is /
   are* are not part of this phase). The independent check is CHILDES attestation (item 2), not the
   OpenRouter oracle. List every generated form CHILDES never contains, with
   the reason it was dropped or kept.
4. **has becomes the -s form of have.** The separate sense *has*
   (`sns_0612`) stops being its own word:
   - the *have* sense gets `has` as its `V;PRS;3;SG` form label;
   - the Little Words cell that shows *has* stays where it is; tapping it
     adds *have* with the `has` form fixed (she chose that form);
   - her existing logged taps of `sns_0612` count as *have* wherever
     history is read (phrase history, group mode). No destructive rewrite of
     her log.
   *did*, *had*, *was*, *were*, *am/is/are* stay as they are (past tense and
   *be* are later).

Show: the list of forms added (count per verb), the dropped/unattested list,
`npm run catalog:build:check` green.

## Slice 2 — Voice clips for the new forms

Pipeline already in the repo: `scripts/catalog/import_wbb_audio.mjs` →
`materialize_audio.mjs` → `generate_missing_audio.mjs`. Key form utterances
by utterance id (005 slice 2 item 1).

1. **WorkbookBench first.** Repo: `/Users/mike/Documents/GitHub/WorkbookBench`
   (manifest `assets/catalog/manifest.json`, clips in R2 bucket
   `workbookbench-catalog`). A 2026-09-25 check found about 80 of ~190
   -s/-ing forms there: most -ing forms exist, most -s forms (*needs, likes,
   makes, comes*) do not.
2. **Generate the rest: authorized by the founder (2026-09-25).** Use
   `generate_missing_audio.mjs` (ElevenLabs, same voice id and settings as
   the base words). Print the exact list and count before running, then run
   it. Expect about 100 clips.
3. Coverage: every approved form label has a ready clip. Listen to *needs*,
   *has*, *going* next to *need*, *have*, *go* in the dev browser: same
   speaker.

## Slice 3 — The form table and its measurement (before any app work)

New build script `scripts/prediction/childes/build_form_table.mjs` →
`data/prediction/form_table.en.json`. Same cleaning as 020 (casual speech
expanded), plus contractions split (*you're* → *you are*, *I'm* → *I am*,
*he's* / *what's* / *it's* … → *X is*).

1. **Lines:** CHILDES train split, **child and caregiver lines** (R11: the
   TalkBank permission covers aggregate counts from both). Caregivers are the
   better grammar model; children say *he want* 14% of the time. It is a
   second shipped table, so before it ships the founder sends TalkBank a
   one-line FYI (`data/prediction/permissions/`). Building and measuring
   locally needs nothing.
2. **Counts:** for every verb use whose form is base, -s or -ing: key =
   (the 1–4 words before it, as spoken, e.g. `he is`; `<s>` for sentence
   start; a wall at any word that isn't a catalog word or one of its forms)
   + the verb; value = counts of each of its present forms. Also a verb-free
   table: (words before) → counts of base / -s / -ing, so a verb with little
   data still gets a form. Drop counts below 2. Aggregate counts only.
3. **The choice (this is `formFor`):**
   1. Longest ending of the words before that has counts for this verb →
      its top form.
   2. Otherwise the verb-free table's longest ending → base / -s / -ing →
      that verb's form of that kind (if it has one).
   3. Otherwise the base form.
   No threshold. The first word of a sentence always shows its base form.
4. **The one allowed change back (decision 4):** a small extra table keyed by
   (words before, verb, the one word after). When she taps a new word, re-run
   the choice for the previous word only, with the new word as its
   following word. If the form changes, update that item's text and
   `labelId` in the bar and in her log row for that tap. Its sound has
   already played; do not replay it. Speak says the updated sentence.
5. **Names.** CHILDES lines are lowercased, but its morphology tier tags
   proper nouns (`n:prop`). If `childes-raw.parquet` carries that tag, count
   every proper noun as one token `<name>`, and in the app treat any entity
   item (her people, pets, shows) as `<name>`. That lets *Daddy needs* and
   *Emma wants* teach *Leo needs*. If the tag isn't there, **stop and
   report**. Don't substitute a rule like "a name is he".
6. **`scripts/prediction/childes/measure_forms.mjs` (the instrument).** Held-out
   test split, adult and child lines reported separately, first word
   excluded. Print: % right for "always base" vs the choice; % right by
   actual form (base / -s / -ing); by number of words before (1…6+); the
   change-back rule's % right on the words it changes; % with and without
   `<name>`. Expected about 81.6% → 93.3% (adults) and 82.0% → 90.3%
   (children). A clearly lower number means stop and report, not tune.

## Slice 4 — Grammar help in the app

1. **`public/shared/forms.mjs`**: `formFor(sentence, senseId)` implementing
   slice 3 item 3 over the shipped `form_table.en.json`, loaded at boot next
   to the phrase table. It must fail loudly if the table is missing (no
   silent fallback to base forms).
2. **Board cells:** after each sentence change, every visible verb cell whose
   sense has forms shows `formFor(...)`: label text and the clip it speaks.
   Same cell, same picture, same size. Use the existing label fitting
   (`fitLabels`) so *getting* fits where *get* did. Nothing moves.
3. **Smart bar tiles:** `stripRanked` is unchanged; each shown verb tile is
   labeled and spoken with `formFor(...)`. After *He is*, the bar
   (post-020 data: *go, a, get, not*) shows **going, a, getting, not**.
4. **Sentence:** a tap appends `{ kind, id, text, labelId }` with the form
   the cell showed. What she saw is what she gets.
5. **Log:** add a nullable `label_id` to `learner_event_log` (new
   `user_version`, migration leaves old rows null) so the log records the
   form she said. Phrase history and the bar keep using sense ids.
6. **Setting "Grammar help"** (On by default) in the same settings sheet as
   *Sentence help*. Off: `formFor` returns the base form everywhere.
7. **Keyboard:** unchanged in this phase (typed forms are 005 slice 4).

## Slice 5 — Founder-reviewed examples

`scripts/prediction/form_examples.json` + `form_examples.mjs`: a fresh
in-memory db, the sentence built through the real tap path, then the form
`formFor` gives the word (and, for the bar row, the real `stripRanked` +
`formFor`). One line per row: before | word | expected | actual | OK/DIFF,
with the counts behind any DIFF.

| Words before | Word | Expected |
| --- | --- | --- |
| he | need | **needs** |
| he | have | **has** |
| she | want | **wants** |
| she | go | **goes** |
| he is | go | **going** |
| he is | get | **getting** |
| I am | go | **going** |
| he wants to | get | get |
| he can | go | go |
| does he | need | need |
| they | need | need |
| I | need | need |
| my mom | like | **likes** |
| entity *Leo* | want | **wants** (if `<name>` exists) |
| (start) | go | go |
| *what do*, then tap *he* | — | sentence reads **what does he** |
| bar after *He is* | — | **going, a, getting, not** |

## Report back with

1. The forms list (count, dropped/unattested list) and the clip counts:
   found in WorkbookBench, generated, and the generated list.
2. `measure_forms.mjs` output.
3. `form_examples.mjs` output, every row.
4. From the real app (`npm run dev:agent`): the home board after *He*
   (which cells changed), the bar after *He is*, and the sentence
   *what do he* → *what does he*. Screenshots.
5. Files changed. Commit per `AGENTS.md`, one commit per slice.

## Out of scope

Past tense and every way to choose it (the Forms key, 005 slice 3); *am /
is / are* as one word; plurals and adjectives; typed forms (005 slice 4);
her own form history (with Grammar help on, her taps follow the shown form,
so there is nothing new to learn yet); JEV.
