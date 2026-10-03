# 039 — The Free Taste: let everyone feel ✨ ❓ ⏪ ⏩ before paying

**Status:** built 2026-10-03 — pool DO (`taste.mjs` on the shared
TileLedger DO), speak grants, per-IP cap, client counter and asks. Held
from deploy by two named gates: founder sign-off on the § 4.5 strings
and a founder listen of the four tour takes before `--ship` (§ 7).
**Read first:** `docs/product/Sentence_Bar.md` (what the buttons do — never
infer their outputs) and `docs/product/Pricing_And_Packaging.md` § 4.2.
**Truth owner:** the Worker. The count of free taps left lives server-side;
the client only displays it.
**Proof owner:** one Works Test (§ 8) plus Worker tests for each gate.

## 1. Why

Free users get full communication. The sentence buttons are the part of Pip
nobody else has, and today a free user's first tap on ✨/❓/⏪/⏩ hits "comes
with Pip Lifetime" — a wall *before* they have felt anything. The product
sells itself once heard with their own child's words. So: **give every user a
one-time taste of the real thing, then ask.**

## 2. Decisions (founder, 2026-10-03)

- **Buttons stay visible to everyone.** Never hide a paid button from a free
  user — the button is the advertisement.
- **10 free taps per user, one time, shared across ✨ ❓ ⏪ ⏩.** Not daily (no
  recurring denial to a child), no expiry (no time-bomb: Pricing § 3). Same
  spirit as the 5 free drawings.
- **A "tap" = one successful model call** (the Worker returned text).
  Failed calls, offline presses, ▶ restore, and ❓ on an existing question
  (re-speak) cost nothing.
- **The taste is the real product**: real transform *and* the real sentence
  voice speaking the result, with the question intonation. A transformed
  sentence read word-by-word is a worse product than Lifetime and would
  undersell it (§ 3.2).
- **Never block the child.** At zero the press still speaks the bar as built
  (existing behavior). The ask goes to the adult, never the child.
- **Honest copy only.** The buttons are a grammar pass on her own words and
  never add words (`Sentence_Bar.md`). Copy may not promise more.
- **The first-run tour is not the taste.** The tour is scripted: recorded
  sentences, no model call, no cost, no latency (shipped; see § 7).
- Groq cost is a non-issue (founder). Sentence-voice (ElevenLabs) cost is real
  but bounded by the pool, the shared R2 cache and the abuse cap (§ 4.3).

## 3. What the code does today (traced 2026-10-03)

1. Every model button → `transformAndSpeak(mode)` in `public/board/speech.js`
   → `POST /api/v1/transform` sending `license: await voiceLicense()`
   (null for an unlicensed user).
2. `src/worker/transform.js` → `checkLicense(...)`; false → `403 bad_license`.
   Client toast: "<name> comes with Pip Lifetime — a grown-up can unlock it in
   Settings" + *Open Settings* action (`speech.js`, `openSettings("you")`).
   The press then speaks the bar as built.
3. **Speaking the *result* is also license-gated.** `speakSentence` →
   `sentenceVoice.request({license})` → `POST` voice (`src/worker/voice.js`
   `handleSpeak`), which runs `checkLicense` **before** it even serves an R2
   cache hit (`voice.js:138`). Unlicensed → `bad_license` → the client falls to
   the word-by-word clip loop: no sentence voice, no `?` intonation.
   *(This is why the tour ships recorded clips.)*
4. Fair use already exists: transform 20,000 chars/day and 30 req/min;
   voice has its own (`usageCheck` / `usageRecord` in `voice.js`, counters in
   the `VOICE` R2 bucket keyed by `uid`).
5. License = HMAC token bound to the user id (`src/worker/license.mjs`).
   Purchase flow (Stripe checkout + webhook + codes) exists from phase 015.

## 4. Build

### 4.1 Worker: the taste pool (`src/worker/transform.js` + new `taste.mjs`)

- `TASTE_POOL = 10` (one constant; founder may tune).
- `tasteLeft(env, uid)` / `tasteSpend(env, uid)`: persistent count keyed by
  `uid`. Atomic spend is required (two parallel presses must not both take
  the last tap). The R2 read-modify-write used by `usageRecord` is *not*
  atomic — prefer a Durable Object (pattern: `TileLedger` in
  `src/worker/tile.js`) or SQLite-in-DO; developer's call, justify in the PR.
  Storage is two integers per user; no content is stored.
- In `handleTransform`: if `checkLicense` fails →
  - pool > 0: continue the normal path (same prompts, same fair-use gates),
    and **spend one tap only when the model returned text**. Response gains
    `taste: { left }`.
  - pool = 0: `403 { error: "taste_exhausted" }` (new code; `bad_license`
    remains for malformed/forged licenses so the client can tell them apart).
- Licensed users: behavior unchanged; no `taste` field.

### 4.2 Worker: let the taste speak (`src/worker/voice.js`)

- When `transform` spends a taste tap it also records a **speak grant** for
  that user and that exact output text: key `taste-grant/<uid>/<sha256(text)>`
  with a timestamp (R2 has no TTL — reject grants older than ~10 min and
  sweep with the existing reconcile cron if one exists).
- In `handleSpeak`: if `checkLicense` fails, look for a valid grant for
  `(uid, text)`; if present → proceed (cache hit or fresh synth, same as a
  licensed user, `feeling: neutral` only) and **consume the grant**. No grant →
  `bad_license` as today. A grant never covers other text, other feelings, or
  a second play (re-speak of the same bar is served by the client's local
  audio cache; do not re-grant).
- Mind the existing order: the cache-hit return happens after the license
  check — the grant check goes in the same place.

### 4.3 Worker: abuse limits

**The allowance is 10 per person, once, ever — there is no daily or per-IP
allowance.** The only extra limit is anti-farming: a new profile = a new user
id = a new 10, so cap how many **new tasting profiles** one connection may
start per day (placeholder: 5, one constant; hashed per-IP day counter, no IP
stored). Over the cap → `taste_exhausted`, as if that profile's pool were
empty. A real family (2–3 children) never notices; a farmer must keep creating
profiles and gets nothing permanent. This is a speed bump, not a wall —
profiles are local with no sign-in, so farming cannot be fully prevented, and
10 taps cost pennies. Existing minute-burst and daily-char fair use still
apply. Sentence-voice spend per taste tap is at most one fresh synth (cached
text is free, shared across users).

### 4.4 Client (`public/board/speech.js`, `public/board.js`)

- Read `taste.left` from the transform response; keep it in a small observable
  (`live.tasteLeft`, session only — the server is the truth; refresh from the
  next response, and expose it on a cheap `GET`/field if the settings screen
  needs it before any press — developer's call).
- Errors: `taste_exhausted` → the ask (§ 4.5) instead of today's
  "comes with Pip Lifetime" toast. `bad_license` toast stays.
- Everything else is unchanged: the press still speaks, offline still toasts,
  ▶ still restores with no call.

### 4.5 The ask (adult-facing; the child never sees a number or a wall)

- **Quiet counter:** Settings → Talking menu subtitle appends
  "· 7 free left" while the person is unlicensed and the pool is below 10
  (pattern: `settings-ui.js` talking subtitle, `onOff` helper).
- **At 3 left:** one non-blocking toast per day (not per press), after the
  press has spoken: "3 free left — keep ✨ ❓ ⏪ ⏩ for good: $49 once." with an
  *Open Settings* action (existing `openSettings("you")` → Your account →
  checkout).
- **At 0 (`taste_exhausted`):** the press speaks the bar as built (existing),
  and the toast carries the offer. Do not repeat every press — once per
  session, then only the quiet counter.
- **Copy rules:** use the real count from the local tap log where available
  (`logTransform`, `learner_event_log`; e.g. "Pip used ❓ 6 times this week")
  — a number from her own taps, never an invented claim. Never say Pip builds
  her sentences or guesses meaning (`Sentence_Bar.md` § The one law). No
  money-back or other guarantee unless the founder adds one. **All final
  strings need founder sign-off before ship** (marketing voice per memory:
  direct-response, but true).
- Unlicensed UI must not look broken: the buttons look and behave exactly like
  licensed ones until the pool is empty.

### 4.6 Docs to update in the same PR

- `docs/product/Pricing_And_Packaging.md` § 2 tier box and § 4.2 table: add
  "10 free ✨ ❓ ⏪ ⏩ taps, one time" to Free; keep unlimited for Lifetime.
- `docs/product/Sentence_Bar.md` § Gates and failure: replace the "every model
  button needs Pip Lifetime" line with the pool rule; add `taste_exhausted`.
- `docs/phases/README.md` row; this doc's status banner.

## 5. Not in scope

- Daily limits, trials by time, or refills.
- Feeling-face voice variants for the taste (neutral only).
- Changing prompts or what the buttons produce.
- Auto-hiding buttons or choosing presets for anyone (phase 038 is the adult's
  setting).
- Marketing-site changes (separate: lead with "same words, asked as a
  question — never puts words in her mouth").

## 6. Privacy & safety

Counts keyed by user id and a hashed per-IP day counter only; no sentence text
is stored (grants are keyed by a hash and consumed). Same footing as the
existing `usage` counters. Not a data-retention change; no new telemetry
fields. Child never gated, never shown a price. Billing logic is untouched —
checkout and license issuance are the existing 015 path.

## 7. The tour (separate slice, not built — do it first, it is small)

The current tour is **untrue**: it taps *want · apple* and scripts ✨ →
"I want an apple.", but the live button returns "Want an apple." (the wand law
never adds a subject). Replace it. Everything stays **scripted with recorded
clips — no model call, no cost, no latency, works offline** (first-run users
are unlicensed, so the live voice would be silent anyway; every sentence is
minted once and shipped):

- Taps: **you · want · apple** (`sns_0002`, `sns_0013`, `sns_0128`).
- ✨ → bar shows and speaks "You want an apple." (clip `you-want-an-apple`).
- ❓ → "Do you want an apple?" (clip `do-you-want-an-apple`). Question is
  toured; ⏪/⏩ are not (grammar goals, taught later via Spotlight).
- Both results were verified live 2026-10-03 on the production prompts
  (`Sentence_Bar.md`, table). Do not tour ❓ on an "I …" sentence ("Do I want
  an apple?").
- New instruction clips: `tour-you` ("Tap you.") and `tour-question` ("Now tap
  the question mark to ask it."). Drop `tour-past`, `i-want-an-apple`,
  `i-wanted-an-apple` from `public/shared/onramp_audio.mjs` and the tour.
- Honour phase 038: steps appear only for buttons the person has
  (`board.shownControls()`); update `src/board/tour_audio.test.mjs` to the new
  clip keys; the done-card note should read "✨ and ❓ work on any sentence you
  build" (offline variant: need the internet).
- **The four new takes are already minted** locally (gitignored,
  `data/samples/onramp/takes/`: `tour-you`, `tour-question`, `you-want-an-apple`,
  `do-you-want-an-apple`; re-mint with `node scripts/voice/mint_onramp.mjs
  --only …`). **Founder listens, then** `mint_onramp.mjs --ship` and
  `scripts/sw/sw_manifest.mjs`. Do not deploy the tour code before the clips
  ship — the new steps would be silent.

## 8. Works Test (owner-visible)

On a fresh profile with no license, on a real device, online:
1. Tap *you want apple* and press ❓ — hear "Do you want an apple?" in the
   product voice with a question lift (not word by word).
2. Repeat ten successful presses across ✨ ❓ ⏪ ⏩; the Talking subtitle counts
   down; the toast appears at 3 left.
3. Press an eleventh time — the bar still speaks as built, the offer toast
   shows once, no further toast on the next press.
4. Go offline, press ✨ — "needs the internet", spoke as built, count
   unchanged.
5. Unlock with a license (dev license path) — unlimited, counter gone.

## 9. Worker tests

`transform.test.mjs`: unlicensed + pool → text + `taste.left`; failed Groq
call spends nothing; pool 0 → `taste_exhausted`; forged license → `bad_license`;
parallel last-tap race spends once; IP cap. `voice.test.mjs`: grant allows
exactly that text once; wrong text / second use / expired grant →
`bad_license`; licensed path untouched.

## 10. Open items for the founder (the developer should not guess these)

- Final ask strings (§ 4.5).
- New-tasting-profiles-per-connection cap (5/day is a placeholder). Note schools: a classroom of kids on one network may hit it — fine if schools buy codes (`/schools`) rather than taste.
- Whether the quiet counter should also show on the Overview screen.
