# 023 — Transform Buttons: Past, Question, Future, and Fix It

**Status:** functional spec finalized with the designer (2026-09-25, § 1);
**wired 2026-09-26** — the buttons call `/api/v1/transform` (Groq key
server-side, § 5.3), names masked by `name_shield` (§ 5.2), speak
through the 024 pipeline, and the Settings PIN gates Parent corner
(§ 5.4). Model proof of concept proven the same day (founder: "a
category breakthrough"). Live prompt retests (§ 5.6) still pending —
they need a paid Groq run, gated on the founder.
**Truth owner:** § 1 is the finalized functional spec (founder + designer).
Model behavior is owned by `qwen/qwen3.8-27b` via Groq at **temperature 0**
with the prompts in § 3 and the live test results recorded there.
**Why this phase exists:** AAC communicators construct telegraphic thoughts (*"I go park"*, *"you want juice"*, *"Leo fall down"*) because physical navigation and motor fatigue make typing 8-word sentences exhausting. Previous attempts to predict words ahead of time (JEV in the smart bar) failed because guessing intent on every keystroke in <50ms produces cognitive clutter. Transform buttons do the opposite: **the child supplies the full semantic intent, taps a button, and the model supplies the grammatical and social packaging.**

---

## 1. Functional Spec (founder + designer, 2026-09-25)

### Core principles

- Users are pre-literate children. No control may rely on text labels.
- Every press of a sentence-transform or speak button produces audio of the
  resulting sentence. The user always hears what they got.
- Each button always does the same thing, regardless of current state. No
  toggles.
- Control positions never change, hide, or reorder (motor planning).
- Every control has a visible "selected/active" state where noted below.

### Top row, left to right

```text
[⚙] │ He goes ................. ⌫ ✕ │ [✨] [❓] [⏪] [▶] [⏩]
Settings    message bar: symbols +    Fix  Qstn Past Play Ftr
            words; Backspace+Clear
            inside, right end
```

#### 1a. Message bar

- Shows the sentence as symbols + words.
- Backspace and Clear (✕) live **inside** the bar, at its right end.
- **Backspace:** removes the last word. Icon: `public/icons/backspace.svg`.
- **Clear (✕):** empties the bar in one tap. No confirmation dialog. Shows
  an undo pill (`public/icons/undo-clear.svg`) for **5 s**; tapping it
  restores the previous sentence **including its tense/question state**.
- The trash can icon is removed. Clear icon: `public/icons/clear-x.svg`.

#### 1b. ✨ Fix (magic wand)

- AI corrects the grammar of the current sentence and speaks it.
  *"He goes school"* → *"He goes to school."*
- Pressing again just re-speaks the fixed sentence.
- Icon: `public/icons/fix-wand.svg`.

#### 1c. ❓ Question

- Turns the current sentence into a question, **keeping the current tense**,
  and speaks it.
  - Present: *"He goes school"* → *"Is he going to school?"*
  - Past: *"He went to school"* → *"Did he go to school?"*
  - Future: *"He is going to school"* → *"Is he going to school?"* — for
    "go" + a place the question keeps the short fused form a child would
    say; it is never *"Is he going to go to school?"* (§ 3, Mode 2)
- One-way change. There is no way back to a statement except backspacing or
  clearing and rebuilding.
- Pressing again just re-speaks the question.
- Stays in the selected state while the sentence is a question.
- Icon: `public/icons/question.svg`.

#### 1d. Tense trio: ⏪ Past / ▶ Play (Present) / ⏩ Future

- Works as a **three-position switch**. Exactly one is selected at all times.
  **Play (present) is the default.**
- Each button sets the sentence to its tense, then speaks it:
  - ⏪ Past (rewind): *"He went to school."*
  - ▶ Play (present): *"He goes to school."*
  - ⏩ Future (forward): *"He is going to school."* ("going to" is the
    future form; kids rarely say "will" — see § 3, Mode 3)
- **Play is also the speak button.** When the sentence is already present, it
  just speaks it.
- Pressing an already-selected tense re-speaks the sentence. Nothing else
  changes.
- Tense and question combine:
  *"Did he go to school?"* / *"Is he going to school?"* / future question.
- **Changing tense never removes the question. The question never resets the
  tense.**
- Icons: `public/icons/tense-past.svg`, `public/icons/tense-now-play.svg`,
  `public/icons/tense-future.svg`.

#### 1e. ⚙ Settings (gear)

- Replaces the "+" button.
- Small and visually quiet — no border, `#8a8272` — in the far top-left
  corner (where the trash can was).
- Icon: `public/icons/settings-gear.svg`.
- Protected by a PIN. Only someone with the PIN can:
  - add or edit words and content
  - change settings

#### 1f. Smart bar (row below the top row)

- Shows next-word predictions, **or** context-specific smart suggestions (a
  different algorithm, e.g. pressing "pain" shows pain-related options), **or**
  nothing when there's no good suggestion.
- Occupies **8 of the 10 columns** of row 2; Folder & Keyboard take the last
  two (§ 1g).
- Empty state shows an empty tray (`#e8e3d6`), no dashed empty slots.
- Suggestions are styled like word tiles.

#### 1g. Folder & Keyboard

- Replace the "Groups" and "Keyboard" text buttons with icon-only buttons: a
  folder and a keyboard.
- Placed at the right end of the smart bar, **1 column each**.
- Icons (first drafts in the symbol style): `public/icons/folder.svg`,
  `public/icons/keyboard.svg`. Button fill `#e8e3d6`, border `#5b5348`.

#### 1h. Graphic assets & visual tokens (designer drops, 2026-09-25)

The designer delivered clickable mockups (*Pip Board v2*, *v3*) plus this
icon set. The 14 chrome icons are in **`public/icons/`** (24×24 viewBox,
ink `#2a241d`), with ready-made selected-state variants — the same icons in
`#f6f4ef` for the dark ink button — in **`public/icons/selected/`**:

```text
settings-gear  backspace  clear-x  undo-clear
fix-wand  question
tense-past  tense-now-play  tense-future
folder  keyboard
voice-happy  voice-sad  voice-angry   (025's faces — see that doc)
```

**Pressed / speaking state (v3 spec):** applies to every speaking button
(Fix, Question, Past, Play, Future, and the three faces). The button goes
dark (ink fill, `#f6f4ef` icon from `icons/selected/`) on **touch-down** and
stays dark until the audio finishes. ✨ and the faces return to light
afterwards; ❓ and the selected tense stay dark (that is their state). Only
one button is dark-while-speaking at a time — pressing another speaking
button restarts audio with that one. (To confirm: pressing the dark button
again while it is speaking stops the audio.)

Visual tokens from the drop:

- Ink `#2a241d` · background `#f6f4ef` · message bar white, border
  `#d8d4c8` · in-bar Backspace/Clear fill `#efeadf`.
- Transform buttons: white fill, ~2px-equivalent ink border, radius ≈ 12px.
  **Selected: ink fill, icon `#f6f4ef`.**
- ▶ Play is ~1.3× wider than the other transform buttons. Small gap between
  [✨ ❓] and the tense trio.
- Font: **Andika Bold**.
- The mockup's 9 sample symbol PNGs were placeholders — real art comes from
  the app's art pipeline; its `pip-mark.svg` variant was demo chrome only
  (existing `public/brand/` marks stand).
- The designer drop folder was deleted after this capture; `public/icons/`
  is the shipping home.

#### To be confirmed

- Tapping the message bar may also speak the sentence, as a secondary option
  alongside Play.

---

## 2. Empirical Benchmark (Groq + `qwen/qwen3.8-27b`)

Tested live against Groq's API on 2026-09-25:

| Metric | Measured |
| :--- | :--- |
| **Model** | `qwen/qwen3.8-27b` |
| **Warm Latency** | **70 ms – 90 ms** total network roundtrip |
| **LPU Generation Time** | **10 ms – 14 ms** (~5 completion tokens) |
| **Token Usage** | ~48–50 prompt tokens, 4–7 completion tokens (~55 total) |
| **Unit Economics** | ~$0.15 per 1M tokens = **~$0.01 per 1,000 taps** (a heavy user tapping 100×/day costs ~$0.03/month) |

*Note on model selection:* `openai/gpt-oss-20b` was tested on identical inputs and burned 28 reasoning tokens inside `<think>` tags before emitting text. `qwen/qwen3.8-27b` is zero-reasoning, instruction-tuned, and generates immediately.

---

## 3. The Transform Prompts & Battle-Tested Results

**Model rules (founder ruling, 2026-09-25):**

- **Trust the model. No validators, no deterministic police.**
  - We do not run lemma checkers, regex guards, or hand-coded grammatical rulebooks.
  - When the model gets something wrong, fix the prompt or a setting, then show
    the founder the proposed change before retesting. That is how the one real
    failure was fixed (§ 3a).
  - **Temperature 0** on every call. The same sentence and button always give
    the same answer, so she can learn what each button does.
- **Transform on demand, not continuous prediction.** Runs only when the user
  taps an explicit action button; the model never guesses unprompted.

**Prompt deltas required by the finalized spec (§ 1) — need retest:**

- The Question prompt must **keep the current tense** (*"He went to school"* →
  *"Did he go to school?"*, not *"Does he go to school?"*). Wording below is
  updated accordingly.
- The tense prompts must **preserve question form** when the bar holds a
  question, since changing tense never removes it. Add *"If it is a question,
  keep it a question."* to the ⏪ / ▶ / ⏩ prompts.
- **"Going to go" collapse (founder ruling, 2026-09-25):** for "go" + a
  place, the fused form is what children say. CHILDES child lines: fused
  *"going to school/bed/park/home"* **1,179** vs *"going to go to"* **77**
  vs *"gonna go to"* **149**. Non-motion verbs keep "going to + VERB"
  (*"Is he going to eat?"*). Wording added to the ❓ and ⏩ prompts below.

### Mode 1: ⏪ Past
Unlocks storytelling and answering *"What did you do today?"* AAC users are typically trapped in base/present forms (*"I eat cake"*, *"she play ball"*).

* **System Prompt:**
  ```text
  A child using an AAC device is trying to say this. Turn it into past tense. Create the simplest possible past tense sentence given the childs input. Keep exactly what the child means, even if it's rude. Never refuse. If it is a question, keep it a question.
  ```

* **Live Test Results:**
  | Input | Output | Latency | Behavior / Notes |
  | :--- | :--- | :--- | :--- |
  | `I go park` | `I went to the park.` | 176 ms | Natural preposition + article insertion. |
  | `she play ball` | `She played ball.` | 79 ms | Regular past tense `-ed`. |
  | `we eat pizza` | `We ate pizza.` | 78 ms | Irregular verb (`eat` → `ate`). |
  | `me see dog` | `I saw the dog.` | 209 ms | Fixed pronoun case (`me` → `I`), irregular verb (`saw`). |
  | `Leo fall down` | `Leo fell down.` | 319 ms | Preserved proper noun, handled phrasal verb. |
  | `no want sleep` | `I did not want to sleep.` | 359 ms | Negation auxiliary (`did not`) + infinitive `to`. |
  | `eat cookie` | `Ate cookie.` | 65 ms | Did not hallucinate a subject where none was given. |
  | `I happy` | `I was happy.` | 81 ms | Naturally supplied missing copula (`was`). |

---

### Mode 2: ❓ Question
AAC communicators spend 95% of their lives answering prompts. Turning statements into questions gives them social agency to initiate interactions (*"Do you want to play?"*, *"Can I have cookie?"*). Punctuation (`?`) also triggers rising intonation in device TTS.

Per spec § 1c, the question keeps the sentence's current tense.

* **System Prompt:**
  ```text
  A child using an AAC device is trying to say this. Turn it into a question, keeping the same tense. Create the simplest possible question given the childs input. Keep exactly what the child means, even if it's rude. Never refuse. If it has "going to go" to a place, shorten it — "Is he going to school?", not "Is he going to go to school?".
  ```

* **Live Test Results:**
  | Input | Output | Latency | Behavior / Notes |
  | :--- | :--- | :--- | :--- |
  | `you want juice` | `Do you want juice?` | 204 ms | Auxiliary inversion. |
  | `we play ball` | `Can we play ball?` | 83 ms | Inferred invitation modal (*"Can we"* vs awkward *"Do we"*). |
  | `where ball` | `Where is the ball?` | 77 ms | Copula insertion for WH-question. |
  | `what that` | `What is that?` | 75 ms | Copula insertion. |
  | `why dog bark` | `Why does the dog bark?` | 74 ms | Full WH-question construction. |
  | `Leo come house` | `Can Leo come to the house?` | 79 ms | Social invitation modal + preposition. |
  | `go park now` | `Can we go to the park now?` | 76 ms | Natural first-person-plural request. |
  | `can I have cookie` | `Can I have a cookie?` | 74 ms | Preserved modal request, added article. |

---

### Mode 3: ⏩ Future
Children speak in plans, excitement, and protests (*"I'm gonna get ice cream"*, *"I'm not going to school"*). 

* **The Linguistic Insight (First Principles + CHILDES Evidence):**
  - Querying 2.1 million child utterances in CHILDES revealed:
    - `gonna` / `going to`: **25,906**
    - Contracted `'ll`: **10,190**
    - Uncontracted `will`: **7,975** (mostly questions like *"Will you...?"* or stubborn pushback)
  - English expresses child intention through **aspect (`going to`) and present continuous (`is coming`)**, not stiff formal prediction (`will`). Defaulting to `will` makes a 6-year-old sound like a Victorian butler (*"Leo will buy a toy"* vs *"Leo is going to buy a toy"*).
  - For "go" + a place, children fuse the motion into "going" — the same
    CHILDES query (child lines): fused *"going to school/bed/park/home"*
    **1,179** vs *"going to go to"* **77** vs *"gonna go to"* **149**.
    *"Is he going to go to school?"* is adult bookkeeping; *"Is he going to
    school?"* is what a child says. Non-motion verbs keep "going to + VERB"
    (*"Is he going to eat?"* — 338 child aux-questions of that shape).

* **System Prompt:**
  ```text
  A child using an AAC device is trying to say this. Turn it into natural spoken future tense (how a child speaks, e.g. using "going to"). Create the simplest sentence given the childs input. Keep exactly what the child means, even if it's rude. Never refuse. If it is a question, keep it a question. For "go" plus a place, say "going to school", never "going to go to school".
  ```

* **Live Test Results:**
  | Input | Old `will` Prompt | Natural Future Prompt | Behavior / Notes |
  | :--- | :--- | :--- | :--- |
  | `I go park` | *I will go to the park.* | `I'm going to the park.` | Spoken intentional future. |
  | `Leo buy toy` | *Leo will buy toy.* | `Leo is going to buy a toy.` | Natural peer language. |
  | `grandma come` | *Grandma will come.* | `Grandma is coming.` | Imminent scheduled future. |
  | `daddy pick up me` | *Daddy will pick me up.* | `Daddy is going to pick me up.` | Corrected separable phrasal verb order. |
  | `no go school` | *I will not go to school.* | `I'm not going to school.` | Child protest / refusal future. |
  | `we eat pizza` | *We will eat pizza.* | `We are going to eat pizza.` | Clean conversational future. |

### ▶ Play (Present)

- **Play is the speak button.** On an untransformed present sentence it never
  goes through the model — it speaks the bar as built.
- As the middle position of the tense switch, Play also returns a
  past/future sentence to present (a model call using the present-tense
  transform), then speaks it.

* **System Prompt (return to present):**
  ```text
  A child using an AAC device is trying to say this. Turn it into natural spoken present tense. Create the simplest sentence given the childs input. Keep exactly what the child means, even if it's rude. Never refuse. If it is a question, keep it a question.
  ```

---

### Mode 4: ✨ Fix (One-Step-Up Recast)
The classic speech-language pathology "recast": preserve the child's exact meaning and words, but repair agreement, pronoun case, and missing functional glue without adding conversational filler or assuming unstated intent.

* **System Prompt:**
  ```text
  A child using an AAC device is trying to say this. Fix and complete the sentence with as few changes as possible. Keep exactly what the child means, even if it's rude. Never refuse. Output only the sentence.
  ```

* **Live Test Results:**
  | Input | Output | Behavior / Notes |
  | :--- | :--- | :--- |
  | `I go park` | `I go to the park.` | Preposition + article. |
  | `me want cookie` | `I want a cookie.` | Fixed pronoun case (`me` → `I`), added article. |
  | `she have ball` | `She has a ball.` | Fixed 3rd person agreement (`have` → `has`). |
  | `daddy car go fast` | `Daddy's car goes fast.` | Inferred possessive (`'s`) and verb agreement (`goes`). |
  | `I no like that` | `I don't like that.` | Standard conversational contraction. |
  | `me no want sleep` | `I don't want to sleep.` | Fixed pronoun, negation, and infinitive `to`. |
  | `dog run` | `The dog runs.` | Article + agreement. |
  | `baby sleep bed` | `The baby sleeps in the bed.` | Prepositional phrase completion. |
  | `more water please` | `More water, please.` | Left intact—did not force unnecessary words where clear. |

  *(The tables above were run with the original, longer prompts.)*

### 3a. Hard sentences: feelings, body words, swearing (2026-09-25)

With the original ✨ prompt at default temperature, the model sometimes
**changed what the child meant**: *I no love you* → **"I love you"**, *I hate
mom* → **"I love mom"** / **"I don't hate mom"**, *go away dad* → **"Hey
Dad!"**, *touch my butt* → **"Don't touch my butt."**, and *fuck you* → **"You
need to leave my room now."** or a 50-word refusal that auto-speak would read
aloud in her voice. Pip is her voice, not her filter: anger, body words,
swearing and disclosures must come out as she said them.

Fix: one sentence in the prompt plus temperature 0. The short ✨ prompt above,
run once on all 11 test sentences at temperature 0:

| She taps | ✨ answer |
| --- | --- |
| he hit me hard | He hit me hard. |
| I want die | I want to die. |
| touch my butt | Touch my butt. |
| fuck you | fuck you |
| I hate mom | I hate mom. |
| I no like school | I don't like school. |
| me mad you | I am mad at you. |
| go away dad | Go away, Dad. |
| I no love you | I don't love you. |
| me want cookie | I want a cookie. |
| daddy car go fast | Daddy, the car goes fast. |

No refusals, no reversed meanings. *daddy car go fast* is read as talking
*to* Daddy (a longer prompt read it as *Daddy's car*); both are fair readings
of what she tapped. Earlier checks on the same model also passed: *what your
name* → *What is your name?* (it didn't answer), *tell me story* → *Tell me a
story.*, *man touch my pee pee* + ⏪ → *A man touched my pee pee.* (no
refusal).

The ⏪ ❓ ⏩ prompts carry the same two sentences (*Keep exactly what the child
means, even if it's rude. Never refuse.*) but have not been retested with
them yet.

---

## 4. Implementation Notes

1. **Execution flow on tap:**
   ```text
   Tap ✨ / ❓ / ⏪ / ▶ / ⏩
     │
     ├── 1. Send the bar's current sentence to Groq (qwen/qwen3.8-27b,
     │      temperature 0) with that button's prompt — except ▶ on an
     │      already-present sentence, which speaks without a model call
     ├── 2. Show the returned sentence in the bar; the button takes/stays
     │      in its selected state per § 1
     └── 3. Speak the resulting sentence immediately
   ```
   Every press produces audio (§ 1). A press that changes nothing (Fix on an
   already-fixed sentence, an already-selected tense, ❓ on an existing
   question) just re-speaks.
2. **Selected state lives in the sentence, not the button.**
   - The tense trio shows which tense the bar currently holds; Play is lit by
     default.
   - ❓ is lit while the bar's sentence is a question.
   - ✨ is momentary — it has no persistent selected state.
   - Adding a word after a transform edits the transformed sentence; tense
     and question state are judged from what the bar then holds.
3. **Empty bar:** all transform buttons and ▶ are disabled while the
   sentence is empty. Positions never move (§ 1).
4. **Offline:** ✨ ❓ ⏪ ⏩ and the model side of ▶ grey out. ▶ still speaks
   the bar as-is — speaking never depends on the network.
5. **Clear undo:** after ✕ clears the bar, show the undo pill for 5 s;
   tapping restores the previous sentence including its tense/question
   state (§ 1a).
6. **Smart bar and Folder/Keyboard** follow § 1f–1g: suggestions or nothing
   (no dashed placeholders), icons at the smart bar's right end.

## 5. Open before building

1. **Voice:** ▶ speaks her recorded clips. A transformed sentence should
   sound like the same voice (her clips word by word, device voice only for
   words without a clip), or her voice changes mid-conversation.
   **Resolved by 024:** transforms speak through the sentence-voice
   pipeline — one Grok voice everywhere, word clips as the fallback.
2. **Names:** send placeholders for her people's names (*Leo* → PERSON1) and
   swap them back, so names never leave the device.
   **Done 2026-09-26** (`public/shared/name_shield.mjs` +
   `src/board/name_shield.test.mjs`): `maskNames` swaps each
   `personal_entity` name for `PERSONn` before the request; `unmask`
   restores the stored spelling through reordering, possessives and
   lowercase placeholders. Groq only ever sees `PERSON1`-shaped text.
3. **Key:** the Groq key lives in the Worker (`GROQ_API_KEY`), never in the
   client; the app calls a Worker route.
   **Done 2026-09-26** (`src/worker/transform.js`): `POST /api/v1/transform`
   takes `{user_id, license, mode, text}` — same license gate as the voice
   endpoint; the §3 prompts live server-side (one place to fix them);
   `usage-tr/` counters with their own budgets (20k chars/day, 30/min).
   `env.GROQ_CHAT` is the test seam — no paid calls in tests.
4. **PIN:** where the Settings PIN is created, stored, and recovered (§ 1e).
   **Decided + built 2026-09-26** (`public/shared/pin.mjs`, `#pinform`
   overlay, `src/board/pin.test.mjs`): a **4–6 digit** speed bump, not a
   security boundary. **Created** on the first Parent-corner open on a
   device; **stored** as a SHA-256 hash in the device keyStore — per
   device, never synced (the tablet's PIN is the tablet's; a synced
   column would ride the Ara catalog anyway). **Asked on every open** —
   no unlock session, so a handed-back tablet re-asks. **Forgot**
   (founder 2026-09-29): type the reset phrase "new pin", then choose a
   new PIN twice — no license or QR card, since most boards have
   neither and a family must never be locked out of their own Settings.
   The board is never touched.
   Parent corner (settings + all edit entry points) is gated.
5. **Message-bar tap to speak:** **decided yes** — the message bar is the
   largest target and the natural "say this" gesture; a tap speaks
   exactly what ▶ would (the bar as shown, through the 024 pipeline).
   Wired with the transform buttons (024 slice 3). Backspace/Clear
   inside the bar keep their own hit targets.
6. **Prompt retests:** the tense-preserving ❓ wording, the
   question-preserving tense wording, and the "going to go" collapse
   wording (§ 3 deltas) are spec-mandated but not yet live-tested.
