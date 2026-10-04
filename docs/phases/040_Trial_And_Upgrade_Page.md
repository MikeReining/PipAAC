# 040 — The 7-day trial and the Pip Lifetime page

**Status:** built 2026-10-04 (`f7455246`, `a7e33b60`) — the 7-day trial
replaces 039's pool; the Lifetime page tops Settings. Owed: founder
sign-off on page/toast strings + a listen of `demo-sentence`, then
`--ship` + deploy + Works Test. Founder decisions 2026-10-03
(chat); items marked **Founder confirm** are my recommendations, not rulings.
**Supersedes:** 039's *pool* (10 taps). 039 shipped (`360ba07`, `c2db8c3`,
`ef19c12`, docs `2b074d9`); this phase replaces its gate with a trial and adds
the page that sells Lifetime. The tour rewrite from 039 **stays**.
**Read first:** `docs/product/Sentence_Bar.md` (what the buttons do),
`docs/product/Pricing_And_Packaging.md` § 4.
**Truth owner:** the Worker decides "entitled"; the Settings page only renders
it. **Proof owner:** Worker tests per gate + one Works Test (§ 9).

## 1. Why

Two problems. (1) Nobody can buy: today's only Buy button is the locked
Progress page (`progress-ui.js`, `#prog-buy`), and for anyone not signed in it
drops them on a "License key or PIP- code" box (`index.html` `#dev-lifetime-row`)
— a place for people who already bought. The ❓ failure toast lands on the same
box. The "Your account" page is the last sidebar item and its sign-in row is
hidden until the board is synced (`devices-ui.js renderAccount`). (2) The
expensive features need a clear, simple line between free and paid and a
standard way to try them: **a 7-day trial from install**, then Lifetime.

## 2. Decisions (founder, 2026-10-03)

- **7 days of every paid feature, starting at install** — the standard mobile
  trial. Not "first use of a paid button" (more complex, nothing gained).
  **One time per person. No extension.** One constant: `TRIAL_DAYS = 7`.
- The 10-tap pool (039) is **removed**. Nothing is counted any more.
- After the trial: nothing is locked or removed from the screen. Free stays
  free forever (§ 3). Paid buttons stay visible; a press speaks the bar the
  free way and the adult gets the ask.
- New paid items (reverses two § 4.4 "rejected levers" — update that table):
  **feeling faces**, **choosing a voice**, and the **natural full-sentence
  voice itself** (even for a plain present-tense Play). Free = every word
  speaks, one word at a time, in the default product voice.

## 3. The line: free forever vs Pip Lifetime

Source of each row in parentheses. This is the list the page, the site and the
app copy must use — do not drop or add rows without editing this table.

| Free forever | Pip Lifetime ($49 once, per person) | In the 7-day trial? |
| --- | --- | --- |
| Every word speaks, **one word at a time**, default voice | **Natural full-sentence voice** — Play on 2+ words (`voice.js` license gate; today free users fall to the word-by-word clip loop in `speech.js speakSentence`) | **Yes** |
| | ✨ Fix it · ❓ Question · ⏪ Past · ⏩ Future (`transform.js`) | **Yes** |
| | Feeling faces: excited, sad, angry (`voice.js` feeling variants; 025) | **Yes** |
| | Choose a voice (`voice-ui.js` picker; costs to mint per voice, 028) | **Yes** |
| | Voice for the words you type (`tile.js` on-demand mint, license-gated) | **Yes**, inside its existing per-license caps |
| | Progress: weekly charts, goal words, new words, PDF/IEP report (`progress-ui.js`, `report.mjs`) | **Yes** — shown in full, locked back to the preview after |
| 20 words of your own | Unlimited words of your own | **No** — structural, never unwound |
| One supporter (any of their devices) + that supporter's web editor | Every supporter, every web editor | **No** — structural, people are never removed |
| The user's own device | Sync across unlimited devices | **No** |
| 5 "Draw it for me" pictures | 300, then top-ups (`pictures_draw.js`) | **No** — has its own quota |
| Spotlight, prediction, groups, hiding words, Record my own, backup, QR card restore | (same) | n/a |

**Why the trial covers only the first six rows (Founder confirm).** They are the
cost-bearing, instantly reversible features. Words, supporters and devices hold
the family's data and people; taking them away on day 8 would mean deleting
words or removing a teacher. Those stay behind Lifetime during the trial.

**Spotlight: keep it free (Founder confirm).** It is not behind any licence
check today and is the most SLP-valued feature (aided language modeling).
Gating it would kill the loop that sells Lifetime: an SLP sets a Spotlight
goal → the goal feeds Progress → Progress shows the locked preview and
"What Lifetime adds" (`wincard-ui.js`) → the team buys. A free Spotlight is the
best upsell engine we have. Levers if wanted later, *not now*: a cap on saved
lists. Revisit with real usage.

## 4. Day 8 and the child

At expiry: Play on 2+ words becomes word-by-word; faces and ✨ ❓ ⏪ ⏩ press →
spoke as built + the adult ask (existing fallback path); a chosen non-default
voice reverts to the default (the choice is remembered and restored on
purchase); Progress returns to the preview. **Nothing is hidden from the
child's screen.** The change in how Play *sounds* is real and is the cost of a
trial — so the adult is told it is coming: countdown (§ 6.3), a heads-up on
days 5–6, and the ask at expiry. Cached audio already on the device may replay
offline; do not engineer around that, and do not delete it either.

## 5. Worker

### 5.1 One predicate
`entitled(env, uid, license) = checkLicense(...) || trialActive(env, uid)`.
Replace the license check with it in: `transform.js`, `voice.js` (sentence
speak, feeling variants, non-default voices), `tile.js` (the two license
checks at the on-demand mint routes), and wherever the voice list marks voices
"available". Licence-forged tokens stay a hard `bad_license`.

### 5.2 The trial record (ledger DO — keep what 039 built)
- Table `trial(uid PRIMARY KEY, started_at)`; reuse the shared ledger DO and
  `ensureSchema` pattern in `src/worker/taste.mjs`. The write is
  insert-if-absent, so it is atomic and idempotent.
- `trialActive = now < started_at + TRIAL_DAYS * 86400000`.
- **Start = install.** On first run (the welcome completing) the client calls
  `POST /api/v1/trial/start { user_id }`; offline first run → retry when online.
  First call wins, later calls return the existing record. Returns
  `{ endsAt }`. (This is first online boot, which is install in practice.)
- `GET /api/v1/trial?user_id=` → `{ licensed, endsAt | null }` (this replaces
  039's `GET /api/v1/taste`).
- Keep 039's **per-connection cap on new profiles** (`taste_ip`,
  `TASTE_IP_DAY_CAP`, hashed IP, no address stored): applied at
  `trial/start`. Over the cap → the profile starts with **no trial** (free
  forever only). A new profile otherwise = a new trial; this is a speed bump,
  not a wall, because profiles are local with no sign-in.
- **Delete from 039:** `taste_pool` and spend/refund logic, the speak-grant
  writer/reader (`writeSpeakGrant`, `taste-grant/` objects) and their paths in
  `transform.js` and `voice.js`, the `taste` field of the `/transform`
  response, `taste_exhausted`. Update `transform.test.mjs`/`voice.test.mjs`
  accordingly; add tests: trial active → paid paths allowed; day 7+1 → denied
  with the existing codes; second `trial/start` returns the same `endsAt`;
  forged license still `bad_license`; IP cap → no trial.

## 6. Client

1. Remove 039's `live.tasteLeft`, `tasteEcho`/`taste_text` echo, the 3-left
   toast, the `pip-taste-nag` key, and the Talking subtitle counter
   (`speech.js`, `board.js`, `settings-ui.js`, `voice_sentence.mjs`).
2. Mirror `endsAt` in `live.trial` from `trial/start` / `GET /trial`.
3. **Countdown (adult-facing only):** the top sidebar item (§ 7) reads
   "Free trial · 5 days left" until expiry. Toast once on day 5 and day 6 and at
   expiry, each with an action that opens the Lifetime page. Never on the
   child's board; never a modal.
4. At expiry a press of ✨ ❓ ⏪ ⏩ or a face → speak as built + one toast per
   session with the action (replaces today's "comes with Pip Lifetime … Open
   Settings → Your account" at `speech.js:~355`, which must now open the page).
5. The voice picker: non-default voices show a lock after the trial, and the
   active voice falls back to the default (store the chosen id, restore on
   purchase).

## 7. The Pip Lifetime page (the sales page)

**Entry:** the **first item of the Settings sidebar**, above Overview,
unlicensed only, in an accent colour (Founder: pick; not the red used for
stop/no tiles). Label: "Get Pip Lifetime · $49 once", with the trial countdown
under it. After purchase it becomes a quiet "Pip Lifetime ✓" at the end of
the person's group (the license is the person's), and the page itself turns
into "<Name> has Pip Lifetime" — what's on, and Add a device; nothing for sale
(founder 2026-10-04: a licensed iPad showed the sales page with no Buy).
"Has Lifetime" is one answer: the relay's entitlement. The device's stored
license is a copy `devices-ui.js reconcilePlan` keeps in step with it.
Add `lifetime upgrade buy price` to the search keywords (`settings-ui.js`).

**Every dead end routes here** (one destination, one button): the ❓/✨ ask,
a locked face, the voice lock, Progress's locked state (replace `#prog-buy`'s
fallback), the 20-word limit, the second-supporter and second-device walls
(`upgrade_required`, `devices-ui.js`), Overview's "What Lifetime adds" door.

**Page, top to bottom (the Settings page style — `set-sec`, `Design_System.md`):**
1. Hero: "Pip Lifetime. $49 once. No subscription. Every helper free." Trial line
   if active.
2. **Hear the difference** — two Play buttons for the same sentence: "Free: one
   word at a time" vs "Lifetime: a natural sentence", real recordings. Needs
   a few new shipped clips (≤10, mint locally, founder listen, then `--ship`).
3. The table in § 3, trimmed to words a parent reads; each paid row shows its
   real icon (✨ ❓ ⏪ ⏩, faces, the speaker). **Copy may never promise more
   than `Sentence_Bar.md`:** her own words, grammatical, never guessed.
4. One large Buy button — in every browser, iPad Safari included (Apple's
   in-app-only rule binds the future App Store app, not the web). Then a
   "Have a code?" card with the field itself, and "Buying for 10 or more?
   Half price" → `/schools` at the foot.
5. **"Send an unlock link"** for an SLP or grandparent to hand to whoever pays
   (§ 8).

## 8. Making the purchase actually work (no account, ever)

Today checkout needs a signed-in supporter account (`account.mjs checkout`
needs `acct_id` + `session`), and the Settings sign-in row is hidden until the
board is synced. A parent who taps Buy cannot buy.

- **No account to buy. Anywhere. Say so plainly.** Buying a licence never
  asks for an account, sign-in, or email-then-password step — in the app, on
  pipaac.org, or from a link. State it at every Buy button: "No account
  needed."
- **Build on what exists.** `POST /api/v1/checkout/codes` (commit `d1f3f2e`)
  is already unauthenticated: it takes a count, redirects to Stripe Checkout,
  and lands on `app.pipaac.org/codes.html`, where the webhook mints the codes.
  It is priced at $24.50 a code from 10 up. Extend it: **count 1–9 is $49 a
  code** (the licence is per person; 10 or more stays 50% off). Same
  idempotent order record, same bearer-code redeem path.
- **In the app** the Buy button uses that same route and returns to the app,
  where the code redeems automatically for this person (no pasting). The
  "Have a code or key?" box stays as the secondary path.
- **On the marketing site:** a "Buy Pip Lifetime · $49 once — no account
  needed" button on `/pricing` and the home page, using the same checkout.
  After payment the buyer gets the code on the confirmation page and by email
  (existing `EMAIL` binding) with a one-line "open the app → Settings → Get
  Pip Lifetime → Enter code". A buyer who has not created a board yet can buy
  first and redeem later.
- **SLP → parent:** "Send an unlock link" on the page shares that same
  no-account checkout (link or QR). Once bought **every supporter gets
  everything** (including the SLP who built the board).
- iOS stays Apple IAP only (Pricing § 4.5); this page links no web checkout there.

## 9. Docs, site, and proof

- `Pricing_And_Packaging.md`: replace the free-column "All voices" and the
  039 pool row; add the § 3 table; edit § 4.4 (voice switching and time-limited
  features are no longer rejected; say why: real per-voice and per-sentence
  cost, founder 2026-10-03); keep § 3 "no time-bomb" meaning *speech and
  vocabulary never lock* and say so.
- `Sentence_Bar.md` § Gates and failure: the pool rule → the trial rule.
- phase 039 (in git history): its banner read "Superseded by 040 (pool → trial)".
- **Audit pipaac.org** (`site/public/*.html`, `compare-data.json`) for any
  claim that natural full-sentence voice, feelings, voices or the sentence
  buttons are free. "Every word speaks, free, forever" stays true.
- **Works Test (owner-visible):** fresh profile, no licence, real device, online:
  (1) first run starts the trial and Play speaks a natural sentence;
  (2) ✨ ❓ ⏪ ⏩, a face, the voice picker and Progress all work;
  (3) with `TRIAL_DAYS` forced to 0 (test seam), Play is word-by-word, each
  paid button speaks as built and shows one ask, the voice reverts, Progress
  shows the preview, nothing is removed from the board;
  (4) the sidebar's top item opens the page from every entry in § 7;
  (5) Buy completes with no account; the licence turns the features back on;
  (6) offline first run: no trial starts until online; board still speaks.

## 10. Open for the founder

- Confirm the trial scope in § 3 (six rows) and Spotlight staying free.
- Accent colour; final page and toast strings; the "hear the difference"
  sentence.
