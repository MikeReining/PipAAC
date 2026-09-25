# 020 — Prediction Data Fix: casual speech in CHILDES

**Status:** done (2026-09-25). `wanna`/`gonna`/`hafta`-class reductions now
expand to their standard forms at `lemmatize` (`CASUAL` in `common.mjs`),
consuming the transcriber's `[: ...]` echo when present. Table rebuilt as
`phrase-table.2026-09-25.1`. Held-out on-bar at 5%: 24.2% → 25.4%.
**Truth owner:** what children actually said in CHILDES, not our converter's
reading of it.
**Why this phase exists:** founder test, 2026-09-25: after *He have* the bar
shows only **a**. *He has to* is one of the most common things children say,
so where is **to**?

## Rules for this work

- Implement, then prove it with the scripts below. No new unit tests. We are
  still iterating; the proof is looking at real bars and one measurement.
- Change the data, not the rule. Do not touch `stripRanked`, the 5% cutoff, or
  the ending rule.
- No word rules in the app. The list below is how CHILDES *spells* speech, not
  a rule about language, and it only runs at table build time.

## What is broken

CHILDES transcribers write casual speech the way it sounds: *wanna*, *gonna*,
*hafta*. Our converter (`scripts/prediction/childes/common.mjs`, `lemmatize` →
`toLemma`) either drops these words or turns them into the wrong word. Counted
on all child lines (2.1 M):

| Written as | Times | Our converter today | What goes wrong |
| --- | --- | --- | --- |
| wanna | 19,688 | `want` (drops *to*) | after *want*, **to** is 9% instead of 45% |
| gonna | 15,762 | `go` (drops *to*) | *I gonna go* becomes *I go go*: ~3,000 fake *go go* |
| hafta | 8,221 | dropped (a wall) | *have to* missing |
| gotta | 2,749 | dropped | *got to* missing |
| needta | 1,497 | dropped | *need to* missing |
| hadta | 901 | dropped | *had to* missing |
| hasta | 811 | dropped | *he has to* never appears; the founder's bug |
| sposta | 517 | dropped | |
| dunno | 432 | dropped | |
| gimme | 390 | `give` (drops *me*) | |
| lemme | 372 | dropped | |
| lookit | 101 | dropped | |

About 53,000 words in children's lines. It hurts the most common phrases in
AAC (*I want to*, *I need to*, *I have to*).

## The fix

1. **Prefer the transcriber's own standard form.** CHAT marks these as
   `wanna [: want to]`. Check whether `data/prediction/childes/childes-raw.parquet`
   (or the source behind `transcripts.jsonl`) carries that standard form or a
   gloss. If it does, use it for every such word, not only the list above.
2. **Otherwise expand before lemmatizing,** in one exported map in `common.mjs`
   used by every CHILDES script (build, measure, examples):

   | written | expand to |
   | --- | --- |
   | gonna | going to |
   | wanna | want to |
   | hafta | have to |
   | hasta | has to |
   | hadta | had to |
   | gotta | got to |
   | needta | need to |
   | sposta | supposed to |
   | oughta | ought to |
   | gimme | give me |
   | lemme | let me |
   | dunno | don't know |
   | lookit | look at |

   Before you finalize, list every other CHILDES child-line token that
   `toLemma` maps to `null` and that occurs 100+ times, and add any that is
   clearly a spelled-out reduction (e.g. `whatcha`, `gotcha`, `kinda`,
   `sorta`, `outta`, `lotta`). Report that list with counts either way.
3. Rebuild `data/prediction/phrase_table.en.json` (bump the version). Same wall
   rule, `seen`, CTX_MAX 6, MIN_COUNT 2 as today.

Do **not** merge *has* into *have* here. *has* is its own catalog word today
(sense `sns_0612`, in the Little Words group). That merge belongs to
`021_Grammar_Help.md`, where *has* becomes the -s form of *have*.

## Expected bars (independent run on the same data)

I ran this fix in a separate script over the raw children's lines, not the app
code. Numbers are the word's share of all the times the phrase was seen.

| Phrase | Today | After the fix |
| --- | --- | --- |
| he have | a | **a, to** |
| he has | a, not, get | a, **to**, not, get |
| I want | to 7%, a | **to 45%**, a |
| want | to 9%, a | **to 45%**, a |
| go | to 18%, in | **to 35%**, in |
| I need | a, some, to, the | **to 23%**, a, some, the |
| we have | get, not, a | **to 31%**, get, not, a |
| I | am, want, don't | am, want, **have**, don't |
| go go (children) | seen 3,295 | seen 284; the fake *go go* are gone |

Add the rows above that the app can express (`he have`, `he has`, `I want`,
`I need`, `we have`, `I`) to `scripts/prediction/bar_examples.json`. Rerun all
existing rows. Some may change after the rebuild: for each changed row, print
the counts, `seen` and share at the chosen ending, and say why it changed. Do
not edit an expected row to make it pass without that explanation.

## Proof

1. `node scripts/prediction/bar_examples.mjs`: every row, OK/DIFF, with the
   explanation for each changed row.
2. `node scripts/prediction/childes/measure_bar.mjs`, before and after the
   rebuild. Report both tables. The share bands should stay calibrated; if
   "next word on bar" drops, stop and report.
3. In the app (`npm run dev:agent`): *He have*, *I want*, *I need*, *we have*
   → the bars above. Screenshot or copy the tiles.

## Report back with

The list of reduced forms found (with counts), bar_examples output, the
measure_bar before/after, the four app bars, table version and size, files
changed. Commit per `AGENTS.md`.
