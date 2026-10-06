# Platforms — native iOS and web

**DECIDED 2026-10-06.** Pip AAC will have a native Swift/SwiftUI iOS app
and a full web app. The founder approved this architecture, the shared
JavaScript core (§ 2, subject to the A0 device test in phase 044) and the
device floor (§ 5) on 2026-10-06. Desktop customization of the user's
native device is essential.

**Current state:** the web app and backend are live. The Xcode project at
`apps/PipAAC/PipAAC.xcodeproj` is a starter template; native Pip
functionality is not implemented. Execution lives in
`docs/phases/044_Native_iOS_App.md`. This document owns lasting platform
decisions; the phase owns work and proof, and is deleted at closeout.

## 1. Two clients, one person's words

| | Native iOS app | Web app |
| --- | --- | --- |
| Main job | Everyday communication on iPad, including offline use | Full communication app on browser devices, plus desktop customization |
| Supporter work | Native Settings, Library, customization, team and recovery flows | Edit words, groups, positions, pictures, recordings and settings with a keyboard and mouse |
| Local data | On-disk SQLite file and persistent media files in the app container | SQLite WASM, persisted exports in IndexedDB; media in OPFS |
| Distribution | Apple's App Store | `https://app.pipaac.org` |

The web app remains a supported product. Building iOS does not turn it
into a limited editor or move the backend into the app.

Both clients use the same sense identities, catalog, coordinate maps,
SQLite data contracts and product rules. The sync unit is the **user**,
the person who speaks. Groups and the main board are views of that
person's words, not separate accounts or databases.

Vocabulary: `docs/product/SSOT.md`. Data:
`docs/product/Language_And_Voice_Schema.md`. Layout:
`docs/product/Motor_Grid_And_Art.md` and
`docs/product/Core_Coordinate_Map.md`.

## 2. One shared core, native everything else

**Why.** Sync replays operations through the same write functions on
every device, and replicas must end byte-identical
(`public/shared/ops.mjs`; proof style: `src/board/sync_merge.test.mjs`).
A second implementation of those functions in Swift would have to match
the JavaScript one exactly, forever, for every future rule change. So
the rules are not rewritten: the iOS app runs the existing shared
JavaScript in **JavaScriptCore**, Apple's built-in JavaScript engine.
It is not a web view and draws nothing.

**The split:**

| Shared core — the same JavaScript, bundled into the app | Swift — native |
| --- | --- |
| Op record/apply/replay/drain and snapshots (`ops.mjs`) | Every screen, gesture and animation (SwiftUI) |
| Every write owner that changes synced tables: entities, groups, placement, masks, overrides, families, Spotlight lists, stats days, supporter names | Audio playback and the audio session (§ 3) |
| Smart bar and forms (`funnel.mjs`, `forms.mjs`, answer tables) | The SQLite file, transactions, backups of the file |
| Normalization, spelling, keyboard maps, library queries, import and migrations | Encryption (CryptoKit), passkeys, keychain |
| Read-side queries the screens render: board layout, labels, which clip a tile plays | Relay transport, media upload/download, voice/picture HTTP clients |
| | Purchases (StoreKit), photos, recording, files, background tasks |

Rule of thumb: a shared module that reads or writes the database, or
decides which words appear or what they say, belongs to the core. A
module that touches the network, keys, audio, files or the screen is
platform code. Today's web-only globals in shared modules are small
(`crypto.randomUUID`, and comments that only mention "window"); the
host supplies them.

**The database seam already exists.** The shared code runs today on two
SQLite engines — `node:sqlite` in tests and SQLite WASM in the browser —
through one adapter shape (`adapt()` in `public/db.js`): `exec(sql)`,
`prepare(sql).run(...params) → { changes }`, `prepare(sql).all(...params)
→ rows` and `all(sql, params)`. The iOS app implements that same shape
over its on-disk SQLite file. That is the third engine, not a new API.

**Rules for the core on iOS:**

- The core is bundled into the app at build time from `public/shared/`
  by one build script. The app never downloads code (App Review 2.5.2).
- One JavaScriptCore context runs on one serial executor off the main
  actor. Screens never wait on the core before making a sound: the
  board precomputes each visible tile's label, picture and clip when it
  renders, so a tap plays audio natively first and updates the Smart
  bar after.
- Web and iOS share the same SQL schema and migrations (`migrate.mjs`,
  `fresh_db.sqlite`), driven by the core.
- Changing a core module changes both apps. Its existing node tests are
  the first proof; the shared parity fixtures (phase 044 A) are the
  second.

**Gate.** Phase 044 A0 times and verifies this on the floor iPad before
any feature slice. If one module is too slow in JavaScriptCore, only
that module moves to Swift, held to the same golden fixtures. Sync
replay stays in the shared core in every case.

**Native stack.** SwiftUI and Observation (`@Observable`), Swift 6
language mode with strict concurrency; UI state on the main actor;
UIKit only where a native capability needs it. The template's SwiftData
`Item` model is scaffolding and is deleted.

Apple references: [JavaScriptCore](https://developer.apple.com/documentation/javascriptcore),
[Observation](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app),
[Swift concurrency](https://docs.swift.org/latest/documentation/the-swift-programming-language/concurrency/).

## 3. Our recordings, stored locally

**Founder clarification, 2026-10-06:** Pip uses its own audio. Apple
audio APIs play those files; Apple TTS is not the native speech engine
or a fallback for missing Pip recordings. Personal Voice and voice
cloning are not added by this platform decision.

**Audio session.** Pip is the user's voice, so it uses the `.playback`
category: it speaks with the Ring/Silent switch on, in Guided Access and
with the screen about to lock. It stops other apps' audio rather than
mixing under it. Route changes (Bluetooth speaker, headphones pulled)
must never leave speech silent.

The release bundles the default voice's clips and the board assets
needed to communicate on first launch without a network. `public/audio`
holds about 114 MB across six voices today; the other five voices,
new word clips and generated sentence recordings download from the
existing services and are saved locally. Caregiver recordings are
persistent user media. Packaging and coverage are measured from the
actual catalog during implementation, not assumed from a manifest.

Catalog clip identity, word/form resolution, overrides, voice selection,
speed, sentence fallback and expressive voice keep their existing owners:
`docs/product/Language_And_Voice_Schema.md`,
`docs/product/Sentence_Bar.md`, `docs/phases/028_Tile_Voice_Library.md`,
`docs/phases/024_Sentence_TTS_And_Audio_Cache.md` and
`docs/phases/025_Expressive_Voice.md`.

Downloaded words and media stay usable offline. A new cloud-generated
sentence still needs the network until its recording is available
locally; offline sentence playback uses the existing local clip behavior.
A missing or pending clip has an honest supporter-visible state, without
silently selecting a different voice. If imported data selects
`device_tts`, resolve that case explicitly; do not silently replace the
family's voice.

**Storage.** User recordings and photos live in Application Support,
included in device backup. Downloaded voice packs and caches are
excluded from backup and can be re-downloaded. Verify files before making
an updated voice pack active, and keep the working pack when a download
is interrupted.

**Keys.** Device and account keys live in the keychain as
"this device only", available after first unlock. They do not travel in
an iCloud backup. A family moving to a new iPad gets their words back
through the existing recovery card or a supporter's sign-in — the same
route as the web. Device backup and Pip recovery are distinct
mechanisms; neither is proof of the other.

## 4. Desktop customization is a core requirement

The required flow is:

```text
supporter edits on desktop -> existing encrypted relay -> native local
database + media -> the user's board shows and speaks the edit offline
```

This includes pictures and recordings, not just references to their bytes.
Native edits return through the same protocol to other linked clients.
Pairing, supporter permissions, recovery, key rotation and private/local
data boundaries keep their owner: `docs/product/Sync_And_Web_Editing.md`.

Operation semantics come from the shared core (§ 2), so ordering,
placement/conflict behavior and snapshot versions match by construction.
What the iOS app reimplements is the envelope: `sync_crypto.mjs` and
`sync_client.mjs` in Swift. Every primitive has a CryptoKit/Compression
equivalent: P-256 ECDSA (raw `r‖s` signatures) and ECDH, HKDF-SHA256,
AES-GCM-256 and raw DEFLATE (`deflate-raw`). Interop is proven with
fixtures sealed on one side and opened on the other, in both directions.
Device-local histories stay device-local; parity does not mean
transferring every table.

App resume/reconnect catches up durably. A desktop editor must not need
the child to reload the board to receive an edit. Version 1 catches up
on launch, on resume and while open; it does not use push notifications
or a permanent background connection.

**Passkeys.** Accounts use passkeys with the PRF extension to unlock the
account key; the relying party is `pipaac.org` (`public/shared/account.mjs`).
The iOS app uses the same passkeys through Associated Domains
(`webcredentials:pipaac.org`), which requires an
`apple-app-site-association` file served from
`https://pipaac.org/.well-known/`. Native passkey PRF needs iOS 18 or
later, which the device floor covers.

**Moving from the web app.** A family using Pip in Safari on their iPad
moves to the app through the existing routes, not a file export: the QR
card restore (free) or linking the app as another device (Lifetime,
per `docs/product/Pricing_And_Packaging.md` § 4.2). The app becomes "the
user's own device" without spending the family's free supporter spot.

## 5. Device floor, accessibility and platform fit

**Device floor (founder, 2026-10-06).** We support new devices and
recent software, not legacy hardware.

- **Minimum OS: iOS/iPadOS 26.** Raise it as new versions ship; never
  hold it back for old devices.
- **Slowest supported device: the base iPad (A16, 2025)** — the
  cheapest iPad Apple sells. Speed budgets are measured on it.
- **Supported means tested and promised.** Apple can only restrict by OS
  version, so older iPads that run iOS 26 can install the app; we do
  not test them or fix bugs that only happen on them. The App Store
  listing and Help say which devices are supported.

**Version 1 is iPad-only.** iPhone joins when the iPhone layout is decided
(`docs/founder/2026-09-22_iPhone_Proposal.md` is still a proposal).
The App Store lets an app add a device family later but never remove
one, so iPad-first keeps the option open.

**Accessibility** is part of the communication experience from the
first board slice:

- VoiceOver labels and actions; a tile must not be spoken twice (once by
  VoiceOver, once by Pip). Phase 044 A decides the tile behavior.
- Switch Control with a scan order that follows the motor grid.
- Larger system text grows text inside a tile; it never moves a word.
- Reduced motion, contrast, legibility and predictable touch targets.
- Guided Access: the whole board works with the iPad locked to Pip;
  supporter screens stay behind the PIN.

Validate these on devices with the features turned on. Framework
adoption alone proves none of them.

Native presentation preserves fixed word positions, masking without
reflow, the reserved Smart bar area and the existing sentence-button
semantics. Owners: `docs/product/Design_System.md`,
`docs/product/Motor_Grid_And_Art.md` and `docs/product/Sentence_Bar.md`.
Apple reference: [accessible controls](https://developer.apple.com/documentation/swiftui/accessible-controls).

## 6. Shared services and release

The Worker, relay, media store and generation services remain shared.
Native requests use the existing production API origin and contracts;
service secrets remain server-side. Native authentication preserves the
account encryption/recovery design; there is no second identity system.

**Purchases** follow `docs/product/Pricing_And_Packaging.md` § 4.5:
Apple in-app purchase only, a consumable "Pip Lifetime for one user",
validated by our server with the App Store Server API and bound to one
user. The Worker adds the App Store Server Notifications endpoint;
StoreKit and Stripe grants resolve into the same `entitled()` owner.

**App Review requirements:** in-app account deletion (built on web in
015; reachable from the app), a privacy manifest, App Privacy answers
that match what we actually send (including the anonymous research data,
on by default), a parent gate in front of purchases and outside links
because a child holds the device, and no listing in the Kids category.
Check current [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
and [StoreKit guidance](https://developer.apple.com/documentation/storekit/in-app-purchase)
when submitting.

**Shipping.** For native work, "always deploy" means a TestFlight build
installed on a real iPad at the end of every slice. Store releases go out
when a planned release scope is complete.

Native implementation is not evidence of lower latency, App Store
acceptance, ratings or rankings. Measure those separately.

## 7. Keeping the two apps in step

- **Every new phase doc carries a `**Platforms:**` line** saying where
  the change lands: *shared core* (both apps, one change), *web screen*,
  *iOS screen*, *backend*, or *web-only* with the reason. A phase that
  changes a screen on one app names the matching work on the other, or
  says why there is none. `npm run check` enforces the line once phase
  044 A adds the lint.
- **Push rules into the core or the data**, never into a screen. Catalog,
  answer tables, Help answers, prompts and voice generation are already
  shared data or services; keep it that way.
- **Parity fixtures:** core scenarios (op streams with expected table
  dumps, Smart bar and form cases, crypto envelopes) live in one place
  and run in node and in the iOS test target. A new core behavior adds
  a fixture; both test suites read it.
