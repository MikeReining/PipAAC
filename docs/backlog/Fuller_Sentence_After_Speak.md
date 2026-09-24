# Idea — The fuller sentence after Speak

**Status:** Never decided. An idea the founder wants to come back to
(2026-09-24). Not work. Name is a placeholder.

## The idea

The child builds a short message, for example *I waffle* or just
*waffle*, and presses Speak. Pip speaks exactly what the child built.
Then it shows a fuller version faintly underneath: *I want waffles*.
One tap says it; ignoring it costs nothing.

This is what speech therapists teach adults to do: the child says
"waffle", and the adult says back "you want a waffle?", one step past
what the child said, without demanding a repeat. The field calls it a
recast or expansion. Here the device does it.

## Why it could matter

- AAC users drop small words (*want*, *the*, *-s*) because every word
  costs a hunt and a tap. Shorthand is rational when words are
  expensive. A one-tap fuller version makes grammar cheap.
- School plans (IEPs) often target sentence length and word endings.
  This works on those goals during normal use, not in drills.
- It could win over therapists and parents: prediction that helps a
  child grow, not only go faster.

## How it could work without live LLM calls

- **The data already exists.** Real family conversation (CHILDES) is
  full of child turn → adult repeat-back pairs. They can be counted
  into a table, like the opening book (017 step 23; TalkBank permission
  scope, R11, to confirm for this table).
- **The vocabulary is closed.** 680 words, and most messages are 1–3
  words, so the common short messages form a finite list. Their fuller
  forms can be worked out once before shipping: from the repeat-backs,
  plus a one-time offline Jev pass for gaps. The result ships as data:
  instant, offline, and no per-use cost.
- **Judging Jev's grammar:** the founder and Claude review a sample
  side by side and decide. No eval harness.

## Rules it must respect

- Pip never speaks for the child without the child's tap (the concern
  behind the 012 hold).
- No invented message tiles (017 R13). The fuller version is made of
  real word tiles the child could have tapped, shown in order.
- No hand-coded grammar rules (017 R14). Fuller forms come from data or
  Jev, never from a rule table.
- A parent or therapist can turn it off.

## How we'd know it helps

The child's own average message length and use of small words, counted
on the device over weeks and shown on the parent dashboard. Speed
metrics can't see this.

## Open questions

- What's it called?
- Shown after every Speak, or only when the fuller form differs enough?
- Does the fuller form also show the word tiles on the grid, so the
  child sees where *want* lives?
- Related: the prediction strip's "their words ↔ one step up" dial
  (brainstorm, 2026-09-24). Same goal, earlier in the message.
