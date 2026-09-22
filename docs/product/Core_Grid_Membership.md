# Core grid membership rule

**PROPOSED 2026-09-22** — pending founder + reviewer ratification.

This file owns *how a word earns a `grid60` cell* — the rule, the evidence, and
the pending v2 map. **It changes nothing yet.** `Core_Coordinate_Map.md` remains
the truth owner for slot assignments until it is amended with a new DECIDED tag.

On ratification:

- §2 (rule) and §6 (named waivers) become **DECIDED** here.
- §4's table is copied into `Core_Coordinate_Map.md` §3 as `grid60` v2 with a
  new DECIDED date, citing this file.
- §7's vocabulary fixes land in `Initial_Vocabulary_600.md`; the lexicon and
  catalog regenerate from source.

Origin: external design review of `grid60` v1 (2026-09-22) plus a data pass
against `data/reference/` (`aoa.csv` — Kuperman et al. 2012 age-of-acquisition;
`fry-rank-1000.txt` — instant-word rank; both explained in
`data/reference/aoa-README.md`).

---

## 1. What is actually in dispute

The **structure** is settled and the review did not challenge it: vertical
syntactic sectors — columns 1–2 starters, 3–5 verbs, 6–7 spatial, 8–9
modifiers, 10 edge/regulators (`Core_Coordinate_Map.md` §2). Ten columns keeps
tiles ≥ ~100 pt on an 11-inch iPad.

The dispute is **membership**: which 60 of the 81 root-core senses get cells.

One honest framing note, so future reviews argue about the right thing:
"left-to-right sentence building" is real but *secondary*. Emerging
communicators produce mostly 1–3-tap utterances; nobody sweeps a row. What the
sectors actually buy is **category coherence for visual search** (a verb is
always in the middle band) plus **frequency zoning** (high-value words in
high-attention rows). Membership calls should be made on evidence, not on
preserving a literal reading sweep.

## 2. The selection rule

Every future membership change runs these checks, in order. A word that fails
and stays on the board needs a named waiver in §6. **PROPOSED.**

1. **Universal Core 36 first.** Every Project Core Universal Core word is a
   `grid60` cell unless waived by name in §6. The set (UNC CLDS / Erickson,
   Geist, Hatch & Quick): all, can, different, do, finished, get, go, good, he,
   help, here, I, in, it, like, look, make, more, not, on, open, put, same,
   she, some, stop, that, turn, up, want, what, when, where, who, why, you.
   Our `all done` cell is the `finished` sense.
2. **AoA, then Fry.** Remaining slots fill by age-of-acquisition
   (`data/reference/aoa.csv`, lower = earlier); Fry rank breaks ties and is
   the floor check. AoA filters candidates; function places them
   (`data/reference/aoa-README.md`).
3. **Functional coverage.** Every communicative function — request,
   refuse/negate, direct attention, ask, regulate (yes/no/stop/help), social —
   keeps ≥ 1 dedicated cell. Two candidates covering one function: keep the
   earlier or more generative one. A function covered by nothing beats a
   redundant second covering.
4. **Paired opposites share a row** inside a sector (in/out, on/off, up/down,
   here/there, big/little, good/bad, yes/no).

Standing laws still apply (`Motor_Grid_And_Art.md` §1): fixed slot indices
within a named layout; sector membership preserved across densities.

## 3. Evidence on the contested seats

**BUILT** — measured from `data/reference/aoa.csv` and
`data/reference/fry-rank-1000.txt` on 2026-09-22.

| Word | AoA (yrs) | Fry rank | UC36 | v1 map | Review draft | This proposal |
| --- | --- | --- | --- | --- | --- | --- |
| not | 3.89 | 53 | ✓ | off | **on** | **on** |
| look | 4.05 | 85 | ✓ | off | **on** | **on** |
| make | 4.68 | 86 | ✓ | off | **on** | **on** |
| open | 5.00 | 257 | ✓ | off | **on** | **on** |
| turn | 4.11 | 187 | ✓ | off | **on** | **on** |
| where | 4.09 | 149 | ✓ | off | **on** | **on** |
| different | 5.50 | 191 | ✓ | off | **on** | **on** |
| need | 3.56 | 184 | – | on | off | **on** — see §5 |
| who | 3.81 | 109 | ✓ | on | off | **on** — see §5 |
| some | 4.85 | 87 | ✓ | off | off | **on** — see §5 |
| see | 3.06 | 96 | – | on | on | **off** — `look` covers the function |
| same | 5.62 | 157 | ✓ | off | on | **off** — latest word on the draft board |
| why | 3.97 | 189 | ✓ | on | on | **off** — `who` outranks it on both axes |
| they | 4.88 | 37 | – | on | off | off |
| have | 3.72 | 45 | – | on | off | off — grammatical glue; strip covers |
| wait | 4.30 | 427 | – | on | off | off |
| but / or / because | 4.60 / 4.14 / 4.44 | 51 / 47 / 181 | – | on | off | off — literate-adult grammar; `and` stays |
| when / how | 4.24 / 5.36 | 58 / 63 | ✓ / – | off | off | off — latest-developing questions |
| mine | 4.24 | 829 | – | off | off | off — `my` covers possession |

## 4. Proposed `grid60` v2

**PROPOSED.** Slot index row-major, 0-based. Bold = differs from the review
draft.

| Row | Cols 1–2 Starters | Cols 3–5 Actions | Cols 6–7 Spatial | Cols 8–9 Modifiers | Col 10 Edge |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | I · you | want · like · go | in · out | more · all done | yes |
| 2 | it · me | **need** · look · come | on · off | not · and | no |
| 3 | my · he | get · make · do | up · down | big · little | stop |
| 4 | this · that | put · take · give | here · there | good · bad | please |
| 5 | she · we | open · turn · play | to · for | happy · all | help |
| 6 | what · where | eat · drink · can | with · at | **some** · different | **who** |

Coverage: **33 of 36 Universal Core** words are cells (`same`, `when`, `why`
waived — §6). **19 of 23 Banajee toddler words** (Banajee, DiCarlo &
Stricklin 2003 — the study already in the vision bibliography); waived:
`the`, `a`, `is`, `mine` — §6.

Sentence paths that must stay cheap: `I·want·more`, `I·need·help`,
`you·look·at·that`, `not·like·it`, `go·out`, `put·in·here`, `what·that`,
`where·go`, `who·that`.

## 5. What changed

**vs `grid60` v1** (`Core_Coordinate_Map.md:76-81`): in — look, make, open,
turn, not, where, some, different, need*(stays)*, who*(stays)*; out — they,
have, wait, see, but, or, because, why, same*(stays off)*. Reorders: `help`
moves verb-sector → edge column; `this`/`that` move up to row 4; `yes`/`no`
flip to positive-first (matches in/out, on/off, more/all done); wh-questions
move from the edge into the starter columns where questions begin.

**vs the review draft** — three swaps, each forced by §2:

| Swap | Why |
| --- | --- |
| `see` → `need` | Functional coverage (rule 3): `look` already covers visual attention; nothing else covers "I need ___" — assistance, toileting, self-advocacy. `need` is also earlier on AoA than `make`, `open`, `can`, `take`, `give`, `play`. |
| `same` → `some` | Rule 1 + 2: `some` is UC36, earlier (4.85 vs 5.62) and more frequent (87 vs 157). "want some" is a requesting utterance; `same` is academic comparing, and `different` alone carries the comparison function. `all`/`some` becomes the quantity pair. |
| `why` → `who` | Rule 2: `who` is earlier (3.81 vs 3.97) and more frequent (109 vs 189). Person-questions are the most socially central ask; protest — the main use of a one-word "why?" — is already covered by `no`/`stop`. `why` stays tier-1, strip-eligible. |

## 6. Named waivers and deliberate off-boards

UC36 waivers (rule 1 exceptions): `same`, `when`, `why` — rationale in §5/§3.

Banajee waivers: `the`, `a` (articles are not core cells — no core list
includes them), `is` (copula; telegraphic output is the design), `mine`
(`my` covers possession).

Deliberately off `grid60` (all remain tier-1, `grid90` cells, strip-eligible):

- **Grammar glue**: `have`, `but`, `or`, `because` — needed for literate
  output, not for a beginning communicator's board.
- **Late AoA / redundant verbs**: `see` (≈`look`), `feel`, `tell`, `think`,
  `find`, `work`, `read`, `wait` (`stop` covers the protest-of-action use).
- **Spatial**: `away`, `under`, `over` — `here`/`there` and `in`/`out`/`on`/
  `off`/`up`/`down` carry the spatial load.
- **Pronouns**: `they` (AoA 4.88 — latest pronoun; `we` covers plural
  subjects), `mine`.
- **Questions**: `when`, `how`, `why`.
- **Greetings/manners**: `hi`, `bye`, `sorry`, `thank you` already live in
  fringe (`Initial_Vocabulary_600.md` §3.14) and the strip's idle state owns
  conversational starters (`Motor_Grid_And_Art.md` §2). No edge-column seat
  needed.

## 7. Bundled vocabulary fixes

Same slice, different owner — these amend `Initial_Vocabulary_600.md`, not the
coordinate map. **PROPOSED.** All confirmed against the live lexicon
(`data/launch_lexicon.json`):

1. **Spoken-text junk** — sense-disambiguation suffixes leak into what the
   device says aloud: `wipe action` (:331), `orange color` (:640),
   `pink color` (:642), `light weight` (:652), `clean item` (:660),
   `dark color` (:682), `light color` (:683), `bathroom urgent` (:749).
   Fix: `spokenText` becomes the clean word; disambiguation lives in
   category/part-of-speech fields, never in what the child hears.
   Cheap now: all eight are unresolved audio misses — no clip needs redoing.
2. **Number split** — digits `1,2,3,4,5,10` in Time (:714-719) duplicate
   words `one–ten` in Numbers (:802+). Merge to a single 1–10 set in
   Numbers & Counting; digits 6–9 don't exist at all today. Label may show
   the numeral while the utterance speaks the word — label ≠ utterance is
   already legal in the schema (`Language_And_Voice_Schema.md`).
3. **Fringe gaps** — add: `hit`, `bite`, `break`, `scratch`, `poop`, `pee`,
   `close`, `shut`, `boy`, `girl`, `man`, `woman`, `breakfast`, `lunch`,
   `dinner`, `food`, `ketchup`, `fries`, `love`, `tickle`, `together`,
   `yours`, `these`, `those`, `nothing`, `behind`, `did` — plus `don't`
   (a single lexical unit for kids: "don't want" beats "not want") and `ow`
   (reflexive pain; `hurt` exists but `ow` is the protest). Suggested
   homes: behavior words → Daily Actions; `poop`/`pee` → Body/Health;
   people → People & Roles; meals/food → Food & Drink; `don't`/`yours`/
   `these`/`those`/`nothing`/`behind`/`did` → Function Words & Grammar;
   `ow`/`love`/`together` → Social & Urgent; `tickle`/`close`/`shut` →
   Daily Actions. Exact category is an implementation detail — the schema
   CHECK constraint (`src/board/schema.sql`) lists the legal names.

## 8. Ratification checklist

1. Amend `Core_Coordinate_Map.md` §3 table + off-grid-21 list + new DECIDED
   tag. `grid90` membership is unchanged (all 81 keep cells); leave its row
   order as-is.
2. Apply §7 to `Initial_Vocabulary_600.md`; regenerate
   `data/launch_lexicon.json` (`scripts/catalog/extract_launch_lexicon.mjs`);
   rebuild `data/catalog/catalog.json` (`build_catalog.mjs` — currently stale).
   Expected lexicon size ≈ 679 senses (656 − 6 digit dupes + 29 adds); the
   regenerated file sets the exact assert.
3. Update `scripts/catalog/catalog.test.mjs` — still asserts the pre-rederive
   counts (599 entries / 75 tier-1 at lines 11-19; actual is 656/81).
4. Update `src/board/core_map.test.mjs` — `OFF_GRID60` and `SECTORS`
   (lines 29-59) and the `board[59]` assertion (line 133 → `who`). **Add the
   rule-1 gate**: assert UC36 ⊆ `grid60` ∪ named waivers, so the next
   membership debate is a test run, not a thread.
5. `npm run check` green.

## 9. Why the churn is acceptable now

Slot immutability is a *post-launch* law — it exists so a child's motor memory
is never betrayed. With zero users, re-seating words costs nothing; after
ship, these swaps cost real motor memory. Spend the churn now, freeze on
ratification, and let §2's rule + the UC36 gate settle any future dispute
mechanically.
