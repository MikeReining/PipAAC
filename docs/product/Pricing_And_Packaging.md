# Pricing, Packaging, and Ethical Monetization

**DECIDED 2026-09-22** (not built). **Amended 2026-09-23:** one price per
user, § 4. Where § 2 and § 4 disagree, § 4 wins.
**Amended 2026-10-03:** school codes are self-serve on the web at 50%
off **10** or more (was 20, by request).
**Amended 2026-10-04:** the 039 ten-tap pool is superseded by the 040
7-day trial; the voice features (natural sentence voice, sentence
buttons, faces, voice choice, typed-word voice, Progress) are the paid
surface and are tried, not gated forever. § 4.2's table is the canonical
list (`docs/phases/040_Trial_And_Upgrade_Page.md` § 3).
Intake: `docs/founder/2026-09-22_Customization_Pricing_VoiceCloning.md`,
`docs/founder/2026-09-23_Accounts_And_Pricing.md`.
Fact map: `docs/product/SSOT.md`.
Roadmap: `docs/strategy/Roadmap.md`.

---

## 1. The Core Law: A Voice is Not Rented

**DECIDED 2026-09-22** (not built).
A person's voice is a fundamental human right, not a monthly subscription service. 

Pip AAC establishes a permanent architectural and business invariant:
**Core offline communication functionality will never be locked behind a recurring monthly or annual subscription.**

### Why the Subscription Model Fails in AAC
1. **Ableist Exploitation:** Charging a recurring monthly fee for a non-verbal child or adult to speak forces families into an agonizing dilemma during financial hardship: pay the subscription or silence the child.
2. **The Institutional & Medicaid Lockout:** State assistive technology programs, school districts, and Medicaid/insurance providers fund AAC under Durable Medical Equipment (DME) or one-time educational software grants. By switching to a recurring \$10–\$15/month subscription, AssistiveWare (Proloquo 2022) made their software legally ineligible for state-funded reimbursements, cutting off low-income families.
   **UNVERIFIED** (2026-09-23): the "legally ineligible" claim. Medicaid and
   insurance fund a dedicated speech-generating device (HCPCS E2510) for one
   patient through a DME vendor, not an App Store app, whatever its price
   model. Our route into that system is a later device partner (§ 4.5).

---

## 2. Packaging Tiers

```text
+-------------------------------------------------------------------------------+
| 1. CORE TIER (Free Forever, Local-First)                                       |
|    - 100% functional AAC communication (offline-always)                       |
|    - Full 677-word core & primary fringe library                              |
|    - 20 words of your own (§ 4; superseded 'unlimited' 2026-09-23)            |
|    - Device text-to-speech (OS synthesized voices)                            |
|    - Full spatial-vector motor grid & predictive strip                        |
|    - Local storage (SQLite WASM / OPFS)                                       |
|    - Encrypted backup, QR card restore (own device + one supporter)          |
|    - 5 "Draw it for me" drawings as a taste                                   |
|    - 7 days of the paid extras, one time (040 trial — § 4.2)                  |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
| 2. PIP LIFETIME ($49 once, per user — § 4)                                    |
|    - Flat, single-purchase license (zero recurring fees)                       |
|    - Grant and school friendly via license codes (Medicaid: § 4.5)            |
|    - Encrypted multi-device Cloudflare edge sync (backup itself is free)     |
|    - Caregiver Co-Pilot real-time modeling surface                            |
|    - Unlimited desktop/browser remote vocabulary editing                      |
|    - "Draw it for me" in our house style (fair use)                           |
+-------------------------------------------------------------------------------+

**DECIDED 2026-09-22** (founder, "all agreed"). Amendments to the tiers
above:

- **Backup and restore are free for every board.** "A voice is not rented"
  includes the vocabulary a family spent hours building. Pip Lifetime adds
  more than one linked device and the web editor
  (`docs/product/Sync_And_Web_Editing.md` § 11).
- **A board is never deleted because of payment**
  (`docs/product/Sync_And_Web_Editing.md` § 6).
- **Draw it for me** is a Pip Lifetime feature. *Superseded 2026-09-23 by
  § 4.2 (300 included, then top-ups):* fair use (30 a day,
  about 1,000 a year, starting values), shown only near a limit, never a
  silent cutoff. More drawings past the yearly limit are an in-app
  purchase, priced later. Free boards get 5
  (`docs/product/Word_Library.md` § 6.1).
- **iOS:** digital unlocks on the iOS app use Apple in-app purchase.
                                       |
                                       v
+-------------------------------------------------------------------------------+
| 3. CLOUD AI & VOICE PASSTHROUGH (Optional Usage-Based Add-on)                 |
|    - Transparent passthrough for real third-party API compute costs           |
|    - ElevenLabs instant voice cloning (e.g. Mom's voice / SLP voice)          |
|    - Vision-multimodal entity auto-enrichment (Muse Spark via OpenRouter)     |
|    - Purchased as one-off credit packs — never a gate on speaking offline     |
+-------------------------------------------------------------------------------+
```

---

## 3. Invariants & Bans

| Invariant | Enforcement |
| --- | --- |
| Core board speaks offline with zero payment | Works Test: fresh install speaks all 677 catalog words and personal entities without an account or network. |
| No time-bomb expiration | **Speech and vocabulary never lock.** The app never disables speech or locks vocabulary after a trial period — the 040 trial adds paid extras for 7 days and then politely asks the adult; every word keeps speaking either way. |
| Zero loss upon cloud disconnection | If cloud sync or credits expire, the local database remains 100% intact, readable, and speakable. |
| No deletion for payment | A free user's backup is kept and restorable; only a family's request or 3 idle years deletes a user. |
| Nothing is taken away | A free user's own words past the limit (added before a downgrade, a restore, or a limit change) keep speaking; the limit only stops adding. |
| No surprise paywall | The limit is stated in the App Store listing and first run, and the counter shows before the limit is reached (§ 4.3). |

---

## 4. One price per user

**DECIDED 2026-09-23** (not built; founder: "all approved, lock it in").
Execution: `docs/phases/015_Accounts_And_One_Price.md`.

### 4.1 The price

**Pip Lifetime: \$49 once, per user** (the person who speaks). No
subscription. No discount for a second user: an SLP's first client and
tenth pay the same, and so do siblings. License codes are 50% off 10 or
more — anyone can buy them, self-serve, no quote or email thread (§ 4.5).

Every **supporter** (parent, grandparent, SLP, teacher) is free. Once a
user has Pip Lifetime, every supporter of that user gets everything, and
nobody pays again. Anyone may buy it: the family, or an SLP for a client.

Why \$49 (founder, cost basis): storage is pennies a year per user,
pictures and audio are shared, and families at this price can buy without
waiting months for a funder. Competitors charge \$250–\$300 or a
subscription before a child can speak
(`docs/founder/2026-09-23_Accounts_And_Pricing.md` § Research).

### 4.2 Free vs Pip Lifetime

Canonical list — the page, the site and app copy must use these rows and
no others (`docs/phases/040_Trial_And_Upgrade_Page.md` § 3, DECIDED
2026-10-04; the 039 ten-tap pool is removed).

| Free, forever | Pip Lifetime (\$49 once, per person) | In the 7-day trial? |
| --- | --- | --- |
| Every word speaks, **one word at a time**, default voice | **Natural full-sentence voice** | **Yes** |
| | ✨ Fix it · ❓ Question · ⏪ Past · ⏩ Future | **Yes** |
| | Feeling faces: excited, sad, angry | **Yes** |
| | Choose a voice | **Yes** |
| | Voice for the words you type | **Yes**, inside its existing per-license caps |
| | Progress: weekly charts, goal words, new words, PDF/IEP report | **Yes** — shown in full, locked back to the preview after |
| **20 words of your own** (people, pets, places, with your photos) | Unlimited words of your own | **No** — structural, never unwound |
| **The user's own device + one supporter** (all of that supporter's devices: laptop, phone, tablet) | **Every supporter**, every web editor | **No** — structural, people are never removed |
| The user's own device | Sync across unlimited devices | **No** |
| 5 drawings (Draw it for me) | 300 drawings, then top-up packs near cost | **No** — has its own quota |
| Spotlight, prediction, groups, hiding words, Record my own, backup, QR card restore | (same) | n/a |

The trial covers only the six feature rows — the cost-bearing, instantly
reversible ones. Words, supporters and devices hold the family's data
and people; taking them away on day 8 would mean deleting words or
removing a teacher. Those stay behind Lifetime during the trial.

- **A word of your own** is a live `personal_entity`. Retiring one frees a
  slot; changing a built-in word's picture or recording does not count.
  20 is a starting value, to be tested with real families.
- **One supporter free** (DECIDED 2026-09-23, replaces "one live
  device"). A free user has its own device (the child's iPad) and one
  supporter, on as many of that supporter's devices as they like. Editing
  on the user's own device is always free. A second supporter is the
  \$49 moment. When the supporter spot is taken, the app offers
  "Replace [name, last seen …]?" or Pip Lifetime; a spot unused for 60
  days (starting value) frees itself.
- **The user's own device moves.** Scanning the QR card on a device that
  is not signed in as a supporter makes it the user's own device; the old
  one keeps speaking everything it has and stops getting changes. The
  supporter stays. The relay enforces this, not only the UI.
- **Code still runs the older rule.** **BUILT** (2026-09-23): `POST
  /devices` refuses any second registration with `upgrade_required`, and
  `POST /restore` replaces the whole device set on a free board
  (`src/worker/relay.js`). 015 slice 6 changes this to own device + one
  supporter, using the supporter identity from slice 4. The lifetime
  flag is the dev-license path; verified purchases write the same flag.
- **Drawings** are the one cost that recurs (about 1¢ each). 300 are
  included once, not per year; top-ups are an in-app purchase priced near
  cost. This replaces the 2026-09-22 fair use of 30 a day / 1,000 a year.
  **What counts (founder, 2026-09-29):** image API calls only — a new
  drawing or a redraw. Using any picture we already have (catalog, extended
  library, or any earlier drawing) is free and stays available at 0 left.
  Spending is automatic and shown on the card
  (`docs/phases/030_Picture_Finder_And_Drawing.md` § 6.1).
- **Voice cloning and other passthrough credits** are unchanged (§ 2,
  tier 3).

### 4.3 No surprise

- App Store listing and first run: "Free: every word speaks, 20 of your
  own, and one supporter. \$49 once: unlimited, for the whole team."
- The add flow shows "14 of 20 free words" from the first add.
- At the limit the adult sees the offer; the child never sees a paywall
  and speaking never waits on it.

### 4.4 Rejected levers (2026-09-23)

| Lever | Why not |
| --- | --- |
| Charge for backup or restore | Asks for money at the moment a child lost their voice |
| Lock custom groups | Words land in My Words anyway; nobody hits the wall |
| ~~Charge to switch voices~~ **reversed 2026-10-04 (040)** | Choosing a voice is now paid/trial: minting and serving a voice costs per voice and per sentence, so the feature carries a real per-use cost. The **default** voice stays free forever — identity never goes silent. |
| ~~Prediction that turns off after X days~~ **partially reversed 2026-10-04 (040)** | Prediction itself stays free (rejected stands). What did change: paid extras — the natural sentence voice, sentence buttons, faces, voice choice — run as a 7-day trial then ask the adult, never the child. This is not a time bomb on speech: § 3's invariant holds because words and vocabulary never lock. |
| Per-supporter license covering all their users | SLPs are the channel and each brings many users; per user is how every funder counts |
| Discount for additional users | Unfair to the first client; confusing |
| One free laptop (by hardware id) | Browsers expose no hardware id, by design; a website cannot reliably tell a laptop from an iPad in landscape |
| An SLP's first client free, later clients paid | Needs verifying who is an SLP; makes family #2 pay because of someone else's caseload |
| Referral payments to SLPs | Founder: "100% not"; complicated, and likely an ethics conflict for SLPs. We win by the best product |

### 4.5 Who can buy, and how

- **Payments: Stripe** (DECIDED 2026-09-23). **Web:** Stripe Checkout
  (cards, Apple Pay, Google Pay), attached to the user through a
  supporter account.
- **iOS:** Apple's native in-app purchase only, no link out to the web
  (DECIDED 2026-09-23). Apple's server notification confirms it and our
  server records the license on the user. The license belongs to the
  user, whoever paid, and travels with the user to any device through
  the QR card or a supporter's sign-in.
  The product is a **consumable** ("Pip Lifetime for one user"),
  researched 2026-09-23: Apple lets an Apple ID buy a non-consumable only
  once, so a parent or SLP could never buy a second user's license. A
  consumable can be bought again and again. Apple does not restore
  consumables, so our server is the record: it validates the signed
  transaction with the App Store Server API, binds it to one user, and
  keeps the license. The App Review notes say that each credit
  permanently unlocks one user in our account system and is restored by
  sign-in or the QR card. Model Apple's cut at 30%.
- **Schools, grants, SLPs buying ahead:** license codes, each redeemable
  on one user. **\$49 a code for 1–9; 50% off 10 or more** — self-serve
  on the web, no account needed (040 § 8: the app's own Buy button and
  the "send an unlock link" flow use the same route; the in-app buyer
  returns to the app and the minted code redeems for that board
  automatically)
  (`pipaac.org/schools` → Stripe Checkout on the app worker; the buyer's
  codes render on screen and arrive by email, redeemable like any
  founder-minted code), or by purchase order for districts that need
  one. Apple School Manager's volume discount covers a paid app's
  price, not an in-app purchase, so codes are the school path. A code
  bought outside the app works in the iOS app because the same unlock is
  sold in the app (App Review Guideline 3.1.3(b); schools 3.1.3(c)).
- **Medicaid / insurance:** later, through a device partner that ships a
  dedicated device with a Pip Lifetime user. Not built, not scheduled.
