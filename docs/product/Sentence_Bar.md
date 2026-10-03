# The Sentence Bar — what each button actually does

**Read this before reasoning about ✨ ❓ ⏪ ▶ ⏩, pricing them, demoing them, or
writing copy about them.** It is the shipped behavior, traced from code
(2026-10-03). Phase 023 § 3's prompts and live-test tables are the *old*
prompts and are superseded — do not quote them.

Truth owners: prompts → `src/shared/transform_prompts.mjs`; the call →
`public/board/speech.js` `transformAndSpeak` → `POST /api/v1/transform`
(`src/worker/transform.js`); bar state → `public/shared/txbar.mjs`; which
buttons show → `learner_profile.bar_controls` (phase 038).

## The one law (the wand law, founder 2026-09-30)

**A grammar pass, never a guess at what the child wants.** The output is the
words she tapped plus small glue words. Nothing else.

- Allowed to add: `a an the to is am are was were do does did not` (and
  `don't`). Reorder freely. Change word forms for tense/agreement.
  `me` → `I` only as a subject.
- **Never added:** a subject she didn't tap (she has an *I* tile), a content
  word (verb, noun, place), a modal (`can`, `want`, `would`), or a change of
  speech act (a report stays a report, a command stays a command).
- If no grammatical version exists without guessing, the output is **her taps
  unchanged** (abstain-by-echo). That counts as a pass.
- Temperature 0: same taps + same button → same answer, so she can learn what
  a button does. Model: `qwen/qwen3.8-27b` on Groq. No validators, no
  hand-coded language rules in production (fix the prompt instead).

So: **"go park" can become "Go to the park?" — never "Can we go to the park?"**
*Can* and *we* were never tapped. Nobody puts words in her mouth.

## The buttons (what comes out — examples from the shipped prompts)

| Button | Does | Examples | Can't |
| --- | --- | --- | --- |
| ✨ Fix it | Her taps as a natural sentence | `we play` → "We are playing." · `me hungry` → "I am hungry." · `eat cookie` → "Eat a cookie." · `daddy work` → "Daddy is working." | Add a subject to `eat cookie`, or a want |
| ❓ Question | Same words as a question (rising-intonation question is fine; subject + verb gets question form) | `go park` → "Go to the park?" · `more` → "More?" · `we play` → "Are we playing?" · `mom play` → "Is Mom playing?" · already a question stays one | Add `can`/`do you`/`we`. `go park` never gets a subject |
| ⏪ Past | Past tense; subject may stay dropped | `go park` → "Went to the park." · unchanged if it can't go past naturally | Invent a subject |
| ⏩ Future | Spoken future with "going to" | `go park` → "Going to the park." · "going to school", never "going to go to school" | Use "will"; invent a subject |
| ▶ Play | Speaks the bar as built. **Never calls the model.** On a past/future bar it first restores her exact taps | | |

The examples above are the ones written in the prompt file. The wider
regression battery is `scripts/sentences/battery.json` (46 telegraphic
fragments) scored by `scripts/sentences/scorer.mjs` (flags added /
dropped / subject); 023 § 2 records 164/165 clean after the rewrite. For
*actual* outputs on a given input, run the lab (`/sentence-lab`) — do not
guess them. (Running it calls Groq: confirm first.)

## How a press behaves (call path)

1. Press → `transformAndSpeak(mode)` (`speech.js`). No-op if the bar is empty
   or a press is in flight.
2. Source = her **saved taps**: the first transform snapshots them
   (`barState.preTransform`); every later transform reads that snapshot,
   **never the last model output** — chains cannot compound a guess.
3. Family names are masked as `PERSON1/2` before leaving the device
   (`name_shield.mjs`) and restored after.
4. `POST /api/v1/transform` with `mode`, the bar's `tense`, and whether it is
   already a `question`. The Worker composes the prompt.
5. The result replaces the bar as typed words, art looked up per word, then
   it **speaks** through the sentence-TTS pipeline (phase 024). Every press
   produces audio.
6. ❓ on an existing question just re-speaks. ⏪/⏩ on a question keep it a
   question. ❓ asks in the bar's current tense ("Went to the park?").
7. **Any edit** (tap, backspace, clear) voids the snapshot and flags — the bar
   holds her words again.

## Gates and failure (today)

- **Every model button needs Pip Lifetime**, the internet, and fair use
  (20,000 chars/day ≈ 200 sentences; 30 requests/min). Source:
  `transform.js` (`checkLicense`, `usageCheck`).
- Failure never silences a press: it **speaks the bar as built** and toasts —
  offline ("needs the internet"), unlicensed ("comes with Pip Lifetime", with
  an *Open Settings* action), fair use ("back tomorrow"), or "couldn't work
  just now."
- Cost is not a concern (founder 2026-10-03; 023 § 2 measured ~$0.01 per
  1,000 taps).

## What the value actually is (and isn't)

- **Is:** her own words, grammatical, spoken in an adult-sounding voice;
  ❓ gives a one-word or two-word tap the **asking** form ("More?" is not "More.")
  — a device otherwise says everything flat; Past/Future let her tell what
  happened or what's next without building the verb form herself.
  Trust: it never invents what she meant.
- **Isn't:** autocomplete of intent. Two taps do not become "a gorgeous long
  sentence." Anything that sounds like it does is wrong copy.
- *Unverified claim carried from 023 § 2:* the `?` gives rising intonation in
  the TTS. Check `docs/phases/024_Sentence_TTS_And_Audio_Cache.md` and
  `025` before leaning on it in marketing.

## Change rules

Change a prompt only in `src/shared/transform_prompts.mjs`; show the founder
the diff before any re-test; re-run the battery. Update this file in the same
commit as any behavior change.
