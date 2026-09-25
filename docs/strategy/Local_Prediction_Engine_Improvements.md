# Local Prediction Engine: Root Cause Analysis & Architectural Improvements

> **Status:** Proposal & Architectural Specification  
> **Applies to:** `public/shared/funnel.mjs`, `public/shared/opening_book.mjs`, `data/prediction/`  
> **Topic:** Fixing on-device prediction quality independently of external AI (TypeSafe JEV).

---

## 1. Executive Summary

Pip AAC's on-device prediction engine was designed to be state-of-the-art: a lightweight, offline-first blend combining child language models (CHILDES, TinyDialogues, Imagine AAC), local recency, personalized history, and grammatical invitations.

However, live diagnostics show that the current engine produces **poor, repetitive, and grammatically broken recommendations**:
- It recommends duplicate verbs: `"I need you"` $\rightarrow$ **`need`** (*"I need you need"*).
- It suffers from severe sentence amnesia: `"can I have"` $\rightarrow$ **`get`** and **`not`** (*"can I have get"*, *"can I have not"*).
- It clusters identical word types: `"I want to go"` $\rightarrow$ **`to | in | on | home`** (three prepositions in a 4-tile bar).
- It repeats words from the sentence: `"too loud"` $\rightarrow$ **`loud`** (*"too loud loud"*); `"I feel sick"` $\rightarrow$ **`I`** (*"I feel sick I"*).
- It crowds the bar with empty demonstratives: `"not like"` $\rightarrow$ **`that | it | this | a`**.

These failures are **not** inherent limitations of on-device n-gram models. They stem from four concrete architectural defects in our local code and training pipelines. This document details each defect, its root cause, and the deterministic fixes required to repair the local engine regardless of JEV.

---

## 2. Four Architectural Defects & Their Fixes

### Defect 1: Trigram Amnesia (`ctx.length < 2`)

#### Root Cause
In `public/shared/funnel.mjs` (lines 178–184):
```javascript
// The book's context: last-2 in-vocab lemmas
for (let i = sentence.length - 1; i >= 0 && ctx.length < 2; i--) {
  const it = sentence[i];
  ...
  ctx.unshift(t);
}
```
The context window is hard-capped at **at most two lemmas**. The engine literally throws away all preceding words in sentences of 3 or more words:
- **`"can I have"`**: Context passed to the model is `["I", "have"]`. The question modal `"can"` is discarded. In child speech, `"I have"` is usually followed by *"I have got a..."* or *"I have not..."*, causing the engine to recommend **`get`** and **`not`**.
- **`"where did it go"`**: Context passed is `["it", "go"]`. The interrogative `"where"` is discarded.
- **`"can you help me"`**: Context passed is `["help", "me"]`. The request frame `"can you"` is discarded.

#### Fix: Sentence Mood & Variable-Length Backoff
1. **Track Sentence Type (Mood Marker):**
   Even with a 2-word trigram table, track sentence-level mood from the opening words:
   - Starts with modal (`can`, `could`, `may`, `will`): Flag `sentence_type = 'request'`.
   - Starts with wh-word (`where`, `what`, `who`, `why`): Flag `sentence_type = 'question'`.
   In a `'request'` sentence ending in `"have"`, suppress auxiliary verbs (`get`, `not`) and boost direct objects (`water`, `snack`, `turn`, `a`).
2. **Expand Context to 3 Lemmas (4-Gram Backoff):**
   The opening book (`opening_book.en.json`) is currently ~2 MB. Expanding key core frames to 4-grams (e.g. `"can I have [X]"`, `"I want to [X]"`, `"where is my [X]"`) adds minimal storage (~300 KB pruned) while eliminating sentence amnesia for the most common AAC carrier phrases.

---

### Defect 2: Blind "Invited" Grammar Heuristics

#### Root Cause
In `public/shared/funnel.mjs` (lines 28–34):
```javascript
export const GRAMMAR = {
  en: {
    invitesNoun: ({ pos }) => pos === "Verb" || pos === "Preposition",
    invitesVerb: ({ pos, prevPos, tailId }) =>
      pos === "Pronoun" || (pos === "Preposition" && tailId === TO_SENSE_ID && prevPos === "Verb"),
  },
};
```
The rule states: **If the tail word is a Pronoun, invite Verbs.**
- In English, a pronoun can be a subject (*"I want"*) or an object (*"I need you"*).
- Because `"you"` is a pronoun, the engine blindly boosts **every verb in the dictionary**.
- Since `"need"` is a verb and has high frequency, the engine boosts `need` after `"I need you"`, offering **`"I need you need"`**!
- Similarly, after `"help me"`, `"me"` is a pronoun, so the engine floods the bar with verbs (`do`, `put`, `get`, `make`), crowding out nouns, courtesy words, or specific actions.

#### Fix: Clause & Argument State Tracking
Replace raw POS checks with clause-aware argument checks:
1. **Distinguish Subject vs. Object Pronouns:**
   - Subject pronouns (`I`, `you` (initial), `we`, `they`, `he`, `she`) $\rightarrow$ invite finite verbs.
   - Object pronouns (`me`, `him`, `her`, `us`, `them`, or `you` when preceded by a verb) $\rightarrow$ **do NOT invite finite verbs**. They invite:
     - Infinitival `"to"` (infinitival bridge).
     - Prepositional phrases (`with`, `for`).
     - Adverbs (`now`, `please`).
     - Conjunctions (`and`).
2. **Clause Verb Saturation:**
   Track whether the current clause already has a finite verb:
   ```javascript
   const hasFiniteVerb = sentence.some(w => w.pos === "Verb" && !w.isAuxiliary);
   if (hasFiniteVerb && tailPos === "Pronoun") {
     // Object position: do NOT invite finite verbs!
     invitesVerb = false;
     invitesBridge = true; // invites "to", "with", "now"
   }
   ```

---

### Defect 3: Missing Anti-Repetition / Anti-Stutter Filter

#### Root Cause
There is zero penalty or check against suggesting a word or lemma that was just typed.
- Spoken child language corpora (CHILDES) contain frequent vocal repetitions and stutters (*"loud loud"*, *"no no"*).
- The raw n-gram count reflects this repetition, and the engine uncritically outputs:
  - `"too loud"` $\rightarrow$ **`loud`**
  - `"I feel sick"` $\rightarrow$ **`I`**
  - `"I need you"` $\rightarrow$ **`need`**

#### Fix: Immediate Lemma Suppression
In `public/shared/funnel.mjs` within `scoreCandidates`:
```javascript
// Never suggest the exact lemma just typed, unless specifically licensed
const tailLemma = sentence.at(-1)?.lemma;
for (const cand of candidates) {
  if (cand.lemma === tailLemma) {
    cand.s -= 10.0; // Hard suppression of immediate word repetition
  }
}
```

---

### Defect 4: The 4-Slot Monoculture (Zero Strip Diversity)

#### Root Cause
In `public/shared/funnel.mjs`, `finalStrip` simply takes `allowed.slice(0, cap)`.
Because function words (prepositions, articles, demonstratives) have overwhelming raw frequency in corpora, they cluster together:
- After `"I want to go"`, the top probabilities are:
  - `to`: 12.1%
  - `in`: 1.0%
  - `on`: 0.8%
  - `home`: 0.4%
- The resulting 4-tile bar is: **`to | in | on | home`** (3 prepositions).
- After `"not like"`, the top probabilities are:
  - `that`: 11.1%
  - `it`: 1.3%
  - `this`: 0.5%
  - `a`: 0.3%
- The resulting 4-tile bar is: **`that | it | this | a`** (4 demonstratives).

When all 4 tiles belong to the exact same grammatical category, the communicator's communication rate drops to zero if they wanted to say anything else.

#### Fix: Slot Diversity Quotas in `finalStrip`
Implement deterministic slot diversity rules in `finalStrip` (similar to how R21 currently handles the `"no"` slot):
1. **Preposition/Bridge Cap:** At most **one** grammatical bridge or preposition (`to`, `in`, `on`, `with`) in the 4-tile strip.
2. **Demonstrative Cap:** At most **one** demonstrative pronoun (`that`, `it`, `this`).
3. **Content Guarantee:** At least **two** slots must be allocated to content words (nouns, action verbs, descriptors, or entities) if any eligible content words exist in the candidate pool.

---

## 3. Training Corpus & Data Hygiene

### The CHILDES Alignment Trap
The opening book was compiled from:
- `childes` (TalkBank transcripts of parent-child audio)
- `td_age2` / `td_age5` (TinyDialogues)
- `imagine` (Imagine AAC)

**The Problem:** Toddler conversational speech recorded over a microphone is fundamentally different from motor-based augmentative communication (AAC):
1. **Spoken speech is inefficient:** Toddlers say *"like that that one"* because speech motor execution is cheap.
2. **AAC communication is motor-taxing:** An AAC communicator navigating a grid wants **high-impact semantic targets** (*"juice"*, *"bubbles"*, *"open"*, *"stop"*), not conversational padding (*"that"*, *"it"*, *"is"*, *"a"*).

### Actionable Data Cleaning:
1. **Penalize Spoken Fillers in the Book Builder:**
   In `scripts/prediction/book/build_book.mjs`, apply an AAC utility weighting:
   - Down-weight empty demonstratives (`it`, `that`, `this`, `thing`) by 0.5×.
   - Boost core nouns, specific action verbs, and regulatory words.
2. **Corpus De-duplication:**
   Strip stuttered consecutive tokens (`w1 w1` $\rightarrow$ `w1`) from CHILDES training lines prior to n-gram counting.

---

## 4. Summary: Before vs. After Proposed Local Fixes

| Utterance | Current Broken Behavior | Root Cause | Behavior With Local Fixes |
| :--- | :--- | :--- | :--- |
| **`"I need you"`** | `to \| need \| are \| don't` | POS rule invites verbs after pronoun `you` | **`to \| help \| here \| now`**<br>(`need` suppressed; object position invites bridge/action) |
| **`"can I have"`** | `get \| a \| some \| not` | 2-word amnesia loses `"can"` | **`water \| snack \| a \| turn`**<br>(Modal request mood enforces noun targets) |
| **`"I want to go"`** | `to \| in \| on \| home` | Monoculture allows 3 prepositions | **`home \| outside \| park \| to`**<br>(Prepositions capped at 1; destinations promoted) |
| **`"too loud"`** | `loud \| one \| and \| is` | Corpus stutters & no anti-repetition | **`stop \| quiet \| now \| and`**<br>(`loud` repetition suppressed; regulation elevated) |
| **`"not like"`** | `that \| it \| this \| a` | Demonstratives cluster in raw freq | **`that \| loud \| this \| touch`**<br>(Demonstratives capped at 1; sensory words preserved) |

---

## 5. Next Steps

1. **Implement Anti-Repetition & POS Clause Logic in `funnel.mjs`:** Immediate, zero-cost wins that instantly fix `"need you need"` and `"too loud loud"`.
2. **Implement Slot Diversity Quotas in `finalStrip`:** Prevents preposition and demonstrative clustering.
3. **Re-train Opening Book with AAC Utility Weighting:** Prunes toddler stutters and balances high-impact core words against conversational filler.
4. **Benchmark on Sim Replay:** Run `scripts/prediction/jev_smoke.mjs` and `npm run check:fast` to ensure the local hit rate increases without regressions.

---

## 6. Verified Bug List (2026-09-24)

Each bug below was reproduced by replaying sentences through `stripScored`
with the real catalog, `loadWeights` (sentence help doubles the book weight),
and `opening_book.en.json`, logging taps the way `public/board.js` does.
Causes are traced to code or book rows, not inferred from the strip.

| # | Bug | Seen as | Cause | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| B1 | The open sentence counts itself as history | Fresh profile, `go do play want` → strip `go, do, play, want` | `logSelection` wrote `history_count` on every tap, before `renderStrip()` (`public/board.js:861`); Clear/backspace never undid it | Write history only when a sentence is spoken | In progress (uncommitted `funnel.mjs`: `recordSpokenHistory`) |
| B2 | History falls through to the word's overall share when the word never followed this context | After `want`: hist(want)=0.408 > hist(juice)=0.400; `…want i` | Per-word backoff in `features()` treats "context seen, word never followed" like "context never seen" | Witten-Bell interpolation (~12 lines) | Not started |
| B3 | Book learned `i have → get` (24.8%) | `can I have` → `get`, `not` | Book builder splits `I've got` into `i have` + `got`→`get` (`scripts/prediction/childes/common.mjs` `expandContraction` + `toLemma`). Not a context-length problem: `can i → have` is right | Treat `'ve got` as one verb; regenerate book | Not started |
| B4 | Book learned stutters | `too loud` → `loud` (12%); `go → go` 6.8%; `need you → need` 8.6% | No repetition/retracing stripping in the builder | Strip CHAT `[/]` `[//]` material if the transcripts still carry markers, else collapse immediate repeats; regenerate book | Not started |
| B5 | Grammar rule invites verbs after an object pronoun | `I need you` → verbs | `invitesVerb` fires on any pronoun | Minor: `invited` weight 0.76 vs book ×40 — B4 is the main cause of `need you need` | Parked |
| B6 | Default weights fitted around B1/B2 | `freq` weight −2.14 | Fit ran on leaky `hist` | Refit after B1+B2; founder reviews old vs new | After B1+B2 |

**Corrections to § 2:** Defect 1 (amnesia) is B3, a data bug. Defect 2's
`need you need` is mostly B4. Defect 3 is B2 + B4 at the source, so no runtime
suppression is needed. Defect 4 (bar diversity) is a real complaint, but
`to | in | on | home` is what children say. Quotas by word type would be
hand-coded rules. Open for founder discussion, alongside Jev-based options.

## 7. Prediction Playground (build before more prediction tests)

The problem: we write green tests around an engine nobody looks at. Typing
five sentences found more real bugs than the suite did. Until the engine is
good, the founder's eyes are the instrument.

- **One page** (served by `npm run dev:agent`): type any words, see the strip
  instantly, update on every keystroke.
- **Why each word is there:** per-candidate feature breakdown (book, hist,
  invited, recency…), top 16 with scores, pNone.
- **Jev column:** the same moment with Jev's ranking and, optionally, the
  Jev-picked words beyond the local shortlist.
- **Profile switch:** brand-new / sample history / an imported real profile.
- **Flag button:** saves sentence + strip + a one-line note. The flagged list
  is the fixed test set later. It holds founder sentences only, never
  sentences an agent invented.
- **Rule until then:** keep the existing suite green; add no new prediction
  tests per fix. A fix is done when the founder retypes the flagged sentence
  and it looks right.
