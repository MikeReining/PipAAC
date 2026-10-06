# Platforms — native iOS and web

**DECIDED 2026-10-06.** Pip AAC will have a native Swift/SwiftUI iOS app
and a full web app. The founder approved this architecture and the
implementation plan after reviewing the working web app. Desktop
customization of the user's native device is essential.

**Current state:** the web app and backend are live. The Xcode project at
`apps/PipAAC/PipAAC.xcodeproj/project.pbxproj` is a starter template;
native Pip functionality is not implemented. Execution lives in
`docs/phases/044_Native_iOS_App.md`. This document owns lasting platform
decisions; the phase owns work and proof, and is deleted at closeout.

## 1. Two clients, one person's words

| | Native iOS app | Web app |
| --- | --- | --- |
| Main job | Everyday communication on iPad and iPhone, including offline use | Full communication app on browser devices, plus desktop customization |
| Supporter work | Native Settings, Library, customization, team and recovery flows | Edit words, groups, positions, pictures, recordings and settings with a keyboard and mouse |
| Local data | On-disk SQLite and persistent media files in the app container | SQLite WASM, persisted exports in IndexedDB; media in OPFS |
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

## 2. Native implementation

- SwiftUI is the primary UI framework; Observation (`@Observable`) owns
  observable presentation state, with `@State`, `@Environment` and
  `@Bindable` as appropriate. UIKit integration is available where a
  specific native capability needs it.
- Use the current stable toolchain and Swift 6 language mode, structured
  concurrency and explicit isolation. UI state belongs on the main
  actor; database work, media processing and other expensive work must
  not block tile interaction. An `async` declaration alone does not move
  work off the UI actor.
- Persist the existing data model with SQLite. The template's SwiftData
  `Item` model is scaffolding, not a persistence decision. Observation
  does not require SwiftData. Select the SQLite binding during the
  foundation slice and preserve the schema, constraints and migrations.
- Use native playback for Pip's audio files, native secure key storage,
  photo selection, recording, authentication and purchase integration.
- Keep one state owner for each screen or flow. Views render domain
  results; they do not independently decide sync, permissions or
  entitlement truth.

The board is native UI. A web view is not its implementation. The
existing browser seam, `public/shared/platform.mjs`, identifies browser
capabilities; swapping that module does not port JavaScript flows into
Swift. Reimplement the client behavior with shared contracts and proof.

Apple references: [Observation](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app)
and [Swift concurrency](https://docs.swift.org/latest/documentation/the-swift-programming-language/concurrency/).
Recheck availability against the selected deployment target when building.

## 3. Our recordings, stored locally

**Founder clarification, 2026-10-06:** Pip uses its own audio. Apple
audio APIs play those files; Apple TTS is not the native speech engine
or a fallback for missing Pip recordings. Personal Voice and voice
cloning are not added by this platform decision.

The release bundles the default built-in audio and board assets needed
to communicate on first launch without a network. Additional voice
packs, new word clips and generated sentence recordings are downloaded
from the existing services and saved locally. Caregiver recordings are
persistent user media. Packaging and coverage must be verified from
the actual catalog during implementation, not assumed from a manifest.

Catalog clip identity, word/form resolution, overrides, voice selection,
speed, sentence fallback and expressive voice keep their existing owners:
`docs/product/Language_And_Voice_Schema.md`,
`docs/product/Sentence_Bar.md`, `docs/phases/028_Tile_Voice_Library.md`,
`docs/phases/024_Sentence_TTS_And_Audio_Cache.md` and
`docs/phases/025_Expressive_Voice.md`.

Downloaded words and media stay usable offline. A new cloud-generated
sentence still needs the network until its recording is available
locally; offline sentence playback uses the existing local clip behavior.
A missing or pending clip must have an honest supporter-visible state,
without silently selecting a different voice. If imported legacy data
selects `device_tts`, resolve that compatibility case explicitly before
claiming parity; do not silently replace the family's voice.

Keep user recordings and irreplaceable photos in persistent storage,
separate from disposable caches. Downloaded media referenced by the
active user's words must remain locally available under the offline
contract. Verify files before making an updated voice pack active, and
preserve the working pack when a download is interrupted. Device backup
and Pip recovery are distinct mechanisms; neither is proof of the other.

## 4. Desktop customization is a core requirement

The required flow is:

```text
supporter edits on desktop -> existing encrypted relay -> native local
database + media -> the user's board shows and speaks the edit offline
```

This includes pictures and recordings, not just references to their bytes.
Native edits return through the same protocol to other linked clients.
Pairing, supporter permissions, recovery, key rotation and private/local
data boundaries retain their owner:
`docs/product/Sync_And_Web_Editing.md`.

**Same SQLite schema is necessary but insufficient.** The current client
records editing operations and replays them through domain functions:
`public/shared/ops.mjs` records and applies operations,
`public/shared/sync.mjs` exchanges them, and
`public/shared/sync_crypto.mjs` seals their payloads. Both clients must
agree on operation semantics, ordering, placement/conflict behavior,
snapshot versions, key epochs and media formats.

Share the existing backend and asset pipeline. Keep stable IDs, normalized
text and hashes compatible. Compare both clients using the same scenario
inputs, inspecting persisted tables and media and exercising encryption
in both directions. Device-local histories remain device-local according
to the sync owner; parity does not mean transferring every table.

App resume/reconnect catches up durably. A desktop editor must not need
the child to reload the board to receive an edit. iOS suspension does
not imply a permanent background WebSocket or guaranteed immediate
delivery while the app is closed.

## 5. Native accessibility and platform fit

Accessibility is part of the communication experience from the first
board slice: VoiceOver labels/actions, Switch Control traversal, focus,
contrast, text legibility, reduced motion, indirect input and predictable
touch targets. Validate these on devices with the relevant assistive
features enabled. Framework adoption alone proves none of them.

Native presentation preserves fixed word positions, masking without
reflow, the reserved Smart bar area and the existing sentence-button
semantics. Adaptive layouts and visual effects must respect those laws.
Owners: `docs/product/Design_System.md`,
`docs/product/Motor_Grid_And_Art.md` and `docs/product/Sentence_Bar.md`.
Apple reference: [accessible controls](https://developer.apple.com/documentation/swiftui/accessible-controls).

iPad and iPhone are the intended platforms. Minimum OS, the supported
hardware matrix and iPhone launch layouts are still implementation
decisions. The template's iOS 26 minimum is not a founder ruling.
Modern Swift does not by itself require the newest OS. The iPhone
proposal's pocket mode, location features and widgets remain proposals:
`docs/founder/2026-09-22_iPhone_Proposal.md`.

## 6. Shared services and release

The Worker, relay, media store and generation services remain shared.
Native requests use the existing production API origin and contracts;
service secrets remain server-side. Native authentication must preserve
the account encryption/recovery design rather than create another
identity system.

StoreKit purchases and restore feed the same backend entitlement truth
as web purchases. Pricing, limits and access remain owned by
`docs/product/Pricing_And_Packaging.md` and
`docs/product/Sync_And_Web_Editing.md`; storefront-specific purchase
handling is implementation work, not a new pricing law. Check current
[StoreKit guidance](https://developer.apple.com/documentation/storekit/in-app-purchase)
and [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
when implementing and submitting.

Release proof covers real-device offline communication, persistent edits,
desktop/native convergence including media, recovery, accessibility and
upgrade compatibility. Native implementation is not evidence of lower
latency, App Store acceptance, ratings or rankings. Measure and verify
those outcomes separately. Full launch scope and release evidence live
in phase 044 until closeout; lasting decisions return here or to their
existing feature owner.
