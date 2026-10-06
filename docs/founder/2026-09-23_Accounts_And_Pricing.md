# Founder Intake: Accounts, the QR card, and one price per user

**Intake date:** 2026-09-23.
Source: founder session revisiting "no accounts" from first principles, then
three pricing rounds with competitor research.
Intake workflow: `docs/workflows/SSOT_Founder_Input_Workflow.md`.
Nothing in this file is the truth owner. Routed claims live in the docs named
below.

## Founder intent

1. "No accounts" was not thought through for real life. An SLP with ten
   clients, or a parent with two children, cannot log in and out, and a
   new laptop must not mean re-pairing with ten families.
2. **Vocabulary.** The person who speaks with Pip is a **user** ("Add
   user"). A user has many boards and groups. Calling one user's whole
   setup a "board" made the design impossible to follow.
3. **The 24-word recovery sheet is unacceptable.** "You're not securing
   Bitcoin." Restore is scanning a QR code. The QR can be printed or
   emailed to yourself or anyone, which also makes sharing easy. The QR
   being a house key is "a non-issue".
4. Build adult accounts **now**, before there are users. No WorkOS.
5. **Pricing:** one fee per user, and nobody supporting that user pays
   again. SLPs may pay for a client or recommend the family buy. Flat
   price, no additional-user discount ("feels unfair"); schools may get
   50%. Cost basis is near zero, so be radically disruptive: $49.
6. Paywall must not surprise (App Store reviews). Considered and rejected:
   locking custom groups, charging to switch voices, prediction that turns
   off after X days.

## Research that fed the rulings (2026-09-23)

- Competitors charge per communicator: Proloquo2Go $249.99 one-time;
  LAMP Words for Life and TouchChat with WordPower $299.99; Proloquo
  $9.99/month or $99.99/year; TD Snap needs a subscription to speak after
  a trial; CoughDrop $295 lifetime or $9/month per communicator, supporters
  free but $45 to edit.
- SLPs pay nothing anywhere: AssistiveWare gives certified SLPs a free
  professional license; PRC-Saltillo gives a free copy after training.
- Medicaid and insurance fund a dedicated speech-generating device
  (HCPCS E2510) for one patient through a DME vendor, not an App Store
  app. The route into that system is a later device partner, priced per
  user by nature.
- Schools buy through Apple School Manager; a developer may offer 50% off
  20+ copies of a paid app. That discount does not cover an in-app
  purchase, so schools buy license codes.
- **Apple product type (founder research):** a per-user one-time unlock
  must be a **consumable**. An Apple ID cannot buy the same
  non-consumable twice ("You've already purchased this"), so a second
  user could never be bought. Consumables need server-side validation
  (App Store Server API), binding to the user in our database, and App
  Review notes explaining the permanent unlock and how it restores.
- Passkeys can unlock end-to-end keys on the device (WebAuthn PRF): iCloud
  Keychain (Safari 18+, iOS 18.4+), Google Password Manager, Windows 11
  25H2. Not on every authenticator, so it is an enhancement with a
  fallback, not a hard dependency.

## Rulings (all approved 2026-09-23)

| # | Ruling | Routed to |
| --- | --- | --- |
| 1 | The sync unit is a **user**; adults are **supporters** | `docs/product/Sync_And_Web_Editing.md` § 12 |
| 2 | Supporter accounts: email + passkey; keys stay end to end; no WorkOS | § 12 of the same doc |
| 3 | One device and one account hold many users | § 12; `docs/phases/015_Accounts_And_One_Price.md` |
| 4 | QR card replaces the 24 words; printable, emailable, shareable | § 12 |
| 5 | **$49 once per user.** Every supporter free. SLPs free. No extra-user discount. Schools 50% on 20+ | `docs/product/Pricing_And_Packaging.md` § 4 |
| 6 | Free forever: every built-in word, **10 words of your own** (was 20, amended 2026-10-06), all voices, prediction, groups, backup, QR restore, moving to a new device, 5 drawings | § 4 of the pricing doc |
| 7 | The $49 unlocks: unlimited own words, every supporter, 300 drawings then top-ups at near cost, progress stats | § 4 of the pricing doc; `docs/product/Word_Library.md` § 6.1 |
| 8 | The limit is visible from day one (listing, first run, "7 of 10" counter) | § 4 of the pricing doc |
| 9 | Payments: Stripe on the web (with Apple Pay); inside the iOS app, Apple's native in-app purchase only, no link out. Either writes the same license on the user, which works on any device | § 4.5 of the pricing doc |
| 10 | A supporter is only a supporter: deleting a supporter account never affects the user; the user owns the license | `docs/product/Sync_And_Web_Editing.md` § 12.3 |
| 11 | 015 runs right after 013 slice 2 and 014 slice 2 (core infrastructure) | `docs/phases/README.md` |
| 12 | **One supporter free**: a free user has its own device plus one supporter on all their devices, including the web editor. Replaces "one live device" ("I love it because it's so simple") | § 4.2 of the pricing doc |
| 13 | SLPs are the number-one distribution channel; a free demo user per supporter account | `docs/strategy/SLP_Channel.md` |
| 14 | Progress stats and the progress report are paid; design is the next session | § 4.2 of the pricing doc |
| 15 | No referral payments, ever | § 4.4 of the pricing doc |
| 16 | Stats reach the SLP's laptop: daily totals (counts only) sealed to the user's supporters ("they are on the support team") | `docs/product/Stats_And_Progress.md` § 6.2 |
| 17 | Anonymous totals to Pip, on by default, strict whitelist; never names, own words, photos, recordings or sentences | § 6.3 of the same doc |
| 18 | A free weekly win card is the dashboard's preview; the full dashboard and report are Pip Lifetime | § 4 of the same doc |
| 19 | Words per minute is measured and shown (it leads for literate adults); claims only from measured data | § 3 of the same doc |

## Product value

- A family gets a real, personal voice free in ten minutes and never
  loses it.
- An SLP signs in once and sees every client; a parent sees every child.
- A broken iPad is fixed by scanning a QR card or signing in.
- "Pip speaks for free, including your family's names. $49 once and the
  whole team can edit."

## Next slice

`docs/phases/015_Accounts_And_One_Price.md` slice 1.
