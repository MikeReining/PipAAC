# 025 — Expressive Voice: happy, sad, angry

**Status:** slices 1–4 landed 2026-09-26 (`97c968d` + faces commit).
**2026-09-29:** founder approved **Eleven v4** for all sentence feelings
(same voice as tiles — Eve/Leo per `tile_voices.json`). Compare lab
`compare-v1` passed vs Grok Ara. **Worker shipped:** `POST /api/v1/voice/speak`
uses Eleven + `src/shared/expressive_eleven.mjs`; board sends `voice_key`
from `preferred_voice_id`. UI/faces unchanged; cache-once economics unchanged.

**Truth owner:** `src/shared/expressive_eleven.mjs` + ear on tablet;
Grok formulas in `Grok_Voice_Emotional_Prosody.md` § 2 are legacy reference.
**Why this phase exists:** for 40 years people who rely on AAC have spoken in
one flat voice. A furious *go away* sounds polite; *I love you* sounds like a
weather report. The voice can now say any sentence happy, sad or angry. That
is three more feelings than any AAC user has today.

## Decisions (2026-09-25)

1. **▶ Play is always neutral** and says exactly what is in the sentence bar.
   Nothing about ▶ ever changes silently.
2. **Three faces: Happy, Sad, Angry.** Neutral is the default. Out of scope:
   silly, scared (not accurate yet), intensity levels (barely audible).
3. **The faces live in the last smart-bar slot.** No new top-row buttons.
   Smart-bar slots are already two tiles wide, so three faces fit in one slot.
4. **The faces show from the first word.** No word-count threshold: the
   shortest messages (*No! Stop! Mom! Yay!*) are often the most emotional, and
   the faces never move once she starts a sentence (motor memory).
5. **Tapping a face speaks the sentence in that feeling, once.** Nothing stays
   on. The same tap always does the same thing.
6. **"I + feeling word" lights the matching face as a suggestion.** *I'm
   happy* lights the happy face. ▶ still speaks neutrally; she taps the lit
   face to hear it happy. A suggestion, never an automatic change.
7. **Nothing carries over.** Faces and suggestions reset when the sentence
   ends (Clear or Speak).
8. **Setting "Expressive voice", on by default**, behind the parent PIN. Off:
   no faces, everything neutral.
9. **Offline: no faces.** Expressive speech needs the cloud voice.
10. **No "say it louder" on a second ▶.** The founder tested the `<loud>`
    formula: not audibly different enough. Not built.

*(The v3 designer spec sketched different behavior — faces appearing only
after 3+ words and an automatic feeling on ▶ for "I + feeling". This doc's
decisions 4 and 6 are the ruling ones: faces from the first word, suggestion
only, ▶ always neutral.)*

## What giving up slot 4 costs (measured 2026-09-25)

Held-out CHILDES, the current smart bar (5% rule), how often the child's
actual next word sat in the 4th slot:

| Words so far | Next word on the bar | Right word in slot 4 | Bar had 4 tiles |
| --- | --- | --- | --- |
| 1 | 22% | **1.0%** of moments | 22% |
| 2 | 34% | **2.1%** | 32% |
| 3+ | 24% | **1.1%** | 20% |

Slot 4 holds the right word about 1–2% of the time. Giving it to the faces
costs almost nothing.

---

## 1. What she sees

```text
Sentence bar:  I  am  happy
Smart bar:     [ tile ] [ tile ] [ tile ] [ 😊 ● | 😢 | 😠 ]
                                            last slot: three faces
                                            (● = lit suggestion: dark background)
```

- **When:** the sentence has at least one word, Expressive voice is on, the
  device is online, and she is not in the middle of typing a word on the
  keyboard (faces return once the word is committed).
- **Where:** always the **last** smart-bar slot, whatever the board layout
  (`stripSlots(boardGeom().cols)` decides how many slots exist; faces take the
  last one). Word suggestions fill the slots before it, as today. In group
  mode the faces stay in the same place.
- **Order inside the slot, left to right:** Happy, Sad, Angry. Fixed.
- **Pictures:** two candidate asset sets — confirm which ships.
  - Catalog word pictures: *happy* and *sad* faces (`symbols/happy.png`,
    `symbols/sad.png`). *Angry* gets one new drawing in the same style: the
    current `symbols/angry.png` is a different drawing (its face sits
    off-center). Drawn under the art rule: one image, founder review.
  - Designer face icons (v3 drop, 2026-09-25): `public/icons/voice-happy.svg`,
    `public/icons/voice-sad.svg`, `public/icons/voice-angry.svg`, with
    selected-state variants in `public/icons/selected/`. The v3 spec styles
    them like the transform buttons (white fill, ink border) "so they never
    read as word cards", and puts them under the same pressed-while-speaking
    state as ✨❓⏪▶⏩ (023 § 1h). **Not yet reconciled** with the
    catalog-picture plan — founder picks.
- **Each face is its own button** with a label for screen readers and
  switches: "Say it happy", "Say it sad", "Say it angry". In switch scanning
  they come last in the strip.
- **Lit face (suggestion):** dark background, same shape and size. Only one
  face can be lit at a time.

## 2. What a tap does

**Tap a face** (lit or not):
1. The pressed face shows a pressed state at once.
2. The sentence exactly as the bar shows it (after any transform button,
   023) is spoken in that feeling through 024's pipeline (§ 4).
3. It counts as speaking the sentence: the same as ▶ (the sentence closes as
   *spoken*, trains her phrase history, the after-Speak setting applies).
4. The feeling is logged with the sentence (§ 5).
5. Nothing stays on.

**Tap ▶:** neutral, exactly as today, lit face or not.

**Never silent:** if the feeling's audio hasn't started within about **1
second** (slow network, error, fair-use limit reached), speak the sentence
neutrally with the 024 fallback (her word clips). She is always heard; the
feeling is the extra.

## 3. The "I + feeling word" suggestion

Computed from word ids, never from spelling. She taps tiles, and typed words
resolve to the same ids, so spelling mistakes and *I'm / I am / I feel* need
no special handling (*I'm* is *I* + *am* since 021).

1. **Feeling map:** a small data file, `data/catalog/feeling_voice.json`,
   shipped in `catalog.json` as `feelingVoice` (sense id → feeling):

   | Word (sense) | Feeling |
   | --- | --- |
   | happy `sns_0061` | happy |
   | excited `sns_0183` | happy |
   | sad `sns_0179` | sad |
   | angry `sns_0181` | angry |
   | mad `sns_0180` | angry |
   | frustrated `sns_0187` | angry |

   Adding a word later is a data change, not code.
2. **Rule:** find the **last** feeling word in the sentence. Look back from
   it for the nearest *people word* (a catalog pronoun, or one of her people
   / pets). If that word is *I* (`sns_0001`) or *me* (`sns_0003`), light that
   feeling's face.
   - *I'm happy*, *I am so sad*, *me mad* → lit.
   - *He is happy*, *I think he is sad*, *it is sad* → not lit.
   - *happy* alone (no people word) → not lit.
3. The suggestion is recomputed on every sentence change and disappears
   when the sentence ends.

## 4. The voice request (024's pipeline)

- The client calls 024's endpoint with the sentence text, the voice, and
  **`feeling`**: `neutral | happy | sad | angry`. The **Worker** builds the
  provider text in one place (`expressive_eleven.mjs` as of 2026-09-29).
- **Eleven v4 mint text** (`Grok_Voice_Emotional_Prosody.md` § 7):

  | Feeling | Sent to Eleven |
  | --- | --- |
  | happy | `[cheerful, bright voice] {text}{end}` |
  | sad | `[sad] {text}{end}` |
  | angry | `[frustrated] {text}{end}` |
  | neutral | `{text}{end}` |

  `{text}` is the sentence without its final `. ! ?`. `{end}` is **`?` if the
  sentence ended with `?`** (a question from ❓ stays a question, happy or
  angry). Otherwise `!` for happy and angry, `.` for sad and neutral.
- **No theatrical sound-effect tags** on the bar (`[laugh]`, sob cues, etc.).
  Eleven **delivery** tags above are voice-quality directions, not pantomime.
- **Every feeling recording is saved and reused: pay once, replay fast**
  (founder, 2026-09-25). Exactly the same rule as every other sentence 024
  speaks (present, past, question, future):
  - the first time a sentence is spoken in a feeling, the MP3 is saved on her
    device (024 Tier 1) **and uploaded to the shared Cloudflare R2 cache**
    (024 Tier 2);
  - every later request for the same sentence, voice and feeling, from any
    child, plays from the cache: no Grok call, no cost, much faster;
  - the only exception is 024 § 5's privacy line, identical for every
    feeling: a sentence with a rare name, surname or typed word is saved on
    her device only.
- **The cache key includes the feeling** (024 rule 2): the same sentence
  neutral, happy, sad and angry are four separate recordings, each synthesized
  once.
- **Fair use** (024 § 6a): characters count as usual (the sentence text, not
  the tags). Past the limit, the never-silent rule speaks it neutrally.
- **No prefetching.** A feeling is synthesized only when she taps its face.
  The sentence doesn't leave the device before she chooses.

## 5. Data

- `sentence.spoken_feeling`: new nullable column (`happy | sad | angry`,
  null = neutral). Bump `user_version`; old rows stay null. Written when a
  face tap speaks the sentence.
- `learner_profile.expressive_voice INTEGER NOT NULL DEFAULT 1`, synced like
  `grammar_help` (021 slice 4 is the pattern: profile column, settings seg,
  `onSyncApplied` resync).
- Nothing else is stored. The feeling selects Eleven mint text; no ids on the wire.

## 6. Setting

**Parent corner (PIN), next to Grammar help:** "Expressive voice" — On / Off,
**On by default.** Supporter-facing line: *"Faces in the smart bar let your
child say a sentence happy, sad or angry."* Off: no faces, no suggestions, all
speech neutral.

## 7. Slices

1. **Data + formulas:** `feeling_voice.json` into the catalog;
   `sentence.spoken_feeling`; `expressive_voice` setting with sync; the
   Worker applies the formula from the `feeling` field, with the `?` rule.
   Update the helper in `Grok_Voice_Emotional_Prosody.md` § 4 to match.
   Feeling recordings go through 024's caches like every sentence: saved on
   the device and uploaded to R2 (§ 4), keyed by sentence + voice + feeling.
2. **Faces in the strip:** render in the last slot (§ 1) when the conditions
   hold; tap handling (§ 2); the never-silent 1-second fallback.
3. **Suggestion:** the "I + feeling word" rule (§ 3), lit face.
4. **Angry face picture:** one drawing, founder review, then wire all three.

## 8. Proof (founder-reviewed, in the real app)

No new unit-test suite. The proof is the real app plus a listen:

1. `npm run dev:agent`, then screenshots of:
   - *He* → the last slot shows three faces, none lit;
   - *I am happy* → happy face lit; ▶ sounds neutral; the happy face sounds
     happy;
   - *he is happy* → no face lit;
   - *I think he is sad* → no face lit;
   - *Do you want to play?* (via ❓) + happy face → still a question;
   - Clear → faces gone; Expressive voice off → no faces; offline → no faces.
2. **Listen:** one sentence in all four ways (neutral, happy, sad, angry),
   plus *No!*, *Stop!*, *I love you*, *go away*: the founder listens and
   approves before shipping.
3. **Never silent:** with the network throttled so audio takes over 1 second,
   a face tap still speaks (neutrally).
4. **Pay once:** tap the same face on the same sentence twice (and from a
   second device): the second play comes from the cache, with no new Grok
   call in the Worker log.
5. Report: which faces were tapped in your own test use, from
   `sentence.spoken_feeling`.

## Out of scope

Silly, scared and other feelings; intensity levels; "say it louder" on a
second ▶; automatic feelings (anything ▶ does differently without her tap);
feelings offline; prefetching.
