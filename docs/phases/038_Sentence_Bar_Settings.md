# 038 — Sentence Bar Settings: choose which buttons the person sees

**Status:** built 2026-10-03 (slices 1–5). Founder decisions same day:
Past and Future are **two toggles**; hidden buttons free space and **Play
grows into it** (the bar reflows). Truth owner: `learner_profile.bar_controls`
(synced JSON list of shown controls; NULL = Everything).
**Truth owner:** the per-person setting (synced profile field). The bar renders
it; the bar never decides it.
**Why:** the top bar offers Fix it, Question, Past, Play, Future, plus Delete
and Clear. Different people need different subsets: some only want Play, some
Play + Question, some everything. An adult (parent/SLP) picks; the child's
board never changes on a guess.

## 1. Findings that shape the design (traced 2026-10-03)

1. **The model buttons are not free and not offline.** ✨/❓/⏪/⏩ all call
   `transformAndSpeak` (`public/board/speech.js:~285`) →
   `POST /api/v1/transform` (`src/worker/transform.js`), which gates on the
   license for every mode (`bad_license` → "comes with Pip Lifetime" toast).
   They need the internet, a Pip Lifetime license,
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
| ⏪ Past | yes | yes (own toggle — founder 2026-10-03) |
| ⏩ Future | yes | yes (own toggle) |
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
- **Freed space goes to Play** (larger target), not a gap. Decided
  2026-10-03: the bar reflows — hidden buttons leave the layout and Play
  grows by the space each freed (`--play-grow` on `#topbar`, capped).
- **Delete/Clear:** a person who can tap once or twice needs undo. Hiding
  Backspace shows a one-line warning; Clear's 5 s undo pill stays.
- Instructions and tour show the real tiles/icons, and only the buttons that
  person has (`instructions-show-tiles`).
- Spotlight (032) targets `control:fix` / `control:question`; a hidden control
  must not be targeted. Progress counts only what's shown.

## 5. Slices — all built 2026-10-03

1. Schema: per-person `bar_controls` column (JSON list of shown controls,
   NULL → Everything) + additive migration. Proof: op-log round-trip in
   `src/board/bar_controls.test.mjs`.
2. Render: `syncBarSeg` hides the buttons (`hidden` + `#bar-btns` when
   empty) and Play grows via `--play-grow` on `#topbar` (66 px per hidden
   model button, capped 336 px).
3. Settings UI under Talking: presets + per-button toggles + Backspace
   warning + Lifetime tags + the nav-list subtitle.
4. Spotlight (`startSpotlight`/`listTargets` skip + suggestions filtered),
   Try it (steps built per person), the tour (steps filtered), and
   Progress (presses filtered) all respect hidden controls.
5. 023 § 1 amended.

## 6. Separate cheap fixes surfaced the same day (not part of this phase)

- Home hero mock (`site/public/index.html:79`) shows 😊😢😠 emoji; swap for the
  app's real feeling-face icons (`public/icons/voice-*.svg`).
- Hero mock top bar: show one Play button only ("As simple as you want it").

## 7. Open questions for the founder

- Should *Play + Question* be the default for **licensed** new people, and
  what does an unlicensed person see (Question shown with a Lifetime badge, or
  hidden until unlocked)? **Still open** — shipped with Everything as the
  default for everyone; the model buttons carry a "Lifetime" tag in the
  setting.
- ~~Past/Future: one toggle or two?~~ **Two toggles** (founder 2026-10-03).
- ~~Does Play keep its slot or does the bar reflow?~~ **Reflow — Play
  grows** into the freed space (founder 2026-10-03).
