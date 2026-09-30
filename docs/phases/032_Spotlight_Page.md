# 032 — Spotlight gets its own page

**Status:** A, B, C built 2026-09-29; E built 2026-09-30. Waiting on
founder review of A–C and E. D (partner-phone coach polish) is held until
then (founder, 2026-09-29).

## Founder intent (2026-09-29)

Spotlight (013) works in code, but the surface is a 2/10: it hides behind a
"Practice words" button on Overview, between Add a word and Edit the board.
Nobody can tell what it is. The sheet leads with knobs, and the session
timer contradicts its own footnote ("Until ended · 15 min…" / "always ends
by midnight"). The founder adopted the agent's review in full: its own
sidebar page, one name, no timer, a try-it demo instead of a video.

## What Spotlight already is (code, not this doc)

`public/shared/spotlight.mjs` owns the semantics: a session glows target
words and dims the rest, never muting one; saved lists; a list marked as
a goal feeds Progress (own taps vs glowed taps); an SLP's per-word tips;
live modeling from a linked (`role: "partner"`) device; the coach bar on
that device (`public/board/coach-ui.js`). Laws: Design_System § Attention
layer.

## Decisions

1. **One name: Spotlight.** "Practice words" is deleted. Verbs on buttons:
   *Spotlight words*, *Start*, *End*. "Goal" → *Track progress*; "Tips" →
   *Coaching tips*.
2. **Its own Settings page**, after Words. The nav line is live state:
   `Off · 2 lists` / `On · Snack time · until tonight`. Overview loses the
   button and caption. While a spotlight runs, Overview leads with a card
   that says so, with End.
3. **No timer.** A session runs until someone ends it, and always ends at
   local midnight (the safety net stays in `startSession`). The Session
   length control is deleted. `spot_minutes` stays in the schema but is
   no longer read. A row synced from an older device keeps its own
   `ends_at`.
4. **Settings before value is backwards.** Page order: what it is →
   right now → your lists → model from a phone → progress → look (folded).
5. **Model from this device is shown only where it does something**: on a
   partner device (`me.role === "partner"`). The child's device instead
   explains linking a phone and opens Add a device.
6. **Try it instead of a video.** A spotlight on this person's own board,
   with three coach cards the adult steps through. It is a local layer only: no session
   row, no sync op, and it never touches a running session.
7. **Suggested lists** (slice C; First words revised in E): First words
   (want, more, help, not, that, look — asking, refusing, pointing, and
   commenting, not only requests), Snack time (eat, drink, more, all done, open), Play time (go,
   stop, turn, look, like). Every word already has a shipped coach tip and
   sits on the 60-button home board. Content lives in
   `public/shared/spotlight_starters.mjs`. One tap adds a list to Your
   lists. **Needs founder review**, like any shipped content.
8. **Dim labels were inverted** (found in B). `spot_dim` is the dimmed
   words' opacity, so "A little" wrote 30, the strongest dim. The labels
   now match (A little 60, Medium 45, A lot 30). Stored values keep their
   look.
9. **Try it never counts as the child.** While it runs, a tap speaks and
   nothing else: no sentence, no tap log, no sync op. It ends on Done, on
   the 🔦 chip, or after two minutes. It is hidden while a real spotlight
   runs.

## Slices

| Slice | Scope | Proof |
| --- | --- | --- |
| A | Sidebar page (existing controls moved in), Overview cleanup, copy renames, timer removed, pick bar tells you what to do, list name suggested from the picks | `scripts/probes/spot_session_probe.mjs` drives Settings → Spotlight → pick → save → Start |
| B | Page layout: hero, Right now card, list cards with word chips, Model-from-phone by role, Progress pointer, Look folded with a live preview | same probe + screenshots at 820 and 390 wide |
| C | Try it demo (3 coach cards) + suggested lists | `scripts/probes/spot_demo_probe.mjs`: glow on the real grid, no `spotlight_session` row, no sync op, no logged tap, the layer is off after. Seen failing with the tap intercept removed |
| D | Partner-phone coach flow polish | **held** for founder review of A–C (and E) |
| E | Spotlight teaches moves, not only words (founder, 2026-09-30) — see § Slice E | `src/board/spotlight_controls.test.mjs`; `spot_demo_probe` (✨ lit in the real top bar, ❓ picked into a saved list, the live ✨ card with the network stubbed) |

## Slice E — moves (founder, 2026-09-30)

Why: for a Pip user the most valuable skill is not a word but two words
and a button. ✨ is a grammar pass (023's wand law, 2026-09-30): it adds
only the little words — is, are, a, the, to — and never a word the child
didn't tap, never a guess at what they mean. "we play" → "We are
playing." ❓ asks the same taps, with no question grammar to build: "Are
we playing?" (First drafted here as "✨ expands 'more swing' into 'I want
more swing'" — that adds a subject and a verb, exactly the guessing the
wand law bans. Corrected in E7.) Research the founder brought: model refusal,
pointing, and commenting from day one, and early sentences are two-word
combinations.

| Part | What | Status |
| --- | --- | --- |
| E1 | First words: want, more, help, not, that, look | built `687c3c6` |
| E2 | ✨ / ❓ as targets (`control:fix` / `control:question` on `spotlight_list.controls`); pick them, model them from a phone; moves lists (now Add the little words, Ask a question, Say no), each with a recipe for the adult | built `1830806` |
| E3 | Try it's third card: tap more, then go, then ✨ — a live transform. Demo taps build the bar but never the log; the child's bar is set aside and comes back | built `f941373` |
| E5 | Instructions show what you press, not words to hunt for (founder, 2026-09-30): each Try it card draws the board's own tiles and the live ✨ / ❓ icon (`public/board/move-row.js`); the move card outlines the next one and fades pressed ones; each moves suggestion shows one example move as tiles | built |
| E6 | One worked example (founder, 2026-09-30: the page, card 1, and card 3 showed three different examples). `SHOWCASE` in `spotlight_starters.mjs`: the page's picture and every Try it card use the same six tiles; what glows is read from First words; the picture taps `go`, card 2 asks for `go`, card 3 is more → go → ✨. No arrow on the comparison card | built |
| E7 | Rebuilt on the wand law (founder, 2026-09-30). The showcase pair is **we play** — happy and shared (founder: never lead with a negative feeling), every button proven in battery v5: "We are playing." / "Are we playing?". Try it is five cards: compare → tap play → we → play → ✨ → tap ❓ → end, and after each press the card shows taps → what Pip said. "Make it a sentence" → **Add the little words** (we mom it play good + ✨); Ask a question uses the same words + ❓; move examples are battery-proven pairs only (a test enforces it). Copy says what ✨ does — "adds only the little words… never guesses" — never "whole sentence". Also fixed: Try it's Smart bar opened a sentence row and logged impressions, so the demo's speak counted as her spoken sentence | built |
| E4 | Progress → Sentence buttons: ✨ ❓ ⏪ ⏩ presses on their own vs with the glow, by week. New device-local `transform_event` (additive table until the catalog ships it) → `stats_day.transforms` → `sentenceButtons()`. Research sharing is a whitelist and does not carry it | built |

Rules kept: the glow invites, it never scripts an order; ✨ runs only on a
press; recipes never state a button's output; no efficacy claim in copy.

Open (founder): the **first-run tour** (`public/board/tour-ui.js`, not
032's) still scripts "want apple" → ✨ → "I want an apple." — under the
wand law the model says "Want an apple." (battery: "want cookie" → "Want
a cookie."), and the tour's own header says scripted results must match
live output. Needs a proven pair (e.g. we play) or a founder ruling.

## D — held, candidate scope (not decided)

Written down so it isn't lost; the founder decides after reviewing A–E.
- The coach bar on a linked phone: today a row of word chips, one tip
  line, and a tally. Candidates: show the list's recipe (moves), group
  ✨ / ❓ apart from words, and a clearer "you're modeling" state.
- Starting, switching, and ending a spotlight from the phone without
  opening Settings.
- Phone-width top bar: the 🔦 End chip is off-screen at 390px (see
  below) — if D owns the phone experience, it needs this fixed first.
- The older spot probes (mirror, model, coach) still launch Chrome via
  `open -na`; move them to the binary when D touches them.

## Works Test

On a fresh agent profile at 820×1100: open Settings. **Spotlight** is in the
list. Open it, tap *Spotlight words*, and tap *want* and *stop* on the
board. The pick bar counts them and nothing speaks. Tap *Start*: both cells
glow and the rest dim. Settings' Spotlight line reads *On · …*. End it:
nothing glows. The session's `ends_at` is the next local midnight.

## Found, not fixed here

- **Phone width: the 🔦 End chip is off-screen.** At 390px the board's top
  bar overflows (the 023 transform buttons). The chip lands at x≈458–639.
  At 820 it fits. Phones can still end a spotlight from Settings (the
  Overview card and the Spotlight page). The fix belongs to the top bar
  layout, not this phase.
- **Probe hygiene (fixed for 032's two probes in E):** probes that
  launch headless Chrome through `open -na` leave it running after
  `chrome.kill()`, and a running Chrome can swallow the next launch.
  `spot_session_probe` and `spot_demo_probe` now spawn the binary. The
  older spot probes (mirror, model, coach, layer) still use `open -na`.

## Founder review

`http://localhost:21087/?reseed` → Settings (gear) → Spotlight.
