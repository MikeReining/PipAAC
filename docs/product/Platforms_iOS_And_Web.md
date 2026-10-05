# Platforms — the iOS app and the web app

**DECIDED 2026-09-22** (founder: "we will be doing an iOS app 100% so that we
can launch in the App Store … what sets us apart … is that we will offer
both"). Not built: today's code is a web app only.
Intake: `docs/founder/2026-09-22_Customization_Library_Sync.md`.
Sync between them: `docs/product/Sync_And_Web_Editing.md`.

This replaces the "built as a PWA" line in `docs/strategy/Vision.md` § 4.4.

---

## 1. Two apps, one board

| | iOS app (App Store) | Web app (any browser) |
| --- | --- | --- |
| Main job | The child's device. Speaking, all day, offline | Editing on a computer; also a full board on any device |
| Who uses it | The child, and adults in the Parent Corner | Parents, SLPs and teachers at a keyboard; families without an iPad |
| Storage | On-device SQLite, same schema | SQLite WASM in memory, exported to IndexedDB `pip-users` (with a `.prev` fallback, 043 A). OPFS holds media blobs only. A cache when sync is on |
| Distribution | App Store, grant and Medicaid friendly | A URL |

Both apps use the same database schema
(`docs/product/Language_And_Voice_Schema.md`), the same catalog, and the
same rules. The shared schema is what makes sync possible, and what lets
an edit on a laptop mean exactly the same thing on the iPad.

**Why both.** Incumbents such as Proloquo2Go are iPad-only, and editing
happens on the iPad. Editing on a real computer (paste 40 words, drag in a
folder of photos, see the whole Library on one screen) is a customization
advantage no incumbent offers.

## 2. What differs by platform

| Capability | iOS app | Web app |
| --- | --- | --- |
| Parent Corner lock | Face ID / Touch ID (LocalAuthentication) + PIN | WebAuthn + PIN (`docs/product/Vocabulary_Masking_And_Safety.md` § 3.1) |
| Photos | System photo picker, many at once | File picker and drag-and-drop from a folder |
| Record my own | Device microphone | Browser microphone |
| Voices | Downloaded clips; device voices; **PROPOSED**: Apple Personal Voice as a `device_tts` voice (Proloquo2Go already supports it, [AssistiveWare](https://www.assistiveware.com/support/proloquo2go/speech/apple-personal)) | Downloaded clips; browser speech |
| ~~Listening (008)~~ | Held 2026-09-24 (017 R20) | Held |
| Durable storage | App container, included in the iPad's own backup | Browsers may evict site data; sync is the durable copy (`docs/product/Sync_And_Web_Editing.md` § 7) |

People names from the Photos People album are not available on either
platform (`docs/product/Word_Library.md` § 5.3).

## 3. Open question: how the iOS app is built

**OPEN.** Needs a real-device spike before any iOS phase. The web code is
the working product today (sqlite-wasm, IndexedDB persistence,
`public/board.js`). 043 J named the seams a port would swap —
`public/shared/platform.mjs` owns storage, audio, media blobs, and
lifecycle; `checkJs` types the boundary. Two honest options:

1. **Native shell around the web board.** One codebase. Native bridges
   for storage, audio, photos, Face ID and the microphone. Risk: audio
   latency and storage behavior inside a web view must be measured, not
   assumed.
2. **Native app (Swift).** Best latency and platform fit. Two codebases,
   with the same schema and the same rules, and the web app becomes mostly
   the editor.

Decide with measurements: tap-to-sound latency, cold start, and storage
durability on a real iPad. The sync design does not depend on this choice,
because it syncs rows of the shared schema, not app state.
