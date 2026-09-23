# Phase 010 — Extended picture library

**Status:** Ready to execute. Not started. Size decided (slice 0).

**DECIDED 2026-09-22** (founder: "a thousand images only cost us $10 …
high leverage and high wow if we really build out our image library").
Intake: `docs/founder/2026-09-22_Customization_Library_Sync.md`.

| Topic | Owner |
| --- | --- |
| What the extended library is and how adds use it | `docs/product/Word_Library.md` § 5.2, § 6 |
| Selection method (age of acquisition, then Fry) | `docs/product/Initial_Vocabulary_600.md` (header) |
| Art style and generation rules | `docs/product/Motor_Grid_And_Art.md` § 4, `docs/product/Art_Generation_Lessons.md` |
| `secondary_fringe` tier | `docs/product/Language_And_Voice_Schema.md` § 14.2 (**PROPOSED**, lands in slice 3) |

The launch lexicon already names this tier: "Tier 3: Secondary Fringe
(Pipeline), 1,500–3,000" (`docs/product/Initial_Vocabulary_600.md` § 1).
This phase builds it.

## Why

A parent who types "trampoline" and sees our drawing already has a
finished word. A parent who has to find a photo usually gives up. The
bigger the drawn library, the fewer adds need a photo.

---

## Slice 0 — Size (decided)

**DECIDED 2026-09-22** (founder: "yes at least"): first pass 2,000 words
and 300 phrases. After that, growth comes from demand (slice 6 growth
loop). Generation is cheap; review speed is the real limit (slice 2).

## Slice 1 — The word list

Goal: a ranked, deduplicated list of candidate words and phrases, each with
role, archetype, category, and a one-line drawing description.

Method: the launch lexicon's selection method. Age of acquisition first
(`data/reference/aoa.csv`), then Fry bands, then functional coverage per
category (routines, school, medical, holidays, sensory, places). Phrases
are everyday two- or three-word routines ("brush teeth", "go potty",
"all done eating"). Nothing duplicates a launch sense.

Output: a human-readable source list in `docs/product/` (like
`docs/product/Initial_Vocabulary_600.md`) and a generated JSON beside
`data/launch_lexicon.json`. The markdown stays the source. The JSON is
regenerated from it.

Works Test: the generator rejects a row whose label matches a launch
lemma, a row with no category, and a duplicate row. Seed a fixture list
containing each and assert all three are rejected.

## Slice 2 — The art

Goal: every row drawn in the house style with `scripts/art/gen.mjs`.
Re-roll, never police the prompt (`docs/product/Art_Generation_Lessons.md`
§ 1).

Review gate: no readable text in an image (schema § 11 ban), one clear
subject, Fitzgerald role color where the archetype calls for it. The
review is a founder-and-agent pass (same practice as the occasions
review: side by side, decided together).

Build the review page first: a contact sheet of 50 images at a time,
with one key or tap for approve, re-roll or reject. At 2,300 images, how
fast this page is decides how fast the library ships.

Works Test: the catalog build rejects a `secondary_fringe` sense with no
approved image, and an approved image whose hash has no file.

## Slice 3 — The tier in the catalog

Goal: extended senses ship in the catalog with their pictures, are found
by `+ Add` and the Library, and appear nowhere else until added.

Files: `scripts/catalog/build_catalog.mjs`, `src/board/schema.sql` (tier
value), `public/shared/import.mjs`, the seeding in
`public/shared/groups.mjs`, the strip funnel, `extended.test.mjs` (new, in
src/board).

Works Test: after import, no `group_cell` row points at a
`secondary_fringe` sense. Typing "tramp" in `+ Add` offers `trampoline`
with its picture. Before it is placed, a strip state that would rank it
first does not render it. After placing it in Toys, the same state does.
Core snapshot unchanged.

## Slice 4 — Voices for the extended library

Goal: one clip per extended utterance in every shipped voice
(`scripts/catalog/generate_missing_audio.mjs`, the same path as the launch
catalog).

Works Test: the catalog build reports zero `secondary_fringe` utterances
without a ready clip in each shipped voice, or lists every miss by id.

## Slice 5 — Delivery and size

Goal: measured sizes and a delivery rule per platform
(`docs/product/Platforms_iOS_And_Web.md`).

**UNVERIFIED:** image and clip sizes. Measure the real files. Starting
rule: the iOS app bundles pictures and downloads clips per chosen voice.
The web app downloads extended pictures when first shown (thumbnail in
`+ Add`) and caches them.

Works Test: with the network off after first load, every extended word
that was shown once still shows its picture. An extended word never shown
shows its label and color, and the add still saves.

## Slice 6 — Draw it for me

**DECIDED 2026-09-22** (founder: "a really killer idea … for people that
make the full payment, we should absolutely enable it"). Product rules:
`docs/product/Word_Library.md` § 6.1. Pricing:
`docs/product/Pricing_And_Packaging.md` § 2.

Goal: from `+ Add` (no match, or "another picture") and from the word
card, **Draw it for me** sends the word and an optional hint, uses TypeSafe
Jev to pre-classify the semantic framing lens (`face`, `bust`, `full`,
`diagram`, `object`), generates one version in the house style via Muse
Image, and the adult accepts, re-rolls, or refines with a hint.

Parts:
1. **Server endpoint** on the Worker: a safety check on word and hint,
   a mandatory Jev classification step into the 5 framing lenses
   (`docs/operations/art-generator/SKILL.md`) and Fitzgerald torso color,
   one generation with `scripts/art/gen.mjs` settings via Muse Image
   (cutting generation cost by 66%), per-board limits (30 a day, about 1,000
   a year, starting values), and a count of each word with no board id.
   Parents cannot disable Jev for Draw it for me: requesting image generation
   explicitly invokes this cloud generation pipeline.
2. **Entitlement:** Pip Lifetime, or the 5-drawing free taste. The
   request carries the board id (already known to the relay, needed for
   the limits) and a proof of entitlement, and no personal identity. The
   limit counters are keyed by board. The word counts are stored apart
   from them, with no board id.
3. **UI:** one picture, **Accept**, **Re-roll**, and **Add/Edit hint**.
   The limit message appears only within 10% of a limit and names the reset date.
4. **Storage:** an accepted drawing becomes the entity's picture, or a picture
   override for a catalog word (schema § 14.1). It syncs like a photo.
5. **Growth loop:** a word drawn for 20 or more boards goes onto the
   slice 2 review page as a candidate for the library.

Lie-prone layers: a limit enforced only in the UI (enforce on the
server), and a privacy claim checked by reading our own code (capture the
request).

Works Test:
1. Capture the request body: it contains the word and the hint only. No
   entity id, no spoken name of another entity, no photo, no history.
2. The 31st request in a day for one board is refused by the server with
   a reset time, even when the UI check is bypassed.
3. A word on the safety block list is refused before any generation call
   (the generation stub records zero calls).
4. A free board's 6th drawing is refused. A Lifetime board's is not.
5. Accepting a drawing for a New word saves the entity with that picture
   offline-first: the save works even if the network drops after the
   acceptance.

Done when: that passes and a person types "trampoline", taps Draw it for
me, and puts our drawing on the board in under a minute.

## Out of scope

Real-photo suggestions (clipart first, founder 2026-09-22). Other
locales. Re-drawing launch art.
