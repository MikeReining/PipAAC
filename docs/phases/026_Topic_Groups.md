# Phase 026 — Topic groups

**Status:** EXECUTING — launch direction approved 2026-09-27. **Slice 1
compiled 2026-09-28 (027 A1):** `data/group_seed.topics.json` is the live seed,
capacity-checked by `scripts/catalog/build_groups.mjs` (one page on 60/90, every
launch word reachable on every size). Home, Describing and Little words split
into Home/Things, Describing/Touch & sound, Little words/Who & which — a
curation draft for founder review (`node scripts/catalog/preview_blocks.mjs`).
**Slice 3 built 2026-09-28:** 319 lexicon words carry `None`, schema CHECK and
catalog regenerated, preview shim removed. On screen: home board unchanged
(zero `r-None` on grid60), Animals page shows 33 neutral tiles.
Slices 2 and 4 open. The existing
`public/preview-groups.html` is an earlier review, not launch proof; the compiled seed renders with `node scripts/catalog/preview_blocks.mjs`.

**2026-09-27:** group behavior and editing are owned by
`docs/product/Motor_Grid_And_Art.md` § Groups; 027 owns implementation. Blocks
are authoring tools only. This phase owns topic membership, noun/object color,
and topic door icons. All new groups use the same local editing rules.

| Topic | Owner |
| --- | --- |
| Occasion seed composition, geometry, and execution map | `docs/phases/027_Occasion_Boards.md` |
| Groups are the backup path to every word | `docs/product/Motor_Grid_And_Art.md` § Groups |
| Door order, doors, banded layout | `docs/phases/018_Core_Board_V2_And_Groups.md` D5, D6 (D6's list replaced here) |
| Occasion time windows (prediction) | `docs/phases/007_Occasions.md`; occasion doors are 027 |
| Word colors | `docs/product/Motor_Grid_And_Art.md` § 3 (amended by D8) |

## Why

Groups sorted words by grammar: foods in Food, *eat* in Actions, colors in
Describing. One thought meant several doors — *I want to paint* was
Actions, then Play, then Describing. Actions (48 words) and Moving (18)
split verbs by body part, so no one could guess which door held *kick*
(Moving) or *hit* (Actions). Several groups were grab-bags: Body held the
potty, Animals held the weather, Feelings held *sticky* and *loud*.

The field solves this the same way. PODD puts each topic's verbs, nouns,
and describing words on the topic's page. Proloquo files topic verbs under
the topic (*cook* in Food, *ride* in Vehicles). TD Snap Core First has
situation Topics. Young children group nouns and action verbs by event,
not by grammar (Fallon, Light & Achenbach 2003).

## Decisions

### D1 — A group is a whole topic

A group holds everything said about its topic: the things, the actions,
and the describing words. **Actions is retired**; every verb moves to the
topic it is used in. **Moving folds into Outside.** Home-board words stay
on the home board; a group may repeat one when the topic needs it (*eat*
in Food).

### D2 — The doors

027 puts Breakfast, Lunch, Dinner, Snack first on a new profile; My Words
then leads the topic order below, with the grammar backup last. Set once,
then frozen. Counts below are input sizes, not final capacity claims.

| Door | Holds | Words |
| --- | --- | --- |
| My Words | the family's words | — |
| Social | greetings, manners, reactions, safety + *talk, tell, ask, know, remember, forget, choose* | 42 |
| Numbers | one–ten + *count* | 11 |
| People | people + *hug, kiss, tickle, love, share, give, take* | 39 |
| Time | times, days, order words + *wait* | 25 |
| Home | rooms, furniture, dishes, household things + *sleep, wake up, clean up, open, close, fix, break, find* | 57 |
| Describing | size, texture, sound, light, quality + *same, different* | 52 |
| Outside | yard, park, playground gear, weather, nature + every moving verb + *hot, cold, wet* | 44 |
| Animals | animals + *zoo, farm, pet* | 34 |
| Body & health | body parts, sick, hurt, medicine, doctor + *see, touch, scratch, hit, bite* | 40 |
| Food | food, meals + *eat, cook, bite* — **superseded:** food is distributed across 027 meal and topic groups; no Food door | 57 |
| Going out | stores, places in town, vehicles + *ride, wait* | 41 |
| Colors | the colors + *color* | 11 |
| School | school places and people + *read, write, count, listen, ask, show, work* + *easy, difficult, right, wrong* | 27 |
| Drinks | drinks, cup, bottle, straw + *drink, thirsty* — **an ordinary group with coordinated 027 seed positions** | 12 |
| Art & music | paper, crayons, markers, music + *draw, color, paint, cut, glue, write, sing, dance* | 16 |
| Feelings | emotions + body states (*hungry, tired, hot, cold, sick*) + *feel, laugh, cry* | 32 |
| Clothes | clothes | 28 |
| Play | toys, games + *play, build, share, my turn, your turn* | 20 |
| Bathroom | potty, bath, teeth, towel + *wash, wipe* + *wet, dry, clean, dirty* | 20 |
| Screens | tablet, TV, phone, headphones, charger + *turn, listen, loud, quiet* | 15 |
| Little words | grammar backup (+ *they, mine, under, over, away, but, or, because*) | 56 |
| More people / doing / where / describing | the rest of `grid60` — **`grid15` only** (D5) | 10 / 15 / 12 / 9 |

Bathroom and Screens keep the draft topic order for launch. Families can
reorder or hide any group; frequency never reorders an installed index.

**Member order, ruled 2026-09-28** (founder): inside a group, words fill
band columns most-said-first by CHILDES child-line counts
(`data/prediction/word_frequency.en.json`, built by
`scripts/prediction/childes/word_frequency.mjs`); the seed's authored
order breaks ties and orders unheard words. No hand-ranked word lists.
Occasion groups keep their shared coordinates (027) — pinned
homeCoordinates/firstPage/lead and cluster order stay authored — but
inside each cluster and among leftovers, words claim cells most-said
first by the same counts.

### D3 — One page per seeded topic on 60/90 cells

027's shared geometry computes capacity from the reserved cells (the home
board's top row and frame, plus Next). Every group has **46** content cells on
grid60 and **76** on grid90; a meal group spends three of them on *eat, drink,
all done*. grid15 pages (7 content cells per page). The counts in D2 therefore require an authoring pass: Home, Describing,
and Little words cannot ship unchanged as 60-cell one-page groups. Partition
surplus vocabulary into meaningful sibling groups with fixed index slots and
no nested groups; never drop vocabulary to pass a size check. 027 A1 owns this
pass and its negative fixtures. Personalized groups may grow additional pages.

### D4 — Superseded by 027

Was "a word goes where people look first". Words now repeat in every door
where someone might look (027 § 3). The proposal's 41 two-door words stay.

### D5 — The More groups show on `grid15` only

They hold the rest of `grid60` for Core 15 users (014 § 3.1). On `grid60`
and `grid90` every word in them is already on the home board, so they were
four doors of repeats. The seed carries `layouts: ["grid15"]`.

### D6 — Every word is reachable on every layout

Today 18 words sit only on the `grid90` board and in no group, so on
`grid60` and `grid15` only the Smart bar or keyboard reaches them: *they,
mine, see, read, feel, tell, think, find, work, wait, away, under, over,
same, different, but, or, because*. The build's reachability gate only
checked words with a catalog category, and these have none. The proposal
gives each a door; 027 slice A1 makes the gate check every launch word on
every layout for the fresh seed. Family removals/hides/masks may deliberately
reduce group reachability; Library recovery remains available.

### D7 — Door icons are ink glyphs

Same family as `public/icons` (24 grid, 2px ink, round caps, no color).
Draft set in `public/icons/groups/` (founder-approved style; Body is the
arms-out figure). Describing uses a contrasting-size shapes glyph; the
palette moves to Colors.

**Wired 2026-09-28:** `GROUP_ICONS` in `groups-ui.js` paints the svg for
mapped doors and falls back to the seed emoji where no art exists, so a
new group shows its gap until it gets a glyph. Reused: `places` → Going
out, `actions` (pointing hand) → Touch & sound, the palette → Colors,
`food` (fork and knife) → Dinner, the chrome question mark → Who & which.
Unused drafts: `moving`, `vehicles`. Hand-drawn svg only; no generated
raster batch is authorized by this packet.

**Gap list closed 2026-09-28** (founder picks): Breakfast bowl and spoon,
Lunch sandwich half, Snack cracker with a bite (healthier than a cookie),
Fruit apple, Things open box, Describing big circle + small square
(`shapes`), Outside tree, School backpack, Art & music paintbrush (one
object, not two), Bathroom faucet with a drop (the polite word, not a
toilet), Screens tablet with play. `weather` (sun behind a cloud) is
drawn and mapped ahead of the Weather group below.

### D8 — Things and places take the neutral frame

Decided with the founder 2026-09-26. People and pronouns stay yellow;
things and places take the existing no-role pair (`.r-None`, `#8a8578` /
`#f2efe6`) — about 310 words. No new color: five grammar hues plus
neutral. The home board is unchanged (its yellow words are all people and
pronouns). Group doors and noun tiles share the gray; the folder tab says
"opens" (the "gray = not a word" line in `groups-ui.css` goes).

### D9 — Object art is its natural color

Each object is drawn in its natural main color, one picture per word, so
the color never changes. **The one exception is `house` (plain black and
white) vs `home` (warm color — the color is the meaning).** Stick-figure
torsos keep the grammar color.

### D10–D12 — Implemented through 027

Occasion membership, coordinated starting positions, repeated top row ON,
frame, grid navigation, corrected first-word priors, and local editing are
specified in 027. These replace both earlier address/block prototypes; the
live product contract is Motor_Grid_And_Art § Groups.

## Evidence (CHILDES, 2026-09-26)

Measured on the proposal by `scripts/prediction/childes/measure_groups.mjs` (retired with the 027 A1 swap; in git history) — every transcript,
like for like (a word counts only if both seeds put it behind a door).
"Door words" are words not on the home board. Reported, not gated.

| `grid60`, child lines | Today | Topics |
| --- | --- | --- |
| Content words: lines with 2+ door words served by one door | 10.6% | 14.8% |
| Content words: next door word behind the same door | 29.8% | 33.2% |
| Content words: doors per line | 1.228 | 1.217 |
| All words: lines with 2+ door words served by one door | 9.6% | 10.8% |

Adults move the same way (content, one door: 8.2% → 11.6%). `grid15`
moves less (4.6% → 5.3%) — most of its words are behind a door either way.

What this says, plainly:

- The gain is real and modest. Most lines need only one door word
  (740k lines have one or more; 161k have two or more), so which door is
  *findable* matters more than which words share it — and findability is
  not measurable in a corpus. It rests on the design argument above.
- **Little words are 35% of every word a child needs a door for** (*the,
  a, was, are*). No topic can hold them. That hunt belongs to the Smart
  bar's "one step up" (017 R21), not to groups.
- Social (8%) and Numbers (8%) are the next biggest doors — hence the order.

## Slices

1. **Finalize and compile topic membership with 027 A1.** Update the authored
   mapping for the actual reserved-cell capacity, meaning resolution, layout
   eligibility, and every-launch-word reachability. Seed mixed topics in useful
   clusters; shared meal/Fruit/Drinks positions follow 027. The final compiler
   output replaces the old seed through the normal catalog build, seeded once
   (027 A2; a clean break — no saved groups to convert), never re-seeded.
   Proof: `src/board/groups.test.mjs`, `src/board/layout.test.mjs`, import and
   replay fixtures, rendered groups. No second competing seed writer.
2. **Topic icons.** Every seeded door has an ink glyph (D7); any new sibling
   group needs a matching glyph. Follow D7, and existing founder approval
   rules for generated media.
3. **Neutral noun frame.** Update the lexicon truth owner for things/places,
   regenerate the catalog, keep pronouns/people yellow. Verify actual rendered
   tiles and home-board stability; catalog counts alone do not prove appearance.
4. **Owner docs and closeout.** Update built statuses only with proof. Coordinate
   Motor_Grid_And_Art roles, Design_System, and the art-generator's natural-color
   instructions. 027 owns group behavior; this phase must not duplicate it.
5. **Weather group** (founder-approved 2026-09-28; weather only, not nature).
   Seed it from words that already have art and audio — *sun, rain, raining,
   snow, wind, cloud, moon, hot, cold, warm, cool, wet, dry, umbrella, coat,
   jacket, raincoat, boots, mittens, gloves, hat* — shared with their current
   groups. Then mint the ten missing talk words under the art and voice
   approval rules: *weather, sunny, cloudy, rainy, windy, snowy, storm,
   thunder, lightning, rainbow*. Later: *foggy, puddle, sky, ice, freezing,
   sunscreen*. Door order and capacity go through `build_groups.mjs`; the
   glyph is ready (`weather`).

**Works Test:** on grid60, Outside brings run and swing set together; Bathroom
includes potty and wash. On grid15, the four More groups appear and every
launch word is reachable. On all sizes, shared top/frame words render once,
ordinary tiles do not overlap them, and removal changes only the selected group.

**Focused proof:** extend `src/board/groups.test.mjs` and
`src/board/layout.test.mjs`; run with `scripts/test.sh`, then the rendered Works
Test on `npm run dev:agent`. `npm run check:fast` and
`npm run lint:phase-freshness` close the affected slice. Full-wall approval rules
remain in `docs/operations/Testing.md`.
