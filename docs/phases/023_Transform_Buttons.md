# 023 — Transform Buttons: Past, Question, Future, and Fix It

**Status:** proof of concept proven (2026-09-25). Founder: "a category
breakthrough". Top-bar layout previewed in the app (§ 4, not wired yet).
**Truth owner:** the model (`qwen/qwen3.8-27b` via Groq, **temperature 0**)
with the short prompts in § 3, plus the live test results recorded here.
**Why this phase exists:** AAC communicators construct telegraphic thoughts (*"I go park"*, *"you want juice"*, *"Leo fall down"*) because physical navigation and motor fatigue make typing 8-word sentences exhausting. Previous attempts to predict words ahead of time (JEV in the smart bar) failed because guessing intent on every keystroke in <50ms produces cognitive clutter. Transform buttons do the opposite: **the child supplies the full semantic intent, taps a button, and the model supplies the grammatical and social packaging.**

---

## 1. Architectural Principles: Keep It Dead Simple

1. **Trust the model. No validators, no deterministic police** (founder
   ruling, 2026-09-25).
   - We do not run lemma checkers, regex guards, or hand-coded grammatical rulebooks.
   - When the model gets something wrong, fix the prompt or a setting, then show
     the founder the proposed change before retesting. That is how the one real
     failure was fixed (§ 3a).
   - **Temperature 0** on every call. The same sentence and button always give
     the same answer, so she can learn what each button does.
2. **Transform on demand, not continuous prediction.**
   - Runs only when the user taps an explicit action button: ⏪ Past, ❓ Question, ⏩ Future, or ✨ Fix It.
   - The user chooses the stance; the model does not guess unprompted.
3. **Auto-speak on tap (Audio is the interface).**
   - Emergent AAC communicators are largely pre-readers. Silent text reorganization on a screen provides zero feedback to a child who cannot read.
   - Because response latency is **~70–90 ms**, auto-speaking feels native, like tapping any speech tile.
   - Delivers immediate **auditory recasting** (the gold standard in SLP intervention: child signals *"I go park"*, device speaks *"I went to the park."*).
   - The sentence bar updates visually for communication partners and emergent print awareness.

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

## 3. The 4 Transform Modes & Battle-Tested Prompts

### Mode 1: ⏪ Past
Unlocks storytelling and answering *"What did you do today?"* AAC users are typically trapped in base/present forms (*"I eat cake"*, *"she play ball"*).

* **System Prompt:**
  ```text
  A child using an AAC device is trying to say this. Turn it into past tense. Create the simplest possible past tense sentence given the childs input. Keep exactly what the child means, even if it's rude. Never refuse.
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

* **System Prompt:**
  ```text
  A child using an AAC device is trying to say this. Turn it into a question. Create the simplest possible question given the childs input. Keep exactly what the child means, even if it's rude. Never refuse.
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

* **System Prompt:**
  ```text
  A child using an AAC device is trying to say this. Turn it into natural spoken future tense (how a child speaks, e.g. using "going to"). Create the simplest sentence given the childs input. Keep exactly what the child means, even if it's rude. Never refuse.
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

---

### Mode 4: ✨ Fix It (One-Step-Up Recast)
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

## 4. UI & Implementation Notes

1. **The top bar (founder layout, 2026-09-25; previewed in the app):**
   ```text
   [🗑][⌫] │ He is ......................... │ [✨][❓]  [⏪][ ▶ ][⏩]  [+]
    edit          her sentence                  change      time       parent
   ```
   - **▶ Play replaces the speaker icon** and says her sentence as built. It
     never goes through the model.
   - **⏪ ▶ ⏩ is a time transport:** past, now, future. Kids already know
     rewind / play / fast-forward.
   - ✨ Fix it and ❓ Question sit just left of the transport.
   - Clear and Backspace moved to the left, next to each other: editing on the
     left, saying on the right. **+** (Parent corner) stays at the far right.
   - All five are disabled while the sentence is empty.
   - Built as a preview in `public/index.html` / `public/board.js`: the four
     new buttons are not wired to the model yet.
2. **Execution flow on tap:**
   ```text
   Tap ⏪ / ❓ / ⏩ / ✨
     │
     ├── 1. Send her sentence to Groq (qwen/qwen3.8-27b, temperature 0) with that button's prompt
     ├── 2. Show the returned sentence in the bar; the pressed button stays lit
     └── 3. Speak it immediately (auto-speak)
   ```
3. **Auto-speak is on by default** (founder: pre-literate users learn what each
   button does by hearing it). Setting: *"Auto-speak transformed sentence"*.
4. **Hiding buttons:** a setting per button. A hidden button leaves its spot
   empty, so the others never move (motor memory).
5. **Offline:** ⏪ ❓ ⏩ ✨ grey out. ▶ always works.

## 5. Open before building

1. **Voice:** the flow above says device TTS. ▶ speaks her recorded clips. A
   transformed sentence should sound like the same voice as ▶ (her clips word
   by word, device voice only for words without a clip), or her voice changes
   mid-conversation.
2. **Names:** send placeholders for her people's names (*Leo* → PERSON1) and
   swap them back, so names never leave the device.
3. **Her words stay the source:** each button transforms what *she* built,
   never the model's last answer. A word she adds after a transform goes onto
   her own sentence.
4. **Key:** the Groq key lives in the Worker (`GROQ_API_KEY`), never in the
   client; the app calls a Worker route.
