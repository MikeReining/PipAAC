# Pip AAC — Comprehensive Launch Lexicon (677 Words)

**DECIDED 2026-09-22, amended 2026-09-22** (not built). Clean-room vocabulary architecture for Pip AAC.
Clinical lineage: Banajee, DiCarlo, & Stricklin (2003); Project Core (CLDS, UNC Chapel Hill); MacArthur-Bates CDI; ARASAAC Clinical Taxonomy.
Layout & Art Contract: `docs/product/Motor_Grid_And_Art.md`.
Intake record: `docs/founder/2026-09-22_Mentor_Grid_Prediction_Art.md`.

**Selection method (amendment).** Membership is evidence-ranked, not hand-picked:
every candidate is scored against the bundled reference corpora —
`data/reference/aoa.csv` (age-of-acquisition, ~42k words, Kuperman norms via
WorkbookBench) and `data/reference/fry-rank-1000.txt` (high-frequency rank
bands). Age-of-acquisition is the primary signal — a word a child learns at 3
matters more than a word adults say often — with Fry rank and the clinical
lists above as tiebreakers. The 2026-09-22 amendment added the function-word
layer the original list lacked (conjunctions, auxiliaries, determiners, object
pronouns, numerals): without `and`, `have`, or `him` the board cannot form
sentences at all.

---

## 1. Architectural Distribution & Pareto Analysis

In human communication, vocabulary usage follows a steep Pareto distribution:

| Layer / Tier | Word Count | % of Spoken Daily Communication | Engineering Delivery Mode | Visual Archetype |
| :--- | :---: | :---: | :--- | :--- |
| **Tier 1: Root Core Grid** | **78 words** | ~75% – 80% | Pre-generated, bundled locally in app, permanent motor coordinates | Stick Figure (Verbs/Pronouns) + Diagrammatic (Prepositions/Grammar) |
| **Tier 2: Primary Fringe Folders** | **599 words** | ~10% – 15% | Pre-generated, bundled locally, 1-tap category drill-down & predictive strip | Illustrated Object (Inanimate Nouns/Animals) + Stick Figure (Actions/States) |
| **Total Launch MVP Bundle** | **677 words** | **~90% – 95%** | **100% Offline in iOS App Bundle (0 ms cold start, zero cloud latency)** | Clean-room in-house vector/asset set |
| *Tier 3: Secondary Fringe (Pipeline)* | *1,500 – 3,000* | *~5%* | Automated image generation pipeline with locked prompt templates | Automated Illustrated Object pipeline |
| *Tier 4: Deep Personal Entities* | *Infinite* | *< 1%* | Caregiver camera roll / local photo picker fallback | Authentic personal photos & custom tiles |

### Modified Fitzgerald Key Color Rules

Every word receives an immutable color assignment across the core grid, groups, and the predictive strip (amended 2026-09-26, 026 D8 — things and places take the neutral frame; people and pronouns stay yellow):
- **Yellow / Orange**: Pronouns and people.
- **None (neutral gray)**: Things and places — every other noun.
- **Green**: Verbs and activity actions.
- **Blue**: Descriptors, adjectives, feelings, and sensory states.
- **Pink / Magenta**: Prepositions, little words, joining words, and social phrases.
- **Purple**: Questions and interrogatives (018 D2 — the sixth role).
- **Red / Black Outline**: Negation, stops, urgent requests, emergency protests, and the safety column (yes/no/not/stop/help/hurt).

**Negation flag** (`sense.negation` — the Smart bar's "no" slot, Motor_Grid § 2.2): no, not, never, don't, can't, won't, didn't.

### Visual Art Systems

- **Stick Figure**: Monoline uniform stroke, round joint terminals, solid circular head, no hair, no gender cues, no racial/ethnic markers — except words whose meaning is gender (*he*, *she*, *boy*, *girl*, *man*, *woman*), which carry a hair-silhouette cue only (`docs/operations/art-generator/SKILL.md` § 1.3). The torso is filled with the word's Modified Fitzgerald color (e.g. green torso for *run*, yellow torso for *I*). Used for people, pronouns, action verbs, and somatic/emotive states.
- **Illustrated Object**: Warm illustrated style with soft rounded curves, clean solid fills, and crisp outlines. Used for inanimate objects, food, vehicles, household items, tools, clothing, and animals.
- **Diagrammatic / Metaphor**: Clean abstract symbols, directional vector arrows, and geometric framing. Used for prepositions, spatial vectors, questions, numerals, negation, and regulatory symbols.

---

## 2. Tier 1: Root Core Grid (78 Words)

The unshakeable foundation of daily generative communication. Derived from the convergence of the **Banajee 40**, **Project Core 36**, and **MacArthur-Bates CDI** core lists.

**Amended 2026-09-24 (core board v2, 018 D1–D3).** `is` (#607),
`mom` (#267), and `dad` (#268) are promoted to Root Core — the motor
plan needs the copula and the people the child calls for on the default
board. `take`, `give`, `big`, `little`, `bad`, `happy`, `please`, and
`at` move to their Tier-2 groups (still strip-eligible). Questions take
the new **Purple** role; `yes` and `help` join the Red safety column.
Membership truth: `docs/product/Core_Grid_Membership.md`.

**Amended 2026-09-22 (final grid ruling).** `hurt` (#172, was Body, Health &
Hygiene) and `sad` (#179, was Feelings) are promoted to Root Core so the
default board can report pain and distress without navigation — rule 0 in
`docs/product/Core_Grid_Membership.md` §2. They keep their original row
numbers, so sense ids and bundled audio clips are unchanged.

**Group cross-listing convention.** A Sub-Category written `Core X → Group Name`
means the sense's home is the core board, and it is *also* listed in that
built-in group — a group is a view, not an exclusive home
(`docs/product/Design_Invariants.md` §7). All other Tier 1 rows carry their
`Core X` sub-category only.

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Sub-Category | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **I** | Pronoun | Yellow | Stick Figure | Core Pronouns | Banajee; Project Core; CDI | Stick figure pointing to self (yellow torso) |
| 2 | **you** | Pronoun | Yellow | Stick Figure | Core Pronouns | Banajee; Project Core; CDI | Stick figure pointing forward to partner |
| 3 | **me** | Pronoun | Yellow | Stick Figure | Core Pronouns | Banajee; CDI | Stick figure with hand placed on chest |
| 4 | **my** | Pronoun | Yellow | Stick Figure | Core Pronouns | Banajee; CDI | Stick figure holding object close to chest |
| 5 | **mine** | Pronoun | Yellow | Stick Figure | Core Pronouns | Banajee; CDI | Stick figure clutching prized block to chest |
| 6 | **he** | Pronoun | Yellow | Stick Figure | Core Pronouns | Project Core; CDI | Short-haired stick figure (hair inside head outline) with a pointing hand entering from the tile edge |
| 7 | **she** | Pronoun | Yellow | Stick Figure | Core Pronouns | Project Core; CDI | Stick figure with hair breaking outside the head outline (ponytail or shoulder-length) and a pointing hand entering from the tile edge |
| 8 | **it** | Pronoun | Yellow | Stick Figure | Core Pronouns | Banajee; Project Core; CDI | Pointing hand entering from the tile edge toward a neutral geometric object |
| 9 | **we** | Pronoun | Yellow | Stick Figure | Core Pronouns | CDI; ARASAAC | Two stick figures standing arm-in-arm |
| 10 | **they** | Pronoun | Yellow | Stick Figure | Core Pronouns | ARASAAC; Project Core | Two stick figures positioned across room |
| 11 | **that** | Pronoun | Yellow | Diagrammatic | Core Demonstratives | Banajee; Project Core; CDI | Contrast: far object filled yellow, near object pale grey; pointing hand toward the far one |
| 12 | **this** | Pronoun | Yellow | Diagrammatic | Core Demonstratives | Banajee; Project Core; CDI | Contrast: near object filled yellow, far object pale grey; pointing hand toward the near one |
| 13 | **want** | Verb | Green | Stick Figure | Core Verbs | Banajee; Project Core; CDI | Stick figure reaching both arms out yearningly |
| 14 | **like** | Verb | Green | Stick Figure | Core Verbs | Banajee; Project Core; CDI | Stick figure smiling with thumbs up and small heart |
| 15 | **go** | Verb | Green | Stick Figure | Core Verbs | Banajee; Project Core; CDI | Stick figure stepping forward with motion arrow |
| 16 | **come** | Verb | Green | Stick Figure | Core Verbs | Banajee; CDI | Stick figure beckoning forward with arm wave |
| 17 | **get** | Verb | Green | Stick Figure | Core Verbs | Banajee; Project Core; CDI | Stick figure reaching and grabbing an object |
| 18 | **make** | Verb | Green | Stick Figure | Core Verbs | Banajee; Project Core; CDI | Stick figure hands assembling toy blocks |
| 19 | **do** | Verb | Green | Stick Figure | Core Verbs | Banajee; Project Core; CDI | Stick figure energetically moving with action spark |
| 20 | **see** | Verb | Green | Stick Figure | Core Verbs | Banajee; CDI | Stick figure with eye sightline beam |
| 21 | **look** | Verb | Green | Stick Figure | Core Verbs | Project Core; CDI | Stick figure with hand shielding eyes looking outward |
| 22 | **put** | Verb | Green | Stick Figure | Core Verbs | Banajee; CDI | Stick figure placing block downward into container |
| 25 | **help** | Verb | Red | Stick Figure | Core Verbs → Social Etiquette, Pragmatic Interjections & Urgent/Safety | Banajee; Project Core; CDI | Stick figure extending supportive hand to another |
| 26 | **stop** | Verb | Red | Diagrammatic | Core Regulators → Social Etiquette, Pragmatic Interjections & Urgent/Safety | Banajee; Project Core; CDI | Red octagon with white raised palm |
| 27 | **play** | Verb | Green | Stick Figure | Core Verbs → Daily Actions & Activity Verbs | Banajee; Project Core; CDI | Stick figure tossing ball happily |
| 28 | **eat** | Verb | Green | Stick Figure | Core Verbs → Daily Actions & Activity Verbs | Banajee; CDI | Stick figure putting food item to mouth |
| 29 | **drink** | Verb | Green | Stick Figure | Core Verbs → Daily Actions & Activity Verbs | Banajee; CDI | Stick figure tipping cup to mouth |
| 30 | **open** | Verb | Green | Diagrammatic | Core Verbs → Daily Actions & Activity Verbs | Banajee; Project Core; CDI | Open hinged box with upward motion arrow |
| 31 | **turn** | Verb | Green | Diagrammatic | Core Verbs → Daily Actions & Activity Verbs | Banajee; Project Core; CDI | Curved circular rotational arrow |
| 32 | **read** | Verb | Green | Stick Figure | Core Verbs | Banajee; CDI | Stick figure looking at open picture book |
| 33 | **can** | Verb | Green | Stick Figure | Core Verbs | Banajee; CDI | Glyph (hand-drawn): Two fists (ASL S-hands) with green arrows moving down: the ASL sign CAN. |
| 34 | **need** | Verb | Green | Stick Figure | Core Verbs | ARASAAC; CDI | Stick figure leaning forward with earnest gesture |
| 35 | **feel** | Verb | Green | Stick Figure | Core Verbs | ARASAAC; CDI | Stick figure touching hand gently to chest |
| 36 | **tell** | Verb | Green | Stick Figure | Core Verbs | Banajee; CDI | Stick figure with speech bubble emerging |
| 37 | **think** | Verb | Green | Stick Figure | Core Verbs | ARASAAC; CDI | Stick figure with finger to temple and lightbulb |
| 38 | **find** | Verb | Green | Stick Figure | Core Verbs | ARASAAC; CDI | Stick figure holding magnifying glass over star |
| 39 | **work** | Verb | Green | Stick Figure | Core Verbs | ARASAAC; CDI | Stick figure focused at table writing/building |
| 40 | **wait** | Verb | Green | Stick Figure | Core Verbs | ARASAAC; CDI | Stick figure standing patiently next to hourglass |
| 41 | **in** | Preposition | Pink | Diagrammatic | Core Prepositions | Banajee; Project Core; CDI | Green arrow moving into open box |
| 42 | **out** | Preposition | Pink | Diagrammatic | Core Prepositions | Banajee; Project Core; CDI | Green arrow exiting from box |
| 43 | **on** | Preposition | Pink | Diagrammatic | Core Prepositions | Banajee; Project Core; CDI | Solid ball resting on top surface |
| 44 | **off** | Preposition | Pink | Diagrammatic | Core Prepositions | Banajee; Project Core; CDI | Ball bouncing off and away from surface |
| 45 | **up** | Preposition | Pink | Diagrammatic | Core Prepositions | Banajee; Project Core; CDI | Bold vertical upward pointing arrow |
| 46 | **down** | Preposition | Pink | Diagrammatic | Core Prepositions | Banajee; Project Core; CDI | Bold vertical downward pointing arrow |
| 47 | **away** | Preposition | Pink | Diagrammatic | Core Prepositions | Banajee; CDI | Arrow tracing path toward distant horizon |
| 48 | **here** | Preposition | Pink | Diagrammatic | Core Prepositions | Banajee; Project Core; CDI | Map bullseye marker on ground |
| 49 | **there** | Preposition | Pink | Diagrammatic | Core Prepositions | Project Core; CDI | Hand pointing toward distant bullseye |
| 50 | **with** | Preposition | Pink | Diagrammatic | Core Prepositions | ARASAAC; CDI | Two interlocking puzzle pieces |
| 51 | **under** | Preposition | Pink | Diagrammatic | Core Prepositions | CDI; ARASAAC | Ball positioned below horizontal shelf |
| 52 | **over** | Preposition | Pink | Diagrammatic | Core Prepositions | CDI; ARASAAC | Curved arc leaping over a wall |
| 53 | **to** | Preposition | Pink | Diagrammatic | Core Prepositions | ARASAAC | Glyph (hand-drawn): Pink arrow ending at a black dot: toward a place or thing. |
| 54 | **for** | Preposition | Pink | Diagrammatic | Core Prepositions | ARASAAC | Glyph (hand-drawn): Pink arrow ending at a yellow person: for someone. |
| 55 | **more** | Adjective | Blue | Diagrammatic | Core Descriptors | Banajee; Project Core; CDI | Contrast: tall stack filled blue beside a short pale grey stack |
| 56 | **all done** | Adjective | Blue | Stick Figure | Core Descriptors | Banajee; CDI | Stick figure with both hands swept wide palms up |
| 59 | **good** | Adjective | Blue | Diagrammatic | Core Descriptors → Descriptors, Adjectives & Opposites | Banajee; Project Core; CDI | Thumbs-up icon with positive blue glow |
| 62 | **same** | Adjective | Blue | Diagrammatic | Core Descriptors | ARASAAC; CDI | Two identical colored squares |
| 63 | **different** | Adjective | Blue | Diagrammatic | Core Descriptors | ARASAAC; CDI | A colored square beside a contrasting triangle |
| 64 | **some** | Adjective | Blue | Diagrammatic | Core Descriptors | ARASAAC; CDI | Contrast: two dots filled blue in a cluster of pale grey dots |
| 65 | **all** | Adjective | Blue | Diagrammatic | Core Descriptors | Project Core; CDI | Contrast: every dot in the cluster filled blue |
| 66 | **what** | Pronoun | Purple | Diagrammatic | Core Questions | Banajee; Project Core; CDI | Bold question mark (?) in speech burst |
| 67 | **where** | Adverb | Purple | Diagrammatic | Core Questions | Banajee; Project Core; CDI | Map pin icon with question mark inside |
| 68 | **who** | Pronoun | Purple | Stick Figure | Core Questions | Banajee; Project Core; CDI | Stick figure silhouette with question mark on head |
| 69 | **why** | Adverb | Purple | Diagrammatic | Core Questions | Banajee; Project Core; CDI | Thought bubble containing question mark |
| 70 | **how** | Adverb | Purple | Diagrammatic | Core Questions | Project Core; CDI | Meshing gears with question mark |
| 71 | **when** | Adverb | Purple | Diagrammatic | Core Questions | CDI; ARASAAC | Clock face overlaid with question mark |
| 72 | **no** | Interjection | Red | Diagrammatic | Core Protests → Social Etiquette, Pragmatic Interjections & Urgent/Safety | Banajee; Project Core; CDI | Red circle with diagonal strike prohibition |
| 73 | **yes** | Interjection | Red | Diagrammatic | Core Social → Social Etiquette, Pragmatic Interjections & Urgent/Safety | Banajee; CDI | Vibrant green/magenta checkmark |
| 74 | **not** | Adverb | Red | Diagrammatic | Core Protests → Function Words & Grammar | Project Core; CDI | Bold red X over dashed box |
| 76 | **and** | Conjunction | Pink | Diagrammatic | Core Connectors → Function Words & Grammar | AoA 4.57; Fry top-10 | Glyph (hand-drawn): Grey ball + grey block with a bold pink plus between: this and that. |
| 77 | **but** | Conjunction | Pink | Diagrammatic | Core Connectors | AoA 4.6; Fry top-100 | Glyph (hand-drawn): Pink U-turn arrow: going one way, then turning back. |
| 78 | **or** | Conjunction | Pink | Diagrammatic | Core Connectors | AoA 4.14; Fry top-100 | Glyph (hand-drawn): Pink fork: one path splits to a grey ball or a grey block. Pick one. |
| 79 | **because** | Conjunction | Pink | Diagrammatic | Core Connectors | AoA 4.44; Fry top-500 | Glyph (hand-drawn): Three falling dominoes; the first (the reason) is pink. |
| 80 | **have** | Verb | Green | Stick Figure | Core Verbs | AoA 3.72; Fry top-50 | Stick figure holding object firmly in arms |
| 172 | **hurt** | Adjective | Red | Stick Figure | Core Regulators → Body, Health & Hygiene | CDI; ARASAAC; AoA 4.0 | Stick figure holding painful bruised elbow |
| 179 | **sad** | Adjective | Blue | Stick Figure | Core Descriptors → Feelings, Emotions & Sensory States | CDI; ARASAAC; AoA 3.24 | Stick figure with downcast posture and single tear |

---
| 267 | **mom** | Noun | Yellow | Stick Figure | Core People → People, Family & Roles | CDI; ARASAAC | Adult maternal stick figure smiling warmly (yellow torso) |
| 268 | **dad** | Noun | Yellow | Stick Figure | Core People → People, Family & Roles | CDI; ARASAAC | Adult paternal stick figure smiling warmly (yellow torso) |
| 607 | **is** | Verb | Green | Diagrammatic | Core Verbs | AoA 5.53; Fry top-10 | Glyph (hand-drawn): One grey ball, then a green equals sign: one thing is. |

## 3. Tier 2: Primary Fringe Categories (599 Words)

**Amended 2026-09-22 (vocabulary cleanup).** Spoken texts cleaned of compound
artifacts (`wipe action` → `wipe`, `clean item` → `clean`, `light weight` →
`light`, `orange color` → `orange`, `pink color` → `pink`, `light color` →
`light`, `bathroom urgent` → `bathroom`); `dark color` removed as a duplicate
of `dark` (#205); the duplicate digit senses `1`–`5`/`10` (#577–582) removed —
the canonical numeral set is the word forms `one`–`ten` in §3.16, which keep
their ids and bundled audio; 28 everyday fringe words added at slots 657–684
(meals and food staples, hygiene verbs, behavior words, people, social words,
and grammar words).

### 3.1 Food & Drink (76 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Nutrition taxonomy. Art archetype: Illustrated Object.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 82 | **water** | Noun | None | Illustrated Object | CDI; ARASAAC | Clear glass cup filled with sparkling water |
| 83 | **milk** | Noun | None | Illustrated Object | CDI; ARASAAC | Classic white milk carton with blue crest |
| 84 | **juice** | Noun | None | Illustrated Object | CDI; ARASAAC | Glass of golden juice with fruit slice |
| 85 | **apple juice** | Noun | None | Illustrated Object | CDI; ARASAAC | Juice box with green apple emblem and straw |
| 86 | **chocolate milk** | Noun | None | Illustrated Object | CDI; ARASAAC | Glass bottle with rich chocolate drink |
| 87 | **tea** | Noun | None | Illustrated Object | CDI; ARASAAC | Warm steaming ceramic mug with tea bag tag |
| 88 | **smoothie** | Noun | None | Illustrated Object | CDI; ARASAAC | Tall blended fruit smoothie cup with thick straw |
| 89 | **bread** | Noun | None | Illustrated Object | CDI; ARASAAC | Warm sliced artisan bread loaf |
| 90 | **toast** | Noun | None | Illustrated Object | CDI; ARASAAC | Two golden-brown toasted bread slices |
| 91 | **cereal** | Noun | None | Illustrated Object | CDI; ARASAAC | Colorful cereal bowl with spoon resting in milk |
| 92 | **oatmeal** | Noun | None | Illustrated Object | CDI; ARASAAC | Cozy bowl of warm oatmeal with berry garnish |
| 93 | **pancake** | Noun | None | Illustrated Object | CDI; ARASAAC | Stack of fluffy pancakes with melting butter |
| 94 | **waffle** | Noun | None | Illustrated Object | CDI; ARASAAC | Golden grid-patterned waffle with syrup drip |
| 95 | **bagel** | Noun | None | Illustrated Object | CDI; ARASAAC | Round toasted bagel halved with cream cheese |
| 96 | **egg** | Noun | None | Illustrated Object | CDI; ARASAAC | Sunny-side-up fried egg with golden yolk |
| 97 | **butter** | Noun | None | Illustrated Object | CDI; ARASAAC | Block of creamy yellow butter on dish |
| 98 | **jam** | Noun | None | Illustrated Object | CDI; ARASAAC | Glass jar filled with ruby strawberry spread |
| 99 | **syrup** | Noun | None | Illustrated Object | CDI; ARASAAC | Maple syrup bottle with pouring spout |
| 100 | **pizza** | Noun | None | Illustrated Object | CDI; ARASAAC | Hot triangular pizza slice with stretching cheese |
| 101 | **pasta** | Noun | None | Illustrated Object | CDI; ARASAAC | Bowl of twirled spaghetti pasta |
| 102 | **macaroni** | Noun | None | Illustrated Object | CDI; ARASAAC | Bowl of creamy yellow elbow macaroni |
| 103 | **sandwich** | Noun | None | Illustrated Object | CDI; ARASAAC | Halved layered sandwich with cheese and greens |
| 104 | **chicken** | Noun | None | Illustrated Object | CDI; ARASAAC | Golden roasted chicken drumstick |
| 105 | **nuggets** | Noun | None | Illustrated Object | CDI; ARASAAC | Crispy bite-sized breaded chicken nuggets |
| 106 | **burger** | Noun | None | Illustrated Object | CDI; ARASAAC | Juicy hamburger on sesame bun |
| 107 | **hot dog** | Noun | None | Illustrated Object | CDI; ARASAAC | Frankfurter in split bun with mustard wave |
| 108 | **soup** | Noun | None | Illustrated Object | CDI; ARASAAC | Steaming bowl of vegetable soup with spoon |
| 109 | **rice** | Noun | None | Illustrated Object | CDI; ARASAAC | Fluffy white rice mounded in ceramic bowl |
| 110 | **cheese** | Noun | None | Illustrated Object | CDI; ARASAAC | Wedge of yellow cheese with round Swiss holes |
| 111 | **meat** | Noun | None | Illustrated Object | CDI; ARASAAC | Cooked savory steak / patty fillet |
| 112 | **fish** | Noun | None | Illustrated Object | CDI; ARASAAC | Cooked salmon/fish fillet on plate |
| 113 | **snack** | Noun | None | Illustrated Object | CDI; ARASAAC | Small assorted treat bowl |
| 114 | **cracker** | Noun | None | Illustrated Object | CDI; ARASAAC | Square salted cracker with perforated holes |
| 115 | **cookie** | Noun | None | Illustrated Object | CDI; ARASAAC | Round chocolate chip cookie with crumbled edge |
| 116 | **chips** | Noun | None | Illustrated Object | CDI; ARASAAC | Crispy golden potato chips in snack bowl |
| 117 | **popcorn** | Noun | None | Illustrated Object | CDI; ARASAAC | Red-and-white striped bucket of fluffy popcorn |
| 118 | **pretzel** | Noun | None | Illustrated Object | CDI; ARASAAC | Traditional knotted salted pretzel |
| 119 | **yogurt** | Noun | None | Illustrated Object | CDI; ARASAAC | Single-serve yogurt cup with foil peel lid |
| 120 | **fruit snack** | Noun | None | Illustrated Object | CDI; ARASAAC | Gummy fruit-shaped chewy treats |
| 121 | **ice cream** | Noun | None | Illustrated Object | CDI; ARASAAC | Waffle cone with two colorful scoops |
| 122 | **popsicle** | Noun | None | Illustrated Object | CDI; ARASAAC | Frozen ice pop on wooden stick |
| 123 | **candy** | Noun | None | Illustrated Object | CDI; ARASAAC | Twisted wrapper sweet hard candy |
| 124 | **cake** | Noun | None | Illustrated Object | CDI; ARASAAC | Frosted birthday cake slice with swirls |
| 125 | **muffin** | Noun | None | Illustrated Object | CDI; ARASAAC | Plump blueberry muffin in paper cup |
| 126 | **donut** | Noun | None | Illustrated Object | CDI; ARASAAC | Glazed ring donut with colorful sprinkles |
| 127 | **fruit** | Noun | None | Illustrated Object | CDI; ARASAAC | Arranged bowl of mixed colorful fruits |
| 128 | **apple** | Noun | None | Illustrated Object | CDI; ARASAAC | Crisp shiny red apple with green leaf |
| 129 | **banana** | Noun | None | Illustrated Object | CDI; ARASAAC | Ripe peeled yellow banana ready to eat |
| 130 | **strawberry** | Noun | None | Illustrated Object | CDI; ARASAAC | Bright red strawberry with green hull |
| 131 | **orange** | Noun | None | Illustrated Object | CDI; ARASAAC | Fresh citrus orange sliced open |
| 132 | **grapes** | Noun | None | Illustrated Object | CDI; ARASAAC | Bunch of juicy purple grapes on vine |
| 133 | **watermelon** | Noun | None | Illustrated Object | CDI; ARASAAC | Juicy triangular slice of red watermelon |
| 134 | **carrot** | Noun | None | Illustrated Object | CDI; ARASAAC | Orange tapered carrot with leafy green top |
| 135 | **broccoli** | Noun | None | Illustrated Object | CDI; ARASAAC | Vibrant green broccoli florets |
| 136 | **corn** | Noun | None | Illustrated Object | CDI; ARASAAC | Golden cob of sweet corn with husk |
| 657 | **breakfast** | Noun | None | Illustrated Object | CDI; ARASAAC | Cereal bowl with spoon beside glass of juice |
| 658 | **lunch** | Noun | None | Illustrated Object | CDI; ARASAAC | Sandwich halves beside apple and juice box |
| 659 | **dinner** | Noun | None | Illustrated Object | CDI; ARASAAC | Dinner plate with fork and steaming serving |
| 660 | **food** | Noun | None | Illustrated Object | CDI; ARASAAC | Plate holding varied meal portions |
| 661 | **ketchup** | Noun | None | Illustrated Object | CDI; ARASAAC | Bright red ketchup bottle tilted mid-squeeze |
| 662 | **fries** | Noun | None | Illustrated Object | CDI; ARASAAC | Red carton filled with golden french fries |
| 688 | **cucumber** | Noun | None | Illustrated Object | CDI; ARASAAC | Sliced green cucumber rounds with pale flesh |
| 689 | **pepper** | Noun | None | Illustrated Object | CDI; ARASAAC | Red bell pepper cut into crunchy strips |
| 690 | **granola bar** | Noun | None | Illustrated Object | CDI; ARASAAC | Oat granola bar half-wrapped in foil |
| 691 | **string cheese** | Noun | None | Illustrated Object | CDI; ARASAAC | Peeled mozzarella string cheese stick |
| 692 | **applesauce** | Noun | None | Illustrated Object | CDI; ARASAAC | Small cup of smooth applesauce with spoon |
| 693 | **hummus** | Noun | None | Illustrated Object | CDI; ARASAAC | Bowl of creamy hummus with olive oil swirl |
| 694 | **banana bread** | Noun | None | Illustrated Object | CDI; ARASAAC | Slice of moist banana bread loaf |
| 695 | **goldfish crackers** | Noun | None | Illustrated Object | CDI; ARASAAC | Handful of tiny orange fish-shaped crackers |
| 696 | **pudding** | Noun | None | Illustrated Object | CDI; ARASAAC | Cup of chocolate pudding with swirl top |
| 697 | **jello** | Noun | None | Illustrated Object | CDI; ARASAAC | Wobbly red gelatin cube on small plate |
| 698 | **brownie** | Noun | None | Illustrated Object | CDI; ARASAAC | Fudgy chocolate brownie square |
| 699 | **cupcake** | Noun | None | Illustrated Object | CDI; ARASAAC | Cupcake with swirled frosting and sprinkles |
| 700 | **chocolate** | Noun | None | Illustrated Object | CDI; ARASAAC | Chocolate bar with broken square pieces |
| 701 | **lollipop** | Noun | None | Illustrated Object | CDI; ARASAAC | Round swirl lollipop on a white stick |
| 702 | **dessert** | Noun | None | Illustrated Object | CDI; ARASAAC | Assorted sweets plate with cake and candy |
| 703 | **blueberry** | Noun | None | Illustrated Object | CDI; ARASAAC | Small cluster of round blue berries |
| 704 | **raspberry** | Noun | None | Illustrated Object | CDI; ARASAAC | Bumpy red raspberry with tiny drupelets |
| 705 | **blackberry** | Noun | None | Illustrated Object | CDI; ARASAAC | Bumpy dark purple blackberry |
| 706 | **cherry** | Noun | None | Illustrated Object | CDI; ARASAAC | Pair of shiny red cherries on a stem |
| 707 | **peach** | Noun | None | Illustrated Object | CDI; ARASAAC | Fuzzy orange-pink peach with one leaf |
| 708 | **pear** | Noun | None | Illustrated Object | CDI; ARASAAC | Green pear with curved stem |
| 709 | **mango** | Noun | None | Illustrated Object | CDI; ARASAAC | Ripe orange-red mango, one slice cut |
| 710 | **pineapple** | Noun | None | Illustrated Object | CDI; ARASAAC | Spiky pineapple with green crown |
| 711 | **kiwi** | Noun | None | Illustrated Object | CDI; ARASAAC | Brown kiwi cut open showing green flesh |
| 712 | **cantaloupe** | Noun | None | Illustrated Object | CDI; ARASAAC | Netted cantaloupe half with orange flesh |
| 713 | **melon** | Noun | None | Illustrated Object | CDI; ARASAAC | Whole green melon beside a cut wedge |
| 714 | **coconut** | Noun | None | Illustrated Object | CDI; ARASAAC | Brown coconut cracked open showing white flesh |
| 715 | **orange juice** | Noun | None | Illustrated Object | CDI; ARASAAC | Glass of orange juice beside an orange half |
| 716 | **grape juice** | Noun | None | Illustrated Object | CDI; ARASAAC | Glass of purple grape juice with grapes |
| 717 | **strawberry milk** | Noun | None | Illustrated Object | CDI; ARASAAC | Carton of pink strawberry milk |
| 718 | **lemonade** | Noun | None | Illustrated Object | CDI; ARASAAC | Glass of lemonade with lemon slice and straw |
| 719 | **hot chocolate** | Noun | None | Illustrated Object | CDI; ARASAAC | Mug of hot chocolate with marshmallows |
| 720 | **milkshake** | Noun | None | Illustrated Object | CDI; ARASAAC | Tall milkshake glass with whipped cream and straw |

### 3.2 Body, Health & Hygiene (43 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Health taxonomy. Art archetype: Stick Figure (somatic/roles) & Illustrated Object (tools/organs).*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 137 | **body** | Noun | None | Stick Figure | CDI; ARASAAC | Full neutral stick figure outline with glowing aura |
| 138 | **head** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure with circle highlight on head |
| 139 | **face** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure face with eyes and warm smile |
| 140 | **hair** | Noun | None | Illustrated Object | CDI; ARASAAC | Detailed hair strand texture comb illustration |
| 141 | **eye** | Noun | None | Illustrated Object | CDI; ARASAAC | Open gentle eye with iris and pupil |
| 142 | **ear** | Noun | None | Illustrated Object | CDI; ARASAAC | Curved ear hearing soft sound vibrations |
| 143 | **nose** | Noun | None | Illustrated Object | CDI; ARASAAC | Profile nose inhaling fresh breeze |
| 144 | **mouth** | Noun | None | Illustrated Object | CDI; ARASAAC | Open smiling mouth showing clean teeth |
| 145 | **teeth** | Noun | None | Illustrated Object | CDI; ARASAAC | Clean bright white row of teeth |
| 146 | **tongue** | Noun | None | Illustrated Object | CDI; ARASAAC | Playful pink tongue sticking out |
| 147 | **neck** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure with arrow highlighting neck area |
| 148 | **shoulder** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure with highlight on rounded shoulder |
| 149 | **arm** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure with extended arm highlighted |
| 150 | **hand** | Noun | None | Illustrated Object | CDI; ARASAAC | Open five-fingered palm facing viewer |
| 151 | **fingers** | Noun | None | Illustrated Object | CDI; ARASAAC | Spread fingers with active wiggle motion lines |
| 152 | **tummy** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure resting hands on circular belly |
| 153 | **back** | Noun | None | Stick Figure | CDI; ARASAAC | Rear view of stick figure highlighting spine |
| 154 | **leg** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure with stepping leg highlighted |
| 155 | **knee** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure pointing to bent knee joint |
| 156 | **foot** | Noun | None | Illustrated Object | CDI; ARASAAC | Bare foot sole with five rounded toes |
| 157 | **toes** | Noun | None | Illustrated Object | CDI; ARASAAC | Close-up of five cheerful wiggling toes |
| 158 | **bathroom** | Noun | None | Illustrated Object | CDI; ARASAAC | Bathroom door with universal door symbol |
| 159 | **potty** | Noun | None | Illustrated Object | CDI; ARASAAC | Toddler training potty chair |
| 160 | **toilet** | Noun | None | Illustrated Object | CDI; ARASAAC | White porcelain toilet with raised lid |
| 161 | **diaper** | Noun | None | Illustrated Object | CDI; ARASAAC | Clean baby/toddler diaper with sticky tabs |
| 162 | **wet wipe** | Noun | None | Illustrated Object | CDI; ARASAAC | Pop-up wet wipes container with pull sheet |
| 163 | **bath** | Noun | None | Illustrated Object | CDI; ARASAAC | Clawfoot bathtub filled with bubbly water |
| 164 | **shower** | Noun | None | Illustrated Object | CDI; ARASAAC | Showerhead spraying gentle water streams |
| 165 | **soap** | Noun | None | Illustrated Object | CDI; ARASAAC | Bar of soap with frothy floating bubbles |
| 166 | **toothbrush** | Noun | None | Illustrated Object | CDI; ARASAAC | Soft bristle toothbrush with toothpaste swirl |
| 167 | **toothpaste** | Noun | None | Illustrated Object | CDI; ARASAAC | Squeezed tube of fresh minty toothpaste |
| 168 | **towel** | Noun | None | Illustrated Object | CDI; ARASAAC | Soft folded plush bath towel on rack |
| 169 | **comb** | Noun | None | Illustrated Object | CDI; ARASAAC | Clean fine-tooth comb running through hair |
| 170 | **tissue** | Noun | None | Illustrated Object | CDI; ARASAAC | Cardboard tissue box with soft tissue pulled |
| 171 | **bandage** | Noun | None | Illustrated Object | CDI; ARASAAC | Sterile adhesive strip with protective pad |
| 173 | **sick** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure lying down with forehead thermometer |
| 174 | **pain** | Noun | Red | Diagrammatic | CDI; ARASAAC | Red radiating zig-zag starburst pain marker |
| 175 | **fever** | Noun | Red | Illustrated Object | CDI; ARASAAC | Mercury glass thermometer with red temperature bar |
| 176 | **cough** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure coughing into crook of elbow |
| 177 | **medicine** | Noun | None | Illustrated Object | CDI; ARASAAC | Liquid medicine bottle with measuring spoon |
| 178 | **dentist** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure examining teeth with small mirror |
| 663 | **poop** | Noun | None | Illustrated Object | CDI; ARASAAC | Brown coiled poop swirl beside toilet |
| 664 | **pee** | Noun | None | Illustrated Object | CDI; ARASAAC | Yellow droplets falling into toilet bowl |

### 3.3 Feelings, Emotions & Sensory States (35 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Emotional States. Art archetype: Stick Figure with Blue torso & somatic expression.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 61 | **happy** | Adjective | Blue | Stick Figure | Banajee; CDI | Stick figure smiling broadly with upturned arms |
| 180 | **mad** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure with stomping feet and clenched fists |
| 181 | **angry** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure with furrowed brow and red flushed aura |
| 182 | **scared** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure trembling with hands raised defensively |
| 183 | **excited** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure jumping in air with celebratory fists |
| 184 | **silly** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure striking playful goofy tilted pose |
| 185 | **nervous** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure fidgeting fingers with wary stance |
| 186 | **calm** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure seated cross-legged breathing deeply |
| 187 | **frustrated** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure grimacing with strained flexed arms |
| 188 | **proud** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure standing tall with chest out and smile |
| 189 | **shy** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure peeking shyly from behind soft curtain |
| 190 | **surprised** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure with rounded open eyes and gasp |
| 191 | **bored** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure resting chin on palm staring idly |
| 192 | **lonely** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Single stick figure seated alone on long bench |
| 193 | **hungry** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure rubbing rumbly tummy with fork in mind |
| 194 | **thirsty** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure with dry tongue looking at water drop |
| 195 | **tired** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure yawning wide with drooping eyelids |
| 196 | **sleepy** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure dozing off with 'Zzz' floating above |
| 197 | **energetic** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure leaping with electric energy bolts |
| 198 | **hot** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure fanning face with perspiration drops |
| 199 | **cold** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure shivering wrapped in cozy blanket |
| 200 | **warm** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure basking in gentle sunbeam |
| 201 | **loud** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Megaphone broadcasting bold sound shockwaves |
| 202 | **quiet** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure holding index finger gently to lips |
| 203 | **noisy** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Cacophony of clattering cymbals and drum beats |
| 204 | **bright** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Sun emitting intense radiant light beams |
| 205 | **dark** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Night sky with dim crescent moon and shadows |
| 206 | **soft** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Fluffy white cotton ball / pillow |
| 207 | **rough** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Coarse textured sandpaper / bumpy stone |
| 208 | **sticky** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Dripping honey / syrup adhering between fingers |
| 209 | **dizzy** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure swaying with swirling spiral halo |
| 210 | **gross** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure grimacing with tongue out in disgust |
| 211 | **comfortable** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure sinking into cozy armchair cushion |
| 212 | **uncomfortable** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure shifting awkwardly on stiff stool |
| 213 | **overwhelmed** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure holding head amid chaotic storm |

### 3.4 Daily Actions & Activity Verbs (61 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Verbs. Art archetype: Stick Figure with Green torso.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 23 | **take** | Verb | Green | Stick Figure | Banajee; CDI | Stick figure lifting object out from container |
| 24 | **give** | Verb | Green | Stick Figure | Banajee; CDI | Stick figure handing object forward to another |
| 214 | **run** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure sprinting at high speed with trailing lines |
| 215 | **jump** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure leaping high into air with legs bent |
| 216 | **walk** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure taking steady steps on walkway |
| 217 | **sit** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure sitting upright on four-legged chair |
| 218 | **stand** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure rising upright onto both feet |
| 219 | **climb** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure climbing rungs of a ladder |
| 220 | **dance** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure grooving with joyful arm flourishes |
| 221 | **swim** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure gliding through pool water with goggles |
| 222 | **ride** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure riding two-wheeled bicycle |
| 223 | **crawl** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure moving forward on hands and knees |
| 224 | **kick** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure kicking soccer ball with swinging foot |
| 225 | **throw** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure launching ball forward with raised arm |
| 226 | **catch** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure trapping flying ball safely in both hands |
| 227 | **push** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure leaning forward pushing heavy cart |
| 228 | **pull** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure pulling rope attached to loaded wagon |
| 229 | **swing** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure soaring forward on playground swing |
| 230 | **slide** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure swooping down curved playground slide |
| 231 | **fall** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure tumbling backward onto soft mat |
| 232 | **carry** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure bearing cardboard box with both arms |
| 233 | **drop** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure opening hands as ball plummets down |
| 234 | **write** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure holding pencil writing cursive letters |
| 235 | **draw** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure sketching sun on artist easel |
| 236 | **color** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure filling in coloring book page |
| 237 | **paint** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure dabbing vibrant watercolor brush |
| 238 | **cut** | Verb | Green | Illustrated Object | CDI; ARASAAC | Safety scissors snipping along dotted guide line |
| 239 | **glue** | Verb | Green | Illustrated Object | CDI; ARASAAC | Squeezing craft glue bottle onto paper shapes |
| 240 | **listen** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure cupping hand behind ear attentively |
| 241 | **speak** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure with open mouth producing speech waves |
| 242 | **talk** | Verb | Green | Stick Figure | CDI; ARASAAC | Two stick figures exchanging speech dialogue bubbles |
| 243 | **sing** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure singing heartily with musical notes |
| 244 | **count** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure tallying fingers 1-2-3 |
| 245 | **share** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure passing half of snack to peer |
| 246 | **clean up** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure putting toys neatly into bin |
| 247 | **wash** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure washing lathered hands under faucet |
| 248 | **wipe** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure gliding damp cloth across glass |
| 249 | **cook** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure stirring pot on kitchen stove |
| 250 | **build** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure stacking architectural toy blocks |
| 251 | **fix** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure tightening loose toy bolt with wrench |
| 252 | **hold** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure cradling delicate object securely |
| 253 | **touch** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure reaching index finger to surface |
| 254 | **know** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure smiling as lightbulb illuminates above |
| 255 | **remember** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure reaching into memory chest of photos |
| 256 | **forget** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure tapping forehead with question marks |
| 257 | **choose** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure pointing decisive finger at chosen item |
| 258 | **show** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure presenting completed artwork proudly |
| 259 | **ask** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure raising single hand politely to query |
| 260 | **hug** | Verb | Green | Stick Figure | CDI; ARASAAC | Two stick figures wrapped in warm gentle embrace |
| 261 | **kiss** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure planting tender peck on cheek |
| 262 | **laugh** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure giggling heartily with curved smile |
| 263 | **cry** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure weeping with tears rolling down cheek |
| 264 | **sleep** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure resting head peacefully on pillow |
| 265 | **wake up** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure stretching arms upward in morning light |
| 665 | **hit** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure striking tabletop with flat hand |
| 666 | **bite** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure biting into large sandwich |
| 667 | **break** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure snapping stick into two pieces |
| 668 | **scratch** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure scratching its own forearm |
| 669 | **close** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure pulling open door shut |
| 670 | **shut** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure pressing box lid closed |
| 671 | **tickle** | Verb | Green | Stick Figure | CDI; ARASAAC | Stick figure wiggling fingers at another's belly |

### 3.5 People, Family & Roles (32 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Social roles. Art archetype: Stick Figure with Yellow torso.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 266 | **family** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Cluster of family stick figures gathered together |
| 269 | **mama** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Mother figure cradling toddler gently |
| 270 | **dada** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Father figure carrying toddler on shoulders |
| 271 | **baby** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Small infant stick figure wrapped in bunting |
| 272 | **brother** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Boy stick figure sibling with active posture |
| 273 | **sister** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Girl stick figure sibling with friendly stance |
| 274 | **grandma** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Elderly maternal figure with warm spectacles |
| 275 | **grandpa** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Elderly paternal figure with gentle walking cane |
| 276 | **aunt** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Adult female relative stick figure waving |
| 277 | **uncle** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Adult male relative stick figure smiling |
| 278 | **cousin** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Youth peer relative stick figure playing |
| 279 | **pet** | Noun | Yellow | Illustrated Object | CDI; ARASAAC | Affectionate puppy with wagging tail |
| 280 | **teacher** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Educator figure pointing to alphabet chalkboard |
| 281 | **therapist** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Speech/OT specialist holding communication board |
| 282 | **aide** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Support assistant walking alongside student |
| 283 | **student** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Youth stick figure carrying school backpack |
| 284 | **friend** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Two peer stick figures sharing high-five |
| 285 | **class** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Circle of diverse student stick figures learning |
| 286 | **firefighter** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Firefighter in safety helmet holding hose |
| 287 | **police officer** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Officer with badge guiding pedestrian safely |
| 288 | **bus driver** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Driver steering yellow school bus with mirror |
| 289 | **neighbor** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Friendly community resident waving over fence |
| 290 | **person** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Neutral individual stick figure standing centered |
| 291 | **people** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Small crowd of varied stick figures gathered |
| 292 | **kids** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Group of active youth stick figures playing |
| 293 | **doctor** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Doctor in white coat with stethoscope |
| 294 | **nurse** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Nurse in scrubs offering supportive care |
| 295 | **babysitter** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Caregiver reading bedtime story to toddler |
| 296 | **name** | Noun | Yellow | Diagrammatic | AoA 4.12; Fry top-200 | Name tag badge reading "Hello, my name is" |
| 672 | **boy** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Short child-proportion stick figure (big head), hair inside head outline |
| 673 | **girl** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Short child-proportion stick figure (big head), hair breaking outside head outline |
| 674 | **man** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Tall adult-proportion stick figure, hair inside head outline |
| 675 | **woman** | Noun | Yellow | Stick Figure | CDI; ARASAAC | Tall adult-proportion stick figure, hair breaking outside head outline |
### 3.6 Places, Rooms & Community (35 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Environments. Art archetype: Illustrated Object.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 297 | **home** | Noun | None | Illustrated Object | CDI; ARASAAC | Cozy house with pitched roof and welcoming door |
| 298 | **house** | Noun | None | Illustrated Object | CDI; ARASAAC | Two-story suburban house with chimney and garden |
| 299 | **bedroom** | Noun | None | Illustrated Object | CDI; ARASAAC | Bed with nightstand and warm reading lamp |
| 300 | **living room** | Noun | None | Illustrated Object | CDI; ARASAAC | Sofa with coffee table and framed picture |
| 301 | **kitchen** | Noun | None | Illustrated Object | CDI; ARASAAC | Stove oven, refrigerator, and counter space |
| 302 | **basement** | Noun | None | Illustrated Object | CDI; ARASAAC | Stairs descending into lower storage level |
| 303 | **stairs** | Noun | None | Illustrated Object | CDI; ARASAAC | Flight of carpeted stairs with sturdy handrail |
| 304 | **yard** | Noun | None | Illustrated Object | CDI; ARASAAC | Grassy fenced backyard with blooming tree |
| 305 | **school** | Noun | None | Illustrated Object | CDI; ARASAAC | Brick school building with flagpole and clock |
| 306 | **classroom** | Noun | None | Illustrated Object | CDI; ARASAAC | Desks facing blackboard and book cubbies |
| 307 | **playground** | Noun | None | Illustrated Object | CDI; ARASAAC | Jungle gym tower with slide and swing set |
| 308 | **gym** | Noun | None | Illustrated Object | CDI; ARASAAC | Indoor basketball court with polished hardwood |
| 309 | **cafeteria** | Noun | None | Illustrated Object | CDI; ARASAAC | Long dining tables with food serving counter |
| 310 | **library** | Noun | None | Illustrated Object | CDI; ARASAAC | Tall wooden bookshelves stacked with volumes |
| 311 | **hallway** | Noun | None | Illustrated Object | CDI; ARASAAC | Long school corridor lined with metal lockers |
| 312 | **desk** | Noun | None | Illustrated Object | CDI; ARASAAC | Wooden student desk with attached seat |
| 313 | **park** | Noun | None | Illustrated Object | CDI; ARASAAC | Public green park with walking paths and bench |
| 314 | **store** | Noun | None | Illustrated Object | CDI; ARASAAC | Retail shop with display windows and awning |
| 315 | **grocery store** | Noun | None | Illustrated Object | CDI; ARASAAC | Supermarket aisles stocked with fresh food |
| 316 | **restaurant** | Noun | None | Illustrated Object | CDI; ARASAAC | Dining tables with silverware and menu stand |
| 317 | **pool** | Noun | None | Illustrated Object | CDI; ARASAAC | Swimming pool with clear turquoise water and ladder |
| 318 | **beach** | Noun | None | Illustrated Object | CDI; ARASAAC | Sandy shoreline with ocean waves and umbrella |
| 319 | **zoo** | Noun | None | Illustrated Object | CDI; ARASAAC | Park entrance with animal silhouettes on arch |
| 320 | **doctor office** | Noun | None | Illustrated Object | CDI; ARASAAC | Clinic room with examination table and scale |
| 321 | **hospital** | Noun | None | Illustrated Object | CDI; ARASAAC | Large medical center with red emergency cross |
| 322 | **museum** | Noun | None | Illustrated Object | CDI; ARASAAC | Classical pillars housing art and artifacts |
| 323 | **movie theater** | Noun | None | Illustrated Object | CDI; ARASAAC | Cinema auditorium with big screen and seats |
| 324 | **mall** | Noun | None | Illustrated Object | CDI; ARASAAC | Multi-level shopping center with atrium fountain |
| 325 | **farm** | Noun | None | Illustrated Object | CDI; ARASAAC | Classic red barn with silo and hay bales |
| 326 | **airport** | Noun | None | Illustrated Object | CDI; ARASAAC | Terminal building with control tower and runway |
| 327 | **outside** | Noun | None | Illustrated Object | CDI; ARASAAC | Sun shining over rolling green meadow hills |
| 328 | **inside** | Noun | None | Illustrated Object | CDI; ARASAAC | Looking into cozy warmly illuminated room |
| 329 | **street** | Noun | None | Illustrated Object | CDI; ARASAAC | Paved city roadway with pedestrian crosswalk |
| 330 | **town** | Noun | None | Illustrated Object | CDI; ARASAAC | Skyline of small town shops and steeple |
| 331 | **church** | Noun | None | Illustrated Object | CDI; ARASAAC | Community chapel with peaked roof and stained glass |

### 3.7 Toys, Play, Media & Leisure (38 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Recreation. Art archetype: Illustrated Object.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 332 | **toy** | Noun | None | Illustrated Object | CDI; ARASAAC | Assorted classic toys spilling from wooden chest |
| 333 | **ball** | Noun | None | Illustrated Object | CDI; ARASAAC | Bouncing red rubber playground ball |
| 334 | **blocks** | Noun | None | Illustrated Object | CDI; ARASAAC | Set of primary-colored wooden building blocks |
| 335 | **puzzle** | Noun | None | Illustrated Object | CDI; ARASAAC | Four interlocking jigsaw puzzle pieces fitting |
| 336 | **doll** | Noun | None | Illustrated Object | CDI; ARASAAC | Soft rag doll with button eyes and yarn hair |
| 337 | **action figure** | Noun | None | Illustrated Object | CDI; ARASAAC | Hero figure with movable joints and cape |
| 338 | **bubbles** | Noun | None | Illustrated Object | CDI; ARASAAC | Wand blowing iridescent shimmering soap bubbles |
| 339 | **play dough** | Noun | None | Illustrated Object | CDI; ARASAAC | Tub of colorful modeling clay with rolling pin |
| 340 | **toy car** | Noun | None | Illustrated Object | CDI; ARASAAC | Small die-cast metal toy sports car |
| 341 | **toy train** | Noun | None | Illustrated Object | CDI; ARASAAC | Wooden locomotive pulling tender on track |
| 342 | **stuffed animal** | Noun | None | Illustrated Object | CDI; ARASAAC | Plush cuddly brown teddy bear |
| 343 | **dinosaur** | Noun | None | Illustrated Object | CDI; ARASAAC | Green toy Tyrannosaurus rex stomping |
| 344 | **robot** | Noun | None | Illustrated Object | CDI; ARASAAC | Tin toy robot with antenna and winding key |
| 345 | **legos** | Noun | None | Illustrated Object | CDI; ARASAAC | Interlocking plastic bricks of varied sizes |
| 346 | **board game** | Noun | None | Illustrated Object | CDI; ARASAAC | Colorful game board with dice and player tokens |
| 347 | **swing set** | Noun | None | Illustrated Object | CDI; ARASAAC | Sturdy metal A-frame swing set with two seats |
| 348 | **sandbox** | Noun | None | Illustrated Object | CDI; ARASAAC | Square wooden sandbox with bucket and shovel |
| 349 | **bike** | Noun | None | Illustrated Object | CDI; ARASAAC | Children's bicycle with training wheels and bell |
| 350 | **scooter** | Noun | None | Illustrated Object | CDI; ARASAAC | Two-wheeled kick scooter with handlebar grips |
| 351 | **skateboard** | Noun | None | Illustrated Object | CDI; ARASAAC | Wooden skateboard deck with grip tape and wheels |
| 352 | **wagon** | Noun | None | Illustrated Object | CDI; ARASAAC | Classic red steel wagon with pull handle |
| 353 | **chalk** | Noun | None | Illustrated Object | CDI; ARASAAC | Thick sidewalk chalk sticks in assorted pastels |
| 354 | **jump rope** | Noun | None | Illustrated Object | CDI; ARASAAC | Braided jump rope with wooden handles |
| 355 | **music** | Noun | None | Illustrated Object | CDI; ARASAAC | Floating treble clef and colorful eighth notes |
| 356 | **song** | Noun | None | Illustrated Object | CDI; ARASAAC | Microphone projecting sparkling sound melodies |
| 357 | **tablet** | Noun | None | Illustrated Object | CDI; ARASAAC | Touchscreen tablet device displaying colorful app icons |
| 358 | **iPad** | Noun | None | Illustrated Object | CDI; ARASAAC | Sleek metallic tablet with glowing display screen |
| 359 | **phone** | Noun | None | Illustrated Object | CDI; ARASAAC | Modern smartphone with keypad screen active |
| 360 | **TV** | Noun | None | Illustrated Object | CDI; ARASAAC | Flat-panel television screen playing cartoon |
| 361 | **movie** | Noun | None | Illustrated Object | CDI; ARASAAC | Film reel strip unfolding with popcorn tub |
| 362 | **video** | Noun | None | Illustrated Object | CDI; ARASAAC | Play button inside screen video frame |
| 363 | **headphones** | Noun | None | Illustrated Object | CDI; ARASAAC | Padded over-ear headphones with soft cushions |
| 364 | **computer** | Noun | None | Illustrated Object | CDI; ARASAAC | Desktop monitor with keyboard and mouse |
| 365 | **camera** | Noun | None | Illustrated Object | CDI; ARASAAC | Handheld camera with click shutter and lens |
| 366 | **paper** | Noun | None | Illustrated Object | CDI; ARASAAC | Crisp blank sheet of white drawing paper |
| 367 | **markers** | Noun | None | Illustrated Object | CDI; ARASAAC | Set of washable colored markers with caps |
| 368 | **crayons** | Noun | None | Illustrated Object | CDI; ARASAAC | Cardboard box of vibrant wax crayons |
| 369 | **book** | Noun | None | Illustrated Object | CDI; ARASAAC | Illustrated children's storybook open wide |

### 3.8 Home, Household Objects & Daily Tools (42 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Domestic items. Art archetype: Illustrated Object.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 370 | **chair** | Noun | None | Illustrated Object | CDI; ARASAAC | Comfortable wooden dining chair with backrest |
| 371 | **couch** | Noun | None | Illustrated Object | CDI; ARASAAC | Plush upholstered living room couch with cushions |
| 372 | **table** | Noun | None | Illustrated Object | CDI; ARASAAC | Sturdy four-legged wooden dining table |
| 373 | **bed** | Noun | None | Illustrated Object | CDI; ARASAAC | Bed dressed with soft quilt and fluffy pillow |
| 374 | **door** | Noun | None | Illustrated Object | CDI; ARASAAC | Wooden door with brass knob slightly ajar |
| 375 | **window** | Noun | None | Illustrated Object | CDI; ARASAAC | Clear glass window with opened sunny curtains |
| 376 | **lamp** | Noun | None | Illustrated Object | CDI; ARASAAC | Table lamp with glowing lampshade emitting light |
| 377 | **clock** | Noun | None | Illustrated Object | CDI; ARASAAC | Round analog wall clock showing twelve o'clock |
| 378 | **trash** | Noun | None | Illustrated Object | CDI; ARASAAC | Kitchen pedal waste bin with closed lid |
| 379 | **sink** | Noun | None | Illustrated Object | CDI; ARASAAC | Porcelain sink basin with polished faucet tap |
| 380 | **mirror** | Noun | None | Illustrated Object | CDI; ARASAAC | Wall mirror reflecting crisp clear glass gleam |
| 381 | **rug** | Noun | None | Illustrated Object | CDI; ARASAAC | Woven patterned floor rug on hardwood floor |
| 382 | **plate** | Noun | None | Illustrated Object | CDI; ARASAAC | Round ceramic dinner plate with subtle rim |
| 383 | **bowl** | Noun | None | Illustrated Object | CDI; ARASAAC | Deep cereal/soup bowl in pastel ceramic |
| 384 | **cup** | Noun | None | Illustrated Object | CDI; ARASAAC | Drinking cup with sturdy side handle |
| 385 | **fork** | Noun | None | Illustrated Object | CDI; ARASAAC | Stainless steel four-pronged dinner fork |
| 386 | **spoon** | Noun | None | Illustrated Object | CDI; ARASAAC | Oval soup spoon with reflective polished bowl |
| 387 | **knife** | Noun | None | Illustrated Object | CDI; ARASAAC | Rounded-tip table butter knife |
| 388 | **napkin** | Noun | None | Illustrated Object | CDI; ARASAAC | Neatly folded white cloth table napkin |
| 389 | **bottle** | Noun | None | Illustrated Object | CDI; ARASAAC | Reusable water bottle with flip-up sippy cap |
| 390 | **straw** | Noun | None | Illustrated Object | CDI; ARASAAC | Striped flexible drinking straw bending |
| 391 | **fridge** | Noun | None | Illustrated Object | CDI; ARASAAC | Double-door refrigerator with freezer compartment |
| 392 | **microwave** | Noun | None | Illustrated Object | CDI; ARASAAC | Countertop microwave oven with digital timer |
| 393 | **backpack** | Noun | None | Illustrated Object | CDI; ARASAAC | Zippered canvas school backpack with straps |
| 394 | **bag** | Noun | None | Illustrated Object | CDI; ARASAAC | Cloth tote shopping bag with sturdy handles |
| 395 | **keys** | Noun | None | Illustrated Object | CDI; ARASAAC | Ring of metal house and vehicle keys |
| 396 | **wallet** | Noun | None | Illustrated Object | CDI; ARASAAC | Folded leather billfold wallet |
| 397 | **glasses** | Noun | None | Illustrated Object | CDI; ARASAAC | Pair of prescription reading eyeglasses |
| 398 | **umbrella** | Noun | None | Illustrated Object | CDI; ARASAAC | Opened waterproof umbrella shielding rain |
| 399 | **blanket** | Noun | None | Illustrated Object | CDI; ARASAAC | Warm knitted fleece throw blanket |
| 400 | **pillow** | Noun | None | Illustrated Object | CDI; ARASAAC | Plump feather sleeping pillow with cotton case |
| 401 | **fan** | Noun | None | Illustrated Object | CDI; ARASAAC | Electric oscillating desk fan with spinning blades |
| 402 | **charger** | Noun | None | Illustrated Object | CDI; ARASAAC | Device charging cord with wall adapter brick |
| 403 | **box** | Noun | None | Illustrated Object | CDI; ARASAAC | Sturdy brown corrugated cardboard shipping box |
| 404 | **battery** | Noun | None | Illustrated Object | CDI; ARASAAC | Cylindrical AA battery with positive terminal |
| 405 | **broom** | Noun | None | Illustrated Object | CDI; ARASAAC | Bristle floor sweeping broom with dustpan |
| 406 | **vacuum** | Noun | None | Illustrated Object | CDI; ARASAAC | Upright electric floor vacuum cleaner with hose |
| 407 | **sponge** | Noun | None | Illustrated Object | CDI; ARASAAC | Rectangular dish sponge with scouring side |
| 408 | **tape** | Noun | None | Illustrated Object | CDI; ARASAAC | Roll of transparent adhesive tape on dispenser |
| 409 | **flashlight** | Noun | None | Illustrated Object | CDI; ARASAAC | Handheld flashlight casting bright yellow beam |
| 410 | **bucket** | Noun | None | Illustrated Object | CDI; ARASAAC | Utility mop bucket with metal wire handle |
| 411 | **paper towel** | Noun | None | Illustrated Object | CDI; ARASAAC | Perforated roll of white absorbent paper towels |

### 3.9 Clothing & Accessories (28 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Garments. Art archetype: Illustrated Object.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 412 | **shirt** | Noun | None | Illustrated Object | CDI; ARASAAC | Short-sleeved cotton crewneck t-shirt |
| 413 | **pants** | Noun | None | Illustrated Object | CDI; ARASAAC | Denim jeans with waistband and front pockets |
| 414 | **shorts** | Noun | None | Illustrated Object | CDI; ARASAAC | Casual knee-length summer cotton shorts |
| 415 | **underwear** | Noun | None | Illustrated Object | CDI; ARASAAC | Clean comfortable cotton briefs / undergarment |
| 416 | **dress** | Noun | None | Illustrated Object | CDI; ARASAAC | A-line floral dress with flared skirt |
| 417 | **skirt** | Noun | None | Illustrated Object | CDI; ARASAAC | Pleated twirl skirt with elastic waistband |
| 418 | **sweater** | Noun | None | Illustrated Object | CDI; ARASAAC | Warm knitted woolen pullover sweater |
| 419 | **sweatshirt** | Noun | None | Illustrated Object | CDI; ARASAAC | Fleece hooded sweatshirt with kangaroo pocket |
| 420 | **socks** | Noun | None | Illustrated Object | CDI; ARASAAC | Pair of cozy knitted crew socks |
| 421 | **shoes** | Noun | None | Illustrated Object | CDI; ARASAAC | Pair of tied running sneakers with laces |
| 422 | **pajamas** | Noun | None | Illustrated Object | CDI; ARASAAC | Two-piece cozy flannel sleepwear set |
| 423 | **robe** | Noun | None | Illustrated Object | CDI; ARASAAC | Plush terrycloth bathrobe with tied waist sash |
| 424 | **slippers** | Noun | None | Illustrated Object | CDI; ARASAAC | Fuzzy slip-on house shoes with soft soles |
| 425 | **jacket** | Noun | None | Illustrated Object | CDI; ARASAAC | Lightweight zippered outdoor windbreaker jacket |
| 426 | **coat** | Noun | None | Illustrated Object | CDI; ARASAAC | Heavy winter parka with insulated hood |
| 427 | **hat** | Noun | None | Illustrated Object | CDI; ARASAAC | Curved brim baseball cap with adjustable strap |
| 428 | **mittens** | Noun | None | Illustrated Object | CDI; ARASAAC | Thick knitted winter mittens covering fingers |
| 429 | **gloves** | Noun | None | Illustrated Object | CDI; ARASAAC | Five-finger insulated leather winter gloves |
| 430 | **scarf** | Noun | None | Illustrated Object | CDI; ARASAAC | Long striped winter wool scarf wrapped warmly |
| 431 | **boots** | Noun | None | Illustrated Object | CDI; ARASAAC | Waterproof rubber rain boots with treaded soles |
| 432 | **raincoat** | Noun | None | Illustrated Object | CDI; ARASAAC | Bright yellow hooded waterproof slicker coat |
| 433 | **swimsuit** | Noun | None | Illustrated Object | CDI; ARASAAC | One-piece swimwear / swimming trunks |
| 434 | **sunglasses** | Noun | None | Illustrated Object | CDI; ARASAAC | Dark UV-tinted sunglasses with modern frame |
| 435 | **zipper** | Noun | None | Illustrated Object | CDI; ARASAAC | Metal zipper slider gliding along interlocking teeth |
| 436 | **button** | Noun | None | Illustrated Object | CDI; ARASAAC | Round sewing button with four thread holes |
| 437 | **belt** | Noun | None | Illustrated Object | CDI; ARASAAC | Leather belt with polished metal buckle pin |
| 438 | **pocket** | Noun | None | Illustrated Object | CDI; ARASAAC | Sewn garment pocket holding small treasure |
| 439 | **sandals** | Noun | None | Illustrated Object | CDI; ARASAAC | Open-toe summer sandals with buckle straps |

### 3.10 Animals & Nature (40 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Animals. Art archetype: Illustrated Object.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 440 | **animal** | Noun | None | Illustrated Object | CDI; ARASAAC | Playful animal paw print emblem |
| 441 | **dog** | Noun | None | Illustrated Object | CDI; ARASAAC | Friendly golden retriever sitting with panting smile |
| 442 | **cat** | Noun | None | Illustrated Object | CDI; ARASAAC | Cozy tabby cat curled with curled tail |
| 443 | **puppy** | Noun | None | Illustrated Object | CDI; ARASAAC | Eager puppy bounding forward happily |
| 444 | **kitten** | Noun | None | Illustrated Object | CDI; ARASAAC | Tiny curious kitten batting playful paw |
| 445 | **bird** | Noun | None | Illustrated Object | CDI; ARASAAC | Robin perched on branch with feathered wings |
| 446 | **bunny** | Noun | None | Illustrated Object | CDI; ARASAAC | Soft white rabbit with tall upright pink ears |
| 447 | **duck** | Noun | None | Illustrated Object | CDI; ARASAAC | Yellow mallard duck paddling on pond surface |
| 448 | **hen** | Noun | None | Illustrated Object | CDI; ARASAAC | Barnyard hen with red comb pecking ground |
| 449 | **cow** | Noun | None | Illustrated Object | CDI; ARASAAC | Spotted dairy cow grazing peacefully on meadow |
| 450 | **horse** | Noun | None | Illustrated Object | CDI; ARASAAC | Majestic brown horse with flowing mane and tail |
| 451 | **pig** | Noun | None | Illustrated Object | CDI; ARASAAC | Pink piglet with curly tail and snout |
| 452 | **sheep** | Noun | None | Illustrated Object | CDI; ARASAAC | Fluffy white woolly sheep standing on hill |
| 453 | **goat** | Noun | None | Illustrated Object | CDI; ARASAAC | Curious farm goat with small curved horns |
| 454 | **bear** | Noun | None | Illustrated Object | CDI; ARASAAC | Large gentle brown bear standing upright |
| 455 | **lion** | Noun | None | Illustrated Object | CDI; ARASAAC | Proud male lion with magnificent golden mane |
| 456 | **tiger** | Noun | None | Illustrated Object | CDI; ARASAAC | Orange striped tiger prowling gracefully |
| 457 | **elephant** | Noun | None | Illustrated Object | CDI; ARASAAC | Grand gray elephant with raised trunk and tusks |
| 458 | **monkey** | Noun | None | Illustrated Object | CDI; ARASAAC | Acrobatic monkey swinging from jungle vine |
| 459 | **giraffe** | Noun | None | Illustrated Object | CDI; ARASAAC | Tall spotted giraffe reaching high tree foliage |
| 460 | **zebra** | Noun | None | Illustrated Object | CDI; ARASAAC | Graceful zebra with sharp black-and-white stripes |
| 461 | **hippo** | Noun | None | Illustrated Object | CDI; ARASAAC | Round river hippopotamus bathing in water |
| 462 | **penguin** | Noun | None | Illustrated Object | CDI; ARASAAC | Tuxedo-patterned penguin waddling on ice pack |
| 463 | **dolphin** | Noun | None | Illustrated Object | CDI; ARASAAC | Sleek dolphin leaping in arc over ocean wave |
| 464 | **whale** | Noun | None | Illustrated Object | CDI; ARASAAC | Mighty blue whale breaching with water spout |
| 465 | **snake** | Noun | None | Illustrated Object | CDI; ARASAAC | Smooth coiled garden snake with flicking tongue |
| 466 | **turtle** | Noun | None | Illustrated Object | CDI; ARASAAC | Land turtle with sturdy patterned shell |
| 467 | **frog** | Noun | None | Illustrated Object | CDI; ARASAAC | Bright green tree frog resting on lily pad |
| 468 | **bug** | Noun | None | Illustrated Object | CDI; ARASAAC | Little red ladybug with black polka dots |
| 469 | **spider** | Noun | None | Illustrated Object | CDI; ARASAAC | Harmless eight-legged spider in delicate web |
| 470 | **butterfly** | Noun | None | Illustrated Object | CDI; ARASAAC | Monarch butterfly with vibrant wings spread |
| 471 | **tree** | Noun | None | Illustrated Object | CDI; ARASAAC | Sturdy oak tree with broad leafy green canopy |
| 472 | **grass** | Noun | None | Illustrated Object | CDI; ARASAAC | Blades of fresh morning dew garden grass |
| 473 | **flower** | Noun | None | Illustrated Object | CDI; ARASAAC | Blooming yellow sunflower on tall stem |
| 474 | **sun** | Noun | None | Illustrated Object | CDI; ARASAAC | Radiant golden sun with glowing rays |
| 475 | **rain** | Noun | None | Illustrated Object | CDI; ARASAAC | Raincloud releasing gentle diagonal raindrops |
| 476 | **snow** | Noun | None | Illustrated Object | CDI; ARASAAC | Delicate hexagonal crystalline snowflake drifting |
| 477 | **wind** | Noun | None | Illustrated Object | CDI; ARASAAC | Curling breeze swirls rustling autumn leaves |
| 478 | **cloud** | Noun | None | Illustrated Object | CDI; ARASAAC | Puffy white cumulus cloud in sky |
| 479 | **moon** | Noun | None | Illustrated Object | CDI; ARASAAC | Glowing crescent moon in twilight sky |

### 3.11 Vehicles & Transportation (25 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Transport. Art archetype: Illustrated Object.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 480 | **vehicle** | Noun | None | Illustrated Object | CDI; ARASAAC | Silhouette emblem of wheels and roadway |
| 481 | **car** | Noun | None | Illustrated Object | CDI; ARASAAC | Compact family four-door sedan car |
| 482 | **bus** | Noun | None | Illustrated Object | CDI; ARASAAC | City transit commuter bus with destination sign |
| 483 | **school bus** | Noun | None | Illustrated Object | CDI; ARASAAC | Classic yellow school bus with stop sign arm |
| 484 | **truck** | Noun | None | Illustrated Object | CDI; ARASAAC | Heavy-duty pickup truck with open cargo bed |
| 485 | **fire truck** | Noun | None | Illustrated Object | CDI; ARASAAC | Red emergency fire engine with ladder and siren |
| 486 | **police car** | Noun | None | Illustrated Object | CDI; ARASAAC | Patrol cruiser with rooftop flashing siren bar |
| 487 | **ambulance** | Noun | None | Illustrated Object | CDI; ARASAAC | Emergency paramedic van with medical red cross |
| 488 | **train** | Noun | None | Illustrated Object | CDI; ARASAAC | Streamlined passenger rail train on track |
| 489 | **bicycle** | Noun | None | Illustrated Object | CDI; ARASAAC | Two-wheel pedal bicycle with frame and chain |
| 490 | **motorcycle** | Noun | None | Illustrated Object | CDI; ARASAAC | Motorized two-wheeler with handlebars and engine |
| 491 | **van** | Noun | None | Illustrated Object | CDI; ARASAAC | Family passenger minivan with sliding side door |
| 492 | **tractor** | Noun | None | Illustrated Object | CDI; ARASAAC | Green farm tractor with huge treaded rear tires |
| 493 | **stroller** | Noun | None | Illustrated Object | CDI; ARASAAC | Folding baby stroller carriage with canopy |
| 494 | **airplane** | Noun | None | Illustrated Object | CDI; ARASAAC | Commercial jet aircraft cruising above clouds |
| 495 | **helicopter** | Noun | None | Illustrated Object | CDI; ARASAAC | Helicopter hovering with spinning rotor blades |
| 496 | **rocket** | Noun | None | Illustrated Object | CDI; ARASAAC | Space rocket blasting off with fiery exhaust plume |
| 497 | **boat** | Noun | None | Illustrated Object | CDI; ARASAAC | Recreational motorboat cutting through river water |
| 498 | **ship** | Noun | None | Illustrated Object | CDI; ARASAAC | Large ocean liner cruise ship with chimneys |
| 499 | **canoe** | Noun | None | Illustrated Object | CDI; ARASAAC | Wooden canoe paddle boat gliding on still lake |
| 500 | **subway** | Noun | None | Illustrated Object | CDI; ARASAAC | Underground metro train emerging at platform |
| 501 | **road** | Noun | None | Illustrated Object | CDI; ARASAAC | Curving asphalt two-lane road with dashed lines |
| 502 | **track** | Noun | None | Illustrated Object | CDI; ARASAAC | Parallel steel railroad tracks with wooden ties |
| 503 | **stoplight** | Noun | None | Illustrated Object | CDI; ARASAAC | Traffic signal post with red, yellow, green lights |
| 504 | **gas station** | Noun | None | Illustrated Object | CDI; ARASAAC | Fuel pump nozzle dispensing gas under awning |

### 3.12 Descriptors, Adjectives & Opposites (50 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Attributes. Art archetype: Diagrammatic & Illustrated Object with Blue fill.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 57 | **big** | Adjective | Blue | Diagrammatic | Banajee; Project Core; CDI | Contrast: large ball filled blue beside a tiny pale grey ball, no arrow |
| 58 | **little** | Adjective | Blue | Diagrammatic | Banajee; CDI | Contrast: tiny ball filled blue beside a large pale grey ball, no arrow |
| 60 | **bad** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Thumbs-down icon with jagged accent |
| 505 | **red** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Paint swatch patch of rich crimson red |
| 506 | **blue** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Paint swatch patch of vibrant sky blue |
| 507 | **green** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Paint swatch patch of lush emerald green |
| 508 | **yellow** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Paint swatch patch of sunny bright yellow |
| 509 | **orange** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Paint swatch patch of warm citrus orange |
| 510 | **purple** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Paint swatch patch of royal violet purple |
| 511 | **pink** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Paint swatch patch of soft pastel pink |
| 512 | **brown** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Paint swatch patch of rich earthy brown |
| 513 | **black** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Paint swatch patch of deep pure black |
| 514 | **white** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Paint swatch patch of clean pure white |
| 515 | **fast** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Cheetah silhouette with speed streak blur lines |
| 516 | **slow** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Snail slowly leaving calm glistening trail |
| 517 | **tall** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Towering vertical skyscraper beside low house |
| 518 | **short** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Low garden shrub beside towering pine tree |
| 519 | **long** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Extended horizontal line reaching across frame |
| 520 | **heavy** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Massive iron barbell bending support platform |
| 521 | **light** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Delicate white feather floating gently in breeze |
| 522 | **thick** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Chunky broad wooden plank cross-section |
| 523 | **thin** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Slender wafer-thin paper sliver cross-section |
| 524 | **wide** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Two outward pointing horizontal divergence arrows |
| 525 | **narrow** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Two inward pointing horizontal convergence arrows |
| 526 | **hard** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Solid unyielding solid granite rock boulder |
| 527 | **wet** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Dripping water droplets rolling off saturated leaf |
| 528 | **dry** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Clean sun-dried cloth swaying on clothesline |
| 529 | **clean** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Sparkling shiny dish with twinkle star gleams |
| 530 | **dirty** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Mud-splattered surface with brown dirt smears |
| 531 | **smooth** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Polished glassy river pebble without ripples |
| 532 | **broken** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Ceramic plate split into cracked fractured pieces |
| 533 | **fixed** | Adjective | Blue | Illustrated Object | CDI; ARASAAC | Item reassembled seamlessly with sturdy seam |
| 534 | **empty** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Clear glass cup containing zero liquid inside |
| 535 | **full** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Clear glass cup filled to brim with liquid |
| 536 | **safe** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Sturdy green shield with protective checkmark |
| 537 | **dangerous** | Adjective | Red | Diagrammatic | CDI; ARASAAC | Yellow warning triangle with exclamation point |
| 538 | **easy** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Simple straight single puzzle connection |
| 539 | **difficult** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Intricate tangled labyrinth maze pathway |
| 540 | **right** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Crisp green checkmark signifying correct choice |
| 541 | **wrong** | Adjective | Red | Diagrammatic | CDI; ARASAAC | Bold red X mark signifying incorrect choice |
| 542 | **new** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Unwrapped box with radiant pristine sparkle |
| 543 | **old** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Faded antique scroll with softened frayed edges |
| 544 | **pretty** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Graceful blossoming lotus flower in bloom |
| 545 | **cool** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Sunglasses wearing star giving chill thumbs-up |
| 546 | **special** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Glowing golden star encircled by laurel wreath |
| 547 | **ready** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure poised at runner starting blocks |
| 548 | **favorite** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Glowing golden heart with ribbon bookmark |
| 549 | **weird** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Quirky asymmetrical spiral with playful eyes |
| 550 | **funny** | Adjective | Blue | Stick Figure | CDI; ARASAAC | Stick figure laughing heartily slapping knee |
| 552 | **light** | Adjective | Blue | Diagrammatic | CDI; ARASAAC | Pale pastel yellow gradient fill swatch |

### 3.13 Time, Calendar & Sequencing (24 words)
*Seeded from MacArthur-Bates CDI & ARASAAC Temporal structuring. Art archetype: Diagrammatic with Pink/Yellow/Blue styling.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 553 | **morning** | Noun | None | Diagrammatic | CDI; ARASAAC | Sunrise peeking above horizon with golden glow |
| 554 | **afternoon** | Noun | None | Diagrammatic | CDI; ARASAAC | Bright sun positioned high in clear mid-sky |
| 555 | **evening** | Noun | None | Diagrammatic | CDI; ARASAAC | Sun setting beneath horizon casting orange dusk |
| 556 | **night** | Noun | None | Diagrammatic | CDI; ARASAAC | Crescent moon resting amid sparkling starry night |
| 557 | **bedtime** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure tucking into bed with nightcap |
| 558 | **naptime** | Noun | None | Stick Figure | CDI; ARASAAC | Stick figure resting on nap cot with blanket |
| 559 | **now** | Adverb | Pink | Diagrammatic | CDI; ARASAAC | Clock face with flashing red second pointer |
| 560 | **later** | Adverb | Pink | Diagrammatic | CDI; ARASAAC | Curved forward timeline arrow leaping ahead |
| 561 | **soon** | Adverb | Pink | Diagrammatic | CDI; ARASAAC | Short hopping forward arrow arriving quickly |
| 562 | **today** | Noun | None | Diagrammatic | CDI; ARASAAC | Calendar page with current square highlighted gold |
| 563 | **tomorrow** | Noun | None | Diagrammatic | CDI; ARASAAC | Calendar page with next day box circled |
| 564 | **yesterday** | Noun | None | Diagrammatic | CDI; ARASAAC | Calendar page with previous day box marked |
| 565 | **before** | Preposition | Pink | Diagrammatic | CDI; ARASAAC | Arrow pointing backward on horizontal axis |
| 566 | **after** | Preposition | Pink | Diagrammatic | CDI; ARASAAC | Arrow pointing forward on horizontal axis |
| 567 | **again** | Adverb | Pink | Diagrammatic | CDI; ARASAAC | Circular rewind / repeat looping arrow |
| 568 | **always** | Adverb | Pink | Diagrammatic | CDI; ARASAAC | Unbroken continuous infinity loop symbol |
| 569 | **never** | Adverb | Red | Diagrammatic | CDI; ARASAAC | Infinity loop slashed by prohibition line |
| 570 | **sometimes** | Adverb | Pink | Diagrammatic | CDI; ARASAAC | Alternating dotted switch track line |
| 571 | **first** | Adverb | Pink | Diagrammatic | CDI; ARASAAC | Gold medal badge stamped with numeral '1' |
| 572 | **next** | Adverb | Pink | Diagrammatic | CDI; ARASAAC | Rightward sequential step indicator arrow |
| 573 | **then** | Adverb | Pink | Diagrammatic | CDI; ARASAAC | Flowchart arrow bridging box A to box B |
| 574 | **last** | Adverb | Pink | Diagrammatic | CDI; ARASAAC | Tail end marker concluding a lineup queue |
| 575 | **minute** | Noun | None | Diagrammatic | CDI; ARASAAC | Small timer wedge sweeping sixty seconds |
| 576 | **hour** | Noun | None | Diagrammatic | CDI; ARASAAC | Full hour revolution highlighted on clock |

### 3.14 Social Etiquette, Pragmatic Interjections & Urgent/Safety (31 words)
*Seeded from MacArthur-Bates CDI & Light (1988, 1989) Pragmatic Functions. Art archetype: Stick Figure & Diagrammatic.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 75 | **please** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure rubbing flat hand on chest |
| 583 | **hello** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure raising friendly open palm wave |
| 584 | **hi** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure smiling with cheerful quick wave |
| 585 | **goodbye** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure walking away turning to wave farewell |
| 586 | **bye** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure waving hand in cheerful signoff |
| 587 | **thank you** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure with flat hand moving from chin forward |
| 588 | **you're welcome** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure with warm welcoming open hands |
| 589 | **sorry** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure rubbing fist circular over heart |
| 590 | **excuse me** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure politely passing between two people |
| 591 | **good morning** | Interjection | Pink | Diagrammatic | CDI; ARASAAC | Rising sun with cheerful friendly greeting burst |
| 592 | **good night** | Interjection | Pink | Diagrammatic | CDI; ARASAAC | Sleeping crescent moon with twilight stars |
| 593 | **okay** | Interjection | Pink | Diagrammatic | CDI; ARASAAC | Hand forming crisp universally recognized OK sign |
| 594 | **ready to go** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure standing at door with shoes on |
| 595 | **wow** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure with wide awe-filled eyes and smile |
| 596 | **really** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure tilting head with curious eyebrow raise |
| 597 | **maybe** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure shrugging shoulders palms upturned |
| 598 | **I don't know** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure shrugging with question marks overhead |
| 599 | **look at this** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure pointing enthusiastically downward |
| 600 | **my turn** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure placing hand firmly on gaming piece |
| 601 | **your turn** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure gesturing game piece forward to peer |
| 602 | **careful** | Interjection | Red | Diagrammatic | CDI; ARASAAC | Yellow shield warning of caution obstacle |
| 603 | **emergency** | Interjection | Red | Diagrammatic | CDI; ARASAAC | Red flashing beacon emergency light |
| 604 | **no way** | Interjection | Red | Stick Figure | CDI; ARASAAC | Stick figure shaking head vigorously arms crossed |
| 605 | **don't** | Verb | Red | Diagrammatic | CDI; ARASAAC | Raised open hand forbidding forward approach |
| 606 | **bathroom** | Interjection | Red | Diagrammatic | CDI; ARASAAC | Urgent flashing restroom accessibility symbol |
| 676 | **love** | Verb | Green | Stick Figure | CDI; ARASAAC | Two stick figures embracing with heart floating between |
| 677 | **together** | Adverb | Blue | Stick Figure | CDI; ARASAAC | Two stick figures standing side by side hands joined |
| 678 | **ow** | Interjection | Red | Stick Figure | CDI; ARASAAC | Stick figure wincing and clutching stubbed toe |
| 685 | **wait, I'm spelling** | Interjection | Pink | Stick Figure | Light (1989) Pragmatic Functions | Stick figure holding up palm while tapping letter keys |
| 686 | **guess my word** | Interjection | Pink | Stick Figure | Light (1989) Pragmatic Functions | Stick figure tapping chin with a playful question-mark bubble |
| 687 | **oops** | Interjection | Pink | Stick Figure | CDI; ARASAAC | Stick figure with hand over mouth and wide surprised eyes |

### 3.15 Function Words & Grammar (46 words)
*Added 2026-09-22 amendment — AoA/Fry gap fill. The closed-class words that turn word strings into sentences: auxiliaries, determiners, conjunctions, object & possessive pronouns, indefinite pronouns, and degree adverbs. Art archetype: Diagrammatic.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 81 | **at** | Preposition | Pink | Diagrammatic | AoA 4.04; Fry top-50 | Glyph (hand-drawn): Pink dot inside camera-focus corners: right at this spot. |
| 608 | **are** | Verb | Green | Diagrammatic | AoA 5.53; Fry top-50 | Glyph (hand-drawn): Three grey balls, then a green equals sign: many things are. |
| 609 | **am** | Verb | Green | Diagrammatic | AoA 5.53; Fry top-100 | Glyph (hand-drawn): A small yellow person (me), then a green equals sign: I am. |
| 610 | **was** | Verb | Green | Diagrammatic | AoA 5.53; Fry top-50 | Glyph (hand-drawn): The 'is' glyph with the past badge (rewind ◀◀) above. |
| 611 | **were** | Verb | Green | Diagrammatic | AoA 5.53; Fry top-100 | Glyph (hand-drawn): The 'are' glyph with the past badge (rewind ◀◀) above. |
| 612 | **has** | Verb | Green | Stick Figure | AoA 4.83; Fry top-50 | Stick figure holding single object close |
| 613 | **had** | Verb | Green | Stick Figure | AoA 4.83; Fry top-100 | Stick figure looking back at held object |
| 614 | **will** | Verb | Green | Diagrammatic | AoA 7.53; Fry top-50 | Glyph (hand-drawn): Green fast-forward (▶▶): it is going to happen. |
| 615 | **would** | Verb | Green | Diagrammatic | AoA 5.28; Fry top-50 | Glyph (hand-drawn): The 'will' fast-forward, pale fill and dashed outline: maybe it will. |
| 616 | **can't** | Verb | Red | Diagrammatic | Negation family (don't); Fry top-100 | Glyph family: red slashed circle over the 'can' glyph |
| 617 | **won't** | Verb | Red | Diagrammatic | Negation family (don't); Fry top-200 | Glyph family: red slashed circle over the 'will' glyph |
| 618 | **didn't** | Verb | Red | Diagrammatic | Negation family (don't); Fry top-200 | Slashed circle over a past-time bubble |
| 619 | **a** | Determiner | Pink | Diagrammatic | AoA 2.89; Fry top-10 | Glyph (hand-drawn): Row of three blocks, one pink: any one of them. |
| 620 | **an** | Determiner | Pink | Diagrammatic | AoA 4.0; Fry top-200 | Glyph (hand-drawn): Same glyph as 'a' (same word, different spelling). |
| 621 | **the** | Determiner | Pink | Diagrammatic | Fry rank 1; AoA 3.29 | Glyph (hand-drawn): The 'a' row with a spotlight on the pink block: that specific one. |
| 622 | **of** | Preposition | Pink | Diagrammatic | AoA 4.55; Fry top-10 | Glyph (hand-drawn): Grey pie with one pink slice pulled out: a piece of the whole. |
| 623 | **every** | Determiner | Pink | Diagrammatic | AoA 4.2; Fry top-200 | Row of identical fully-checked blocks |
| 624 | **each** | Determiner | Pink | Diagrammatic | AoA 4.95; Fry top-300 | Arrow visiting each block in a row |
| 625 | **another** | Determiner | Pink | Diagrammatic | AoA 5.05; Fry top-300 | Arrow jumping to a second identical block |
| 626 | **other** | Determiner | Pink | Diagrammatic | AoA 5.33; Fry top-100 | Arrow pointing to the unlike block in a pair |
| 627 | **so** | Conjunction | Pink | Diagrammatic | AoA 5.15; Fry top-100 | Glyph (hand-drawn): Three falling dominoes; the last (the result) is pink. |
| 628 | **if** | Conjunction | Pink | Diagrammatic | AoA 5.36; Fry top-100 | Glyph (hand-drawn): Pink decision diamond with a path in and two paths out. |
| 629 | **him** | Pronoun | Yellow | Stick Figure | AoA 3.43; Fry top-100 | Stick figure receiving an object |
| 630 | **her** | Pronoun | Yellow | Stick Figure | AoA 5.09; Fry top-100 | Stick figure receiving an object |
| 631 | **us** | Pronoun | Yellow | Stick Figure | AoA 4.19; Fry top-200 | Two stick figures receiving an object together |
| 632 | **them** | Pronoun | Yellow | Stick Figure | AoA 4.9; Fry top-100 | Group of figures receiving an object |
| 633 | **his** | Pronoun | Yellow | Diagrammatic | AoA 3.69; Fry top-100 | Stick figure with possession line to object |
| 634 | **your** | Pronoun | Yellow | Diagrammatic | AoA 4.1; Fry top-100 | Pointing hand with possession line to object |
| 635 | **our** | Pronoun | Yellow | Diagrammatic | AoA 4.35; Fry top-200 | Two figures sharing a possession circle |
| 636 | **their** | Pronoun | Yellow | Diagrammatic | AoA 5.26; Fry top-100 | Group sharing a possession circle |
| 637 | **something** | Pronoun | Yellow | Diagrammatic | AoA 5.05; Fry top-100 | Vague mystery blob with question mark |
| 638 | **someone** | Pronoun | Yellow | Stick Figure | AoA 4.92; Fry top-200 | Vague figure silhouette with question mark |
| 639 | **everyone** | Pronoun | Yellow | Stick Figure | AoA 4.83; Fry top-300 | Crowd of figures with all-inclusive circle |
| 640 | **thing** | Noun | Yellow | Diagrammatic | AoA 4.58; Fry top-100 | Generic labeled block standing for any object |
| 641 | **very** | Adverb | Blue | Diagrammatic | AoA 4.9; Fry top-100 | Intensity dial turned to maximum |
| 642 | **too** | Adverb | Blue | Diagrammatic | AoA 5.1; Fry top-100 | Cup overflowing past its rim |
| 643 | **just** | Adverb | Blue | Diagrammatic | AoA 7.01; Fry top-100 | Exactly-one highlighted dot |
| 644 | **also** | Adverb | Blue | Diagrammatic | AoA 6.64; Fry top-300 | Plus sign adding a matching block |
| 645 | **only** | Adverb | Blue | Diagrammatic | AoA 4.95; Fry top-200 | Single lit block among dimmed blocks |
| 646 | **still** | Adverb | Blue | Diagrammatic | AoA 5.26; Fry top-200 | Motionless figure amid motion lines |
| 679 | **yours** | Pronoun | Yellow | Stick Figure | CDI; Fry top-300 | Stick figure offering object toward the viewer |
| 680 | **these** | Determiner | Pink | Diagrammatic | CDI; Fry top-200 | Two nearby objects circled together |
| 681 | **those** | Determiner | Pink | Diagrammatic | CDI; Fry top-100 | Two distant objects indicated by long arrow |
| 682 | **nothing** | Pronoun | Yellow | Diagrammatic | CDI; Fry top-100 | Empty dashed circle showing absence |
| 683 | **behind** | Preposition | Pink | Diagrammatic | CDI; ARASAAC | Ball hidden behind solid box |
| 684 | **did** | Verb | Green | Diagrammatic | Fry top-100 | Bold checkmark inside completed box |

### 3.16 Numbers & Counting (10 words)
*Added 2026-09-22 amendment — quantifier gap fill. Cardinal numerals one through ten; "first" already lives in Time & Sequencing. Art archetype: Diagrammatic.*

| # | Word | Part of Speech | Fitzgerald Color | Visual Style | Clinical Source | Visual Prompt Description |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| 647 | **one** | Number | Blue | Diagrammatic | AoA 3.23; Fry top-100 | Single bold counting block with numeral 1 |
| 648 | **two** | Number | Blue | Diagrammatic | AoA 4.24; Fry top-200 | Pair of counting blocks with numeral 2 |
| 649 | **three** | Number | Blue | Diagrammatic | AoA 4.06; Fry top-300 | Three counting blocks with numeral 3 |
| 650 | **four** | Number | Blue | Diagrammatic | AoA 4.0; Fry top-300 | Four counting blocks with numeral 4 |
| 651 | **five** | Number | Blue | Diagrammatic | AoA 4.18; Fry top-300 | Five counting blocks with numeral 5 |
| 652 | **six** | Number | Blue | Diagrammatic | AoA 4.65; Fry top-400 | Six counting blocks with numeral 6 |
| 653 | **seven** | Number | Blue | Diagrammatic | AoA 4.65; Fry top-400 | Seven counting blocks with numeral 7 |
| 654 | **eight** | Number | Blue | Diagrammatic | AoA 4.94; Fry top-500 | Eight counting blocks with numeral 8 |
| 655 | **nine** | Number | Blue | Diagrammatic | AoA 5.09; Fry top-500 | Nine counting blocks with numeral 9 |
| 656 | **ten** | Number | Blue | Diagrammatic | AoA 4.59; Fry top-500 | Ten counting blocks with numeral 10 |

---

## 4. Visual Prompt Generation (WorkbookBench Standard)

Following the proven clipart generation standard from WorkbookBench (`promptStyle.mjs` and `gen.mjs` in WorkbookBench), prompt generation eliminates paragraph-long attribute lists in favor of 3 reference images and a tight 3-line prompt:

```text
We are trying to teach a child the concept of: {word}.
Draw it in exactly the same style as the reference images: pure white background, bold black outline, flat solid colour, no shading.
Do not include any text in the image.
{sceneHint}
```

- **Reference Images**: Exactly 3 frozen reference images in `assets/style-refs/` carry the hand, line weight, and character style.
- **The Frame**: The 5 load-bearing words (`pure white background, bold black outline, flat solid colour, no shading`) anchor the canvas.
- **Scene Hint**: When an abstract word requires metaphor disambiguation (e.g. *make*, *know*, *in*), a single 5-to-10 word `sceneHint` is appended (e.g. `hands putting blocks together`). Pure nouns use no `sceneHint`.
- **Torso Fill**: For stick figure characters, a one-line color hint specifies the Fitzgerald key (e.g. `The stick figure's torso is solid green.`).
- **Re-Roll Lever**: Variance between seeds is larger than any prompt tweak. Re-roll is the quality lever, not prompt bloat.
