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
> questions; group doors use the neutral no-role pair. **Amended 2026-09-29:**
> no folder tab — a door reads by structure (glyph above label, one cream
> fill with no label band, ink line glyph vs clipart).

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

- **Label strip:** top 33% of the tile, role fill, Andika Bold, centered.
  One uniform size per board (`fitLabels` — nominal fits two lines in the
  strip); a label that doesn't fit on one line wraps to two, hyphenating
  long words (`hyphens: auto`), never shrinking into a different size.
  Shrinking is the last resort when even two lines don't fit.
- **Art area:** white, remaining 67%, ~3% padding, `object-fit: contain`.
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
  people & places exist), gone when done. **Protect** card once the
  board is invested (first customization: people, words, groups,
  pictures, hidden or moved words, saved practice lists — `sync_op`
  kinds; settings flips and the demo don't count): Lock Settings with a
  PIN and Make the recovery card, whichever is missing, owners only.
  Quick actions: Add a word, Practice words (Spotlight), Edit the board,
  Replay the tour. "How it's set up": one line per page, read from the
  live controls.
- **Controls.** On/off is a switch, On on the right (`.seg[data-switch]`;
  the hidden buttons still carry the write). Real choices stay labelled
  options. Risky actions sit in a red-bordered block at the bottom of
  their page. A missing recovery card shows a warning dot on Backup &
  privacy — only once the board is invested.
- **People.** The header switcher reloads into the chosen person and
  reopens the same page (one-shot `pip_reopen_settings`, written only
  inside Settings). "When Pip opens on this device": a person (`home`),
  or Show the list (no home → the launch list "Who's talking?").
- **PIN.** Off until someone asks for one (founder 2026-09-28): the
  gear opens Settings with one tap. Backup & privacy → Settings PIN:
  Lock Settings with a PIN (twice), Change PIN (never the old one), Turn
  off the PIN. One per device (`device/pin`, `public/shared/pin.mjs`).
  Exactly four digits (founder 2026-09-29): the sheet acts on the
  fourth digit, with no Open button.
  Never shown. Forgot the PIN? → type "new pin" → choose a new one;
  one path, no license or card, the words untouched.
- **Recovery card.** Asking for it on an unsynced board turns on the
  encrypted sync first, then shows the card (`recovery-ui.js` →
  devices-ui `ensureUser`); offline, it says so in one line.
- **Search.** Word-start match over each row's text plus per-page
  synonyms (`SYNONYMS` in settings-ui.js); a hit opens the page and
  rings the row.

- **Previews.** Pictures of the effect: grid per size (CSS from the
  cells seg's layout id), After Play as a sentence bar, Grammar help as
  he + want → he wants, an outlined tile for Outline likely next words.
- **Show groups.** Words lists every non-meal group with a switch
  (`public/board/group-shows.js` → `setGroupHidden`, 027 B8). Meal
  groups keep their one switch (`occasions_visible`).

- **Add a device.** One button; a sheet asks which device you're
  holding and hands off to the existing flow (`dev-link` shows a code,
  `dev-add` types it and Allows — devices-ui owns both).

- **Owner and Team.** **DECIDED 2026-09-28** (founder: "an owner, and
  someone who can edit everything except deleting boards, managing
  people and changing the license — we can stop there"). Two kinds of
  people, no levels to pick. Whoever creates the board, a device an
  owner pairs, and a recovery-card restore are Owners; everyone invited
  joins as Team; an owner can Make owner / Make team. Team edits
  everything; only owners invite, remove, add devices, manage the
  license, replace the card, and delete the board. Enforced by the relay
  (`src/worker/relay.js` `isOwner`), shown in Team & devices
  (`public/board/devices-ui.js` `applyOwner`); a Team device sees a
  "You're on the team" note and no management buttons, and is never
  nagged about the recovery card. Owner/Team is derived per device, not
  stored: no account tag → Owner; through a supporter account → that
  account's `owner` flag. The last owner can't be demoted or removed.

## Welcome and first-run demo

**DECIDED 2026-09-28** (founder: "get the user to a wow experience as
quickly as possible"); **BUILT 2026-09-29**. No photos, PIN, backup or
sign-in before the wow.

- **Welcome** (`public/board/onramp-ui.js`, on a new person —
  `needsSetup`): one screen, a name (optional) and "Who's it for?" — A
  child / A teen or adult (`audience` on the registry row). A teen or
  adult gets one more: "How should the buttons look?" — Pictures and
  words / Words only, shown as real tiles. Mom and Dad stay on every
  board. The old four-step "their world" form opens only from Settings.
- **Demo** (`public/board/tour-ui.js`): want → apple (placed on the
  Smart bar for the tour) → ✨ Fix it → "I want an apple." → ⏪ → "I
  wanted an apple." → "Now try your own." Scripted, so it plays offline
  and instantly; while it runs, board.js routes taps, the Smart bar and
  the transforms to it and nothing reaches the tap log, stats or the
  ranker. The last card says ✨ needs the internet on your own
  sentences. **Open:** the founder confirms the live Fix it / past
  output for "want apple" matches the script; optional recorded clips
  (`/audio/onramp/i-want-an-apple.mp3`, `i-wanted-an-apple.mp3`) wait
  for a founder listen (AGENTS.md) — until then the normal sentence
  voice speaks.
- **Voice** (**BUILT 2026-09-29**, founder: "very important and highly
  requested"). Settings → Talking opens on Voice: the voice in use, ▶
  Hear it, Change voice. The picker (`public/board/voice-ui.js`) lists
  voices by ear — chips Girl · Boy · Woman · Man, a card per voice with
  ▶ "I want an apple." — under Available now, and the planned lineup
  (Girl, Boy, Teen girl, Teen boy, Woman, Man; `VOICE_LINEUP` in
  `public/shared/voices.mjs`) under Coming soon. A voice is selectable
  only when the catalog `voice` table has it active: each voice is a
  full word clip library plus its matching sentence voice, never two
  speakers in one (Schema § 5.5, § 7). Choosing writes
  `preferred_voice_id` (synced). The demo's last card offers "Try other
  voices". **Open:** each new voice's clip library and sentence voice —
  a founder-approved batch and listen per voice (AGENTS.md); a
  download-progress state ("Getting Sam's voice ready…") when a second
  voice exists; the sentence voice (`grokVoice`) still a fixed seam in
  board.js until voice rows carry their sentence engine.
- **Speaking speed** (Settings → Talking; `learner_profile.speech_rate`
  slower / normal / faster, synced, added via `ADDITIVE_COLUMNS`): every
  clip and sentence plays at 0.8×, 1× or 1.2× with pitch kept.
- **Words only** (Settings → Board → Buttons show; `presentation_mode`
  'label', synced; `.words-only` in index.html): no pictures anywhere,
  one shared text size, every cell and color unchanged.

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
