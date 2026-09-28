# Design System — Brand, Tokens, Word Tiles

Owner of the visual contract delivered in the designer handoff of
2026-09-22 (brand board + tile system v1). Role *semantics* — which words
get which color — stay with `docs/product/Motor_Grid_And_Art.md` §3; the
hex values, tile anatomy, states, and chrome rules live here.

## Brand marks

**BUILT** (masters in `assets/brand/`, served copies in `public/brand/`).
One bird, drawn at the sizes it's used:

| File | Use |
| --- | --- |
| `pip-mark.svg` | Master mark (standing, with legs). White/light surfaces. |
| `pip-mark-seated.svg` | Legless mark. Dark backgrounds. |
| `pip-mark-32.svg`, `pip-mark-16.svg` | Small-size redraws (favicon). Never scale the master down. |
| `pip-mark-black.svg`, `pip-mark-white.svg` | One-color versions. |
| `pip-mark-ink.svg` | Line-only bird — the only mark allowed near the grid (empty sentence bar, offline, Parent Corner). |
| `icon-ios.svg` | iOS 1024 app icon (charcoal, seated bird). `icon-180.png` is the rasterized touch icon. |
| `icon-maskable-512.svg` | PWA maskable icon, bird inside the 80% safe circle (`icon-512.png` raster). |

## Group surface — launch amendment

**DECIDED 2026-09-27; BUILT 2026-09-28** (027 A3). Behavior owner:
`docs/product/Motor_Grid_And_Art.md` § Groups; painter: `public/board/groups-ui.js`
(`groups-ui.css` — reserved cells read faded-solid in Edit mode, never dashed
or droppable; a hidden door shows faded with Show/Hide).

- Groups share the home board's active cell size; sentence bar and Smart bar
  do not move. Reserved cells show the home board's top row (on by default)
  and its yes/no/stop/help frame — the same tiles as home, not group content,
  and not editable inside a group. Meal groups seed eat/drink/all done as
  ordinary words.
- Home is a corner control outside the word grid. Groups opens the index.
  Add sits beside Groups in Edit mode only. Next reserves the final grid cell
  at all times and appears only when paging, with a page count.
- Seed clusters have no outlines, handles, titles, or block-edit affordances.
  Empty space is intentional. Word identity/art is shared; placement is local.
- × says Remove from [group], with Undo. No scope modal, linked-state marker,
  drift badge, or make-it-match control. The word card labels shared identity
  edits and offers explicit Add to other boards with named destinations.
- Top-row OFF leaves those cells empty instead of repacking. In Edit mode
  reserved cells read as reserved (not drop targets), distinct from an available
  empty cell; globally masked words keep their separate existing treatment.
- Speak preserves the open group/page. Home remains explicit. A likely occasion
  may glow, but index positions and selected group remain fixed.
- No refresh or catalog update rearranges a group a family has edited.

## Palette

> **Amended 2026-09-24 (`docs/phases/018_Core_Board_V2_And_Groups.md` slice 1):** a sixth role, **Purple**, for
> questions; group doors use the neutral no-role pair with a folder-tab
> edge.

**BUILT** (`public/index.html` `:root` + `.r-*`).

| Token | Hex | Use |
| --- | --- | --- |
| Pip Amber | `#fcb82b` | Bird body. Icon/marketing only — never UI chrome. |
| Ember | `#fc7419` | Beak, feet. |
| Ink | `#2a241d` | Primary action, focus, icon ground. |
| Ink text | `#1a1a1a` | Text on light; tile pressed/focus ink. |
| Cream | `#f6f4ef` | Page background. |
| Line / Tray / Edge / Muted | `#d8d4c8` / `#e8e3d6` / `#8a8578` / `#5b5348` | Warm neutrals for chrome. |
| Masked | `#cfc9bb` border · `#efeadf` fill · `#a39c8a` text | Masked cells, disabled controls. |

Grammar roles (border / label-strip fill):

| Role | Border | Fill | Maps to |
| --- | --- | --- | --- |
| Yellow | `#b07f00` | `#fdf0c8` | Nouns, pronouns (tuned from `#d9a410` for 3:1 against cream) |
| Green | `#2e8b3a` | `#dcf0dd` | Verbs |
| Blue | `#2f6fd0` | `#dcecfd` | Descriptors — never buttons or selection |
| Pink | `#d0438c` | `#fbdfee` | Social, little words, joining words |
| Purple | `#6f55b0` | `#ebe5f7` | Questions — the sixth role (018 D2) |
| Red | `#c62828` | `#fbdcdc` | Negation, safety & urgent |

**Rules (DECIDED 2026-09-22, designer board; BUILT in the app):**

- Hue in the product means grammar only. UI chrome is ink + warm neutrals.
- The gold bird never appears on the grid; the ink bird does.
- Primary buttons are solid ink (`#2a241d`). Blue no longer paints buttons
  or selection — that conflict is retired, as is the lavender prediction
  color (`#8a7fbf` / `#ece8f9`); the strip needs no prediction hue because
  the neutral tray marks the zone.
- Selected and focus states are a cream + ink double ring, not a hue.

## Word tiles

**BUILT** (`public/index.html` `.cell`, `public/board.js` `wordTile`).

- **Label strip:** top 22% of the tile, role fill, Andika Bold, centered,
  one line, shrink-to-fit (`fitLabels`). A word never breaks inside
  itself; two-word labels may wrap between words.
- **Art area:** white, remaining 78%, ~3% padding, `object-fit: contain`.
  Art is trimmed to the drawing's bounding box at build time; stick-figure
  symbols share one trim scale, objects are trimmed individually.
- **Border:** 3px role border color, ~10px radius.
- **Photos:** fill the art area edge to edge (`object-fit: cover`) using
  the focal point + zoom captured at upload. **PROPOSED** — focal/zoom is
  not yet captured at add time; photos cover centered today.
- Tiles with no shipped art keep the white art area empty — the strip and
  border still carry the grammar.

## States

**BUILT** (`public/index.html`; `likely`/`masked` wired in
`public/board.js`):

- **Idle** — as above.
- **Pressed** — border ink `#1a1a1a`, fill `#f2efe6`. No scale, no movement.
- **Likely next** — Parent Corner setting "Highlight likely next words"
  (`learner_profile.highlight_next`, default OFF). Up to 3 grid cells the
  ranker invites get a 4px inner border in their own role color
  (`box-shadow: inset`), tile size unchanged, no animation.
- **Switch / keyboard / eye-gaze focus** — outer double ring: 4px cream +
  5px ink (`:focus-visible`, so touch never shows it).
- **Modeling** — live partner modeling rides the same layer: a tap on
  the linked adult device glows the word on the child's board for a few
  seconds (steady `--glow` ring), then fades — or ends the moment the
  child taps it. Silent unless the family turns on Speak
  (`model_speaks`). Never saved, never in the sync log.
- **Arrange / lifted** — Parent Corner edit mode: dashed ink border +
  shadow.
- **Masked** — border `#cfc9bb`, fill `#efeadf`, label `#a39c8a`, art at
  ~18% opacity, space preserved, untappable. The `.masked` style is
  shipped; the masking feature is built (009 slice 9,
  `docs/product/Vocabulary_Masking_And_Safety.md` § 2).
- **Spotlight** — the attention layer: target words get a
  steady glow (`--glow` ring + halo), every other word dims to
  `--dim-o`, nothing is disabled and nothing moves. A masked cell is
  never glowed. The `🔦 name · End` chip sits in the top bar while a
  spotlight runs.
- **Moved (upgrade highlight)** — a word that changed home after a Cells
  change keeps a soft 3px inner `--glow` ring (`.cell.moved`) for 14
  days; quieter than the spotlight's outer glow, dims nothing.
- **Empty cell** — dashed `#d8d4c8`, transparent, never collapses. The
  grid renders all 60 slots; a gap is a placeholder, not a layout shift.

## Attention layer

**BUILT** (`public/board.js` `layerMark`; state in
`public/shared/spotlight.mjs`; phase:
phase 013 (in git history)).

"Brighten some words, dim the rest, disable nothing" is one layer — one
mark pass every use paints through:

| Use | Trigger | Mark |
| --- | --- | --- |
| Spotlight | an adult starts a list of target words | `.glow` on targets, `.dimmed` on the rest |
| Live modeling | an adult taps a word on their linked device | `.glow`, fades in seconds |
| Pick mode | an adult choosing targets | `.picked` ring |
| Upgrade highlight | a Cells change moved the word | `.moved` inner ring |
| Prediction halo | the ranker invites a core word | `.likely` inner ring in the role color |

Marks compose — one cell can carry several at once. Laws (013 § 2.1,
all hold in the shared pass):

1. **Never a muzzle.** A dimmed word stays 100% tappable, speaks, and
   joins the sentence. The layer changes how words look, never what the
   child can say.
2. **Never moves.** No cell moves, grows, or shrinks.
3. **Never changes the board.** No layer write touches the coordinate
   map, groups, or words.
4. **Never unmasks.** A masked word stays masked.
5. **Gentle.** Steady glow by default; pulse is optional; no flashing,
   strobing, or sound cues.

Durable mechanics: a spotlight is a **list of words, not a board** — if
a target sits inside a group, the glow walks the route through the
Groups anchor, the group tile, and the word; the session row syncs so
the adult's device mirrors the child's board and can start/end it;
live-model taps are transient relay messages — rebroadcast, never
stored, never in `sync_op`; the partner mirror carries the **Coach
view** (target chips, tips, today's tally, rotating basics) which never
renders on the child's device.

## Prediction strip

**BUILT** (`public/index.html` `#tray` / `.pred`, `public/board.js`
`predCard`):

- Four cards sit on a neutral tray (`#e8e3d6`) spanning strip columns
  1–8; the `Groups` and `Keyboard` anchors hold columns 9–10.
- A strip card is a normal word tile turned sideways: art on a white
  square at left, the label on the role fill at right.
- Empty slots are ghost cards: dashed `#d8d4c8`, nothing else.
- Anchors: fill `#e8e3d6`, border `#5b5348`.

## Sentence bar

**BUILT** (`public/index.html` `#topbar` / `.chip`, `public/board.js`
`renderBar`), decided with the founder 2026-09-24:

- Order: 🗑 Clear · sentence · ⌫ Backspace · 🔊 Speak · 📊 / ✚. Clear
  sits at the far end from Speak so a mis-tap can't wipe a sentence.
- Bar is 68px. Each item is its picture with the word under it in ink
  (Andika Bold 20px) — no role color, no frame. Color helps *find* a word
  on the grid; in the bar the word is already found and only has to read.
- Controls are ink line glyphs (inline SVG, `currentColor`), never
  clipart — art means a word, a glyph means a control. Each keeps its
  `title` / `aria-label`. ✚ turns into ✓ on `body.editing`.
- ⌫ removes the last whole word (or the word being typed); a logged pick
  is detached, same as the keyboard's ⌫. 🗑 empties the bar.
- 🔊, or a tap on the bar, speaks the sentence. The words stay for a
  repeat. Parent Corner "After Speak, the next word": **Adds on**
  (default) or **Starts fresh** (`fresh_after_speak`) — the next new
  word empties the bar first. ⌫ or 🗑 cancels a pending fresh start.
- Empty bar: the ink bird + "Tap a word to start." All three controls
  render disabled — `#cfc9bb` / `#efeadf` / `#a39c8a`.

## Typography

**BUILT.** Andika Bold (SIL OFL, self-hosted `public/fonts/`) is the face
of every word the learner sees: tile labels, strip cards, sentence words,
keycaps, anchors. Parent Corner sheets stay on the system font — adult
chrome.

## Adult-facing copy

**DECIDED 2026-09-24** (018 D10, moved here at closeout). Edit-mode
chrome follows one rule: icons, one field, one list, numbers. No
explaining sentences, and no user's name in the copy. A screen that
needs a sentence isn't finished.

## Settings (formerly Parent corner)

**DECIDED 2026-09-28** (founder, "I fully agree with everything", on the
Settings redesign proposal: https://claude.ai/artifact/4wYfqZjY7QCz8GgvXxkaLG).
**BUILT 2026-09-28** unless marked. Markup `public/index.html` `#menu`;
navigation, summaries, checklist, search, switches `public/board/settings-ui.js`;
people `public/board/people-ui.js`; styles `settings-ui.css`. Every control
keeps its id and its owner module's wiring — Settings owns navigation only.

- **Who it's for.** Parents, SLPs, teachers, aides, and adult
  communicators. It is "Settings" with the Settings PIN, never "Parent
  corner". Copy names the person (their name, else "this person"),
  never a role ("your child"). Edit-mode chrome keeps its own no-name
  rule above; this amendment is Settings only.
- **Layout.** Full screen. Header: the person (tap to switch), search,
  Done. A section list beside one page; under 760px the list, then the
  page with Back. Pages: Overview · Words · Board · Talking · Language
  help · Progress · Team & devices · Backup & privacy, then *You* → Your
  account. A page whose every row is hidden drops out of the list.
- **Overview.** A setup checklist of measurable facts only (named;
  people & places exist; recovery card shown on this device —
  `cardShownAt` on the registry row), gone when done. Quick actions: Add
  a word, Practice words (Spotlight), Edit the board. "How it's set up":
  one line per page, read from the live controls.
- **Controls.** On/off is a switch, On on the right (`.seg[data-switch]`;
  the hidden buttons still carry the write). Real choices stay labelled
  options. Risky actions sit in a red-bordered block at the bottom of
  their page. A missing recovery card shows a warning dot on Backup &
  privacy.
- **People.** The header switcher reloads into the chosen person and
  reopens the same page (one-shot `pip_reopen_settings`, written only
  inside Settings). "When Pip opens on this device": a person (`home`),
  or Show the list (no home → the launch list "Who's talking?").
- **PIN.** One per device (`device/pin`, `public/shared/pin.mjs`);
  legacy per-person PINs migrate on first good check. Change PIN asks
  for the new PIN twice, never the old one. The PIN is never shown.
- **Search.** Word-start match over each row's text plus per-page
  synonyms (`SYNONYMS` in settings-ui.js); a hit opens the page and
  rings the row.

- **Previews.** Pictures of the effect: grid per size (CSS from the
  cells seg's layout id), After Play as a sentence bar, Grammar help as
  he + want → he wants, an outlined tile for Outline likely next words.
- **Show groups.** Words lists every non-meal group with a switch
  (`public/board/group-shows.js` → `setGroupHidden`, 027 B8). Meal
  groups keep their one switch (`occasions_visible`).

**PROPOSED** (from the proposal, not built yet): one "Add a device"
button that asks which device you're holding; team roles and
permissions (needs the feature workflow — permissions are a high-risk
stop); a "this board is mine" mode for adult communicators.

## Open items (designer's "next" list)

**PROPOSED**, unscheduled: custom "Pip" wordmark (Andika Bold is the
placeholder), poses 2–6 as drawn vectors, Mode C high contrast
(`docs/product/Profile_Presentation_Modes.md` §2.3), system icon set
(top bar done 2026-09-24), color-blindness simulation of roles + amber, squint test on a cheap
tablet.

## Asset homes

- `assets/brand/` — master SVG marks + the 1024 pose PNGs.
- `public/brand/` — served copies: ink mark, favicons, touch icon,
  maskable icon, `manifest.webmanifest` icons.
- `assets/style-refs/tile-v1/` — the designer's placeholder tile art
  (figure + noun sheet crops), layout reference only; product art comes
  from `scripts/art/gen.mjs` per `docs/product/Motor_Grid_And_Art.md` §4.
