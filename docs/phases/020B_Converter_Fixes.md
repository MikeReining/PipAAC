# 020B — Converter Fixes: read CHILDES the way it was written

**Status:** ready to execute (opened 2026-09-25). One slice. Follow-up to
`020_Prediction_Data_Fix.md` (done, `b57f600`). Do this before
`021_Grammar_Help.md`: its form table is built by the same converter, and a
converter that turns *using* into *us* would teach forms to the wrong words.
**Truth owner:** what people actually said in CHILDES. The converter
(`scripts/prediction/childes/prep.py` → `transcripts.jsonl` →
`common.mjs` `lemmatize` / `toLemma`) must not change a word into a
different word.
**Why this phase exists:** reviewing 020 turned up four more ways the
converter rewrites what children said. Counted on child lines after 020:

| Problem | Child-line words | Worst examples |
| --- | --- | --- |
| A single word is mapped to a two-word tile | **36,530** | *way* → "no way" 6,058 · *fire* → "fire truck" 3,054 · *room* → "living room" 2,001 · *chocolate* → "chocolate milk" 1,880 · *game* → "board game" 1,626 · *ice* → "ice cream" 1,560 · *guess* → "guess my word" 1,094 · *police* → "police car" 861 · *set* → "swing set" 663 |
| An ending is stripped onto a pronoun, number or other small word | **5,423** | *ones* → one 2,981 · *its* → it 702 · *using* → us 199 · *shed* → she 194 · *hers* → her 105 · *wing* → we 93 · *notes* → not 38 · *pleased* → please 37 |
| Every *-ies* / *-ied* word is dropped | **2,808** | *babies* 948 · *strawberries* 484 · *cried* 258 · *cries* 231 · *butterflies* 143 · *dried* 119 · *bunnies* 101 · *puppies* 100 |
| Every CHAT correction is doubled (`goed [: went]` → "goed went") | not yet counted | 020 found it for casual speech (`gonna going to`, 14,386 times) and worked around it for those words only |

Each of these puts wrong words into the phrase table the bar runs on today
(a child who said *that way* taught the bar *that no way*).

## Rules for this work

- Fix the source, then regenerate. `transcripts.jsonl` and the phrase table
  are derived; no patching of their output.
- Fix each problem as a rule of how the converter reads text, not as a list
  of words. The only word list allowed is item 3's aliases, which are
  meanings the catalog should own.
- Proof is counts and bars, not new unit tests.

## 1. `prep.py`: read CHAT markup instead of keeping all of it

`parse_transcript` splits on spaces and strips punctuation, so CHAT codes
leak in as words. `wanna [: want to]` becomes *wanna want to*, and
`goed [: went]` becomes *goed went*.

1. **Census first.** Before changing anything, print the markup patterns in
   the raw parquet text with counts: `[: …]` corrections, `[/]` / `[//]`
   repetitions and restarts, `[* …]` error codes, `&-uh` / `&=laughs`
   fillers and events, `xxx` / `yyy` / `www`, `0word` omitted words, and
   `word@x` special forms. Keep the census as the first lines of the report.
2. **Rules** (as the census confirms each exists):
   - `word [: standard]` → keep **only the standard form**. It is what the
     child meant, and it matches the catalog (*went*, *rabbit*, *want to*).
   - `[/]` and `[//]`: keep what the child said after restarting, and drop
     the part they repeated or abandoned (*I want [/] I want cookie* → *I
     want cookie*). Doubled phrases teach the bar false *want → I*.
   - `[* …]`, `&=event`, `&-uh`-type fillers: drop them and join the words
     around them (*I &-um want* → *I want*).
   - `xxx` / `yyy` / `www`: a wall (unknown word), as today.
   - `0word` (a word the child left out): drop it. We count what was said.
   - `word@x`: a wall.
3. Regenerate `transcripts.jsonl` (needs `pandas` + `pyarrow` locally; the
   file stays gitignored, R11).
4. In `common.mjs`, delete the echo-consuming code in `lemmatize` once the
   echo is gone at the source. Keep `CASUAL` for reductions the transcriber
   did not mark.

## 2. `toLemma`: fix the *-ies* / *-ied* bug

`candForms` builds the *-ies* candidate as `base.slice(0, -2) + 'y'`, so
*cries* becomes *criy*. It should be `slice(0, -3) + 'y'`. Add the same for
*-ied* (*cried* → *cry*, *dried* → *dry*). This recovers the 2,808 words
above.

## 3. No automatic "piece of a two-word tile"

Today any single word that is part of a two-word tile maps to that tile
(the `surface` loop over `MULTIWORD` pieces). That is right for a few words
and wrong for most (*way*, *fire*, *room*, *chocolate*, *game*, *ice*,
*guess*, *police*, *set*…).

1. Delete the automatic piece mapping. A word that is not a catalog word, a
   catalog alias, or a form of one is a wall. A wall is honest data.
2. Keep the handful where the single word **means** the tile, as explicit
   aliases next to the existing ones (*mommy* → mom): *done* → all done,
   *thank* and *thanks* → thank you, *excuse* → excuse me, *wake* → wake up.
   These are the only additions.
3. Multi-word matching of the whole phrase (*ice cream*, *living room*)
   stays exactly as it is.

## 4. Endings never land on a small closed word

`candForms` strips *-s*, *-es*, *-ing*, *-ed* and accepts whatever catalog
word is left. Rule: a stripped form may only land on a **noun, verb or
adjective** (catalog `part_of_speech`). It never lands on a pronoun,
determiner, number, preposition, conjunction, adverb or interjection. That
fixes *ones*, *its*, *using*, *shed*, *hers*, *wing*, *notes*, *pleased* and
the rest at once, and replaces 020's single-word patch (`used: null`).

## 5. Rebuild and look

1. After items 1–4, print a **mapping census**: every CHILDES word (child
   lines, 20+ times) whose converted catalog word differs from its
   spelling, with counts, sorted by count. Read the top 200. Any false
   mapping you see means a rule is still wrong, so fix the rule and
   rerun. Report the top 50 lines.
2. Rebuild `phrase_table.en.json` (bump the version).
3. `measure_bar.mjs` before and after (both tables).
4. `bar_examples.mjs`: every row. For each changed row, print counts,
   `seen` and share at the chosen ending, and say which item caused it.

## Report back with

The markup census; the mapping census (top 50); measure_bar before/after;
bar_examples output with explanations; table version and size; files
changed. Commit per `AGENTS.md`.
