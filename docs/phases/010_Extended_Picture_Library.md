# Phase 010 — Extended picture library

**Status:** Ready to execute after a founder call on size (slice 0). Not
started.

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

## Slice 0 — Founder call: size and phrases

Recommendation: 1,300 words and 200 short phrases for the first pass
(about 1,500 images, about $15 at the founder's estimate), then grow from
the demand signal (slice 6).

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
review is a founder-and-agent pass on a contact sheet (same practice as
the occasions review: side by side, decided together).

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

## Slice 6 — Draw it for me (PROPOSED)

**Founder call before building.** When nothing matches, **Draw it for me**
sends only the typed word to our server. That is the only time it leaves
the device. We draw it in the house style, and it comes back as that
word's picture. Request counts, with no device id, rank what enters the
library next.

Privacy boundary: this is an explicit per-word tap by the adult, never
automatic. An entity's spoken name is otherwise sent only to enrichment
(`docs/product/Personal_Entities.md` § Enrichment).

## Out of scope

Real-photo suggestions (clipart first, founder 2026-09-22). Other
locales. Re-drawing launch art.
