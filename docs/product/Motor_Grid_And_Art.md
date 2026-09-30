# Motor Grid, Predictive Strip, and Symbol Art

**DECIDED 2026-09-22** (mentor intake; not built).
Clinical framing: `docs/strategy/Vision.md`.
How candidates are scored: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.
Fact map: `docs/product/SSOT.md`.
Intake record: `docs/founder/2026-09-22_Mentor_Grid_Prediction_Art.md`.

This file owns the motor-grid layout contract, the color and symbol rules, and
the visual contract of the predictive strip. It does not own ranking math, and
it does not own slot assignments — which sense sits in which slot lives in
`docs/product/Core_Coordinate_Map.md`.

---

## 1. Clean-room grid

**DECIDED 2026-09-22** (not built). The core coordinate map is original work.

Safe to use, because they are open method rather than someone else's board:

- Modified Fitzgerald color roles (section 3).
- Core-versus-fringe grammar: a small set of high-frequency words stays available; specific nouns and names are fringe.
- Left-to-right English syntax on the sentence bar.
- Fixed positions within a session so motor memory can form.
- Published vocabulary studies named below.

Do not copy into layouts, fixtures, stylesheets, or assets:

- An incumbent product's exact cell coordinates (which word sits at a given row and column).
- Symbol libraries that Pip AAC does not own, including SymbolStix and AssistiveWare vector sets.
- Another product's branded vocabulary engine or template pack.

Named incumbents that must not be transcribed: AssistiveWare Proloquo / Crescendo, PRC-Saltillo WordPower, Tobii Dynavox Core First. Studying published clinical principles is in scope. Tracing their button maps is not.

### Vocabulary seeding

**DECIDED 2026-09-22** (not built). The first motor-grid word list is compiled from open clinical sources, then placed by an independent coordinate pass:

- Banajee, DiCarlo, and Stricklin (2003), already in the vision bibliography.
- Center for Literacy and Disability Studies core-word studies.
- MacArthur-Bates Communicative Development Inventories.

**DECIDED 2026-09-21** still holds for lexicon size: the relational graph keeps about 200 high-frequency generative anchors. The mentor range of about 50 to 100 words is the first primary set that receives motor-grid coordinates, not a cut in the graph.

The initial compiled 677-word launch lexicon (83 Tier 1 Root Core + 594 Tier 2 Primary Fringe across 16 clinical categories) is cataloged in `docs/product/Initial_Vocabulary_600.md`.

The coordinate pass is written down as `docs/product/Core_Coordinate_Map.md`; the rule that decides which words earn `grid60` cells is `docs/product/Core_Grid_Membership.md` §2. A table extracted from another app is not an acceptable source, even if the words themselves came from a paper.

### Two stability rules

These are both in force. They answer different questions.

| Question | Rule | Decided |
| --- | --- | --- |
| Did this cell move during the session because prediction, a pragmatic lens, or a folder changed? | No. At a chosen density and orientation, core indices are immutable. | **DECIDED 2026-09-22** (not built) |
| Did the child change density, or rotate the device? | Sectors stay stable (pronouns, verbs, descriptors, spatial words) by default. Absolute pixels may change. Copying one frozen incumbent template is not the method. Amended 2026-09-22: a default design goal, not a law — the move cost is measured and shown, and the adult decides (`docs/phases/014_Grid_Density_And_Fit.md` § 4). | **DECIDED 2026-09-21**, amended **2026-09-22** |
| Did a parent or SLP move a core word on their child's board? | Allowed, per profile, in Edit mode: move or swap, never reflow. The app, prediction, lenses, and catalog updates never move a cell and never overwrite an adult move. | **BUILT** — `public/shared/coremove.mjs` (`move_core` op, `core_override` profile table shadows `core_cell`; regen-safe) |

When a grid engine exists, a test must show that a suggestion model cannot reorder or swap primary core indices. That test is **PROPOSED**. It does not exist yet.

### Groups — occasions and independent editing

**DECIDED 2026-09-27; BUILT 2026-09-28** (027 A1–A4; its Works Test passed on
an agent slot). Founder approved the launch recommendation in the 027 review.
This section owns the product contract; execution details are in
`docs/phases/027_Occasion_Boards.md`. It replaces the 2026-09-24 return-home
rule and the earlier linked-block proposal. Code owners: `public/shared/groups.mjs`
(storage, reserved cells, placement, replay), `public/board/groups-ui.js` (the
one group-page painter), `scripts/catalog/build_groups.mjs` (the seed). Still
open: founder review of the seed curation, and the corrected CHILDES starter
table (generated on the founder's machine) — until it exists the empty-sentence
bar starts from the child's own first picks.

- **One container: Group.** Breakfast, Drinks, My Words, and a family's custom
  group have the same editing rules. A door is the tile that opens a group.
  Blocks are seed-authoring clusters, never a family-facing concept or a
  runtime subscription. One word record can appear in many independent groups.
- **Launch order (amended 2026-09-30):** ten doors to a row on the default
  layout — My Words, then the four meals (Breakfast, Lunch, Dinner, Snack),
  then food, then people and self, things and places, describing and language.
  Within a block, groups run most-said first by CHILDES child-line totals of
  their members (`data/prediction/word_frequency.en.json`); meals keep
  time-of-day order. The order is fixed — never reordered by usage; only
  adults move groups. The default reaches new installs and `?reseed` only;
  existing profiles keep their order. Source: array order of
  `data/group_seed.topics.json`.
- **One group order everywhere.** `board_group.index_slot` is the only stored
  order. The board index, Settings → Show groups, the editor sidebar and the
  Add a word picker all read it (Settings folds the four meals into one
  "Meals" row at their place, bound to `occasions_visible`). Adults reorder
  by dragging on the board, in the editor, or by the grip in Show groups
  (`moveGroupBlock`, synced as `reorder_groups`, with Undo). A family can hide
  groups, turn off the four occasions together, and create its own. Hiding
  preserves membership, positions, and index slots. Time/history may glow a
  visible door; they never move, open, or hide it. No default Now cell. More
  occasions are post-launch.
- **Curated membership; a shared meal kit on dense boards.** (Amended
  2026-09-28 — one coordinate per word across all occasion groups produced
  sparse, unreadable pages.) Each meal board packs its own members in
  reading order: the occasion's menu leads in authored order — food before
  utensils — while the kit sits in identical cells on every board that
  offers it: water/milk/juice and the common fruits right-anchored,
  vegetables on Lunch/Dinner/Snack, tableware bottom-anchored. Membership
  is independent: yogurt can appear in Breakfast without popcorn. The
  Fruit and Drinks doors are ordinary topic groups carrying the full
  shelves. Positions are a starting arrangement, not a constraint on later
  family edits.
- **The top row and the frame are part of the page.** On every page of every
  group, reserved cells show whatever the home board holds there: the top row
  (row 0) and the frame (the home cells of yes, no, stop, help). They are not
  group content and can't be edited inside a group; a home-board edit shows in
  every group at once. The setting **Top row on every group** defaults ON; off
  leaves those cells empty and still reserved, so nothing reflows. The frame
  always shows. Meal groups also hold *eat, drink, all done* as ordinary seeded
  words at their home coordinates where free. Reserved cells are in 027 § 3.2.
- **Same geometry, full-screen groups.** Group tiles use the active Cells size;
  sentence bar and Smart bar stay in place. Home in the corner returns directly
  to the home board; Groups opens the index. Add sits by Groups in Edit mode.
  Next uses the always-reserved last grid cell, visible only for multiple pages.
  Corner Home is outside the grid.
- **Stay after Speak.** Speaking leaves the current view, group, and page in
  place, including expressive and transformed speech. Existing sentence-clear/
  fresh-start preferences are unchanged. Explicit navigation always wins over
  a pending playback. Home is one action, not an automatic destination.
- **The Smart bar supplements the grid.** In an empty group sentence, use
  measured first-word priors, then the child's own starts. After a word, use
  continuation ranking. Suggestions are optional shortcuts, not board cells;
  they never rearrange the grid. No new network dependency for speaking or
  editing. Prediction semantics remain in 017; 027 specifies the starter input.
- **Placement edits are local.** Add/remove affects membership in this group;
  move/swap affects this group at the active board size only. Remove
  leaves a hole, including in built-in groups. A drag onto a word explicitly
  swaps only those two placements. Edits never move unrelated words or write
  another group. No scope modal, block handles, pins, drift badge, or make-it-
  match action. A new custom group uses the same rules.
- **Placement choice:** an explicit empty-cell target wins; otherwise prefer a
  free established coordinate for this word, then the first free cell, then a
  new page. No automatic displacement. The tie-break and reserved cells have one
  code owner in `public/shared/groups.mjs`. Parent placement wins
  over authored clusters. Toggling settings never closes gaps.
- **Shared identity is explicit.** A word-card picture, name, or recording edit
  changes that record throughout this user's vocabulary. Its scope is stated
  on the card. Global Hide/retire remains a distinct word-card action. Removing
  from a group never masks, retires, or deletes the word record.
- **Multiple destinations require intent.** After an add, offer an optional
  Add to other boards action, also available on the word card. Show named
  destinations, none preselected; save to only those selected. Existing
  placements are skipped. Enrichment can suggest destinations but cannot file
  a word automatically. Same behavior online and offline.
- **Removal and recovery.** An active word can have zero group placements.
  Last-placement removal does not silently add it to My Words. The Word
  Library retains it for restoration; active words remain available through
  the keyboard lookup. Full home/group reachability is a fresh-seed guarantee,
  not a promise to override a family's removals or global masks. Do not show
  a group-path hint for an unplaced word. Library recovery is an adult path,
  not a substitute for claiming child-visible group reachability.
- **Saved work wins.** A catalog import never restores removals, adds new
  placements to installed groups, or overwrites custom positions. Seed once;
  keep the installation record even for empty, hidden, or deleted groups. No
  automatic re-seed on upgrade. (027 ships as a clean break: there are no
  saved boards to convert.)
- **Cells changes are explicit.** Positions are stored per board size, created
  when needed: the seed ships all three named sizes; after that, edits write the
  active size, and accepting a Cells change (its move-cost preview includes the
  groups) writes the new size's missing positions once. Switching back is exact.
  On 15 cells paging is expected; author the first page rather than truncate the
  60-cell board.
- **One level deep.** A group never contains a group. Built-in starter content
  fits one page on 60/90 cells after the reserved cells; personalized groups can
  page.
- **One Edit mode.** Drag moves/swaps, tap opens the word card, × removes this
  placement with Undo, and tapping an available empty cell adds there. A custom
  group's delete remains explicit; built-in groups can be hidden. Undo is local
  and restores exact positions when free, without displacing later edits.

The core map remains owned by `docs/product/Core_Coordinate_Map.md`; adding a
word to a group never writes it. Word-card identity and recovery belong to
`docs/product/Word_Library.md`; personal additions belong to
`docs/product/Personal_Entities.md`. Existing code paths and replacement proof
are enumerated in 027, rather than inferred from these decided rules.

Each named layout (`grid60`, `grid90`) is its own default map. Changing
density swaps the map; it does not move a cell within one. A profile's board
is its default map plus any adult moves (row 3 of the stability table).
Assignments: `docs/product/Core_Coordinate_Map.md`.

---

## 2. Smart bar (formerly the predictive strip)

**DECIDED 2026-09-22** (not built). On the motor-grid view the stack is:

1. Sentence bar (words already chosen, plus speak and clear).
2. Predictive strip.
3. Fixed core grid.

```text
+------------------------------------------------------------------+
| [Back]  Sentence bar: "I want to go..."              [Speak/Clr] |
+------------------------------------------------------------------+
| [prediction] [prediction] [prediction] [prediction]  |🗂️Grp|⌨ KB|
+------------------------------------------------------------------+
| Fixed core grid: indices do not move while this view is open     |
+------------------------------------------------------------------+
```

Layout rules:

- The strip sits directly under the sentence bar and directly above the core grid. **It never collapses.** Its height is fixed and rendered on first paint; an empty prediction state shows ghost cards, not a zero-height bar. A strip update must never shift the core grid's physical position — layout shift breaks motor planning.
- **8 + 2 geometry, scaled to the board.** The strip spans the same columns as the grid. At ten columns: columns 1–8 hold four prediction slots (2 columns each); columns 9–10 hold permanent utility anchors — `🗂️ Groups` (the group index, § Groups) and `⌨ Keyboard` (type a word at any point; while the keyboard is open it reads `Board` and closes it — keyboard modes and key map: `docs/product/Profile_Presentation_Modes.md` § 4) — visible and tappable in every state. At five columns the strip holds two prediction slots and the same two anchors (**BUILT** 014 slice 1 — `stripSlots`/`sizeStrip` in `public/board.js`); a layout may also declare an in-grid `Groups` cell (grid90 slot 89).
- It shows at most four candidate tiles. Three or four is the whole set. A longer row is a scanning tax.
- Every tile shows the word and its stick or object icon (a 1:1 square on the left, label on the right). Text alone is not enough for emerging and non-literate communicators. A sense with no art yet renders a Fitzgerald-tinted swatch; an entity renders its photo.
- Idle state (empty sentence) shows conversational starters and routine anchors in priority order — the top personal entity, greeting, the Food group, help — never a blank strip. A narrow bar (two slots on Core 15) keeps the front of the list, so the child's person is always shown (`docs/phases/014_Grid_Density_And_Fit.md` § 7a).
- Tiles in the strip are not core cells. Selecting one speaks or inserts that candidate. It does not rearrange the grid underneath.
- **Amended 2026-09-24 (founder; § 2.2):** core words are shown in the bar too, when they are the likely next words (*I* → *am*, *want*, *have*, *don't*). The grid tile stays where it is; the bar shows it a second time. Setting **Show board words** (default on) turns this off, and then core words are only emphasized in place (confidence halos), as before. Ranking owner: `docs/strategy/Dual_Engine_Predictive_Intelligence.md`.

**Listen key — HELD 2026-09-24** (founder, 017 R20: no listening for
prediction; `docs/backlog/008_Partner_Listening.md`). The rules below
stay as the held design; nothing is built.

**Listen key. DECIDED 2026-09-22** (not built). When the profile's
listening setting is on, a Listen key is on the board; when it is off, the
key does not exist and the microphone is never requested. Tap starts
listening, tap stops it. While listening, the key shows a live indicator
that cannot be missed. The key takes no grid cell and no strip slot
(`grid60` is frozen), and within a profile it sits in the same place in
every state, so turning listening on or off mid-conversation shifts
nothing. Changing the setting is an adult action in the Parent corner, like
a density change. Position in the top bar: founder call in
`docs/backlog/008_Partner_Listening.md` slice 1. Behavior owner:
`docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 6.

On the motor-grid view, the strip is where a suggestion may show a word that is not already a core cell. The Context River remains a separate situational surface. A specific food, place, person, or thing can show up in one tap instead of three or four folder levels.

### 2.1 Smart bar contract

**DECIDED 2026-09-22** (founder). Renamed from "predictive
strip": prediction is one of its jobs, not the only one. Code and older docs
still say *strip*; it is the same surface. **BUILT** (014 slice 7) for the
Expand mode: `bar_family`/`bar_family_item` hold fixed-order tiles; family
anchors (`?` on grid15) open them in the bar via `families.mjs` +
`renderExpand` in `public/board.js`; Parent Corner → Smart bar edits the
order. Forms and Partner modes land with their own phases.

**The grid never changes. The Smart bar is the one place that does.** Every
flexible behavior that would otherwise move a cell lands here instead.

**Modes.** One mode at a time, always caused by a visible action; after a
pick, the bar returns to Predict.

| Mode | Caused by | Shows | Order | Owner |
| --- | --- | --- | --- | --- |
| Predict | default | likely next words | ranked | `docs/strategy/Dual_Engine_Predictive_Intelligence.md` |
| Expand | tapping a family tile (`?`, Pain, Hot/cold, Call) | that tile's family | **fixed** | this section; defaults in `docs/phases/014_Grid_Density_And_Fit.md` § 5 |
| Forms | the Forms key | forms of the last word | ranked by context | `docs/phases/005_Word_Forms.md` |
| ~~Partner~~ | — | dropped 2026-09-24 (017 R20: no listening) | — | `docs/backlog/008_Partner_Listening.md` |

**Fixed-order rule.** A family's tiles always sit in the same slots on a
given profile, so "`?` then slot 2" becomes a motor plan the way a cell
does. Families are never ranked, reordered by a model, or trimmed by
context. Only an adult changes a family, and that change is shown like any
other move (`docs/phases/014_Grid_Density_And_Fit.md` § 4).

**Tile widths.** Predict tiles are two columns wide and at most four (a
ranked row is a scanning tax). Expand tiles are one column wide — never
smaller than a board cell on that profile — so a 5-column board shows 4 and
a 10-column board shows 8; fixed order means the child does not scan them.
A family longer than the bar ends in a fixed `more ›` tile that pages it.
The utility anchors (`🗂️ Groups`, `⌨ Keyboard`) stay put in every mode.

**Family tiles.** A family tile is a cell that opens its family in the bar
and speaks its own label (`Pain` speaks "I'm in pain"). Each family tile
the child taps speaks at once, so a partner hears the message build even if
the child stops partway. A family may lead to one more family (Pain → how
much → where); no deeper.

**Who may put what there.**

- **Predict:** the ranking engine only, choosing from words this profile
  has. A word an adult hid never appears. **BUILT** (013 slice 5): a
  running Spotlight session gives its target words a bounded lift in the
  ranking — `spotGate` in `public/shared/funnel.mjs` caps target tiles
  at half the slots; the `spot_boost` synced setting (default on) turns
  the lift off entirely.
- **Expand:** families. Pip ships defaults; a parent, SLP, or teacher may
  add, remove, or reorder a family's tiles and make a family tile from any
  word (Parent Corner → Smart bar).
- **Forms:** the catalog's word forms.
- ~~**Partner**~~: dropped 2026-09-24 (017 R20). Words an adult taps
  while modeling boost the next Predict row for one turn and are never
  stored (017 step 24 item 1).
- **Nobody else.** No tips, prompts, promotions, notifications, or app
  messages ever appear in the bar.

### 2.2 Predict order: board words, the "no" slot, and settings

**DECIDED 2026-09-24** (founder). Not built; build step: 017 step 29.

Why: the bar should hold the next word the user is most likely to say,
like a phone keyboard (017 R9). Leaving out core words made it
unpredictable: the most likely next words were never there. A bar that
reliably holds the next word gets looked at by habit, so each look costs
less. That look cost decides whether prediction pays at all (017 R18).

**Rules for the Predict row.**

0. **Words only (DECIDED 2026-09-24, founder).** The Predict row never
   holds a group door. Groups open from the 🗂 Groups anchor only, and the
   likely group glows in the list
   (`docs/phases/018_Core_Board_V2_And_Groups.md` D9).

1. **Board words count.** Core words are ranked with everything else
   and may appear in the bar. The grid never changes.
2. **The "no" word takes the last slot.** If a "no" word is among the
   likely next words, it goes in the last Predict slot even if it ranked
   lower, so "no" is always in the same place. At most one "no" word.
   It is never forced in: after *I want*, "no" is almost never next, so
   the rule doesn't fire. "Likely" = within the top 8 (a starting value,
   not a ruling).
3. **"No" words are a catalog label**, like a word's color or part of
   speech, not a rule about sentences (017 R14). Initial set, from the
   680: *not*, *no*, *don't*, *can't*, *won't*, *didn't*, *never*. An
   adult can't edit the set; changing it is a catalog change.
4. **Stable order.** The other slots are in probability order, with ties
   always broken the same way, so the same sentence start puts the same
   words in the same slots.
5. **Two-slot bars** (Core 15): the "no" slot would take half the bar.
   Open: how likely "no" must be before it does. Measure before
   choosing.

**Evidence (real children, CHILDES, measured 2026-09-24, scratch script).**
What follows *I*: *am* 14%, *want* 8–18%, *don't* 8–9%, *have* 3–5%.
The same four are the next word about 1 time in 3, and the top 8 about
half the time. A "no" word right after: *you are* 13% (#1), *she is* 7%
(#1), *I am* 11% (#2), *it is* 10% (#2), *I do* 10% (#2), *he is* 5%
(#4). After *I can* / *I will* / *I want*: under 1% (rank 26 or lower),
because children fuse it earlier (*I can't*, *I won't*). Rule 2 on
held-out transcripts (all words, 4 slots): overall hit rate 38.7 →
38.4% (~age 2), 41.2 → 41.0% (~3), 38.6 → 38.5% (4+); "no" words
found 58 → 59%, 45 → 49%, 44 → 47%; it fires at 15–18% of moments.
It costs almost nothing in accuracy, and the payoff is predictability.

**Settings** (Parent Corner → Smart bar; synced per profile; a parent
or SLP decides — `docs/product/SSOT.md` individual fit):

| Setting | Default | Off / other value is for |
| --- | --- | --- |
| **Show board words** | On | A child working on grid motor patterns: core words then only glow in place |
| **Keep "no" in the last spot** | On | Rarely changed; it's what keeps "no" predictable |
| **Sentence help:** *One step up* / *Their words* | **One step up** (founder, 2026-09-24) | *One step up* keeps the real-children book strong against the child's own history, so the small words a fuller sentence needs stay in the bar (*I* → *want*; *I want* → *to*, *a*, *some*). The finger barely moves: after *I want*, the next words are already there. *Their words* lets the child's own history take over as it builds. An AAC child who skips small words then gets a bar that learns the shorthand; for families who want pure speed |
| **Highlight next** (built) | Off | Glows likely next tiles on the grid, in addition to the bar |

**Evidence for the Sentence help default (CHILDES, 2026-09-24, scratch).**
Right after *I want*, *I have*, *I need*, *I got*, *can I have*,
*give me*, and *where is*, 58–76% of what real children say next is a
small word (*to*, *a*, *some*, *it*, *the*…), filling 3–4 of the top 4
slots; children use them about as much as adults do. After *I want to*
they drop to 1% (then *do*, *go*, *play*). The small word also makes the
next word easier to predict (held-out, content word in the top 4): *I
want* 21% → *I want a/to* 31%; *I need* 4 → 21%; *I have* 7 → 17%; *I
got* 4 → 19%. Many of these small words are core (*to*, *some*, *my*,
*it*, *this*, *that*), so they reach the bar only with Show board words
on.

Why settings, not proof: some SLPs will call bar use a failure of grid
motor planning, whatever the numbers say. It is a values choice, so the
family and SLP choose. Pip ships its default.

---

## 3. Modified Fitzgerald Key

> **Amended 2026-09-24 (founder; `docs/phases/018_Core_Board_V2_And_Groups.md` D2, D7), BUILT 018 slice 1.**
> One column band, one color, one kind of word. Questions get their own
> **purple** role. The last column is the **safety column**, red
> whatever the grammar (*yes*, *no*, *not*, *stop*, *help*, *hurt*).
> Nouns stay yellow (people & things). A new word's color comes from its
> kind (a plain-words choice, or Jev once at add time), never from a
> color picker.

> **Amended 2026-09-26 (founder; `docs/phases/026_Topic_Groups.md` D8).**
> People and pronouns keep yellow; things and places take the existing
> no-role pair (`.r-None`, `#8a8578` / `#f2efe6`). The home board is
> unchanged — its yellow words are all people and pronouns.

**DECIDED 2026-09-22** (not built). Button fields and stick-figure torsos use these roles. The torso is a grammar cue, not clothing.

The hex values, tile anatomy, and states are **BUILT** and owned by
`docs/product/Design_System.md`; this section owns which role a word gets.

| Color | Role |
| --- | --- |
| Yellow / orange | Pronouns, people |
| Neutral gray (`None`) | Things, places — every other noun (026 D8, decided 2026-09-26) |
| Green | Verbs, actions |
| Blue | Descriptors, adjectives, adverbs |
| Pink / magenta | Social phrases, little words, conjunctions |
| Purple | Questions, interrogatives |
| Red, or a black outline | Negation, stops, emergency & safety words |

One word keeps one color role across the core grid, groups, and the predictive strip.

---

## 4. Symbol art

**DECIDED 2026-09-22**. Symbol art is created in-house using a frozen 3-image style reference bundle (`assets/style-refs/pip-v1/`) and a minimal prompt harness (`scripts/art/gen.mjs`). Audio assets and layout stylesheets follow the same isolation rule: they are created for Pip AAC, not imported from an incumbent library.

### 4.1 Stick character (people, pronouns, actions)

One character, used everywhere a human figure carries the meaning. Canonical style reference: `assets/style-refs/pip-v1/01-stick-persona.jpg`.

- No hair, no gender markers, and no racial or ethnic cues. **Exception (DECIDED 2026-09-23):** words whose meaning is gender (*he*, *she*, *boy*, *girl*, *man*, *woman*) carry a hair-silhouette cue only, never a dress (`docs/operations/art-generator/SKILL.md` § 1.3).
- Bold, uniform monoline stroke with soft rounded joint curvature.
- Friendly, warm circular head with simple dot eyes and a gentle smile (warmth and approachability for children; avoids the sterile, creepy look of a faceless mannequin).
- **The Single-Finger Mitten Hand Standard:**
  - *Resting Hand:* Simple, smooth neutral circle. Functions as a "visual null" so the child's visual processing focuses 100% on the active gesture rather than dividing attention. Avoids black pixel mud at 48×48px.
  - *Active / Pointing Hand:* Exactly **one distinct index finger** extended from a curled fist. Never 5 realistic fingers (prevents spider-line noise).
  - *Focal Scaling:* The active pointing hand is drawn slightly enlarged in perspective to establish immediate visual hierarchy on a motor grid tile.
- Clean silhouette with zero motion lines, speed streaks, or dust puffs (achieved through seed re-rolling, not prompt-policing).
- Torso filled with the Fitzgerald color for that button's grammar role. A green torso marks an action such as *run*. A yellow torso marks a pronoun such as *I* or *we*.
- Meaning comes from posture, action, and directional arrows.

Master symbol references:
- Active motion: `assets/symbols/run.jpg` (green torso, running posture, clean silhouette)
- Deictic pointing: `assets/symbols/you.png` (yellow torso, single-finger mitten, enlarged focal point)

The same character is the person on pronoun buttons and the actor on verb buttons. Do not introduce a second human style for a demographic group.

### 4.2 Objects and other fringe icons

Inanimate nouns (vehicles, food, household items, animals) use a warm illustrated style: soft rounded curves, solid fills, clean outlines. Canonical style reference: `assets/style-refs/pip-v1/02-object.jpg`.

- Pure objects do not use the stick body. An animal is drawn as that animal, not as the stick character in a costume.
- No background scenery: zero floors, walls, or rooms. Pure white background.
- Custom fringe entities (a family member, a pet, a place) may use a caregiver photo or an in-house icon. They still must not use a third-party symbol library.

### 4.3 Spatial diagrams & prepositions

Relational and positional concepts (*in*, *out*, *on*, *under*, *up*, *down*) use minimalist diagrammatic glyphs. Canonical style reference: `assets/style-refs/pip-v1/03-diagram.jpg`.

- Neutral solid container or surface with completely opaque sides (no transparent wireframes or clipping).
- Directional arrow carrying the Fitzgerald key accent (pink for prepositions).
- Opposites share identical geometry: *in* and *out* use the exact same container perspective, changing only the arrow trajectory.

### 4.4 Semantic Framing Lenses (The 48px Grid Legibility Law)

**DECIDED 2026-09-22**. On an iPad grid with 60 tiles, buttons render between 48×48px and 60×60px. A full-body stick figure for emotions (`happy`, `sad`) or oral/fine-motor actions (`eat`, `think`) fails clinically: the face or action shrinks to a 2-pixel blur while 60% of the tile is wasted on stick legs. Every symbol is assigned a framing lens before generation:

1. **Face (`--framing face`):** Emotions, sensory states, and facial expressions (`happy`, `sad`, `hurt`, `tired`, `sleepy`). Close-up circular head filling 80%+ of the frame. Head only; no body, no legs. Facial expression is 5× larger and immediately recognizable.
2. **Bust (`--framing bust`):** Oral actions, fine-motor manual actions, and deictic chest gestures (`eat`, `drink`, `taste`, `think`, `say`, `I`, `me`). Upper body, head, hands, and Fitzgerald torso collar. Eliminates dead leg space while preserving grammar torso color.
3. **Full (`--framing full`):** Gross-motor locomotion (`run`, `jump`, `walk`, `sit`, `stand`) and multi-person social actions (`help`, `play`, `hug`). Complete stick figure with torso, limbs, and stance where leg stride or elevation carries the meaning.
4. **Diagram (`--framing diagram`):** Spatial prepositions and relationships (`in`, `out`, `on`, `off`, `up`, `down`). Minimalist container/surface with bold Fitzgerald pink vector arrow, zero human figures.
5. **Object (`--framing object`):** Inanimate nouns (`apple`, `car`) and universal regulators (`stop`, `yes`, `no`). Standalone object or sign with bold monoline outline and solid fill, zero human figures.
6. **Contrast (`--framing contrast`):** Relation words (`big`, `little`, `more`, `some`, `all`, `this`, `that`). Two of the same thing: target filled in the role color, reference pale grey, no arrow. **DECIDED 2026-09-23.**

Opaque function words (`can`, `to`, `and`, `the`) get no lens and no generated picture: a hand-drawn glyph from a closed set (`data/art/glyph_words.json`). Pronouns are the person plus a pointing hand. **DECIDED 2026-09-23**; rules in the skill guide § 1.1–1.3.

Operational skill guide: `docs/operations/art-generator/SKILL.md`.

### 4.5 Generation Prompt Architecture & Lessons

Every symbol in Pip AAC is generated via `scripts/art/gen.mjs` using the locked 3-line base prompt:

```text
We are trying to teach a child the concept of: {word}.
Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.
Do not include any text in the image.
```

- **Plurals:** Automatically appends `Show more than one.`
- **Grammar Color:** Appends `The stick figure's torso is solid {color}.`
- **Abstract Concepts:** Appends a concise 5-to-10 word physical `sceneHint` rather than a full scene description.
- **The Re-roll Law:** Never police minor defects (stray lines, angle quirks) by bloating the prompt with negative rules or micro-constraints. The 3 reference images carry the hand; seed re-rolling is the lever. Full case study: `Art_Generation_Lessons.md`.

### 4.6 Pip the Bird — Canonical Mascot and System Poses

**DECIDED 2026-09-22** (locked brand suite).
Masters: `assets/brand/pip-sitting.png` (app icon mark / Pose 1) and the 6 system poses in `assets/brand/`.

#### The Core Architectural Division of Labor
- **The Stick Persona is Language:** Lives inside motor-grid tiles and on the sentence bar. Means words and actions (`you`, `run`, `help`). Speaks *for* the child.
- **The Bird is the System:** Lives outside the grid. Never appears inside a tile or button. Appears in onboarding, empty prediction states, offline status, caregiver mode, and the app icon. Speaks *to* the child.
- **Clinical Cognitive Anchor:** A child learns *"the bird talks to me, the figure talks for me."* This prevents confusion between app chrome / state indicators and AAC vocabulary targets.

#### Visual Geometry and Palette
- **Hand & Style:** Drawn by the same hand as the stick figure persona using the frozen style bundle (`assets/style-refs/pip-brand/`).
- **Head & Body:** Clean circular head geometry echoing the stick figure's head; plump songbird silhouette with smooth curved wing and perked wedge tail.
- **Color Palette:** Warm rich gold body (`#fdb826`), orange triangular beak cleanly fused with the head outline, solid black round dot eye matching the stick figure's eye weight, and black stick legs with orange three-toed feet. No green (avoids Duolingo / action-verb collision) and no cyan (avoids Twitter / descriptor collision).
- **Zero Noise:** Pure white canvas, bold black monoline stroke, flat solid fills, zero shading, zero motion lines, zero text.

#### The 6 System Poses (1024×1024 Master Suite)
1. **Pose 1: Sitting / Primary Mark** (`assets/brand/pip-sitting.png`, alias `pip-01-sitting.png`): Facing forward / three-quarters, wing resting, feet planted, calm and steady. Used for the app icon, favicon, primary brand mark, and first launch.
2. **Pose 2: Looking Up** (`assets/brand/pip-02-looking-up.png`): Seated/standing posture, head and body tilted back ~10°, eye directed upward toward the top of the frame. Curious and hopeful. Used for the empty prediction strip, empty sentence bar, and *"tap a word to start"*.
3. **Pose 3: Resting** (`assets/brand/pip-03-resting.png`): Body settled lower, eye closed as a single clean sleeping line (`◡`), feet tucked underneath. Calm and peaceful. Used for offline mode (*"Pip works offline, nothing's wrong"*), idle state, and sleep mode.
4. **Pose 4: Listening** (`assets/brand/pip-04-listening.png`): Facing three-quarters with head cocked ~15° to the side, one eye slightly higher than the other. Used for voice settings, voice preview, and caregiver modeling mode.
5. **Pose 5: Wing Out / Welcome** (`assets/brand/pip-05-welcome.png`): Standing with one smooth curved wing opened out forward like an open arm in a warm welcoming gesture. Used for onboarding, the marketing hero, and *"welcome back"*.
6. **Pose 6: Hopping In** (`assets/brand/pip-06-hopping.png`): Mid-hop with feet together lifted off the ground, small gap under the body, tail lifted, zero motion lines. Used for sync complete, *"new words added"*, and app update available.

---

## 5. Proposed build order

**PROPOSED.** Not scheduled. None of these exist in the repo.

1. ~~Compile the primary core list~~ Done: `docs/product/Initial_Vocabulary_600.md` + `docs/product/Core_Coordinate_Map.md`.
2. Lock character drawing rules and the Fitzgerald torso mapping before producing a symbol set.
3. Scaffold the motor grid and the strip, with a test that suggestion output cannot reorder core indices.
4. Feed the strip from the local ranker within the latency rule in the dual-engine doc.
