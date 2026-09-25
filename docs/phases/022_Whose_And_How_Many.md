# 022 — Whose and How Many: her words carry the meaning

**Status:** decided, queued (opened 2026-09-25). Start after
phase 021 (in git history) is done: this phase reuses its forms schema,
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
   so (*it's not mine*). What the word already wears competes: a worn
   *her* stays *her* (ACC out-evidences *hers* 16.7k:201), a bare *you*
   stays *you*. *mine* is a catalog word (`sns_0005`, on `grid90`);
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
   **Done (slice 1+2 commit).** What landed:
   - `common.mjs`: `'s` on a noun stem is disambiguated by the next word
     (noun-next or line-end → `poss` token on the stem lemma; else → `is`).
     MERGES gained his/our/their/your/mine/hers/ours/theirs and the
     feet/men/women irregulars.
   - `en.json` (caregiver-spelling pass): forms for 021 + 022 —
     +4 PRO;POSS (his/our/their/your), +5 PRO;POSS;ABS
     (mine/hers/ours/theirs/yours), 60 measured N;POSS, 129 measured
     N;PL (spellings incl. babies, feet, knives — never sheeps/milks).
   - `form_table.en.json` (.2): `possNext` rows keyed `sense|N|EOS|X`
     plus per-word `sense|x|next` rows for non-noun nexts ("your turn").
     Multiword tiles with a possessive head still count ("your turn"
     shows 'your' before 'turn').
   - `pickForm`: whose-picks after a/an, before next-verb. At EOS the
     worn feature fights the whose-lift — candidates are the current
     form plus the possessive class and the data decides ("not you"
     stays you on BASE 73k; worn "your" lifts to yours 2806:1099; worn
     "her" holds ACC 16.7k > ABS 201; "not my" lifts to mine). A BASE
     tap of *you* can no longer flip to *yours*.
   - **catalog.json NOT rebuilt yet:** 300 new surfaces need clips and
     the strict build guard (rightly) refuses unclipped utt_f rows —
     slice 3's founder-approved generation unblocks it. `utt_f`/`lbl_f`
     ids are now stable by text (adding rows no longer renumbers clips).
   - **Data findings to flag:** (a) `you + turn` stays *you turn* —
     corpus: "you turn (around)" 1306 vs "your turn" 825 — the doc's
     example row does not hold up. (b) `two sheep`, `some milk`,
     `a foot` all stay singular — countability by evidence works.
2. **Measure first:** extend `measure_forms.mjs` with one block per item
   above, "today" vs "data picks", adult and child lines separately. Stop
   and report any block that is right less often than today. That item
   doesn't ship.
   **Done — every block beats today, none stopped** (final run, after
   the caregiver-spelling pass and the EOS-competition rule):
   ```
   whose pronoun + noun    today  3.9/8.2%   data 93.4/87.5%
   whose X's noun + noun   today 59.2/73.0%  data 79.5/80.6%
   whose at EOS (pronouns) today 76.4/53.5%  data 95.7/94.3%
   whose at EOS: my->mine  today 24.4/26.8%  data 75.6/73.2%
   how many (plurals)      today 73.7/79.1%  data 85.3/86.8%
   ```
   (adults/children). Existing blocks unchanged-to-slightly-better
   (is-sense 94.8/96.0, pronouns 92.4/91.5, don't 95.0/94.0, decision-4
   96.7%). The EOS competition lifted the pronoun-EOS block ~20 points —
   "that's her" positions hold ACC instead of over-lifting to *hers*.
3. **Clips — ON HOLD, no ElevenLabs (CTO ruling 2026-09-26).** All audio
   is moving to Grok Ara; the catalog is being re-made in Ara by another
   developer. Every form surface — the 181 021 clips, the 60 WBB clips,
   and the misses — is old voice and gets re-made in that one pass.
   `forms_audio.mjs` keeps the census: it builds the catalog in memory,
   resolves what exists, and writes the needed/missing word-form list
   (021 + 022) into `data/catalog/forms_audio.json` — that list is the
   handoff to the Ara re-make. The shipped catalog.json stays blocked on
   clips by design and ships together with the Ara clips.
   **Census after the caregiver ruling:** `james` is walled at the
   lemmatizer (1,476 name tokens were minting "james" as jam's plural
   and winning `jam|X` -> N;PL); clips bind (id, surface) — the census
   caught 53 plan entries reminted onto different surfaces, which would
   have played the wrong word.
   **Caregiver spellings (CTO ruling):** plural and possessive surfaces
   count on grown-up lines only (CHI + sibling tags excluded). The
   plural surface is what adults put after quantity words — a bare-lemma
   winner (two sheep, some milk, two fish) means no distinct plural;
   attributive nouns are skipped (two baby dolls quantifies dolls).
   Removes sheeps/milks/knifes/tummys/buss/peoples and ~90 more rows;
   spelling comes from grown-ups overall (knives, grandmas, babies).
   **Census now:** 378 form utterances — 233 covered, **145 uncovered**,
   the Ara handoff list. Flagged-but-kept adult spellings: `mummys`
   (corpus spells it 103:88 over *mummies*), `today's`, `thing's`,
   `sheep's`, `people's` — all genuinely possessive on grown-up lines
   ("today's lunch"; "today's the day" correctly stays *is*).
4. **App:** `formFor` and the next-word rule gain the new forms; Speak
   applies the end-of-sentence case once, before speaking.
   **Done.** `speakSentence` re-picks the last word with EOS (merged
   tiles too — a tapped *your* lifts to *yours*; items carry `features`
   so the worn form competes). Entity + noun wears `'s` in strip text
   only (*Leo's car* — speech still says the name). `resolveSlot` speaks
   the re-picked `labelId`, so the Ara clip lands automatically.
5. **Examples** in `form_examples.json` — **done, 70/70.** Founder
   table plus the measured corrections:

   | She taps | Sentence reads |
   | --- | --- |
   | he, dog | **his dog** |
   | we, car | **our car** |
   | you, turn | **you turning** (corpus: ING 69:4; *your turn* loses 825:1306) |
   | entity *Leo*, car | **Leo's car** |
   | entity *Mama*→mom, car | **Mama's car** |
   | mom, phone | **Mom's phone** |
   | it, is, not, my, then Speak | **it is not mine** |
   | it, is, not, your, then Speak | **it is not yours** |
   | that, is, her, then Speak | **that is her** (ACC 16.7k > ABS 201) |
   | two, dog | **two dogs** |
   | two, knife | **two knife** (line-start bare fragments win) |
   | two, baby | **two baby** (line-start "two baby" 22:14 — fragments + "two baby dolls" attributives) |
   | some, cookie | **some cookies** |
   | some, milk | **some milk** |
   | I, want, cookie | I want cookie (no signal, no change) |
   | I, cookie | I cookie (never *my cookie*) |

   **Flag for review:** *two knife/baby* stay bare because utterance-
   initial "two X" productions are mostly child fragments and
   attributives — the same anchored-position rule approved in 021. If
   grammar help should override position evidence for plurals, that's a
   separate ruling.

## Report back with

`measure_forms.mjs` blocks, `form_examples.mjs` output, the clip list and
counts, screenshots of *his dog*, *Leo's car*, *two dogs*, *not mine* in
the real app. Commit per `AGENTS.md`.

## Out of scope

Past and future (backlog: `docs/backlog/Time_Buttons.md`); *it's his*
standalone when no word signals it; *I* → *my*; comparatives.
