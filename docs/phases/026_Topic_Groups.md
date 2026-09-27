# Phase 026 — Topic groups

**Status:** DECIDED 2026-09-26 (founder: "all approved"). The word-by-word
mapping is **PROPOSED** in `data/group_seed.topics.json` and waits on the
founder's mark-up (review page: `public/preview-groups.html`, built by
`scripts/catalog/preview_topic_groups.mjs`). Nothing is built. The live
seed stays `data/group_seed.json` until slice 2.

| Topic | Owner |
| --- | --- |
| Groups are the backup path to every word | `docs/product/Motor_Grid_And_Art.md` § Groups (amended by slice 6) |
| Door order, doors, banded layout | `docs/phases/018_Core_Board_V2_And_Groups.md` D5, D6 (D6's list replaced here) |
| Occasions / routines (time-based, prediction) | `docs/phases/007_Occasions.md` — untouched. Groups stay topics |
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

Default order is by how often children need each door (Evidence), with My
Words first and the grammar backup last; set once, then frozen (018 D6).

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
| Food | food, meals + *eat, cook, bite* | 57 |
| Going out | stores, places in town, vehicles + *ride, wait* | 41 |
| Colors | the colors + *color* | 11 |
| School | school places and people + *read, write, count, listen, ask, show, work* + *easy, difficult, right, wrong* | 27 |
| Drinks | drinks, cup, bottle, straw + *drink, thirsty* | 12 |
| Art & music | paper, crayons, markers, music + *draw, color, paint, cut, glue, write, sing, dance* | 16 |
| Feelings | emotions + body states (*hungry, tired, hot, cold, sick*) + *feel, laugh, cry* | 32 |
| Clothes | clothes | 28 |
| Play | toys, games + *play, build, share, my turn, your turn* | 20 |
| Bathroom | potty, bath, teeth, towel + *wash, wipe* + *wet, dry, clean, dirty* | 20 |
| Screens | tablet, TV, phone, headphones, charger + *turn, listen, loud, quiet* | 15 |
| Little words | grammar backup (+ *they, mine, under, over, away, but, or, because*) | 56 |
| More people / doing / where / describing | the rest of `grid60` — **`grid15` only** (D5) | 10 / 15 / 12 / 9 |

**Open (founder):** the usage order puts Bathroom and Screens late —
CHILDES is typical children at home, and AAC users may need Bathroom
sooner. Drag in the mark-up.

### D3 — One page per group

Every group fits one `grid60` page (57 words). The build already refuses
a bigger group (`buildGroups`, `ITEMS_PER_PAGE`). Food and Home sit at the
limit: a family word added there pages. On `grid15` (12 per page) paging
is unavoidable; the seed order puts the most-used words on page 1.

### D4 — A word goes where people look first

A second door only when both are equally likely (*doctor*: People and
Body & health; *ball*: Play and Outside). The proposal has 41 such words,
listed by the measure script — the founder trims them in the mark-up.

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
gives each a door; slice 1 makes the gate check every word on every
layout.

### D7 — Door icons are ink glyphs

Same family as `public/icons` (24 grid, 2px ink, round caps, no color).
Draft set in `public/icons/groups/` (founder-approved style; Body is the
arms-out figure). New doors need icons: Outside, Bathroom, School, Going
out, Screens, Art & music, Colors. Retired: Actions, Moving, Vehicles,
Places. **Open:** Describing's palette moves to Colors; Describing needs
a new one.

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

### D10 — Occasion doors, one address per word (2026-09-27)

Founder: "the occasions drive speech". Doors are views over one word
graph, so a word repeats in every door where someone might look (this
replaces D4's "look first" rule). Occasion doors — Breakfast, Lunch,
Dinner, Snack first; routines (dressing, bath, bedtime, car, park, store,
doctor, school) to follow — sit beside the topic doors. **Every word has
one address:** home-board words keep their home cell in every door, and
every other word gets one cell shared by all the doors that hold it.
Words that never share a page may share a cell (graph coloring). A family
word added to a door lands on its address, or the nearest free cell.
**Open (founder):** occasions on by default with one switch to turn them
off (proposed), the "Now" cell (a fixed home cell that opens the current
occasion — would amend 018 D8/D9), and 007's "linking groups to times
would be wrong" line.

### D11 — Doors use the whole grid (2026-09-27)

So a door can share the home board's addresses: **Back replaces Settings
in the top-left** inside doors (Settings stays on the home board only);
**Next takes the bottom-right cell only on a door with a second page**;
**+ Add sits next to the Groups button, in Edit mode only** (018 D9's "the
bar holds words" gains "and the Edit-mode controls").

### D12 — Each door carries its own sentence starters (2026-09-27)

**stop** and **help** travel into every door. The rest of the home words
in a door come from CHILDES: home words children said in the line, or
within two lines after, where the door's words came up
(`door_starters.mjs` → `data/prediction/door_starters.en.json`), as room
allows, up to 12.

## Prototype — one address per word (2026-09-27)

`node scripts/catalog/preview_addresses.mjs` → `public/preview-addresses.html`
(Home, Food, Drinks, Breakfast, Lunch, Snack at `grid60`; doors in
`data/occasions/meal_doors.proposed.json`). Measured on the rendered
pages, not the solver:

- **Home and the four occasion doors agree completely** — every repeated
  word sits in the same cell on all of them.
- **The full Food door can't.** At 57 words it has no spare cells, and the
  meal doors' starters hold ~14 home cells, so 14 foods sit next to their
  address in Food only (71 of 85 repeated words agree everywhere, 83.5%).
  With Food out, 100%. A topic door with room to spare would agree too.
- **The starters are nearly the same in every meal door** (*I, is, it,
  and, you, no, that, in, want, to, have, get*) — good for motor memory.
  *No* ranks #6–7 once replies count; *more* ranks only #20–33 and *all
  done* is rare in CHILDES (an AAC/sign phrase more than child speech).
  Reported as measured; the founder decides whether either travels anyway.
- Doors show consistent holes where a home cell isn't used — the look is
  the founder's call.

## Prototype — block doors (2026-09-27)

The word-level prototype above scattered clusters (drinks all over the
page), led Food with treats, and filled doors with filler words the Smart
bar already offers; the founder found it unlovable. Rebuilt as **block
doors** (founder: "the only chance"):

- A door is a set of blocks (breakfast foods, meals, vegetables, snacks,
  treats, dishes, fruit, drinks). A block keeps its order — everyday
  first, treats their own block — and one column position on every door.
- **The frame is four words: yes, no, stop, help**, in their home cells
  (the last column minus *not* and *hurt*). Filler is the Smart bar's job.
- Groups and occasions become one idea: a topic door is one block, an
  occasion door is several.

`node scripts/catalog/preview_blocks.mjs` → `public/preview-blocks.html`
(`data/occasions/block_doors.proposed.json`). Measured on the pages:
every repeated word sits in the same cell on every page, top row on or
off. Occasion doors use 33–43 of 60 cells with the top row off, 42–52
with it on (Lunch nearly full). **Open:** single-block doors (Fruit,
Drinks) sit at the right edge with the left empty, because shared blocks
are placed next to the frame; and blocks that aren't a multiple of six
leave a stray column (Fruit's 7th word, Drinks' last three).

## Evidence (CHILDES, 2026-09-26)

`node scripts/prediction/childes/measure_groups.mjs` — every transcript,
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

1. **Builder.** `word#slot` for two-meaning words (*orange*, *bathroom*,
   *light*); `layouts` on a seed group; the reachability gate covers every
   lexicon word on every layout. Proof: `build_catalog` tests.
2. **Swap the seed.** `group_seed.topics.json` → `group_seed.json` after
   the mark-up; mixed groups seed in the banded layout (018 D5 — things,
   actions, little words, describing, each kind starting a column), not
   row order. Saved boards: a migration re-seeds built-in groups and
   leaves custom groups and family additions alone (018 slice 4's
   pattern). Proof: `groups.test.mjs` + a saved-board replay.
3. **Group index honors `layouts`.** `groupIndex` hides doors not meant
   for the current board. Proof: `layout.test.mjs` leg per layout.
4. **Icons** for the new doors (D7), founder review one at a time.
5. **Neutral noun frame** (D8): things' role → none in the lexicon and
   catalog; the band order puts none first; the review page's before and
   after. Proof: catalog role counts; founder look.
6. **Docs.** `Motor_Grid_And_Art.md` § 3 (D8, D9) and § Groups (D1, D3,
   D5, D6); `Design_System.md` roles table; 018 D6 points here;
   `art-generator/SKILL.md` natural-color rule and the house/home
   exception.

**Works Test:** the founder opens the group index on `grid60`, taps Food,
and finds *eat*, *cook*, and *pizza* on one page; opens Outside and finds
*run* next to *swing set*; switches to `grid15` and sees the four More
doors appear.
