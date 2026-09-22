# Core grid membership — the final `grid60`

**DECIDED 2026-09-22 — final grid ruling.** The founder delegated the final
call ("give us the final grid") after v1, an external review draft, and a v2
proposal (`5c4f4de`). This file records the ruling.

This file owns **how a word earns a `grid60` cell**: the rule (§2), the
master list (§3), the evidence (§4), and the named waivers (§6).
`docs/product/Core_Coordinate_Map.md` stays the truth owner for slot indexes
and carries the same table; the catalog build parses it from there.

---

## 1. Who the board is for

Start from the user, not from word lists. A nonspeaking child or adult, one
finger, often motor-impaired, looking at the home board. No adult has
navigated to the right page. The home board is **what this person can say
when nobody set anything up**. Everything else waits for the predictive strip
or a zone.

So the question for every cell is: *what must this person be able to say in
one or two taps, with no navigation, all day long?* Ranked by what goes wrong
if they can't:

| Function | If it is missing | Cells |
| --- | --- | --- |
| Report that something is wrong | Pain and distress go unreported; behavior becomes the message | `hurt` · `sad` · `help` · `stop` · `no` |
| Refuse and protest | The only refusal left is physical | `no` · `not` · `stop` · `all done` |
| Request | Adults guess at wants | `want` · `more` · `need` · `get` · `give` · `open` · `help` |
| Direct attention and comment | The user can only ask, never share | `look` · `that` · `this` · `like` · `good` · `bad` · `big` · `little` |
| Ask | The user can't start a topic | `what` · `where` · `who` |
| Social control | Conversation is always adult-led | `yes` · `please` · `my`·`turn` · `you` |
| Talk about people | Only "I" exists | `I` · `you` · `me` · `my` · `he` · `she` |

Evidence corpora (research lists and age-of-acquisition data) then decide
*which* words cover each function. They do not decide what the functions are.

A framing note so future reviews argue about the right thing:
left-to-right sentence building is real but *secondary*. Emerging
communicators produce mostly one- to three-tap utterances. What the sectors
actually buy is **category coherence for visual search** (a verb is always in
the middle band) plus **frequency zoning** (earlier words sit higher).

## 2. The selection rule

**DECIDED 2026-09-22.** Every membership change runs these checks in order. A
word that fails a check and stays on the board, or passes and stays off,
needs a named waiver in §6.

0. **Self-report first.** The board must let a user say that something is
   wrong without navigating: pain (`hurt`), distress (`sad`), `stop`, `help`,
   `no`. These are cells in every layout. Rule 0 outranks rule 1 because
   Universal Core was designed for classroom literacy instruction. It has no
   pain or emotion word. A board that can't say "hurt" from the home screen
   fails at the most important thing a user needs to say.
1. **Universal Core 36.** Every Project Core Universal Core word is a
   `grid60` cell unless waived by name in §6. The set (UNC CLDS / Erickson,
   Geist, Hatch & Quick): all, can, different, do, finished, get, go, good,
   he, help, here, I, in, it, like, look, make, more, not, on, open, put,
   same, she, some, stop, that, turn, up, want, what, when, where, who, why,
   you. Our `all done` cell is the `finished` sense.
2. **Age-of-acquisition, then Fry.** Remaining seats fill by AoA
   (`data/reference/aoa.csv`, lower = earlier). Fry rank band breaks ties
   and is the floor check (`data/reference/fry-rank-1000.txt`, accurate to
   within ten; see its header).
3. **Functional coverage.** Every function in §1 keeps at least one
   dedicated cell. When two candidates cover one function, keep the earlier
   or more generative one. A function covered by nothing beats a redundant
   second covering.
4. **Paired opposites share a row** inside a sector (in/out, on/off, up/down,
   here/there, this/that, big/little, good/bad, happy/sad, all/some,
   yes/no by adjacency).

Standing layout laws (`docs/product/Motor_Grid_And_Art.md` §1) still apply:
fixed slot indexes within a named layout; sector membership preserved across
densities.

## 3. The master list — final `grid60`

**DECIDED 2026-09-22.** Slot index is row-major and 0-based. The same rows
live in `Core_Coordinate_Map.md` §3, which the catalog build parses.

| Row | Cols 1–2 Starters | Cols 3–5 Actions | Cols 6–7 Spatial | Cols 8–9 Descriptors | Col 10 Regulators |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | I · you | want · like · go | in · out | more · all done | yes |
| 2 | me · my | need · look · come | on · off | not · and | no |
| 3 | he · she | get · make · do | up · down | big · little | stop |
| 4 | this · that | put · take · give | here · there | good · bad | help |
| 5 | it · who | open · turn · play | to · for | happy · sad | hurt |
| 6 | what · where | eat · drink · can | with · at | all · some | please |

How the layout reads:

- **Regulator column (col 10)** is the "listen to me now" column: yes, no,
  stop, help, hurt, please. It sits on the outside edge, the easiest place
  to find with a flailing or scanning hand. It holds no questions and no
  grammar.
- **Questions** cluster in the bottom-left of the starter columns
  (`who` · `what` · `where`), where a question starts an utterance.
- **Feelings** pair on one row (`happy` · `sad`) next to `hurt` in the
  regulator column, so the emotion-and-pain words form one visual patch.
- **Quantity** pairs (`all` · `some`) sit under `more` in the same sector.

Coverage: **32 of 36 Universal Core** words are cells (waived: `same`,
`different`, `when`, `why` — §6). **19 of 23 Banajee toddler words**
(Banajee, DiCarlo & Stricklin 2003; waived: `the`, `a`, `is`, `mine`).
All five rule-0 words are cells.

Utterances that must stay at or under three taps, with no navigation:
`I·want·more`, `I·need·help`, `it·hurt`, `I·sad`, `not·like·it`,
`all done`, `my·turn`, `help·me`, `look·at·that`, `go·out`, `put·in·here`,
`what·that`, `where·go`, `who·that`, `you·do·it`, `open·it`, `more·please`,
`I·like·that`, `give·me`, `stop·that`.

## 4. Evidence

**BUILT** — measured from `data/reference/aoa.csv` and
`data/reference/fry-rank-1000.txt` on 2026-09-22. AoA in years (Kuperman et
al. 2012). Fry is the rank band (`≤N`); `–` = not in the Fry 1000.
`all done` uses the AoA of `finished`.

**Correction.** The v2 proposal's Fry column counted file lines, including
the 14-line header, and claimed single-rank precision the source does not
have. The bands below replace it. No v2 argument flips: `who` (≤90) still
beats `why` (≤170), and `some` (≤70) still beats `same` (≤140).

On the board — the sixty:

| Word | AoA | Fry | UC36 | Word | AoA | Fry | UC36 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I | 2.79 | ≤20 | ✓ | in | 3.69 | ≤10 | ✓ |
| you | 4.35 | ≤10 | ✓ | out | 3.28 | ≤60 | – |
| me | 3.28 | ≤120 | – | on | 4.01 | ≤20 | ✓ |
| my | 2.72 | ≤90 | – | off | 3.83 | ≤190 | – |
| he | 3.81 | ≤20 | ✓ | up | 2.92 | ≤60 | ✓ |
| she | 3.57 | ≤50 | ✓ | down | 4.93 | ≤100 | – |
| this | 4.93 | ≤30 | – | here | 3.74 | ≤170 | ✓ |
| that | 5.53 | ≤10 | ✓ | there | 5.25 | ≤50 | – |
| it | 4.40 | ≤10 | ✓ | to | 3.95 | ≤10 | – |
| who | 3.81 | ≤90 | ✓ | for | 4.39 | ≤20 | – |
| what | 3.86 | ≤40 | ✓ | with | 4.44 | ≤20 | – |
| where | 4.09 | ≤130 | ✓ | at | 4.04 | ≤30 | – |
| want | 4.16 | ≤150 | ✓ | more | 3.78 | ≤80 | ✓ |
| like | 3.69 | ≤70 | ✓ | all done | 6.09 | – | ✓ |
| go | 3.37 | ≤80 | ✓ | not | 3.89 | ≤40 | ✓ |
| need | 3.56 | ≤170 | – | and | 4.57 | ≤10 | – |
| look | 4.05 | ≤70 | ✓ | big | 2.89 | ≤160 | – |
| come | 3.32 | ≤100 | – | little | 3.95 | ≤110 | – |
| get | 3.17 | ≤100 | ✓ | good | 3.55 | ≤130 | ✓ |
| make | 4.68 | ≤70 | ✓ | bad | 2.79 | ≤730 | – |
| do | 3.60 | ≤50 | ✓ | happy | 2.72 | ≤580 | – |
| put | 3.72 | ≤160 | ✓ | sad | 3.24 | – | – |
| take | 4.37 | ≤110 | – | all | 4.24 | ≤40 | ✓ |
| give | 4.28 | ≤120 | – | some | 4.85 | ≤70 | ✓ |
| open | 5.00 | ≤240 | ✓ | yes | 2.31 | ≤480 | – |
| turn | 4.11 | ≤170 | ✓ | no | 2.72 | ≤80 | – |
| play | 4.10 | ≤190 | – | stop | 2.89 | ≤280 | ✓ |
| eat | 2.78 | ≤280 | – | help | 3.65 | ≤130 | ✓ |
| drink | 3.47 | – | – | hurt | 4.00 | – | – |
| can | 4.32 | ≤40 | ✓ | please | 3.48 | ≤780 | – |

Off the board — the contested 23:

| Word | AoA | Fry | UC36 | Why it is off (§6) |
| --- | --- | --- | --- | --- |
| same | 5.62 | ≤140 | ✓ | Latest-acquired UC36 word; comparison, not expression |
| different | 5.50 | ≤180 | ✓ | Same reason; lost its seat to `sad` under rule 0 |
| why | 3.97 | ≤170 | ✓ | `who` is earlier and more frequent; one-word "why?" protest is covered by `no`/`stop` |
| when | 4.24 | ≤40 | ✓ | Time questions develop late; no concrete answer on a board |
| how | 5.36 | ≤50 | – | Latest-developing question |
| we | 5.04 | ≤40 | – | Latest-acquired pronoun on the list; `you`+`me` carry joint action |
| they | 4.88 | ≤20 | – | Plural third person; strip covers |
| mine | 4.24 | ≤810 | – | `my` covers possession |
| see | 3.06 | ≤80 | – | `look` covers visual attention and is UC36 |
| have | 3.72 | ≤30 | – | Grammar glue; strip covers |
| wait | 4.30 | ≤410 | – | Adult-directed word; `stop` covers user protest of an action |
| feel | 5.11 | ≤430 | – | `happy`/`sad`/`hurt` say the feeling directly |
| read, tell, think, find, work | 4.11–5.86 | ≤100–≤170 | – | Later or narrower verbs; zone and strip |
| away, under, over | 5.07–5.89 | ≤110–≤230 | – | `in`/`out`/`on`/`off`/`up`/`down` carry the spatial load |
| but, or, because | 4.60 / 4.14 / 4.44 | ≤40 / ≤30 / ≤170 | – | Literate-adult grammar; `and` stays |

## 5. How we got here

| Version | What it got wrong |
| --- | --- |
| v1 (`77dff88`) | Built for literate sentence grammar: `they`, `have`, `wait`, `but`, `or`, `because` on the board; UC36 words `look`, `make`, `open`, `turn`, `not`, `where`, `some`, `different` off. `not` missing is fatal for refusal. |
| Review draft | Fixed UC36 coverage but kept `see` (redundant with `look`), `same` (latest-acquired), `why` over `who`; dropped `need`. |
| v2 proposal (`5c4f4de`) | Right rule, one blind spot: every seat was judged against research lists, and none of them measures a person's need to say *it hurts*. `happy` had no opposite; `who` sat in the regulator column only because a slot was free. |
| **Final (this file)** | Adds rule 0 and applies it: `hurt` and `sad` in; `we` and `different` out; `who` joins the other questions in the starter columns, so the regulator column is pure. |

Final vs v2, cell by cell:

| Change | Why |
| --- | --- |
| `different` → `sad` | Rule 0 over rule 1. `sad` is acquired at 3.24, over two years before `different` (5.50). It gives `happy` its opposite (rule 4). A child who can say "happy" but not "sad" can only report good news. |
| `we` → `hurt` | Rule 0. `we` is UC36-free and the latest-acquired pronoun (5.04). `hurt` is how a user reports pain, the report caregivers most need and most often miss. |
| `who` col 10 → col 2 | Questions belong where utterances start. Column 10 becomes only regulators. |
| `help` stays col 10 | A call for help is a regulator before it is a verb; it keeps green (Fitzgerald = word role). |
| `please` → row 6 | Least urgent regulator sits lowest. Urgent words (`stop`, `help`, `hurt`) sit in the middle band. |
| Starter rows reorder | `me`·`my` (earliest-acquired pronouns) up to row 2; `he`·`she` paired on one row; `this`·`that` paired. |

`please` vs `why` for the last regulator seat was the closest call. `please`
wins: it is acquired half a year earlier (3.48 vs 3.97), and in the real
world it is often what gets a nonspeaking person's request honored. `why`
stays one tap away in the strip.

## 6. Named waivers and deliberate off-boards

**DECIDED 2026-09-22.**

UC36 waivers (rule 1 exceptions): `same`, `different` (academic comparison;
the latest-acquired UC36 words), `when`, `why` (§4 reasons).

Banajee waivers: `the`, `a` (articles are not core cells; no core list
includes them), `is` (copula; telegraphic output is the design), `mine`
(`my` covers possession).

Deliberately off `grid60` — every one stays root core, a `grid90` cell, and
strip-eligible:

- **Pronouns**: `we`, `they`, `mine`.
- **Verbs**: `see`, `have`, `wait`, `feel`, `read`, `tell`, `think`,
  `find`, `work`.
- **Spatial**: `away`, `under`, `over`.
- **Descriptors**: `same`, `different`.
- **Connectors**: `but`, `or`, `because`.
- **Questions**: `why`, `how`, `when`.
- **Greetings and manners**: `hi`, `bye`, `sorry`, `thank you` live in
  fringe (`Initial_Vocabulary_600.md` §3.14). The strip's idle state owns
  conversational starters (`Motor_Grid_And_Art.md` §2).
- **Other feelings** (`mad`, `scared`, `tired`): Feelings zone and strip.
  Two feelings plus `hurt` is the ceiling for the default board. More would
  take seats from request and refusal.

## 7. Enforcement

**BUILT** (`src/board/core_map.test.mjs`) — the membership gate:

- `OFF_GRID60` lists the 23 off-board senses; each must be absent from
  `grid60` and present in `grid90`.
- `SECTORS` pins each column band to its word set.
- **UC36 gate**: every Universal Core word is a `grid60` cell unless it is in
  the named-waiver list. **Rule-0 gate**: `hurt`, `sad`, `help`, `stop`, `no`
  are `grid60` cells.

A future membership change edits this file's §3/§6, then the coordinate map,
then the test. It must beat §2 to land. Opinion alone does not move a seat.

**Freeze.** Slot immutability is a post-launch law, there so a child's motor
memory is never betrayed. With zero users the churn above cost nothing. From
this ruling on, `grid60` is frozen for launch.

## 8. Still open (not part of this ruling)

These items came from the v2 review. They amend `Initial_Vocabulary_600.md`,
not the grid. **PROPOSED.** They are confirmed against `data/launch_lexicon.json`:

1. **Spoken-text junk.** Disambiguation suffixes leak into speech: `wipe
   action`, `orange color`, `pink color`, `light weight`, `clean item`,
   `dark color`, `light color`, `bathroom urgent`. `spokenText` should be the
   clean word; disambiguation belongs in category and part-of-speech fields.
2. **Number split.** Digits `1,2,3,4,5,10` in Time duplicate words
   `one`–`ten` in Numbers. Merge them into a single 1–10 set in Numbers &
   Counting.
3. **Fringe gaps.** Add `hit`, `bite`, `break`, `scratch`, `poop`, `pee`,
   `close`, `shut`, `boy`, `girl`, `man`, `woman`, `breakfast`, `lunch`,
   `dinner`, `food`, `ketchup`, `fries`, `love`, `tickle`, `together`,
   `yours`, `these`, `those`, `nothing`, `behind`, `did`, `ow`.
4. **Zones hide promoted core words.** Root-core senses carry no category
   (`src/board/schema.sql` CHECK), so the Feelings zone shows neither `happy`
   nor `sad`, and the Body zone loses `hurt`. The fix is a zone
   cross-listing of core senses, not demotion. Found while applying this
   ruling.
