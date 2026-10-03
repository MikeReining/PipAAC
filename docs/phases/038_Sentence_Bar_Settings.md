# 038 — Sentence Bar Settings: choose which buttons the person sees

**Status:** proposal, not built. Brainstormed with the founder 2026-10-03.
**Truth owner:** the per-person setting (synced profile field). The bar renders
it; the bar never decides it.
**Why:** the top bar offers Fix it, Question, Past, Play, Future, plus Delete
and Clear. Different people need different subsets: some only want Play, some
Play + Question, some everything. An adult (parent/SLP) picks; the child's
board never changes on a guess.

## 1. Findings that shape the design (traced 2026-10-03)

1. **Question is not free and not offline.** `public/board.js:566` →
   `transformAndSpeak("question")` (`public/board/speech.js:~285`) →
   `POST /api/v1/transform` (`src/worker/transform.js`). It needs the internet,
   a Pip Lifetime license (`bad_license` → "comes with Pip Lifetime" toast),
   and a fair-use cap (20,000 chars/day ≈ 200 sentences, 30 requests/min).
   Model: `qwen/qwen3.8-27b` on Groq, temperature 0. Offline it speaks the bar
   as built and toasts.
   **Consequence:** a *Play + Question* default for a free user is a button
   that hits an upsell wall on first tap. Do not make it the default for
   unlicensed people. Show it in the setting, labelled as Lifetime.
2. **023 § 1 says "Control positions never change, hide, or reorder (motor
   planning)" and "No toggles."** This phase overrides that *only* for an
   adult's deliberate, stored setting. The bar never changes mid-use, so
   motor planning holds per person. Update 023 § 1 when this is built.
3. **Play is the tense switch's centre** (023 § 1d): ▶ restores her words with
   no model call. Hiding ⏪/⏩ leaves Play working as it does now.

## 2. The setting

Home: **Settings → Talking** (already holds feeling faces; the menu subtitle
today reads "Eve · feeling faces on"). Name: **Sentence bar**.

Controls (one toggle each, per person):

| Control | Needs model? | Can be hidden? |
| --- | --- | --- |
| ▶ Play | no | **never** |
| ✨ Fix it | yes | yes |
| ❓ Question (label: "Question", not "What does it mean") | yes | yes |
| ⏪ Past / ⏩ Future | yes | yes (one pair, or two toggles — decide) |
| ⌫ Backspace | no | yes, with warning |
| ✕ Clear | no | yes |
| Feeling faces | no | already exists |

Presets above the toggles (a preset just sets the toggles):

- **Just play** — Play only.
- **Play + Question** — asking is the hardest AAC skill; both buttons do
  something the person can't do alone.
- **Play + Question + Fix it**
- **Everything** (today's bar)

Menu subtitle: "Eve · Play + Question".

## 3. Who it serves

| Person | Likely setting |
| --- | --- |
| Just starting, or motor/attention difficulty | Just play |
| Emerging combiner | Play + Question |
| Telegraphic builder ("me want go park") | + Fix it |
| Working on tense (SLP goal) | Everything |
| Teen/adult AAC user (ALS, stroke) | Play + Question + Fix it, no feeling faces |
| SLP running a progression | Starts small, adds buttons, never restarts |

## 4. Rules

- **Existing people keep today's bar.** Default = Everything. No one loses a
  button on an upgrade (and per `no-users-no-migrations`, a clean format
  change is fine).
- **Adult-set, PIN-gated** like other Settings. Per person, synced across
  devices (school iPad = home iPad).
- **Never auto-hide or auto-add.** No inferring from the child's behaviour.
- **Freed space goes to Play** (larger target), not a gap. Open: does Play keep
  its exact slot, or does the bar reflow? Decide with a motor-planning view.
- **Delete/Clear:** a person who can tap once or twice needs undo. Hiding
  Backspace shows a one-line warning; Clear's 5 s undo pill stays.
- Instructions and tour show the real tiles/icons, and only the buttons that
  person has (`instructions-show-tiles`).
- Spotlight (032) targets `control:fix` / `control:question`; a hidden control
  must not be targeted. Progress counts only what's shown.

## 5. Slices

1. Schema: per-person `bar` field (list of shown controls) + migration of
   absent field → Everything. Proof: round-trips through sync.
2. Render: `renderBar` / `syncTxButtons` honour the field; Play grows.
   Proof: Works Test — set Just play, confirm only Play is on screen on a real
   device, tap it, hear the sentence.
3. Settings UI under Talking: presets + toggles + subtitle.
4. Spotlight/Progress/tour respect hidden controls.
5. Update 023 § 1 wording.

## 6. Separate cheap fixes surfaced the same day (not part of this phase)

- Home hero mock (`site/public/index.html:79`) shows 😊😢😠 emoji; swap for the
  app's real feeling-face icons (`public/icons/voice-*.svg`).
- Hero mock top bar: show one Play button only ("As simple as you want it").

## 7. Open questions for the founder

- Should *Play + Question* be the default for **licensed** new people, and
  what does an unlicensed person see (Question shown with a Lifetime badge, or
  hidden until unlocked)?
- Past/Future: one toggle or two?
- Does Play keep its slot or does the bar reflow?
