# 022 — Whose and How Many: her words carry the meaning

**Status:** decided, queued (opened 2026-09-25). Start after
`021_Grammar_Help.md` is done: this phase reuses its forms schema,
`formFor`, the next-word rule, the `label_id` log and the "Grammar help"
setting. Nothing new to invent; only new forms and new counts.
**Truth owner:** what people actually say in CHILDES, measured on held-out
sentences. No grammar rules, no JEV.
**Why this phase exists:** 021 fixes *agreement*: the other words already
decide the form (*he* → *needs*). *Whose* and *how many* are her
*meaning*: only she knows. But she usually says it with a word she already
has: *he* + *dog* means *his dog*; *two* + *dog* means *two dogs*;
*Leo* + *car* means *Leo's car*. Grammar help can carry that word to the
right form. Proloquo2Go makes the child find *his* or *dogs* in a list;
here she taps the words she already knows and hears the sentence right.

## What the data says (CHILDES child lines, 2026-09-25)

| Meaning | Evidence |
| --- | --- |
| Whose: *his* | Right before a noun at least **56%** of the time (*his dog*); alone at the end (*it's his*) only **3%**. |
| Whose: *mine* | 5,820 uses (*it's mine*, *not mine*). |
| Whose: names | *mommy's / daddy's*-type words 3,359 times, before counting every other name. |
| How many | **19%** of plural nouns follow a quantity word she would tap (*two, some, all, more, these…*). Only **3%** of singular nouns do. |

So the words before or after already decide a large share. What they don't
decide (*I want cookies* with no number, *it's his* on its own) stays as she
tapped it. Nothing is guessed.

## Founder decisions (2026-09-25)

1. A separate phase from 021, same mechanism: the words around a tile pick
   its form, and the data decides which words do.
2. Everything runs under the existing **Grammar help** setting. Off = no
   change.

## What changes

1. **Whose, decided by the next word** (021's next-word rule, like *a* →
   *an*). When she taps a noun right after a people word, that people word
   changes:
   - *he* + *dog* → **his dog**; *we* + *car* → **our car**; *they* +
     *house* → **their house**; *you* + *turn* → **your turn**. *she* +
     *dog* → *her dog* already works (021 made *her* a form of *she*).
   - *his*, *our*, *their*, *your* become forms of *he*, *we*, *they*,
     *you* (same merge pattern as 021 slice 1 item 4; their Little Words
     cells stay and tap as that exact form).
   - **Not** *I* + noun → *my*: *I* and *my* are both home-board cells, and
     children often say *I cookie* to mean *I want cookie*. Leave it.
2. **Names and people nouns + a noun → possessive.** *Leo* + *car* →
   **Leo's car**; *mom* + *phone* → **Mom's phone**. Entities already speak
   through the device voice, so *Leo's* is text only. For catalog people
   nouns (*mom*, *dad*, *grandma*…), which ones take *'s* comes from the data
   (the counts), and each needs a clip.
3. **Mine / yours at the end: Speak counts as the next word.** A
   *my / your / her / our / their* that ends the sentence becomes **mine /
   yours / hers / ours / theirs** when she presses Speak, if the data says
   so (*it's not mine*). *mine* is a catalog word (`sns_0005`, on `grid90`);
   *yours* is too (`sns_0679`). The others are new forms with clips.
4. **How many, decided by the words before** (like 021 verbs). After *two,
   some, all, more, these, those…*, noun cells and bar tiles show the
   plural (*two* → **dogs**, **cookies**). Which words trigger it and which
   nouns take a plural come from the counts, so *some* + *milk* stays
   **milk** without a countability model. This replaces 005 slice 1's
   countability classification for the nouns it covers.
   - Plural forms are catalog `form` labels (`N;PL`), spelled the way
     CHILDES spells them (*babies*, *feet*, *children*).
   - The phrase table folds plurals into their noun (prediction stays on
     meanings; 020B already maps *babies* → *baby*).

## Slices

1. **Forms and counts.** Add the forms above; extend
   `build_form_table.mjs` with: (people word, next word) → possessive counts
   (including "end of sentence" for *mine*); (words before, noun) → singular
   / plural counts.
2. **Measure first:** extend `measure_forms.mjs` with one block per item
   above, "today" vs "data picks", adult and child lines separately. Stop
   and report any block that is right less often than today. That item
   doesn't ship.
3. **Clips.** WorkbookBench first. Plurals are the big one (a few hundred
   nouns). Print the missing list and count; the founder OKs the generation
   run before it goes.
4. **App:** `formFor` and the next-word rule gain the new forms; Speak
   applies the end-of-sentence case once, before speaking.
5. **Examples** in `form_examples.json`:

   | She taps | Sentence reads |
   | --- | --- |
   | he, dog | **his dog** |
   | we, car | **our car** |
   | you, turn | **your turn** |
   | entity *Leo*, car | **Leo's car** |
   | mom, phone | **Mom's phone** |
   | it, is, not, my, then Speak | **it is not mine** |
   | two, dog | **two dogs** |
   | some, cookie | **some cookies** |
   | some, milk | **some milk** |
   | I, want, cookie | I want cookie (no signal, no change) |
   | I, cookie | I cookie (never *my cookie*) |

## Report back with

`measure_forms.mjs` blocks, `form_examples.mjs` output, the clip list and
counts, screenshots of *his dog*, *Leo's car*, *two dogs*, *not mine* in
the real app. Commit per `AGENTS.md`.

## Out of scope

Past and future (backlog: `docs/backlog/Time_Buttons.md`); *it's his*
standalone when no word signals it; *I* → *my*; comparatives.
