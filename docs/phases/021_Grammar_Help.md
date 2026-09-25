# 021 — Grammar Help: every word fits the sentence, from data

**Status:** ready to execute (opened 2026-09-25, scope widened the same day).
Start after `020B_Converter_Fixes.md` is committed: the form table is built
by the same converter, and it must not turn *using* into *us*.
**Truth owner:** what people actually say in CHILDES (child and caregiver
lines), measured on held-out sentences. Not hand-written grammar, not JEV.
**Why this phase exists:** founder tests, 2026-09-25: *She need*, *He have*,
*He is go*, *He is get*. The bar predicted the right meaning, but every word
stayed in one form, and *has* is not even on the board. The founder's goal:
when she taps *he*, the board already says **needs** and **has**. Same cell,
same picture, same meaning; only the word and its sound change.

## Founder decisions (2026-09-25)

1. **The board, the smart bar and the sentence all show the form that fits.**
   After *he*, the *need* cell reads and speaks **needs**. After *he is*, *go*
   reads **going**. After *he wants to*, *get* is **get** again. No tile
   moves; no meaning changes. One word, one form, everywhere.
2. **What changes in this phase:**
   - **Verbs:** base, -s, -ing, for every verb including the action verbs
     (*he is **jumping***, *she **rides***), two-word verbs (*he **wakes**
     up*), and words people use as verbs that the catalog files as
     something else (*my tummy **hurts***, *it is **raining***).
   - ***have / has***, ***don't / doesn't***, ***am / is / are / be***.
   - **People words:** *he / him*, *she / her*, *we / us*, *they / them*.
   - ***a / an***.
   Not in this phase: past tense, plurals, *I / me / my* and *you / your*
   (already separate cells on the board), *his / our / their* (she picks
   those herself), *bigger / biggest*.
3. **No grammar rules and no JEV.** The data picks the form (measured below).
4. **A word already in the sentence keeps its form, with one exception:**
   the word right before the new tap may change when the new word decides
   it. *what do* + *he* → *what **does** he*; *where is* + *you* → *where
   **are** you*; *I want a* + *apple* → *I want **an** apple*. Only that
   one word, and only its form.
5. **Setting: "Grammar help"**, on by default. Supporter-facing line:
   *"Words change to fit the sentence: he needs, they are going, an apple."*
   Off = every word shows its default form, exactly today's board.
6. **Missing voice clips are authorized.** WorkbookBench first, then
   generate what is missing (slice 2).

These replace, for everything in item 2, three decisions in
`005_Word_Forms.md`: "the button always shows the lemma", "suggest, never
auto-replace", and slice 3's hand-written `rankForms` rules (017 R14; the
`GRAMMAR` table was deleted in `4627601`).

## Why this is right for her

- **The child** taps what she sees and hears exactly that word. Nothing
  moves, no picture changes, nothing extra to learn. Only one word can
  change after she taps it (decision 4): the word right before, and only
  its form (*a* → *an*), never its meaning.
- **The parent** hears sentences that sound right to other people: *he
  doesn't want it*, *can you help him*, *I want an apple*.
- **The SLP** gets correct grammar modeled on every tap, which is how
  children learn endings: they see and hear the right form in their own
  sentence. For a child whose goal is producing *-s* herself, the SLP turns
  Grammar help off.
- **Wrong forms still happen**, roughly 1 in 10 to 1 in 15 depending on the
  word. That is far fewer than today, where every *he need* and *give it
  to he* is wrong. Backspace removes a word; the setting turns it all off.

## Measured (held-out CHILDES, 2026-09-25)

The form was picked from the words around it and compared with what the
speaker actually said. The first word of a line is skipped (its form never
changes).

| What changes | Today | Data picks | Uses |
| --- | --- | --- | --- |
| Verbs, adults (base / -s / -ing) | 81.6% right | **93.3%** | 446,748 |
| Verbs, children | 82.0% | **90.3%** | 134,265 |
| *am / is / are*, adults (today: always *is*) | 70.8% | **92.6%** | 171,299 |
| *am / is / are*, children | 72.7% | **96.4%** | 50,300 |
| *he/she/we/they* vs *him/her/us/them*, adults | 74.6% | **91.6%** | 99,818 |
| same, children | 69.9% | **88.9%** | 23,480 |
| *a* vs *an*, learned from caregivers (next word decides) | 96.2% | **99.3%** | 40,058 |

Long sentences are not harder: verbs stay at 92–96% right whether 1 or 6+
words come before, because the form depends on the last 1–3 words. A
version that only changed a form when 80%+ sure scored slightly lower, so
there is no threshold: the data's top form wins.

*a / an* must be learned from caregiver lines only: children often say *a
apple*, and learning from them scored 96.7%, below today.

What's left in the ~7%: questions where the subject comes after the verb
(*what does he*), covered by decision 4; names (*Leo needs*), slice 3 item
5; and rare subjects the data barely saw, where the default form shows as
today.

---

## The design in one page

- **A tile is a meaning; the words around it pick its form.** Prediction
  stays on meanings (`stripRanked`, sense ids, the 5% cutoff), so her
  grammar mistakes never break the bar.
- **One function decides the form** for any word that has forms:
  `formFor(sentence, senseId)` in `public/shared/forms.mjs`. Board cells,
  bar tiles and the sentence all call it. Nothing else picks a form.
- **When it runs:** after every change to the sentence (tap, backspace,
  clear), before the next paint. The one allowed change after a tap is
  decision 4.
- **What a form is:** a catalog label of kind `form` with its own utterance
  and clip (005 slice 1's schema). A sentence item carries `{ kind, id,
  text, labelId }` and speaks its label's clip.

---

## Slice 1 — Forms in the catalog

Use 005 slice 1's schema exactly: `label.kind` gains `'form'`, a `features`
column, the two indexes, a `user_version` bump, and the schema-doc DDL in
the same commit. Changes from 005 slice 1:

1. **Which words get verb forms is decided by use, not by the catalog tag.**
   - Every catalog Verb sense (104 today, all the action verbs included).
   - Plus any catalog word people clearly use as a verb: after 020B, count
     its *-ing* form right after *am/is/are* and its *-s* form right after
     *he/she/it*. A word seen both ways at least 20 times gets verb forms.
     This must pick up ***hurt*** (on the home board, filed as an
     adjective); expect *rain*, *snow*, *clean* too. Report the list with
     counts.
   - Words that never take *-s* / *-ing* (*can, will, would, can't,
     won't…*) get none. Decide it from the data: no attested form, no form.
2. **Spelling comes from the data.** A word's *-s* and *-ing* spelling is
   the most common CHILDES spelling that the (020B-fixed) converter maps
   back to it: *getting*, *running*, *forgetting*, *gluing*, *cries*,
   *carries*, *has*, *does*, *goes*. Simple spelling rules get 16 of these
   wrong. Rules are only a fallback for a word the data never shows; list
   those. No OpenRouter oracle.
3. **Two-word verbs change their first word:** *wakes up*, *waking up*,
   *cleans up*, *cleaning up*.
4. **One meaning, several forms: merge these.** For each row, the kept sense
   keeps its cell and its default label. The merged senses' cells stay
   where they are; tapping one adds the kept sense with that form fixed
   (she chose that form). Her logged taps of a merged sense count as the
   kept sense wherever history is read. No rewrite of her log.

   | Kept sense (default label) | Its forms | Merged senses (cells stay) |
   | --- | --- | --- |
   | *have* `sns_0080` | has | *has* `sns_0612` |
   | *is* `sns_0607` (stays **is**: 58–72% of sentences starting with this word start with *is*) | am, are, be | *am* `sns_0609`, *are* `sns_0608` |
   | *don't* `sns_0605` | doesn't (new word, needs a clip) | — |
   | *he* `sns_0006` | him | *him* `sns_0629` |
   | *she* `sns_0007` | her (object and possessive: same word) | *her* `sns_0630` |
   | *we* `sns_0009` | us | *us* `sns_0631` |
   | *they* `sns_0010` | them | *them* `sns_0632` |
   | *a* `sns_0619` | an | *an* `sns_0620` |

   `features`: the UniMorph tag where one exists (`V;PRS;3;SG`,
   `V;V.PTCP;PRS`, `V;PRS;1;SG`, `V;NFIN`, `PRO;ACC`…). *an* has no
   UniMorph tag; use `DET;PHON` (chosen by sound).
5. **Fold the same way in the children's phrase table.** Rebuild
   `phrase_table.en.json` with every merge above, so prediction runs on
   meanings. Rerun `bar_examples.mjs` and `measure_bar.mjs`: rows naming a
   merged word must show the same words through `formFor` (*I* → **am**,
   want, have, don't). If "next word on bar" drops, stop and report before
   going on.

*did*, *had*, *was*, *were*, *his*, *our*, *their*, *your*, *me*, *my* stay
as they are.

Show: the forms added (count per word), the words that got verb forms by
use (with counts), the rule-fallback spellings, `npm run
catalog:build:check` green.

## Slice 2 — Voice clips

Pipeline already in the repo: `scripts/catalog/import_wbb_audio.mjs` →
`materialize_audio.mjs` → `generate_missing_audio.mjs`. Key form utterances
by utterance id (005 slice 2 item 1).

1. **WorkbookBench first.** Repo `/Users/mike/Documents/GitHub/WorkbookBench`
   (manifest `assets/catalog/manifest.json`, clips in R2 bucket
   `workbookbench-catalog`). A 2026-09-25 check found about 80 of ~190 verb
   forms there: most *-ing* forms exist, most *-s* forms (*needs, likes,
   makes, comes*) do not.
2. **Generate the rest: authorized (founder, 2026-09-25).**
   `generate_missing_audio.mjs` (ElevenLabs, same voice id and settings as
   the base words). Expect about 100 verb forms plus *be*, *doesn't*, the
   two-word verb forms and the verb-by-use forms (*hurts*, *hurting*,
   *raining*…). *am, are, has, him, her, us, them, an* already have clips.
   Print the list and count, then run it.
3. Coverage: every approved form label has a ready clip. Listen to
   *needs, has, going, be, doesn't, him, an* next to their default words in
   the dev browser: same speaker.

## Slice 3 — The form table and its measurement (before any app work)

New build script `scripts/prediction/childes/build_form_table.mjs` →
`data/prediction/form_table.en.json`, on the 020B-cleaned text, with
contractions split (*you're* → *you are*, *I'm* → *I am*, *he's* / *what's*
/ *it's* … → *X is*).

1. **Lines:** CHILDES train split, child and caregiver lines (R11: the
   TalkBank permission covers aggregate counts from both). *a / an* uses
   caregiver lines only (measured above). It is a second shipped table, so
   before it ships the founder sends TalkBank a one-line FYI
   (`data/prediction/permissions/`). Building and measuring locally needs
   nothing.
2. **Counts, keyed on the words before** (1–4 words as spoken, e.g. `he
   is`; `<s>` at sentence start; a wall at any word that is not a catalog
   word or one of its forms) plus the word; value = counts of each of its
   forms. Verbs: base / -s / -ing only (past forms never take part: tense
   is her meaning). Also a verb-free table (words before → base / -s /
   -ing) so a verb with little data still gets a form. *is*, the people
   words and *don't* have plenty of data and use their own counts only.
   Drop counts below 2. Aggregate counts only.
3. **The choice (`formFor`):** the longest ending of the words before that
   has counts for this word → its top form; otherwise, for verbs, the
   verb-free table's longest ending → that kind of form; otherwise the
   default form. No threshold. The first word of a sentence shows its
   default form.
4. **Decided by the next word (decision 4).** Two small tables keyed on the
   word after: (words before, verb, next word) for verb forms (*what do* →
   *does* when *he* follows), and (next word) → *a* / *an* from caregiver
   lines. When she taps a word, re-run the choice for the previous word
   only. If its form changes, update that item's text and `labelId` in the
   bar and in her log row for that tap. Its sound already played; do not
   replay it. Speak says the updated sentence.
5. **Names.** CHILDES lines are lowercased, but the morphology tier tags
   proper nouns (`n:prop`). If `childes-raw.parquet` carries that tag, count
   every proper noun as one token `<name>`, and treat any entity item (her
   people, pets, shows) as `<name>`, so *Daddy needs* teaches *Leo needs*.
   If the tag isn't there, stop and report. Don't substitute "a name is he".
6. **`scripts/prediction/childes/measure_forms.mjs` (the instrument).**
   Held-out test split; adult and child lines reported separately; first
   word excluded. One block per row of the Measured table (verbs, *am / is /
   are / be*, people words, *a / an*), each "today" vs "data picks", plus:
   verbs by actual form and by words before (1…6+); the verbs-by-use words
   (*hurt*, *rain*…); *be*; the next-word rule's % right on the words it
   changes; with and without `<name>`. Expect the Measured table's numbers.
   A clearly lower number means stop and report, not tune.

## Slice 4 — Grammar help in the app

1. **`public/shared/forms.mjs`**: `formFor(sentence, senseId)` over the
   shipped `form_table.en.json`, loaded at boot next to the phrase table.
   Fails loudly if the table is missing (no silent fallback).
2. **Board cells:** after each sentence change, every visible cell whose
   sense has forms shows `formFor(...)`: label and the clip it speaks. Same
   cell, same picture, same size; `fitLabels` handles *getting* where *get*
   was. Nothing moves.
3. **Smart bar tiles:** `stripRanked` unchanged; each shown tile is labeled
   and spoken with `formFor(...)`. After *He is* the bar shows **going, a,
   getting, not**.
4. **Sentence:** a tap appends `{ kind, id, text, labelId }` with the form
   the cell showed. The next-word rule (slice 3 item 4) may then update only
   the item before it.
5. **Log:** add a nullable `label_id` to `learner_event_log` (new
   `user_version`, old rows stay null) so the log records the form she said.
   Phrase history and the bar keep using sense ids.
6. **Setting "Grammar help"** (on by default), in the settings sheet next to
   *Sentence help*. Off: `formFor` returns each word's default form, and the
   next-word rule does nothing: today's board exactly.
7. **Keyboard:** unchanged (typed forms are 005 slice 4).

## Slice 5 — Founder-reviewed examples

`scripts/prediction/form_examples.json` + `form_examples.mjs`: a fresh
in-memory db, the sentence built through the real tap path, then what
`formFor` (and, for bar rows, `stripRanked` + `formFor`) gives. One line
per row: before | word | expected | actual | OK/DIFF, with the counts
behind any DIFF.

| Words before | Word tapped / cell | Expected |
| --- | --- | --- |
| he | need | **needs** |
| he | have | **has** |
| she | want | **wants** |
| she | go | **goes** |
| he | run | **runs** |
| she | cry | **cries** |
| he | carry | **carries** |
| he is | go | **going** |
| he is | get | **getting** |
| he is | jump | **jumping** |
| she is | ride | **riding** |
| I am | swim | **swimming** |
| I am | go | **going** |
| he | wake up | **wakes up** |
| I am | clean up | **cleaning up** |
| my tummy | hurt | **hurts** |
| it is | hurt | **hurting** |
| it is | rain | **raining** |
| he wants to | get | get |
| he can | go | go |
| does he | need | need |
| they | need | need |
| I | need | need |
| my mom | like | **likes** |
| entity *Leo* | want | **wants** (if `<name>` exists) |
| (start) | go | go |
| he | don't | **doesn't** |
| I | don't | don't |
| I | is (cell) | **am** |
| he | is (cell) | **is** |
| they / we / you | is (cell) | **are** |
| they are | go | **going** |
| I want to | is (cell) | **be** |
| he will | is (cell) | **be** |
| (start) | is (cell) | is |
| I like | he | **him** |
| give it to | she | **her** |
| can you help | we | **us** |
| I see | they | **them** |
| (start) | he | he |
| *what do*, then tap *he* | — | sentence reads **what does he** |
| *where is*, then tap *you* | — | sentence reads **where are you** |
| *I want a*, then tap *apple* | — | sentence reads **I want an apple** |
| *I want a*, then tap *ball* | — | sentence reads **I want a ball** |
| bar after *I* | — | **am**, want, have, don't |
| bar after *He is* | — | **going, a, getting, not** |

## Report back with

1. Slice 1's lists (forms added, verbs by use, fallback spellings) and the
   clip counts: found in WorkbookBench, generated, with the generated list.
2. `measure_forms.mjs` output, every block.
3. `form_examples.mjs` output, every row.
4. From the real app (`npm run dev:agent`), screenshots:
   - the home board after *He*, *I* and *They* (which cells changed; the
     *is* cell must read *is*, *am*, *are*);
   - the board after *I like* (the *he* cell reads *him*);
   - the bar after *He is*;
   - the sentences *what do he* → *what does he*, *where is you* → *where
     are you*, *I want a apple* → *I want an apple*.
5. Files changed. Commit per `AGENTS.md`, one commit per slice.

## Out of scope

Past tense and every way to choose it (*was / were*, *went*, the Forms key,
005 slice 3); plurals; *I / me / my*, *you / your*, *his / our / their*;
comparatives; contractions as tiles (*I'm*, *he's*); typed forms (005 slice
4); her own form history (with Grammar help on, her taps follow the shown
form, so there is nothing new to learn yet); JEV.
