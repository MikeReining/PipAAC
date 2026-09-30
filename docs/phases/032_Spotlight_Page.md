# 032 — Spotlight gets its own page

**Status:** A, B, C built 2026-09-29, waiting on founder review. D
(partner-phone coach polish) is held until the founder has reviewed A–C
(founder, 2026-09-29).

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
7. **Suggested lists** (slice C): First words (want, more, help, stop,
   all done), Snack time (eat, drink, more, all done, open), Play time (go,
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
| D | Partner-phone coach flow polish | **held** for founder review of A–C |

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
- **Probe hygiene:** the spot probes launch headless Chrome through
  `open -na`, so `chrome.kill()` leaves it running. Back-to-back runs can
  collide on the debug port. Workaround: `pkill -f pip-spot`.

## Founder review

`http://localhost:21087/?reseed` → Settings (gear) → Spotlight.
