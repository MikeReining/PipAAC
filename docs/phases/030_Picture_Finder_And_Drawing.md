# 030 — Picture Finder and drawing (backend)

**Status:** **Slices 1–7 built; open = founder calibration save, slice-4
live run (≤10, founder-approved), and Works Tests 11 and 13.**
Backend handoff: this doc is written for the developer building the Worker
side. The add experience that calls it is `029_Add_A_Word.md` (front end,
designed separately). Voice for the same add is `028_Tile_Voice_Library.md`
(a separate pipeline; nothing here touches audio).
**Supersedes:** the backend parts of `010_Extended_Picture_Library.md` slice 6
(Draw it for me) and the generate-every-time flow in
`docs/product/Clipart_Pipeline_And_Catalog_Growth.md` § 2. Their art
standards, safety check, Jev framing lenses, and k ≥ 20 review loop still
apply.
**Truth owners:** the OpenRouter usage log (what we paid for), the R2 object
(the picture exists), and the founder's eye on the calibration page (what a
"close match" is).
**Paid-run gate:** dev and tests use stubs. Any live Muse Image call, and any
bulk vision-caption run, needs explicit founder approval
(`AGENTS.md` § Project Laws; ten images at most per approved run).

---

## 0. Decisions (founder, 2026-09-29)

1. **A picture is chosen by meaning; a voice is made for the exact text.**
   "red apple", "apple", "Apfel" and "manzana" can share one drawing. Voice
   stays keyed by exact text (028).
2. **Reuse first, draw last.** Every new word first searches the pictures we
   already own. **A close match is applied automatically**; the adult sees 3
   alternatives and can pick one for free.
3. **What counts as "close" is calibrated by the founder on a side-by-side
   page** (§ 7) and lives in one config number that is easy to change.
4. **Draw automatically** when nothing is close enough — except people and
   pets (Jev scope `personal`), which are never drawn automatically.
5. **The drawing allowance counts image API calls, nothing else.** A new
   drawing costs 1; a redraw costs 1; using any picture we already have
   (catalog, extended library, or anyone's earlier drawing) is free and is
   always available, even with 0 drawings left.
6. **Redraw requires a description.** A redraw without new words would not
   produce a better result, so the server makes it impossible (§ 5.2).
7. **Picks rank globally.** When families pick a picture for a text, that
   picture rises for everyone who types that text. Anonymous; rate-limited.
8. **Allowance spend is automatic** (free users' 5 included). A pasted list
   asks first only when it needs more than 10 new drawings or more than are
   left (the client asks; the server enforces the allowance).
9. No voice cloning. Voices are catalog voices (028).
10. **Families can overrule us, and we learn from it** (founder,
    2026-09-29). When an adult replaces the picture we chose (an auto-applied
    match or an auto-drawing) — by picking another, using a photo, or
    redrawing with a description — that "no" is recorded anonymously. It
    lowers our picture for that text on its own (no review needed), and it
    lands on a **"Where families disagreed with us"** review page where the
    founder can adopt the family's idea for everyone (§ 5.5, § 6.3). Review
    never blocks anything.

## 1. Why

A drawing costs about 1¢ and a few seconds. A match costs nothing and is
instant. Most typed words already have a picture that fits — the 539 catalog
images, ~1,930 extended-library drawings awaiting founder review, and every
drawing any family has made. Searching by meaning instead of spelling makes
all of them reachable: spacing ("apple sauce" → applesauce), modifiers ("red
apple" → apple), phrases ("I want applesauce" → applesauce), and other
languages ("Apfel" → apple), with no translation step and no language rules.

## 2. Architecture

```text
Adult makes "apple sauce"                                   [029 front end]
  │
  ▼
POST /api/v1/pictures/find   {text, description?}
  │  1. Jev: scope (personal | common) + kind (Fitzgerald role)   [text only]
  │  2. embed "text — description" (multilingual model, Workers AI)
  │  3. Vectorize top-k over the picture index  +  pick boost
  ▼
{ candidates[4], auto: <image_id | null>, scope, kind }
  │
  ├─ auto != null  → client applies it (free)
  ├─ scope = personal → client shows "Add a photo" (no draw)
  └─ else          → POST /api/v1/pictures/draw  {text, description?}
                       │  safety check → allowance check
                       │  ledger: key hit? → return it (free)
                       │  miss → Jev lens → Muse Image (gen.mjs settings)
                       │         → R2 `drawing/<key>.png` → index it
                       ▼
                     png  (x-draw-cache: hit | mint, x-drawings-left: n)

Adult taps an alternative → POST /api/v1/pictures/pick {text, image_id}
Adult replaces our choice  → POST /api/v1/pictures/reject {text, ours, action, theirs?}
```

## 3. The picture index

### 3.1 What goes in

| Source | Where it is today | In the index |
| --- | --- | --- |
| Catalog art | `data/catalog/catalog.json` `images` (539, `status: approved`, keys `symbols/*.png|svg` under `public/`) | Yes, `source: catalog` |
| Extended library | `out/extended_art/*.png` + `results.jsonl` + `specs.json` (local, gitignored, unreviewed) | Only rows the founder approves in 010 slice 2 (`review.json`), `source: extended`. **Calibration index** (§ 7) may include unreviewed rows, flagged `pending`; `find` never returns `pending`. |
| Drawings minted by § 5 | R2 `drawing/<key>.png` | Yes on mint, `source: drawn` |
| Family photos | on device / sync blobs | **Never.** Photos are private. |

### 3.2 The record

One vector per picture plus metadata (Vectorize metadata or a side table):

| Field | Notes |
| --- | --- |
| `image_id` | catalog `img_*`, `ext_<slug>`, or `drw_<key>` |
| `asset` | path the client can fetch (§ 4.4) |
| `source` | `catalog` \| `extended` \| `drawn` |
| `status` | `approved` \| `pending` (calibration only) |
| `caption` | the text that was embedded (§ 3.3) |
| `fitzgerald_role`, `lens` | from catalog / Jev spec |
| `caption_version` | bump to rebuild |

### 3.3 Captions (what "meaning" is made of)

- **Catalog:** every English label of the sense (`labels` rows) + its
  category, e.g. `apple · Food & Drink`.
- **Extended:** label + section + Jev spec framing
  (`out/extended_art/specs.json`), e.g. `applesauce · Food & Drink · object`.
- **Drawn:** the text + description that produced it. **For `scope:
  personal`, the caption is the description only** — "our golden retriever",
  never "Cooper". A name never enters the index.
- **Optional later (founder-gated bulk):** a one-time vision caption per
  image by Muse Spark ("a red apple with a green leaf"), appended to the
  caption. Only if the calibration page shows labels alone miss too much.

### 3.4 Embedding model and store

- A **multilingual** embedding model on Workers AI (candidate:
  `@cf/baai/bge-m3`; confirm it is available and multilingual before slice 1,
  and record the choice in `data/catalog/picture_finder.json`). The same
  model embeds captions and queries.
- **Vectorize** index `pip-pictures` (new binding). ~5k vectors at launch.
- **Build script:** `scripts/pictures/build_index.mjs` reads catalog.json,
  the extended review file, and the drawing ledger; writes captions;
  upserts vectors. Generated output — change the sources, then rebuild.
  `npm run pictures:index` (and `--calibration` to include `pending`).

## 4. Find

### 4.1 Query

- `query = normalizeV1(text)` plus `" — " + description` when a description
  is given. (`public/shared/normalize.mjs`.)
- No language detection, no translation, no keyword rules
  (memory: no hand-coded language rules). The multilingual model carries
  "Apfel" to apple on its own.

### 4.2 Score and the auto rule

```text
score(image) = cosine(query, caption)
             + PICK_WEIGHT   · log(1 + picks(text, image))
             − REJECT_WEIGHT · log(1 + rejects(text, image))
auto         = pinned(text)                                  if the founder pinned one (§ 5.5)
             : top.score ≥ AUTO_CUTOFF and top not blocked(text) ? top.image_id : null
```

`AUTO_CUTOFF`, `PICK_WEIGHT`, `REJECT_WEIGHT`, the model id and `caption_version` live in
**`data/catalog/picture_finder.json`** (new, source of truth), imported by
the Worker like `catalog.json`. Changing the cutoff is a one-number edit and
a deploy; no code change. The server computes `auto` — the client never
applies its own threshold, so there is one place to tune.

**Identity beats similarity.** The rule above is tier 2. Tier 1 runs first:
when the typed word IS a picture's label — checked against
`data/catalog/picture_labels.json` (the lexical map `build_index.mjs`
generates beside the index) plus a folded scan of every fetched caption —
that picture applies at any score, any rank ("eat", "no" rank below
`fetch_k` in the embedding entirely). `labelKey` folds case, spaces,
hyphens, apostrophes, so "apple sauce" and "ice-cream" are labels too.
Guards: English common scope only (French "pain" can't steal the English
pain symbol), no description, and a homograph — one label on two catalog
senses ("bat" the animal / the baseball bat) — never auto-applies; its own
images lead the choices and the adult picks the sense.

**Typo suggestion.** When the word is no label at all and nothing applied,
a label within one edit (two for words over four letters) whose picture
the embedding also surfaced is returned as `suggestion` — spelling says
"same word", the pool says "same meaning", so "bananna" suggests "banana"
but "crocs" never suggests "cross". The add card shows "Did you mean
banana?"; accepting renames the word and applies that picture, ignoring
leaves draw/choose untouched. A suggestion never auto-applies and never
spends a drawing.

**Per-language cutoff.** Cross-language cosine scores run lower than
same-language ones ("Apfel" → apple scores below "apple" → apple), so one
number would either block German or let English near-misses through.
`picture_finder.json` holds `AUTO_CUTOFF` as the default plus optional
`AUTO_CUTOFF_BY_LANG` overrides (`{ "de": …, "es": …, "fr": … }`). The
language comes from Jev (§ 4.3). A language with no override uses the
default. Overrides are set on the calibration page (§ 7), never by hand.

### 4.3 Jev in the same request

One Jev call (text + description, no ids) returns:

- `scope`: `personal` (a person, pet, or private place) or `common`.
- `kind`: Fitzgerald role (`Yellow` thing/person, `Green` action, …) — this
  is what replaces the "What kind of word is it?" question in 029.

- `language`: which language the text is in (ISO 639-1 label, e.g. `en`,
  `de`). Jev is a classifier: it returns a label from a fixed list and
  **cannot write or translate**. The label picks the cutoff (§ 4.2). It does
  not disambiguate words that exist in two languages ("Gift", "chat") — the
  app `locale` in the request body is the tiebreaker for those: when Jev's
  top two languages are close, prefer `locale`.

These are model judgments, not keyword rules. If Jev fails, return
`scope: null, kind: null, language: null`; the client treats null scope as
"don't auto-draw" and null kind as Yellow (029); null language uses the
default `AUTO_CUTOFF`.

### 4.5 Translation fallback (only if calibration shows it is needed)

**Not built in slice 1.** Ship with the language label and per-language
cutoffs only. Add this only if the calibration page (§ 7) still shows
non-English rows missing pictures we own:

- Trigger: the first lookup is below its cutoff **and** `language` is not
  `en`. Most typed words never reach it, so the cost stays small.
- A generative model (Groq — already used for magic fix-it and tense
  changes; Jev cannot translate) returns the English text for the string.
- Embed the English text, run the same lookup, and apply `auto` only when
  **both** lookups agree on the top picture. If they disagree, return the
  candidates and let the adult choose — a wrong auto-apply is the costly
  failure.
- Skip it for `scope: personal` (never translate a name).
- Record the English text as an extra column on the calibration page so the
  founder can see each translation next to its row.

### 4.4 Serving images

- Catalog and extended pictures are static assets; return their public
  path.
- Drawings: `GET /api/v1/pictures/img/<image_id>` streams from R2
  (license-gated, like tile clips in 028). The client caches locally
  (Cache Storage) and saves an accepted picture onto the entity so it works
  offline and syncs like a photo (010 slice 6 part 4, unchanged).

## 5. Draw (mint once)

### 5.1 Key and ledger

```text
subject = scope == personal ? normalize(description) : normalize(text) + "|" + normalize(description ?? "")
key     = sha256( STYLE_VERSION | subject )
```

- `STYLE_VERSION` = the frozen style bundle + prompt recipe
  (`assets/style-refs/pip-v1`, `buildPrompt()` in `scripts/art/gen.mjs`).
  Bump it only when everything should redraw.
- Personal subjects key by description alone: "Cooper — our golden
  retriever" and "Max — our golden retriever" share one drawing.
- Ledger (Durable Object, SQLite — same pattern as 028's `TileLedger`; use
  one DO for both if 028 slice 1 lands first): `key` PK, `text`, `description`,
  `scope`, `lens`, `kind`, `r2_key`, `status` (`minting|ready|failed|withheld`),
  `review`, `created_at`, `hits`. **No user, device, or license id.**
- Single flight: concurrent requests for one key make one Muse call
  (028 § 4.5 pattern).

### 5.2 Redraw is a new description

There is no "re-roll the same prompt" endpoint. A draw request whose key
already exists returns the existing picture (hit, free). So the only way to
get a different drawing is a different description — which is exactly the
rule the founder set (decision 6), enforced by the key, not by the UI.

### 5.3 Pipeline on a miss

1. **Safety check** on text + description (010 slice 6, unchanged). Refused
   → 422 `unsafe`, zero Jev/Muse calls.
2. **Allowance check** (§ 6). None left → 402 `allowance`, zero calls.
3. Jev framing lens (`object|face|bust|full|diagram`) + torso color, as in
   `scripts/art/gen.mjs`.
4. **One** Muse Image call via OpenRouter with the `gen.mjs` settings and
   the `pip-v1` style refs. Extract the prompt building into a shared module
   the Worker can import (no Node APIs), the way 028 extracts
   `tile_recipe.mjs`; `gen.mjs` re-exports so scripts don't change.
5. R2 put `drawing/<key>.png`; ledger `ready`; **upsert into the index**
   (`source: drawn`, caption per § 3.3) so the next family finds it.
6. Decrement the allowance by 1. Return png with `x-draw-cache: mint`,
   `x-drawings-left`.

Synth seam: `env.DRAW_SYNTH(prompt, refs)` for tests. **Local dev default is
a stub** (a fixed placeholder png, `x-draw-cache: stub`) unless
`DRAW_LIVE=1` and `OPENROUTER_API_KEY` are set.

### 5.4 Growth loop (unchanged, now cheaper)

`scope: common` drawings still count toward k ≥ 20 for the catalog review
queue (`Clipart_Pipeline_And_Catalog_Growth.md` § 4–5). Picks (§ 6.2) are a
second demand signal for the same queue.

### 5.5 "Where families disagreed with us" (review page, non-blocking)

We make mistakes, and families often have better ideas. Every rejection
(§ 6.3) is a free lesson. This page turns them into catalog fixes. Nothing
waits on it: the ranking already corrects itself through `REJECT_WEIGHT`.

- **Where:** a second tab on the local review page from § 7 (same server,
  same admin token). No public admin UI.
- **Rows:** grouped by `(text, our picture)`, sorted by rejection count,
  newest activity first on ties. Each row shows **our picture** next to
  **what families chose instead** — the alternatives they picked (with
  counts), the drawings they made, and the **descriptions they wrote** — plus
  how many chose a photo (count only; photos are never seen).
- **Only `scope: common` rows appear.** People, pets and private places are
  never listed. Descriptions shown have passed the § 5.3 safety check.
- **Actions** (each logged in the ledger with a timestamp):

| Action | Effect |
| --- | --- |
| **Make theirs the default** | `pinned(text) = their image`. `find` auto-applies it for that text for everyone, above any score. |
| **Stop auto-applying ours** | `blocked(text, our image)`. Ours still shows as an alternative, never auto. |
| **Promote to catalog** | Sends their drawing to the extended-library review (`Clipart_Pipeline_And_Catalog_Growth.md` § 5); approval makes it catalog art. |
| **Redraw our art** | Queues a redraw of our picture using their description as the hint, into the art review flow. **Founder-gated, ten at most per run** (`AGENTS.md`); never replaces shipped art without approval. |
| **Dismiss** | Hides the row until new rejections arrive. |

- Pins and blocks are keyed by text only, like everything else here. Undo
  is removing the row.

## 6. Counting

### 6.1 Drawing allowance (per user, the only identity-keyed counter)

| Tier | Allowance | Source |
| --- | --- | --- |
| Free | 5, once | `Pricing_And_Packaging.md` § 4.2 |
| Pip Lifetime | 300, once | same |
| Abuse guard | 30 mints/day | same |

- **Counts:** image API calls only — new drawings and redraws (a mint).
- **Never counts:** `find`, `pick`, a draw that is a ledger hit, any catalog
  or extended picture.
- Store per user id with the existing `usageCheck`/`usageRecord` pattern
  (`src/worker/voice.js`), ns `usage-draw`, lifetime total plus the daily
  guard. Tier from the license (`src/worker/license.mjs`). Kept apart from
  the ledger and the pick counts.
- Top-up purchase is out of scope until 015 slice 6 (payments) lands; at 0
  the server returns 402 and the client offers a photo.

### 6.2 Picks

`pick(text_norm, image_id) → count`. No identity. Rate-limited per license
(ns `usage-pick`, e.g. 200/day) so one account cannot steer everyone's
ranking. Picks for a personal-scope query are recorded against the
description, never the name.

### 6.3 Rejections

A **rejection** is the adult replacing the picture *we* chose — the `auto`
match or an automatic drawing — on the new word's card (029 § 4.1). Replacing
a picture the adult chose themselves is not a rejection.

- **Client sends** `reject {text, description?, ours: image_id, action:
  pick|photo|draw, theirs?: image_id}` once per replacement. For `photo`,
  `theirs` is omitted: we record only that a photo was chosen, never the
  photo. For `draw`, `theirs` is the new `drw_*` and the description travels
  with it.
- **Server records** `rejects(text_norm, image_id)++` (feeds § 4.2) and one
  anonymous disagreement row `(text_norm, ours, action, theirs, description,
  scope, created_at)` for § 5.5. **No user, device, or license id.**
- Personal scope: recorded against the description, never the name, and
  never shown on the review page.
- Rate-limited per license (ns `usage-reject`, same limit as picks) so one
  account cannot demote a picture for everyone.
- A rejection never costs anything. The redraw that may follow costs 1
  drawing, as any draw does.

## 7. Calibration page (founder decides "close")

A local review page, like the `audio-review-*` pages — built by the backend
developer, used by the founder with Claude (memory: judgment calls are a
side-by-side page and a joint decision, not an eval harness).

- **Queries:** `data/pictures/calibration_queries.json`, ~100 real typed
  inputs. Drafted by the developer, edited by the founder. Must cover:
  exact words; spacing and hyphen variants ("apple sauce", "ice-cream");
  misspellings ("bananna"); modifiers ("red apple", "yellow banana", "big
  dog"); phrases ("I want applesauce", "go to the park"); German, Spanish,
  French ("Apfel", "manzana", "pomme", "Hund"); people and pets ("Grandma
  Rosa", "Cooper — our golden retriever"); and words we have no picture for.
- **Page:** each query → its top 4 pictures with scores and Jev scope/kind.
  A **cutoff slider** recolors every row live: auto-applied / would draw.
  There is one slider per language (default plus each override), and the
  header shows a **per-language table** of the counts below. Cover at least
  15 rows each for English, German, Spanish and French, including words that
  exist in two languages ("Gift", "chat", "pain") as hard cases.
  The founder marks each row's right answer (one of the four, or "none
  fits"); the header shows, at the current cutoff, how many rows auto-apply
  the right picture, auto-apply a wrong one, or draw when a fit existed.
- **Save** writes `AUTO_CUTOFF`, any `AUTO_CUTOFF_BY_LANG` overrides (and
  `PICK_WEIGHT` / `REJECT_WEIGHT` if changed — each has its own slider; the
  page can seed fake pick/reject counts on a row to show how far a weight
  moves it) to
  `data/catalog/picture_finder.json`. Marks are saved beside the queries so
  the page can be re-run after a model or caption change.
- Runs against the calibration index (includes `pending` extended art) so
  calibration does not wait on the founder's extended-library review.
- Embedding calls are Workers AI (fractions of a cent for the whole set);
  no Muse calls.

Until the cutoff is saved, `AUTO_CUTOFF` defaults to 1.01 (never auto): the
client shows the four and the adult chooses.

## 8. Privacy

- Leaves the device: the typed text and optional description, on the
  adult's tap, to our Worker; from there to Workers AI (embedding) and Jev
  (scope/kind/language), Groq (only if the § 4.5 translation fallback is
  built) and, on a draw, OpenRouter/Muse. **No user, device, or
  license id is sent to any vendor.**
- Stored without identity: index captions, drawing ledger, pick counts,
  rejection counts and disagreement rows, pins and blocks.
- Stored with identity: only the per-user drawing allowance counter.
- Names never enter the index, pick counts, or rejections (§ 3.3, § 6.2,
  § 6.3), and personal-scope rows never reach the review page (§ 5.5).
- A rejection by photo records only the word "photo" — no image, no hash.
- Photos never leave this path's scope (unchanged).
- **Open:** the privacy policy must say typed word labels are sent to
  image and classification providers (same line as 028 § 8). No policy
  doc exists in the repo yet — adding the line is an open founder item.

## 9. Endpoints

All follow `src/worker/voice.js` conventions (JSON errors, license check,
`user_id` UUID check, binding present or 503).

| Route | Body | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/v1/pictures/find` | `{user_id, license, text, description?, locale}` | `{candidates:[{image_id, asset, source, score}]×≤4, auto, scope, kind, language, calibrated}` — `calibrated` is false while `auto_cutoff` > 1 (029: no auto-draw until the founder saves a cutoff) | 400 `bad_text`; 403; 429 |
| `POST /api/v1/pictures/find-batch` | `{…, items:[{text, description?}]×≤50}` | `{results:[<find result>]}` | same |
| `POST /api/v1/pictures/pick` | `{…, text, description?, image_id}` | 204 | 400; 403; 429 |
| `POST /api/v1/pictures/draw` | `{…, text, description?}` | `200 image/png`, `x-draw-cache: hit\|mint\|stub`, `x-drawings-left` | 402 `allowance`; 422 `unsafe`; 429 `fair_use`; 502 `draw_failed`; 503 |
| `GET /api/v1/pictures/img/<image_id>` | — | `image/png` | 403; 404 |
| `GET /api/v1/pictures/allowance` | headers `x-pip-user`, `x-pip-license` | `{left, total}` | 403 |
| `POST /api/v1/pictures/reject` | `{…, text, description?, ours, action, theirs?}` | 204 | 400; 403; 429 |
| `GET /admin/v1/pictures/recent` | `source`, `before`, `limit` | recent drawings (newest first) | 401 |
| `GET /admin/v1/pictures/disagreements` | `before`, `limit` | § 5.5 rows (common scope only) | 401 |
| `POST /admin/v1/pictures/disagreements/action` | `{text, ours, action: pin\|block\|promote\|redraw\|dismiss, theirs?}` | 204 | 401 |

Text rules: `normalizeV1`, 1–80 characters for text, 0–120 for description.

**Shape note (as built, differs above):** the admin ruling routes put the
action in the path — `POST /admin/v1/pictures/disagreements/{pin|unpin|
block|unblock|dismiss|promote|redraw}` — and the bodies use `text_norm`,
not `text`. Harmless while the local page is the only consumer; recorded
here so the contract isn't read as settled.

## 10. Slices

Each: read route → truth owner + proof → focused proof → deslop → commit.

**Slice 1 — Index + find (no drawing, no money).**
`data/catalog/picture_finder.json`; `scripts/pictures/build_index.mjs`;
Vectorize + Workers AI bindings in `wrangler.jsonc`; `src/worker/pictures.js`
(`find`, `find-batch`, Jev scope/kind/language); route wiring in
`src/worker/index.js`. Proof: Works Tests 1, 2, 3, 8.

**Slice 2 — Calibration page.** § 7. Founder + Claude run it and save the
cutoffs, per language. Proof: Works Tests 4, 14. If non-English rows still
miss after this, add the § 4.5 translation fallback as slice 2b.

**Slice 3 — Draw ledger + allowance (stubbed synth).** § 5, § 6.1; shared
prompt module extracted from `gen.mjs`. Proof: Works Tests 5, 6, 7, 9, 10.

**Slice 4 — Live draw (founder-gated, ≤10).** Turn on `DRAW_LIVE` for a
founder-approved run of ≤10 words. Proof: Works Test 11 (the instrument).

**Slice 5 — Picks.** § 6.2 and the ranking boost. Proof: Works Test 12.

**Slice 6 — Extended library joins.** After the founder's 010 slice 2
review, rebuild the index with approved extended art (no generation).

**Slice 7 — Rejections and the disagreement page.** § 6.3 (`reject`,
counts, `REJECT_WEIGHT` in scoring), § 5.5 (page tab, admin routes, pin /
block / promote / dismiss; redraw queues only). Proof: Works Tests 15–18.

**Later, founder-gated:** vision captions (§ 3.3) if calibration shows the
need.

## 11. Works Tests

1. **Spacing.** `find("apple sauce")` top-1 is applesauce (calibration index).
2. **Other languages, no translation.** `find("Apfel")`, `find("manzana")`,
   `find("pomme")` top-1 is apple; the request log shows no translation call.
3. **Modifiers and phrases.** "red apple" → apple; "I want applesauce" →
   applesauce, in the top 4.
4. **Cutoff is config.** Change `AUTO_CUTOFF` in `picture_finder.json`,
   rebuild: `auto` flips for rows near the line; no code diff.
5. **Reuse is free.** Find + apply an existing picture: allowance unchanged;
   the draw stub records zero calls.
6. **Draw counts once.** A miss decrements the allowance by 1 and calls the
   stub once; the same `(text, description)` from another license is a hit —
   no decrement, no call.
7. **No description, no redraw.** Drawing an existing key without a new
   description returns the same picture (hit), zero calls.
8. **Names never indexed.** Draw "Cooper — our golden retriever": the index
   caption and pick rows contain "golden retriever" and not "cooper".
9. **Allowance empty.** At 0 left, `draw` → 402 with zero vendor calls;
   `find` still returns existing pictures and `auto` still applies.
10. **Safety first.** A blocked word → 422 before any Jev or Muse call.
11. **Billing truth (instrument the code can't influence).** A
    founder-approved live run of N ≤ 10 distinct words: the OpenRouter
    activity log shows exactly N image calls; repeating the run adds zero.
12. **Picks rank, bounded.** 20 picks of banana for "yellow banana" from
    different licenses move banana to top-1 for a new license; one license
    past its pick limit gets 429 and moves nothing.
13. **No identity.** Inspect every ledger, index-metadata, and pick row: no
    user, device, or license id; vendor request bodies contain only text,
    description, and prompt.
14. **Per-language cutoff.** With `AUTO_CUTOFF_BY_LANG.de` set below the
    default, `find("Apfel")` auto-applies apple while an English near-miss
    at the same score does not; removing the override flips `Apfel` back to
    "show four". Jev returns `language: de` for "Apfel"; `locale: de` breaks
    the tie for "Gift".
15. **A "no" is recorded without identity.** Replace an auto-applied picture
    by pick, by photo, and by draw: three disagreement rows with the right
    `action`; the photo row has no `theirs` and no image data; no row
    contains a user, device, or license id.
16. **Rejections self-correct.** With `REJECT_WEIGHT` set, N rejections of
    apple for "red apple" from different licenses drop apple below
    `AUTO_CUTOFF` for that text — `auto` becomes another picture or null —
    while `find("apple")` is unchanged. One license past its reject limit
    gets 429 and moves nothing.
17. **People never reach review.** A rejection for "Grandma Rosa — …" is
    counted but absent from `/admin/v1/pictures/disagreements`; its row holds
    the description, not the name.
18. **Pin and block act for everyone.** Pin their drawing for "applesauce":
    a new license's `find("applesauce")` auto-applies it. Block ours for
    "red apple": ours appears only as an alternative. Removing the pin/block
    restores scoring.
