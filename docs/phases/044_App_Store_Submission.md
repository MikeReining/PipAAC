# 044 H — App Store submission material (draft for founder review)

Slice H of `044_Native_iOS_App.md`. Everything here is a draft the founder
pastes into App Store Connect. Privacy answers and the privacy policy are a
High-Risk Stop: nothing is submitted until the founder signs off on § 3–4.

## 1. Listing

| Field | Draft |
| --- | --- |
| Name (30) | Pip AAC |
| Subtitle (30) | Tap the words. Hear a sentence. |
| Category | Education (secondary: Medical is **not** used — no health claims) |
| Kids Category | No (decided: supporters manage accounts, passkeys and purchase) |
| Age rating | 4+ (no web browsing, no public user content, no ads) |
| Price | Free download; in-app purchase Pip Lifetime for one user |
| Support URL | https://pipaac.org/faq |
| Marketing URL | https://pipaac.org |
| Privacy policy URL | https://pipaac.org/privacy (needs the § 4 additions first) |

**Promotional text (170):** Your child taps the words; Pip says the
sentence out loud in a natural voice — using only the words your child
chose. Works offline. $49 once, never a subscription.

**Description:**

> Pip is the AAC app built around your child. Your child taps the words,
> and Pip says them out loud. Tap ✨ and Pip turns "Mimi · go · park" into
> "Mimi is going to the park." It adds the little words — is, to, the —
> and nothing else. It never adds a want, a person, or a place your child
> didn't tap.
>
> The board is your child's: their people, their pets, their photos, their
> words. Add any word in seconds, with a photo or your own voice.
>
> • Every word speaks, offline, forever.
> • A natural voice for whole sentences, with past, future and question
>   buttons.
> • Family and therapists edit the same board from their own devices; every
>   change is sealed on the device before it travels.
> • A recovery card brings the whole board back if the iPad is lost.
> • No ads. No tracking. Names never leave the device.
>
> The first week includes everything. Keeping the sentence helpers is Pip
> Lifetime: one payment per child, never a subscription. Helpers never pay.

**Keywords (100):** `AAC,autism,speech,communication,nonverbal,apraxia,talker,symbols,board,SLP,speech therapy`
(review: no competitor names.)

**Screenshots:** 13" iPad (2064×2752 or 2752×2064) — required; 11" is
derived. Six shots: board with a sentence; ✨ result; a group page; add a
word with photo; Settings sections; Team & devices. Captured from the A16
simulator at the end of slice G (copy final then).

## 2. In-app purchase

Product `org.pipaac.lifetime.user` (consumable — one purchase per user, the
Worker holds the entitlement), display name "Pip Lifetime for one user",
price tier $48.99 or $49.99 (founder). Review screenshot: the Lifetime page
(`LifetimeView`). Server Notifications V2, Production and Sandbox:
`https://app.pipaac.org/api/v1/appstore/notifications`.

## 3. App Privacy answers (traced from the Worker, 2026-10-14)

Apple counts data as "collected" when it leaves the device and is kept
longer than the request needs. Sync, backup, photos, recordings, names and
sentence history are sealed on the device (the relay stores ciphertext only,
`src/worker/index.js` § Sync relay) — not readable by us, so not declared.
**Verify that wording against Apple's current App Privacy Details page
before submitting.**

**Tracking:** No. No ads, no SDKs, no data brokers.

| Apple type | Linked to the user? | Purpose | Where (code) |
| --- | --- | --- | --- |
| Contact Info → Email Address | Yes | App Functionality (supporter sign-in, invites) | `src/worker/accounts.js` `acct_map`, `invite`, `mailbox` |
| Identifiers → User ID | Yes | App Functionality | random person / relay / account ids; trial clock `trial.mjs` keyed by person id |
| Purchases → Purchase History | Yes | App Functionality | `src/worker/appstore.mjs` (transaction → license) |
| Usage Data → Product Interaction | Yes | App Functionality (budget caps on cloud voice and helpers) | `src/worker/voice.js` per-user hit counters, `usage_ledger.mjs` |
| User Content → Other User Content | No | App Functionality | sentence audio cached by text hash (`voice.js` `speak/<sha>`); typed words for word voices (`tile_ledger.mjs`) |
| Usage Data → Product Interaction ("Help improve Pip", on by default, switch in Backup & privacy) | No (random research id) | Analytics | `public/shared/research.mjs` → `src/worker/research.js` — **iPad shows the switch but does not send yet; wire it before 1.0 (parity) and keep this row** |

Not collected: location, contacts, health, financial info (Apple and Stripe
take payment), browsing, search history (Help search is answered and not
kept), diagnostics/crash data (none sent by us; Apple's opt-in crash reports
are Apple's), audio recordings (sealed sync only), photos (sealed sync only).

Real-time processors (sent, not kept by us): ElevenLabs / xAI (sentence and
word voices), Groq (sentence buttons, names masked to PERSON1), picture
providers (word only). The trial's anti-abuse day counter stores a salted
hash of the IP, never the address (`trial.mjs ipHashFor`).

## 4. Privacy policy gaps (site/public/privacy.html) — founder sign-off

The page is accurate for the web board but is missing:

1. **Accounts:** "If a grown-up makes a supporter account, we keep the email
   address to send sign-in links and invites. Passkeys stay on your devices;
   we never see a password."
2. **Payments:** "Payments are handled by Stripe on the web and by Apple in
   the iPad app; we see a receipt, never a card." (today: "entirely by
   Stripe").
3. **Help improve Pip:** "Pip sends anonymous daily totals — how many built-in
   words were tapped, sentence lengths — under a random id that is not your
   child's. No names, sentences, photos or typed words. Turn it off in
   Settings → Backup & privacy."
4. **Deleting:** "Settings → Team & devices → Delete cloud data removes the
   sealed backup after 30 days (undo until then); deleting your account
   removes its email and passkeys."

## 5. Review notes (App Review Information)

> Pip is an AAC (augmentative and alternative communication) app for
> children who speak by tapping words. No sign-in is needed: the board opens
> on first launch and works offline. To test: tap words on the board, then ▶
> to hear the sentence or ✨ for the full sentence (needs internet).
> Settings opens with one tap until a grown-up sets a PIN (optional). Supporter
> accounts use passkeys (Settings → Your account) and are optional.
> In-app purchase: Settings → Pip Lifetime; the first week is a free trial
> with everything on. Export compliance: standard encryption only (HTTPS,
> CryptoKit for end-to-end sealed sync) — exempt.

Demo account: none needed (no login wall). Contact: founder name, phone,
hello@pipaac.org.

## 6. Submission checklist

- [ ] Build from `npm run ios:archive` uploaded via Organizer; TestFlight
      passes P1, P3, P7 on the A16 iPad.
- [ ] § 3 answers entered; § 4 policy deployed to pipaac.org first.
- [ ] IAP created, attached to the version, reviewed together.
- [ ] Paid Apps agreement, banking, tax active.
- [ ] Screenshots, description, keywords, age rating, review notes.
- [ ] `ITSAppUsesNonExemptEncryption = NO` in Info.plist (skips the
      per-build question).
