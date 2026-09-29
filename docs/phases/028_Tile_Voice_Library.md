# 028 — Tile voice library (mint once, speak in the chosen voice)

**Status:** **Core shipped 2026-09-29.** Slices 0–5 + the free half of 7
landed (mint core, client playback + triggers, review page, flag/sweep,
reconcile, catalog seed). Leo (slice 6) and the extended-library seed
(slice 7 paid half) are a follow-up gated on founder cost approval;
slice 8 `catalog_lazy` waits on 010. Production deploy: done
(`pippaac.emailmike.workers.dev`, v5 DO migration, admin + vendor
secrets set — overage check remains a founder dashboard step).
Keep-in-phases: still owns the live API/ledger spec and the gated
slices 6–8 work orders.
**Related:** phase 010 (extended library), 024 (sentence Grok cache — a
**different** pipeline that this one copies patterns from),
`docs/product/Language_And_Voice_Schema.md`,
`docs/operations/ElevenLabs_Tile_Minting.md`,
`docs/operations/Catalog_Tile_Voice_Coverage_Plan.md` (bulk pre-seed inventory).
**Truth owners:** the ElevenLabs usage counter (what we were billed for), the
mint ledger (what we made), and what a real tablet plays (§ 11).

---

## 0. Decisions (founder, 2026-09-29)

1. **Every word or phrase a supporter adds is minted instantly, once, in that
   user's selected voice**, uploaded to R2, and served from cache to everyone
   who later asks for the same text in the same voice. No per-user re-mint.
2. **No device TTS for tiles, ever.** Apple/system voices are the wrong voice
   and feel cheap. While the clip is being made the editor says
   *"Making Eve's voice for 'scientist'…"* (voice display name). The child's
   board never waits: minting happens in the supporter's editor.
3. **English only for auto-mint in v1.** Other locales are accepted, held, and
   counted (§ 4.3). When v2 opens a locale is decided later.
4. **Model is `eleven_v4` only.** v3 is retired; leftover v3 references are a
   cleanup slice (§ 10, slice 0), separate from the feature.
5. **Review never blocks anything.** A page lists what was minted most
   recently; the founder spot-checks on whatever cadence they like (§ 7).
   Seed clips (ours) and user-typed clips are told apart by a `source` field.
6. **One mint path.** Bulk pre-seed is the same mint core called with a list;
   there is no second pipeline.
7. **Voices:** the default female tile voice is **Eve**
   (`WWMMC6k9tdar0BthUenK`, in use today); the male voice is **Leo**
   (`aGfQDyfOrmWWfC7ZnTbv`, voice id final, **not yet seeded in the catalog**).
8. **Keyboard text mints too.** Typed words are committed to the message bar
   and minted in the background (§ 5.6); no per-keystroke mints. Device TTS
   is gone from tiles and typed text.
9. **Licensing is settled:** the ElevenLabs plan includes a commercial
   license. If credits run out the plan is upgraded or credits are bought;
   overage billing stays **off** as the vendor-side hard stop.
10. **Ship on first mint.** v4 plain was ~99% acceptable on 400+ catalog clips.
   Custom input is harder (names, homographs), so quality is watched by review
   plus a "sounds wrong" flag, not by a gate.

## 1. Problem and economics

Families customize; the tile voice must stay one consistent human voice.
ElevenLabs must run **once per shared text + voice**, not once per user. Cost
scales with **unique strings**, which repeat heavily (common words, common
names), not with users × vocabulary. Marginal cost of a hit is an R2 read.

**Code truth today** (verify before relying on it):

| Path | Audio today |
| --- | --- |
| Catalog sense with a ready clip | Clip plays (`public/shared/voice.mjs` → `resolveSlot`) |
| Catalog sense without a clip | **Silence** |
| Personal entity (Add → New) | Recording override if any, else **device TTS** on `spoken_name` (`resolveSlot`, entity branch) ← **replaced by this phase** |
| Keyboard `typed` text | Device TTS (`resolveSlot`, typed branch) ← **replaced by this phase** (§ 5.6) |
| Sentence ▶ / transforms | Grok + R2 cache (`src/worker/voice.js`, 024) — not this phase |

## 2. Principles

1. **Audio is a pure function of `(voice, locale, text)`.** Cache it by that;
   it needs no promotion, no catalog membership, no user id. Promotion to the
   public catalog (art, curated entry) is a separate decision that audio does
   not wait for.
2. **The ledger never learns who asked.** Rows hold text, voice, source,
   timestamps, review state, counters. No user, device or license id.
3. **Audio does not require art.** Label + Fitzgerald color already renders.
4. **Never speak in a wrong voice.** No fallback voice; silence + a visible
   state + the Record button (existing override) is the failure mode.
5. **Do not interfere with the child.** Nothing in this phase empties, hides
   or changes a tile the child already has. Failed or held words are a
   supporter-side state.
6. **The instrument the code can't influence is the vendor's usage counter**
   (§ 11 Works Test 9), not our own ledger.

## 3. Architecture

```text
Supporter adds "scientist" (voice: Eve, locale en)         [editor, adult side]
  │  normalizeV1 → validate (§ 4.2) → locale gate (§ 4.3)
  │  local Cache Storage hit?  ── yes ─▶ done (already on this device)
  │  no ▶ "Making Eve's voice for 'scientist'…"
  ▼
POST /api/v1/voice/tile          (Worker, src/worker/tile.js)
  │  license check (024 pattern)  → per-license quota (misses only)
  ▼
TileLedger  (one Durable Object, SQLite)      key = sha256(voice|locale|profile|text)
  ├─ ready     → stream R2 object, `x-tile-cache: hit`             (free)
  ├─ withheld  → 409 (founder rejected it, remint pending)
  ├─ minting   → await the in-flight promise (single-flight)
  └─ absent    → global budget check → claim → ElevenLabs v4 → R2 put → ready
                                                                   `x-tile-cache: mint`
```

- **Namespaces (R2 bucket `VOICE`, already bound):** `tile/<voice_key>/<id>.mp3`
  for user-typed and lazy clips. Seed clips keep their existing catalog R2
  paths; they are **not** copied (slice 7 backfills ledger rows pointing at
  them so identical text hits).
- **Why a Durable Object:** the mint must be claimed atomically (two
  supporters adding "scientist" in the same second must produce one vendor
  call), and review needs "most recent N" listing. R2 alone gives neither.
  One singleton ledger DO (`idFromName("ledger")`) is ample: mints are rare,
  hits are one `peek`.
- **Why the Worker is the only reader:** the bucket has no public access, and
  every read needs a valid license, so keys need no secret salt.
- **Client caches locally** (Cache Storage, same pattern as
  `public/shared/voice_sentence.mjs`), so replays are instant and offline.

## 4. Contract

### 4.1 Voices (`data/catalog/tile_voices.json`, new — source of truth)

```json
{ "schema": "pippaac.tile-voices.v1",
  "voices": [
    { "voice_key": "voi_default_en", "display_name": "Eve",
      "provider": "elevenlabs", "voice_id": "WWMMC6k9tdar0BthUenK",
      "model": "eleven_v4", "voice_settings": { "stability": 0.4, "similarity_boost": 0.8 },
      "locales": ["en"], "status": "active" },
    { "voice_key": "voi_leo_en", "display_name": "Leo",
      "provider": "elevenlabs", "voice_id": "aGfQDyfOrmWWfC7ZnTbv",
      "model": "eleven_v4", "voice_settings": { "stability": 0.4, "similarity_boost": 0.8 },
      "locales": ["en"], "status": "planned" } ] }
```

- `voice_key` **is the local `voice.id`** (`voi_*`, schema § voice). The client
  sends `voice_key`; it never sends an ElevenLabs id. Unknown/retired key →
  400 `bad_voice`.
- `status`: `active` (selectable, minted), `planned` (listed here, **not**
  selectable, Worker rejects with 400 `bad_voice`), `retired`.
- **Eve** launches `active`. **Leo** stays `planned` until slice 6 flips it:
  Leo has no seeded catalog clips yet, so selecting him would silence every
  catalog tile on the board. Leo becomes selectable only when launch-set
  seed coverage for `voi_leo_en` is 100% (slice 6 gate, measured by the
  coverage tool). Typed-word mint works for Leo the moment he is `active`.
- Local `voice` rows: `voi_default_en` display name "Eve"; add `voi_leo_en`
  "Leo" with the catalog import in slice 6.
- Settings come from this file, not from `voices.json` `tiles` (that stays for
  bulk tooling; slice 1 makes `voices.json` `tiles` and this file agree, or
  points the former at the latter).

### 4.2 Text rules (Worker-side, authoritative; client mirrors for UX)

```text
text   = normalizeV1(input)                     // public/shared/normalize.mjs: NFC, trim, casefold, collapse ws
length = 1..60 characters (longer → 400 bad_text; sentences belong to 024)
allow  = ^[\p{Script=Latin}\p{N}\s'’\-.,!?&]+$  // letters, digits, space, ' ’ - . , ! ? &
```

- Anything outside `allow` (brackets, angle brackets, slashes, emoji, other
  scripts) → **held**, reason `chars` (§ 4.3). This is a character-set
  validity check, not a language rule, and it also makes ElevenLabs audio tags
  (`[whispers]`) and IPA slashes un-injectable by users.
- The mint text is produced by the shared recipe (§ 4.4), never the raw input.

### 4.3 Locale gate and held words

- The client sends the board's `locale`. Worker mints only when
  `locale ∈ voice.locales` (v1: `en`). No language detection.
- Otherwise the request returns `422 {held: "locale"|"chars"}` and the Worker
  records/increments a row in `tile_held(locale, text, reason, count,
  first_seen, last_seen)`. No audio, no vendor call.
- Editor copy for held: *"A voice for this word isn't available yet. You can
  record your own."* The tile still saves; the Record button (existing
  `setOverride`) works. This table is the demand signal for v2 locales.
- Known v1 limitation, accepted: a Latin-script foreign word on an English
  board ("gato") mints with English pronunciation. Review and the flag catch it.

### 4.4 Mint recipe (single shared module)

Extract the pure text rules from `scripts/catalog/elevenlabs_v4_lab.mjs` into
`src/shared/tile_recipe.mjs` (no Node APIs — the Worker imports it; the lab
script re-exports so nothing else changes):

- `tileMintText(normalizedText)` → `v4_plain` text, applying
  `needsLexicalV4Guard` (`[isolated dictionary word, do not make the sound] …`)
  and `ipaOverrideForSoundEffectLabel` exactly as the lab does today.
- `TILE_PROFILE = "v4-plain-1"` — part of the dedupe key. Bump only when the
  recipe or model changes and everything should re-mint.
- Multi-word phrases go through plain text (the lab's rule: IPA-only is for
  single-word citation forms; the Groq IPA fallback stays a founder-side lab
  tool, used by review remint, § 7).

### 4.5 Dedupe key and ledger

```text
id = sha256( voice_key | locale | TILE_PROFILE | normalizedText )      // hex
```

`tile_clip` (DO SQLite, created in `TileLedger` constructor):

| Column | Notes |
| --- | --- |
| `id` TEXT PK | the dedupe key above |
| `voice_key`, `locale`, `text` | `text` is the normalized text (needed for review) |
| `mint_text`, `model`, `profile` | what was actually sent to ElevenLabs |
| `source` | `seed` \| `user_typed` (add/rename in the editor) \| `user_keyboard` (committed keyboard words) \| `catalog_lazy` — **this is the "where did it come from" answer** |
| `status` | `minting` \| `ready` \| `withheld` \| `failed` |
| `r2_key`, `bytes`, `duration_ms` | `duration_ms` estimated from bytes at the mp3 bitrate |
| `checks` | JSON: `{ duration_ok, silence_ok }` (§ 6 auto-hints; never gates serving) |
| `review` | `unreviewed` \| `approved` \| `rejected` (default `unreviewed`) |
| `flagged` | 0/1 — set by "sounds wrong" |
| `version` | starts 1; +1 on replace |
| `replaced_at` | ms; set on replace |
| `hits` | endpoint requests served (not device replays) |
| `created_at`, `minted_at`, `reviewed_at` | ms |

Index on `(created_at DESC)`, `(review, source, created_at DESC)`, `(replaced_at)`.
**No user/device/license column, ever.**

`tile_mint` (append-only vendor-spend events, added in slice 5): every
completed synth — first mints and each remint — logs
`(clip_id, voice_key, chars, minted_at)` where `chars` is the exact
`LENGTH(mint_text)` sent. `tile_clip` is state and a remint rewrites it;
the reconcile (WT9) needs the event stream. Stub synths log `chars=0`.


- **Single flight:** the DO keeps `Map<id, Promise>`. A second request for a
  `minting` id awaits the same promise. A `minting` row older than 60 s with
  no in-memory promise (DO was evicted) is reclaimed by the next request.
- **Failure:** ElevenLabs error → row `failed` with `retry_after = now+30 s`;
  the request returns 502. The next request after `retry_after` re-claims.
  A tap never loops the vendor (client backs off, § 5.4).
- **Replace:** new R2 object `tile/<voice_key>/<id>.v<n>.mp3`; row `r2_key`
  swaps, `version++`, `replaced_at = now`. Old objects are kept.

### 4.6 Endpoints

All Worker routes follow `src/worker/voice.js` conventions (JSON errors,
`checkLicense`, `user_id` UUID check, `env.VOICE` present or 503).

| Route | Body | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/v1/voice/tile` | `{user_id, license, voice, locale, text, source?}` (`source` default `user_typed`; clients may send `user_typed`, `user_keyboard`, `catalog_lazy`; `seed` is admin/tooling only) | `200 audio/mpeg`, headers `x-tile-cache: hit\|mint`, `x-tile-version: n` | 400 `bad_user_id\|bad_voice\|bad_text`; 403 `bad_license`; 409 `withheld`; 422 `held` (+ reason); 429 `fair_use` (+ `over`); 502 `mint_failed`; 503 `voice_unavailable\|budget` |
| `POST /api/v1/voice/tile/flag` | `{user_id, license, voice, locale, text}` | `204`; sets `flagged=1` | 400/403; rate-limited via the same usage counter (ns `usage-tileflag`) |
| `GET /api/v1/voice/tile/replaced?since=<ms>&voice=<key>` (license in header `x-pip-license`, `x-pip-user`) | — | `{ids:[<sha256 of normalized text>…], next:<ms>}` — text hashes of clips replaced or withheld since `since` | 403 |
| `GET /admin/v1/tile-voice/recent` | query: `source`, `review`, `flagged`, `before`, `limit≤100` | rows (no audio) | 401 without `Authorization: Bearer $PIP_ADMIN_TOKEN` |
| `GET /admin/v1/tile-voice/audio/<id>` | — | `audio/mpeg` | 401/404 |
| `POST /admin/v1/tile-voice/review` | `{ids:[…], review:"approved"\|"rejected"}` | `204`; `rejected` also sets `status=withheld` | 401 |
| `POST /admin/v1/tile-voice/remint` | `{id, mode:"plain"\|"ipa", ipa?}` | new clip, `version++`, `status=ready`, `review=unreviewed` | 401, 502 |
| `GET /admin/v1/tile-voice/held` | — | `[{locale, text, reason, count}]` | 401 |
| `GET /admin/v1/tile-voice/row/<id>` | — | `{row}` — one clip's full ledger row | 401/404 |
| `GET /admin/v1/tile-voice/usage?from=<ms>&to=<ms>` | — | `{mints, chars}` — vendor-spend events in the window (WT9) | 401 |

Admin routes are on the same Worker; `PIP_ADMIN_TOKEN` is a Worker secret. No
admin UI is served from the Worker (§ 7).

### 4.7 Limits and the budget breaker (silent, per 024 § 6a)

Cache **hits are free and uncounted**. Only fresh mints count. Unit is
**new words (mints)**, not characters.

| Limit | Value | Mechanism |
| --- | --- | --- |
| Text length | 60 chars | § 4.2 |
| **Global new words per UTC day** | **500** (`TILE_DAY_MINTS` var; raise after real data) | ledger DO counter row per UTC day; at the cap → 503 `budget` |
| Per-license new words per day | 100 | reuse `usageCheck` / `usageRecord` (`src/worker/voice.js`), ns `usage-tile` |
| Per-license mints per minute | 20 | same; a **runaway-client guard**, not a user limit — a sequential client cannot exceed ~20/min at 1–3 s per mint; bulk add paces itself under it (equals 024's `MINUTE_REQUEST_BURST`) |

- **At the global cap:** no vendor call. The client shows *"{name}'s voice for
  this word will be ready tomorrow"*, keeps the word queued locally, and
  retries after the UTC day rolls. Nothing is lost and nothing falls back to
  another voice.
- **80% alert:** when the day's count crosses 400, the ledger writes a
  `tile-alert/<date>` marker and the review tool shows a banner (and the
  Worker logs it). Wiring a push/email alert is optional and outside this phase.
- Every limit hit is logged (`usage-tile-hits/…`), as in 024. If a real
  supporter ever hits the per-license cap, the cap is wrong.
- **Vendor-side hard stop (ops, not code):** keep ElevenLabs **overage
  billing off**. If credits run out, upgrade the plan or buy credits. Size
  the plan from the cap: `30 × TILE_DAY_MINTS × ~10 chars` per month, and
  remember a bulk seed (slice 7) is a one-time spike.

## 5. Client

### 5.1 Playback resolution

`resolveSlot` (`public/shared/voice.mjs`) entity branch: override still wins.
Otherwise return a new type `{ type: "tileclip", voice, locale, text }`
instead of `{ type: "tts" }`. The player resolves it through a new
`public/shared/voice_tile.mjs` (modeled on `voice_sentence.mjs`):

1. Cache Storage lookup `https://voice.local/tile/<voice>/<sha256(normalizeV1(text))>`.
2. Hit → play. Miss → `POST /api/v1/voice/tile`; on 200 store + play.
3. Any failure → **silence** (never device TTS). The word card shows the
   state (§ 5.4). The `text` field on today's clip results is kept so callers
   that show captions still work; it is no longer a spoken fallback for these.

`{ type: "tts" }` remains only for a bundled voice whose `source =
device_tts` (a user who explicitly picked a device voice keeps it — their
choice, not our fallback). Keyboard `typed` items resolve to `tileclip` too
(§ 5.6).

### 5.2 Add / rename flow (the primary path)

Hook points: `createEntity` and `renameEntity` in `public/shared/groups.mjs`
callers in the add UI (`src/board/add_flow.test.mjs` shows the flow;
bulk path: `bulk_add.test.mjs`; library adds: `library_add.test.mjs`).

- On save, the editor immediately starts `voice_tile.ensure(text)` and shows
  **"Making {voice display_name}'s voice for '{text}'…"** on the new tile.
  The tile is usable in layout at once; it plays only when ready.
- Ready → state clears silently.
- `held` → *"A voice for this word isn't available yet."* + **Record** button.
- `budget` → *"{name}'s voice for this word will be ready tomorrow."* The
  word stays queued and retries after the UTC day rolls.
- `failed`/offline → *"Couldn't make {name}'s voice. Try again."* + **Try
  again** + **Record**. Offline: the request queues and retries on reconnect.
- Rename recomputes the key; the old clip stays in the ledger untouched.
- The child-facing board never triggers a mint from a tap. A tile whose clip
  is missing on this device (new device, cleared cache) fetches once — a
  ledger hit, ~100 ms; if that is also impossible (offline), it is silent and
  the supporter sees the "not downloaded" badge on next edit.

### 5.3 Bulk add and prefetch

- Bulk add (`bulk_add`): mint sequentially, ≤ 10 concurrent-free, one progress
  line ("Making Eve's voice, 12 of 50"); respects 429 by pausing.
- **Prefetch** on device link/restore, voice switch, and app start (idle):
  for every active entity name + label without a local clip, request it. Hits
  are free; misses mint (they are the user's own words).
- Once a day: `GET …/tile/replaced?since=` → evict those hashes from Cache
  Storage so a rejected clip is not replayed forever.

### 5.4 Voice switch

Switching the board voice shows progress ("Making Eve's voice, 12 of 40") and
**keeps the old voice on the board until the new set is complete**; voices
never mix on one board. Misses mint; everything else is a hit. Failures leave
the old voice active and offer retry.

### 5.5 Overrides and the flag

- **Record** (existing `setOverride`/`clearOverride`) is per-user, private,
  wins over everything, and **never touches the shared clip**.
- Word card gets **"Sounds wrong"** → `POST …/tile/flag`; the tile keeps
  playing. Flag is a review signal, not a takedown. **Entity cards only**
  (shipped): catalog words resolve to the catalog clip pipeline, which
  has its own review path — the flag targets a minted clip, so it shows
  where `resolveSlot` can return `tileclip` (entity names, typed words).

### 5.6 Keyboard text

- When a typed word is **committed** to the message bar (space, enter, or
  accepting a suggestion), the client requests its clip in the background
  (`source: user_keyboard`). **Never per keystroke.**
- ▶ and word taps resolve `typed` items to `tileclip`. If a word's clip is
  not ready when ▶ is pressed, that word is silent in the word-clip fallback
  (whole-sentence Grok audio, 024, is unaffected). Tapping a typed word alone
  shows *"Making {name}'s voice…"* once; afterwards it is cached.
- Typos will mint junk; that is accepted. The `user_keyboard` tag lets the
  review page filter the noise, and the per-license and global caps bound the
  cost. No hand-written "is this a real word" rule.

## 6. Automatic hints at mint time (never gate serving)

Recorded in `checks`, shown as badges in review:

- `duration_ok`: estimated duration within `[0.15 s, 0.5 s + 0.12 s × chars]`.
- `silence_ok`: file is not near-zero-size for its character count.
- (Optional, review-side only, slice 5) round-trip ASR of the mp3 with the
  existing Groq transcriber (`scripts/catalog/transcribe_groq.mjs`) compared
  to the text: mismatch → badge. A hint like the lab acoustic gate, not a gate.

## 7. Review page (founder spot-check, non-blocking)

Local tool, consistent with the other `audio-review-*` pages — **no public
admin UI**:

- Route added to `scripts/catalog/audio_review_dev.mjs`:
  `http://127.0.0.1:3747/audio-review/tile-voice`, page
  `public/audio-review-tile-voice.html`. It proxies the § 4.6 admin routes
  using `PIP_ADMIN_TOKEN` and the Worker base URL from `.env`
  (`PIP_TILE_ADMIN_URL`).
- Default view: **newest first**, all sources. Filters: source
  (`user_typed` / `user_keyboard` / `seed` / `catalog_lazy`; keyboard noise is
  easy to hide), review (`unreviewed` / all),
  flagged only, held words tab.
- Per row: text, voice, source badge, created time, auto-check badges, ▶ play,
  **✓ approve**, **✗ reject**, **Remint (plain)**, **Remint (IPA)** (uses the
  existing Groq IPA lookup, `ipa_lookup_groq.mjs`), and "approve all shown".
- Reject → `withheld` immediately (tile goes silent for everyone until a
  remint is approved). Remint → new version → devices evict via the replaced
  list (§ 5.3).
- No cadence is assumed; nothing waits on this page.
- Existing lab pages keep working for bulk seed review.

## 8. Privacy

- Typed text goes to ElevenLabs (a vendor) **without any identity** — no
  user/device/license id is sent (same rule as 024 rule 8). This includes
  names; a child's name spoken in the human voice is the point. The privacy
  policy text must say typed word labels are sent to a voice provider.
- R2/ledger hold text + audio with **no user linkage**. The public cannot read
  either: no public bucket access; every read is license-gated by the Worker.
- Personal photos, Jev `personal` scope, and family data never enter this
  path. `catalog_candidate` promotion (art) is unchanged and independent.
- Held words are stored as anonymous `(locale, text, count)`.

## 9. Policy amendments (this phase must land them)

`AGENTS.md` Project Laws, replace the audio-replacement bullet's scope so it
matches what is now true:

> **Never replace shipped catalog audio, or bulk-mint (>10 clips), without
> explicit founder approval.** Mint locally, ten clips at most, and wait for a
> listen. **Exception (028, founder 2026-09-29):** the on-demand tile mint
> path may create new clips automatically for authenticated supporters' typed
> text, within the per-license and global budget caps, into the `tile/`
> namespace only. It never edits or replaces an existing clip; replacement is
> a founder action in the review tool.

The default tile voice rule is unchanged: ElevenLabs/human default, Grok
sentences only, no silent swap.

## 10. Slices (each: read route → name truth owner + proof → focused proof → deslop → commit)

Order matters; each slice is independently shippable. Tests are the proof
named under it; add Works Test ids from § 11.

**Slice 0 — v3 cleanup (no behavior change; do not mix with slice 1).**
v3 is retired; the only model is `eleven_v4`.
- *Docs (done with this doc, 2026-09-29):* `ElevenLabs_Tile_Minting.md` v3
  variation table and "legacy v3 path" wording;
  `Grok_Voice_Synthesis_Best_Practices.md` § 10 backup model;
  `Language_And_Voice_Schema.md` § default voice line.
- *Code/data (implementer):* `scripts/catalog/elevenlabs_tts.mjs`
  (`DEFAULT_MODEL` → `eleven_v4`; drop the v3 settings branch);
  `build_elevenlabs_tile_queue.mjs` and `build_elevenlabs_forms_queue.mjs`
  (`?? "eleven_v3"` → read `voices.json`, fail if absent);
  `generate_missing_audio.mjs` header; `elevenlabs_tile_variations.mjs`
  (v3 variation matrix — delete or reduce to plain if still referenced);
  `elevenlabs_v4_lab.mjs` + `.test.mjs` (`V3_MODEL`, `v3_*` variation ids —
  keep only ids that appear in existing take filenames, marked legacy read-only,
  or migrate the takes); `audio_review_dev.mjs` line ~575 regex;
  `public/audio-review-elevenlabs-tiles.html` banner (`eleven_v3` claim);
  `explore_grok_batch.mjs`, `transcribe_groq.mjs` (check each hit).
  Forward config in `data/samples/elevenlabs-{tiles,forms}-core/recipes.json`
  → `eleven_v4`. **Do not rewrite historical records** of what was actually
  minted (e.g. `data/samples/voice-clone/manifest.json`).
- *Proof:* `grep -rniE "eleven_v3|eleven ?v3" . --exclude-dir=node_modules
  --exclude-dir=.git` returns only allowed historical records (list them in
  the commit body); `npm run check:fast` green; a dry `catalog:tiles:queue`
  produces `eleven_v4` recipes.

**Slice 1 — Worker mint core (no client).**
Files: `data/catalog/tile_voices.json`; `src/shared/tile_recipe.mjs`
(extract from the lab; lab re-exports; existing lab tests stay green);
`src/worker/tile_ledger.mjs` (pure SQL ledger logic over a minimal `sql`
interface so it is unit-testable with the same SQLite driver the board tests
use); `src/worker/tile.js` (routes, validation, quotas; `TileLedger` DO class,
a thin wrapper around the pure logic); route wiring in `src/worker/index.js`;
`wrangler.jsonc` (DO binding `TILE_LEDGER`, migration `{"tag":"v5",
"new_sqlite_classes":["TileLedger"]}`); secrets `ELEVENLABS_API_KEY`,
`PIP_ADMIN_TOKEN`; var `TILE_DAY_MINTS` (default 500).
- Synth seam: `env.TILE_SYNTH(mintText, {voice})` for tests (like
  `VOICE_SYNTH`). **Local dev default is a stub** (a short silent mp3, header
  `x-tile-cache: stub`) unless `TILE_LIVE=1` **and** `ELEVENLABS_API_KEY` are
  set — dev servers must never spend money by accident.
- Proof (`src/worker/tile.test.mjs`, light; DO behavior in
  `src/worker/tile.heavy.test.mjs`): Works Tests 2, 3, 4, 5, 6, 7, 8 (§ 11).
- Exit: none beyond the proof (licensing is settled, decision 9).

**Slice 2 — Client playback and add flow.**
Files: `public/shared/voice_tile.mjs` (+ test, fake `caches` like
`voice_sentence` tests); `public/shared/voice.mjs` (`tileclip` type; entity
branch); `public/board.js` player for `tileclip`; add/rename/bulk UI states
(§ 5.2–5.3) in the editor code paths exercised by `add_flow`, `bulk_add`,
`library_add` tests; prefetch; keyboard commit hook and `typed` → `tileclip` (§ 5.6); voice-switch progress (§ 5.4) — the switch UI
may land with slice 6 if there is only one voice.
- Proof: Works Tests 1, 10, 11, 12, 17; `resolveSlot` unit tests (override wins,
  tileclip for entity, tts only for typed/device voices); update
  `src/board/entities.test.mjs`/`voice_sentence.test.mjs`-style tests.
- Founder view: `http://localhost:21087/?reseed` (agents preview with
  `npm run dev:agent`; dev mint is stubbed unless `TILE_LIVE=1`).

**Slice 3 — Review tool.**
Files: `public/audio-review-tile-voice.html`; route + proxy in
`scripts/catalog/audio_review_dev.mjs`; admin routes finished in
`src/worker/tile.js`; `npm run tilevoice:review` alias; doc: add the URL to
`ElevenLabs_Tile_Minting.md`.
- Proof: Works Test 13; admin routes 401 without token (light test).

**Slice 4 — Flag, reject, remint, replaced list.**
Word-card "Sounds wrong"; `tile/flag`; `withheld` handling in the client
(silent + Record offer); daily `replaced` sweep; remint modes.
- Proof: Works Tests 14, 15.

**Slice 5 — Reconcile + optional ASR hint.**
`scripts/catalog/tilevoice_reconcile.mjs` (`npm run tilevoice:reconcile`):
compares ledger minted characters for a window to the ElevenLabs usage
counter delta over the same window; prints both and the gap, plus the measured **credits per character** for
`eleven_v4` (the plan sizing input). Optional: ASR
badge in the review page (§ 6).
- Proof: Works Test 9 (the reconcile is the instrument).

**Slice 6 — Leo (second voice).**
Flip `voi_leo_en` from `planned` to `active` in `tile_voices.json` and add the
`voi_leo_en` "Leo" `voice` row with the catalog import. **Gate:** Leo is
selectable only when launch-set seed coverage for Leo is 100% (coverage tool),
otherwise switching would silence catalog tiles. Seeding Leo's launch set
(~1,087 utterances) is a **bulk mint — explicit founder approval and cost
first** (slice 7 machinery). Voice-switch UI and prefetch backfill (§ 5.4).
Pre-seeding Leo's top-N words is optional, same gate.
- Proof: Works Tests 12 (voice switch), 16, 18.

**Slice 7 — Seed + backfill (founder-gated bulk).**
Ledger rows for existing catalog clips (`source=seed`, pointing at their R2
paths) so identical typed text hits. Bulk pre-seed of default-voice clips for
the extended lexicon uses **this same mint core** with `source=seed`, driven
by the queue tooling in `Catalog_Tile_Voice_Coverage_Plan.md` (phases A–C
there remain the inventory). Never run without explicit founder approval and
cost. Bulk seeds are a one-time credit spike: check the plan tier first
(the measured credits/char from slice 5, ~4k extended words ≈ 40k chars per
voice).

**Slice 8 — `catalog_lazy` (after 010 slice 3).**
A catalog sense with no ready clip, placed by a supporter, requests a mint
with `source=catalog_lazy` (today it is silence). Same endpoint, same ledger.

## 11. Works Tests

1. **Add speaks, in the chosen voice.** Add "scientist" with voice V on a
   fresh profile: editor shows "Making {name}'s voice…", then the tile plays a
   clip whose R2 key is under `tile/V/`. No `speechSynthesis` call occurs
   (spy on `speechSynthesis.speak` — assert zero).
2. **Dedupe.** Two licenses request the same `(voice, locale, text)`; the
   synth stub is called **once**; second response has `x-tile-cache: hit`.
   Case/space variants ("Scientist ", "scientist") collapse to one key.
3. **Single flight.** Ten concurrent requests for one new key → exactly one
   synth call, ten 200 responses, one ledger row.
4. **Held.** locale `es`, and text `你好`, and `[whispers] hi` → 422 `held`,
   zero synth calls, `tile_held` counts incremented, no `tile_clip` row.
5. **No identity.** Inspect every `tile_clip` and `tile_held` column and every
   object under `tile/` after a run: no user id, device id, or license string
   present; the synth stub's arguments contain only the mint text and voice.
6. **Recipe parity.** `tileMintText("coughing")` equals the lab's lexical-guard
   text; `laughs`/`laugh`/`laughing` get the lab's IPA override; a plain word
   is passed through unchanged.
7. **Limits.** 101st fresh mint by one license in a day → 429 `fair_use`; 21
   mints in a minute from one license → 429; cache hits never count. With
   `TILE_DAY_MINTS` set low, the next mint → 503 `budget`, no vendor call, no
   fallback voice; the client queues and retries after the UTC roll (fake
   clock); the 80% marker is written once.
8. **Failure isolation.** Synth throws → 502, row `failed`, no R2 object;
   an immediate retry inside `retry_after` returns 502 without a vendor call;
   after `retry_after` it mints.
9. **Billing truth (instrument the code can't influence).** After a
   controlled live run of N distinct new words (≤10, founder-approved):
   ElevenLabs' usage character counter delta equals the ledger's minted
   characters for that window, and repeated requests add zero.
10. **Child never waits.** The child board render/tap path issues no
    `/voice/tile` request for tiles whose clip is cached; the only network
    call on a cache miss is the ledger hit, and it never blocks a different
    tile's playback.
11. **Failure states are visible and silent-safe.** Force `held`, 502, and
    offline: each shows its message, offers Record, and produces no device-TTS
    audio (spy = zero calls).
12. **Voice switch.** Switch A→B on a board of 40 entities: progress shown,
    A keeps playing until B completes, then plays B clips; no mixed board.
13. **Review page.** With 4 seeded ledger rows (2 `user_typed`, 1 `user_keyboard`, 1 `seed`), the
    page lists newest first, filters by source, ▶ plays, approve sets
    `review=approved`, reject sets `withheld`, and the `seed` row is
    distinguishable at a glance.
14. **Flag.** "Sounds wrong" sets `flagged`, the tile keeps playing, the row
    sorts first under "flagged only".
15. **Reject → remint → devices update.** Reject makes the clip 409/silent;
    remint (mode ipa) bumps `version`; a device with the old clip evicts it on
    its next `replaced` sweep and fetches the new one.
16. **Override safety.** A user's Record override wins locally and leaves the
    shared clip's `hits`, `version` and R2 object untouched.
17. **Keyboard commit.** Typing "h-e-l-l-o" issues zero requests until the
    word is committed, then exactly one (`source: user_keyboard`); ▶ with the
    clip cached plays it; ▶ before it is ready is silent for that word and
    never speaks via `speechSynthesis` (spy = zero calls).
18. **Leo gate.** With Leo `planned`, the picker does not offer him and the
    Worker answers 400 `bad_voice`; with Leo `active` but launch coverage <
    100%, the picker still does not offer him.

## 12. Out of scope

- **Sentence ▶ word-clip fallback** (024 rule 1) will pick up user-minted
  clips only if the sentence path is taught to read the tile cache — a 024
  follow-up, not this phase.
- Non-English auto-mint (v2), a child-voice provider, Grok as a tile voice,
  changing `catalog_candidate` promotion rules, image generation.

## 13. Config (founder-set 2026-09-29; all config, not code)

| Knob | Value | Where |
| --- | --- | --- |
| Global new words / UTC day | 500 | `TILE_DAY_MINTS` var |
| Per-license new words / day | 100 | Worker const in `tile.js` |
| Per-license mints / minute | 20 (runaway guard) | same |
| Text max | 60 chars | same |
| Failed-mint retry delay | 30 s | ledger const |
| Voice names | Eve (default), Leo (male, planned) | `tile_voices.json` |
| ElevenLabs overage billing | off | vendor account |

## Related

- `docs/operations/Catalog_Tile_Voice_Coverage_Plan.md` — bulk inventory and
  phases A–C (seed clips through the same mint core, slice 7)
- `docs/operations/ElevenLabs_Tile_Minting.md` — current review pages and lab
- `docs/phases/024_Sentence_TTS_And_Audio_Cache.md` — pattern source
- `src/worker/voice.js`, `public/shared/voice_sentence.mjs` — code to mirror
- `docs/phases/010_Extended_Picture_Library.md`
