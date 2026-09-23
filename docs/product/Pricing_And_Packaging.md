# Pricing, Packaging, and Ethical Monetization

**DECIDED 2026-09-22** (not built). **Amended 2026-09-23:** one price per
user, § 4. Where § 2 and § 4 disagree, § 4 wins.
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
|    - Encrypted backup, QR card restore (one live device)                     |
|    - 5 "Draw it for me" drawings as a taste                                   |
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
| No time-bomb expiration | The app never disables speech or locks vocabulary after a 30-day trial period. |
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
tenth pay the same, and so do siblings. Schools get 50% off 20 or more.

Every **supporter** (parent, grandparent, SLP, teacher) is free. Once a
user has Pip Lifetime, every supporter of that user gets everything, and
nobody pays again. Anyone may buy it: the family, or an SLP for a client.

Why \$49 (founder, cost basis): storage is pennies a year per user,
pictures and audio are shared, and families at this price can buy without
waiting months for a funder. Competitors charge \$250–\$300 or a
subscription before a child can speak
(`docs/founder/2026-09-23_Accounts_And_Pricing.md` § Research).

### 4.2 Free vs Pip Lifetime

| Free, forever | Pip Lifetime (\$49 once, per user) |
| --- | --- |
| Every built-in word speaks | |
| **20 words of your own** (people, pets, places, with your photos) | Unlimited words of your own |
| One live device | More live devices (a second iPad, a parent's phone, the SLP's laptop) |
| | The web editor |
| 5 drawings (Draw it for me) | 300 drawings, then top-up packs near cost |
| All voices, prediction, groups, hiding words, Record my own | (same) |
| Backup, QR card restore, moving to a new device | (same) |

- **A word of your own** is a live `personal_entity`. Retiring one frees a
  slot; changing a built-in word's picture or recording does not count.
  20 is a starting value, to be tested with real families.
- **One live device.** Restoring on a new device *moves* the user there:
  the old device keeps speaking everything it has and stops getting
  changes. The relay enforces this, not only the UI.
- **Drawings** are the one cost that recurs (about 1¢ each). 300 are
  included once, not per year; top-ups are an in-app purchase priced near
  cost. This replaces the 2026-09-22 fair use of 30 a day / 1,000 a year.
- **Voice cloning and other passthrough credits** are unchanged (§ 2,
  tier 3).

### 4.3 No surprise

- App Store listing and first run: "Free: every word speaks, plus 20 of
  your own. \$49 once: unlimited, for the whole team."
- The add flow shows "14 of 20 free words" from the first add.
- At the limit the adult sees the offer; the child never sees a paywall
  and speaking never waits on it.

### 4.4 Rejected levers (2026-09-23)

| Lever | Why not |
| --- | --- |
| Charge for backup or restore | Asks for money at the moment a child lost their voice |
| Lock custom groups | Words land in My Words anyway; nobody hits the wall |
| Charge to switch voices | The voice is identity; the system voices are free |
| Prediction that turns off after X days | A time bomb (§ 3); the child learns to rely on it |
| Per-supporter license covering all their users | SLPs are the channel and each brings many users; per user is how every funder counts |
| Discount for additional users | Unfair to the first client; confusing |

### 4.5 Who can buy, and how

- **Web:** checkout attached to the user through a supporter account.
- **iOS:** an in-app purchase recorded against the user by our server.
  **UNVERIFIED:** which in-app purchase type App Review accepts for a
  permanent unlock of one user among many.
- **Schools, grants, SLPs buying ahead:** license codes, each redeemable
  on one user. 50% off 20 or more. **UNVERIFIED:** whether Apple School
  Manager volume pricing can apply to an in-app license; codes are the
  path that works regardless.
- **Medicaid / insurance:** later, through a device partner that ships a
  dedicated device with a Pip Lifetime user. Not built, not scheduled.
