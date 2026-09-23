# CHILDES / TalkBank — written permission

**Received:** 2026-09-23, 11:39 AM, by email to the founder (Mike).
**From:** Brian MacWhinney `<macw@andrew.cmu.edu>` — Teresa Heinz Professor of
Cognitive Psychology, Language Technologies and Modern Languages, CMU;
director of TalkBank / CHILDES.
**In reply to:** the founder's request of 2026-09-23 (§ The request,
full text).

**Evidence:** `2026-09-23_TalkBank_CHILDES_reply.png` (screenshot of the
thread; SHA-256 `97804ee3be85fc49cdab9ac1c2564a0def76db08d37c8a9b8cd5a15e4d73c288`).

## Reply, verbatim

> Mike,
> Using locally is fine. Shipping the next-word prediction table is also
> fine. Maybe we could even post that as a "derived measure" at the CHILDES
> site.
>
> — Brian MacWhinney

## Scope

What the reply grants, read literally:

1. **Local use.** CHILDES transcripts may be used on our own machines:
   measurement, the bench and its held-out test set, gap analysis, and
   building the opening book.
2. **Shipping the next-word prediction table.** Word-to-word counts or
   probabilities derived from CHILDES may ship in Pip's opening book.

What it does not cover, so we don't do it without asking again:

- Committing or redistributing CHILDES transcripts or utterances. The raw
  files stay local, outside git.
- Shipping anything but the prediction table (e.g. whole sentences, or a
  model trained to reproduce them).

Still owed: TalkBank's citation ground rules (cite MacWhinney 2000 and the
corpora used) wherever the derived table is credited.

Open offer: publish the table as a "derived measure" on the CHILDES site.
Not an obligation; founder's call.

## The request, verbatim (the email the reply answers)

Sent by the founder on 2026-09-23; full text supplied by the founder the
same day (the screenshot shows only its first line).

> Dear Professor MacWhinney,
>
> I'm building Pip, an AAC app for nonspeaking children. The core app is
> free so families aren't blocked by the $250–350 price of the main AAC
> apps; there's an optional paid tier. I have a TalkBank account and have
> read the CC BY-NC-SA ground rules.
>
> Per the ground rules' algorithm-development provision, I'll use CHILDES
> locally only, to evaluate next-word prediction — transcripts never ship
> or enter the repo.
>
> My question: may we also ship a small derived lookup table — next-word
> probabilities over a fixed list of ~680 common words, computed from
> aggregate CHILDES counts (child and caregiver utterances)? It would
> contain no utterances, no speaker IDs, no transcript text — only counts
> over that closed vocabulary, not reconstructable into original lines.
>
> If not permitted, I won't ship it — the table will be built from openly
> licensed sources instead.
>
> Happy to send the exact format. I'll cite TalkBank/CHILDES and the
> corpora used in any write-up.
>
> Thank you,
>
> Michael Reining
> Founder, Pip (pipaac.org)

The request disclosed the paid tier, so the permission covers a
commercial product.

So "the next-word prediction table" in the reply means that table:
next-word probabilities over Pip's closed vocabulary, from aggregate child
and caregiver counts, with no utterances, speaker IDs, or transcript text.
The founder reads the reply as granting both uses: local use and shipping
that table.

If the vocabulary grows well past ~680 words (e.g. the extended picture
library), the table grows past what was described. Tell TalkBank before
shipping that version.
