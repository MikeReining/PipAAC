# Sync and web editing

**Direction DECIDED 2026-09-22** (founder: "a user can create and edit
things on a computer and then have them also on their iPad"). **Rulings
DECIDED 2026-09-22** (§ 11). The mechanics in § 3–§ 6 are the proposed
engineering design, confirmed or changed by the 011 slices. Not built.
Intake: `docs/founder/2026-09-22_Customization_Library_Sync.md`.
Execution: `docs/phases/011_Sync_And_Web_Editing.md`.
Platforms: `docs/product/Platforms_iOS_And_Web.md`.

This file replaces the PROPOSED pairing sketch in
phase 002 § Out of scope (archived) and the
"Phase 003 — Multi-Device Pairing" entry in `docs/strategy/Roadmap.md`.
It keeps their principles: no account, a QR introduction, per-device keys,
Cloudflare carries only ciphertext, and not iCloud.

It touches credentials, privacy and user-data retention (`AGENTS.md`
§ High-Risk Stops). The founder ruled on each of those in § 11.

---

## 1. What it is for

1. **Edit on a computer, speak on the iPad.** A parent or SLP adds 40
   words by pasting them, drags in photos, records names, and rearranges
   groups at a desk. The child's iPad has all of it the next time it is
   online.
2. **More than one adult.** Mom's phone, Dad's laptop and the school SLP
   edit the same board.
3. **A broken iPad is not a lost voice.** A new device restores the board
   (§ 9). Backup and restore are free for every board (§ 11).

Communication never depends on sync. With sync off, broken, or unpaid, the
iPad speaks everything it has
(`docs/product/Pricing_And_Packaging.md` § 3).

## 2. What syncs and what never does

The unit of sync is **one board**: one learner profile and everything the
adults authored for it.

| Syncs (adult-authored) | Never syncs |
| --- | --- |
| `personal_entity` and its photos | `learner_event_log`, `sentence`, `strip_impression` (what the child said: history never leaves the device, `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 4.1) |
| `board_group`, `group_label`, `group_cell` (groups, names, placements) | `prediction_weights` (learned from that child's own taps on that device) |
| `clip_override` and its audio | Suggested words (`docs/product/Word_Library.md` § 8: on the device only) |
| Picture overrides and masking (hidden words) | Partner words (never stored at all) |
| `entity_enrichment` (so it is never re-asked, `docs/product/Personal_Entities.md` § Enrichment) | The catalog (each device has its own copy of the same version) |
| Profile settings: voice, presentation mode, listening, Jev sharing, suggestions toggle | The Parent Corner PIN and biometrics (per device) |

**DECIDED 2026-09-22:** history stays on the device. A restored or new
device starts learning again. That is cheap, and it keeps the promise that
what the child said never leaves the device.

## 3. No accounts: a board, devices and keys

- A **board** has a random id and a random **board key** (256-bit,
  symmetric). The board key encrypts everything that leaves a device.
  **BUILT** (011 slice 3): AES-256-GCM via `getBoardKey` in
  `public/shared/sync_crypto.mjs`, created once and kept in the keystore.
- Each **device** has its own key pair, kept in the platform's secure
  store (iOS Keychain; a non-extractable WebCrypto key in the browser).
  **BUILT**: an ECDSA pair (signs ops/requests) and an ECDH pair (board-
  key transport in pairing) in IndexedDB `pip-keys`; private keys are
  non-extractable. `device_id` = SHA-256 fingerprint of the signing
  public key, recorded on every op via `setDeviceId`/`recordOp`.
- The server knows board ids and device public keys. It never holds the
  board key, a name, a photo or a recording in the clear.

### Pairing (adding a device) — **BUILT** (011 slice 5)

1. The new device (a laptop browser, say) opens Pip and chooses **Link to
   a board**. It shows a QR code and an 8-character code. Both carry only
   its public key and a short-lived pairing id. **BUILT**: the code is the
   `PairingLobby` DO name (`POST /pair` stores the new device's
   `device_id`, signing pubkey, and dh pubkey for 10 minutes); the QR
   encodes `{pair}` and renders via `public/vendor/qrcode.mjs`.
2. On an already-linked device, in the Parent Corner, the adult scans
   the QR or types the code. The linked device shows **"Allow … to edit
   this board?"** Nothing happens until Allow.
3. On Allow, the linked device encrypts the board key to the new device's
   public key and sends it through the relay. The new device downloads
   the snapshot and the log (§ 5). **BUILT**: `wrapBoardKey` (ephemeral
   ECDH → AES-GCM wrap) → `POST /pair/:code/grant` + `POST
   /boards/:id/devices`; the new device polls `GET /pair/:code`, unwraps
   with `unwrapBoardKey`, stores the key, and `initSync` drains the
   confirmed log.

The QR never contains the board key, so a photo of the screen is useless
after the pairing window closes (starting value: 10 minutes). The
direction is reversed from the old sketch (the linked device scans, the new
device shows) because a laptop has no camera to scan with, and the iPad
does.

### Linked devices and revoke — **BUILT** (011 slice 5)

Parent Corner → **Linked devices** lists each device's name and when it was
last seen. **Remove** makes the relay reject that device, and rotates the
board key: a remaining device makes a new key, encrypts it to each
remaining device, and new ops use it. A removed device keeps what it had
already downloaded. That is stated honestly in the UI, not hidden.

**BUILT**: `DELETE /boards/:id/devices/:id` + `POST /keys {epoch,
wrapped:{device:grant}}` bumps `key_epoch` and stores a wrapped key per
remaining device; each op carries the epoch it was sealed under, and a
device seeing a higher epoch picks up its new wrapped key via
`GET /devices/self`. Board keys live per-epoch in the keystore
(`board_key`, `board_key_e2`, …).

## 4. What travels: an encrypted op log

Every adult edit is already a function call on one write owner
(`public/shared/groups.mjs` for groups, entities, placements and synced
settings). **BUILT** (011 slice 1): each write owner records its call as
an **op** in `sync_op` via `recordOp` (`public/shared/ops.mjs`):

```text
{ op_id, device_id, kind: "create_entity" | "rename_entity" |
  "retire_entity" | "restore_entity" | "set_entity_photo" |
  "place_item" | "move_item" | "swap_items" | "remove_item" |
  "create_group" | "delete_group" | "move_group" | "swap_groups" |
  "set_setting" | "set_override" | …, args }
```

- Ops carry intent — the ids, slots and timestamps the write generated —
  and `applyOp` replays them through the same write owners, suppressing
  re-recording. Placement ops land at their slot if free, else the next
  free slot; an op never displaces an item already placed.
- Ops are encrypted with the board key before they leave the device.
  **BUILT**: `sealOp`/`openOp` — AES-256-GCM, random 12-byte IV per op,
  wire format `{v:1, alg:"A256GCM", iv, ct}` base64url.
- A photo or recording is a separate encrypted **blob**. The op carries
  its content hash, not its bytes. **BUILT**: `sealBlob`/`openBlob` —
  same envelope plus `sha`, the plaintext SHA-256, and `e`, the epoch
  the bytes were sealed under; `openBlob` verifies the hash after
  decrypt and fails closed (011 slice 6). Photos are content-addressed
  end to end: `savePhoto` stores bytes under `blob:<sha256>` in OPFS
  `blobs/` and the row's `photo_key` is that key (`public/db.js`), so
  the same bytes land under the same name on every device.
  `loadPhotoURL` hits the local cache first; on a miss it calls the
  fetcher `sync.mjs` registers — `GET /blobs/:sha`, `openBlob` under the
  epoch's key, hash-verified — then caches the verified bytes under the
  same name. A blob that is missing, corrupt, or sealed under a key the
  device does not hold resolves to no image: the tile keeps its name
  and role color and never shows a broken picture. Uploads ride behind
  their op (`syncUploadBlob`, sealed under the current epoch); a fetch
  miss retries once on the next repaint in case the upload lost the
  race. Legacy `opfs:photos/<id>` keys still read.
- Retire, never delete, fits: a removal is an op, and the retired row
  keeps its bytes (`docs/product/Vocabulary_Masking_And_Safety.md` § 3.2).

## 5. Ordering and merging: one order, same functions

**The rule:** every device applies the same ops, in the same order,
through the same functions. Identical input gives identical state, so the
devices converge by construction, not by a merge heuristic. **BUILT**
(011 slice 2) as a local mechanism in `public/shared/ops.mjs`; the relay
itself is still PROPOSED.

- **The relay orders.** A Cloudflare Durable Object per board gives each
  op it accepts the next sequence number. It cannot read the ops. It only
  orders and stores ciphertext. **PROPOSED** — slice 4.
- **Local edits apply at once** (optimistic) and are marked pending:
  **BUILT** — `sync_op.relay_seq` stays NULL until the relay confirms.
- **When confirmed ops arrive**, the device undoes its pending ops,
  applies the confirmed ones in sequence order, then re-applies its
  pending ops on top (a rebase), and sends them. **BUILT** —
  `drainOps` restores the `sync_baseline` snapshot (captured at boot by
  `ensureBaseline`, before the first local edit), applies the confirmed
  stream in `relay_seq` order, saves that as the new baseline, then
  re-applies the still-pending local ops.
- **Ops carry intent, not results.** "Place Cooper in People" means "the
  next free slot when applied". "Move `cup` to page 0 slot 12" means
  "slot 12 if free; if another item took it, the next free slot". An
  op never displaces an item another device already placed. **BUILT** —
  `applyOp` resolves each op against live state; a target gone under
  merge (deleted group, never-created entity) degrades to the nearest
  honest intent — an entity keeps a home in My Words; a sense write into
  a dead group skips.
- **Invariants hold after every op**, because every op runs through the
  same write owner that enforces them today: no orphan entity (My Words
  catch-all), a seeded word never leaves its built-in group, one item per
  slot. Nothing writes the core map, ever.
- **Last writer wins on plain fields.** Two adults renaming Cooper: the
  later sequence number wins, and the earlier name stays in history (the
  schema supersedes and never deletes).

Concurrent edits to the same group are rare (two adults, same minute,
same page). When they happen, one item lands in the next free slot. That
is the only case where a merge can put an item somewhere its adult did not
choose, and it never moves an item that was already placed.

**Snapshots.** Every N ops (starting value 500) a device uploads an
encrypted snapshot of the synced tables and their sequence number. A new
device loads the latest snapshot, then the ops after it.

## 6. The relay (Cloudflare)

| Piece | Holds |
| --- | --- |
| Worker | Pairing endpoints, auth (each request is signed by a device key the board has allowed) |
| Durable Object per board | Sequence counter, the allowed device list, recent ciphertext ops, live fan-out over WebSocket |
| R2 | Encrypted snapshots and blobs (photos, recordings) |

**BUILT** (011 slice 4): `src/worker/relay.js` — `BoardRelay` DO
(`RELAY` binding, `new_sqlite_classes`), R2 `BLOBS` bucket. Routes under
`/boards/...`: `POST /boards` creates a board and registers the creator's
device; `POST /devices` adds a device (signed by an allowed one);
`POST /ops` assigns `relay_seq`, stores the sealed envelope, fans it out
over the WebSocket (`GET /ws`, signed via query params — browsers cannot
set WS headers); `GET /ops?after=N` is the offline catch-up; `PUT/GET
/blobs/:sha` and `PUT/GET /snapshot` stream sealed bytes to/from R2.
Auth: ECDSA P-256 signature over `method\npath\nts\nsha256(body)` in
`x-pip-*` headers, 10-minute freshness window, verified against the
allowed-device list in DO storage. Client: `public/shared/sync_client.mjs`.

What the server can see: board id, device public keys, op sizes and times,
blob sizes. What it cannot see: any name, photo, recording, word, group
name or setting.

Retention, **DECIDED 2026-09-22** (founder: "customizing these things for
people with special needs takes a ton of time"; § 11):

- **A board is never deleted because of payment.** Pricing is a one-time
  purchase, so no one "stops paying". Even a free board keeps its backup.
- **Deleted on request.** The family deletes a board from the Parent
  Corner, with a confirmation and a 30-day undo.
- **Idle boards: 3 years.** A board with no linked device seen for 3 years
  may be deleted. There are no accounts and no email, so the only warning
  channel is the app: any device that returns in the final 6 months sees
  a warning. The window is long because the warning is weak and storage is
  cheap (a heavily customized board is roughly 50–200 MB, pennies a year).
- **Ops fold into snapshots.** Ops older than the latest snapshot are
  pruned after 30 days (starting value). That removes no data: the
  snapshot holds the same state.

## 7. The web editor

The same web app, laid out for a computer when the screen is wide:

- **Library** full-screen with search, the tabs from
  `docs/product/Word_Library.md` § 3, and the word card as a side panel.
- **Bulk paste** (`docs/product/Word_Library.md` § 5.4) and
  **drag-and-drop** photos: drop 12 files and each becomes a draft word
  named from the file name, ready to correct.
- **Groups editor** showing the child's real group page at the profile's
  Cells setting (10×6 today), so drag-to-move shows exactly the
  coordinates the child will see.
- **Record my own** from the laptop microphone.
- **Live.** With the iPad online, an edit reaches it in seconds. With the
  iPad offline, it arrives on the next connect.

**BUILT** (011 slice 7): at `min-width: 1100px` the app opens to the
editor view (`body.editor` in `public/board.js`) — Library and word card
reparented into the left/right panes, the real 10×6 group grid in the
middle with adult gestures always on (`itemCell` ctx), bulk paste and
photo drop in `public/shared/bulk.mjs` writing through the same owners
as single adds. Live sync rides the op log built in slices 1–6. Record
my own from the laptop lands with 009 slice 4 (the recorder). The iPad's
own paste box and multi-photo picker remain with 009 slices 7–8.

In the browser, the synced copy on the relay is the durable one. The
browser's local database is a cache that can be rebuilt from snapshot plus
log, because browsers may evict site storage. If the browser's device key
is lost, the adult links the browser again. Nothing on the board is lost.

## 8. Many boards (SLPs)

**PROPOSED, later.** An SLP's laptop links to many boards and switches
between them. Each board has its own key. The SLP's device is one allowed
device on each board, and the family can remove it.

## 9. Recovery: when every device is gone

**DECIDED 2026-09-22.** This keeps the "zero loss" promise in
`docs/strategy/Vision.md` § 4.4 without accounts.

- **Recovery sheet, free for every board.** When backup is turned on, the
  Parent Corner shows a printable recovery sheet (a QR plus 24 words) that
  holds the board id and the board key. On a new device, **Restore from
  recovery sheet** downloads and decrypts the board. The app reminds the
  family to print or save it, and they can show it again from any linked
  device that holds the recovery root (see the amendment below).

**BUILT 2026-09-23** (slice 8). The sheet is a `pip:recover:<boardId>:<24
words>` QR plus a numbered word grid — Parent corner → Backup → Recovery
sheet → Print (`public/index.html` `#recform`; `showRecoverySheet` in
`public/board.js`). The 24 words encode a 256-bit **recovery root** —
BIP-0039 English list + 8-bit checksum (`public/shared/recovery.mjs`,
`public/shared/recovery_words.mjs` generated from
`data/recovery/words_en.txt` by `scripts/recovery/build_words.mjs`).
Every epoch's board key derives from the root by HKDF
(`deriveEpochKey`, `public/shared/sync_crypto.mjs`), so a sheet printed
at any time opens every epoch — including ops sealed after a device
removal rotated the key.

- The relay stores only `SHA-256(root ‖ "pip-recovery-v1")`, written at
  board bootstrap. `POST /boards/:id/restore` is the one unsigned call
  besides bootstrap: it trades the proof for device registration at the
  current epoch, then the restored device drains the op log like any
  linked device (`src/worker/relay.js`; `restoreDevice` in
  `public/shared/sync_client.mjs`). The relay never sees a key.
- Restore UI: Parent corner → Backup → Restore a board → paste the QR
  text or `boardId + 24 words` (`restoreFlow` in `public/board.js`).
  The success line says plainly that speech history never leaves a
  device, and nothing in the sync path carries history tables.
- **Amendment to "any linked device can show it":** only a device
  holding the recovery root can print the sheet — the device that set
  up sync, or a device restored from a sheet. If every paired device
  held the root, it could re-derive every future epoch key and
  removing a device would be cosmetic. A paired device sees an honest
  "print it on the device that set up sync" instead.
- Proof: `src/board/recovery.test.mjs` (wordlist integrity, words
  round-trip, checksum/word rejection, proof, payload parse, a fresh
  keystore holding only the root opening every epoch's ops);
  `src/worker/recovery.heavy.test.mjs` (real relay: restore after a
  rotation, synced tables byte-identical, history tables empty, wrong
  proof → 403); live two-browser proof — device A linked, added a word,
  spoke a sentence, showed the sheet; fresh-profile device C pasted the
  payload, restored byte-identical synced tables with empty history
  and the history notice on screen.
- **The iPad's own backup counts too.** On the iOS app, Apple's device
  backup (iCloud or computer) restores the app's data and the Keychain
  board key. That is Apple's backup, not our sync, and it is a second path.
- Without the sheet, a linked device, or a device backup, the board is
  gone. We cannot recover it, and the UI says so plainly when backup is
  turned on.

## 10. Bans

| Ban | Negative test |
| --- | --- |
| Plaintext leaves the device | Capture every relay request during a scripted edit session. No request body contains the entity's spoken name, a group name, or photo/recording bytes that hash to the originals. |
| History syncs | After 50 taps and a sync, no captured payload decrypts to a `learner_event_log`, `sentence` or `strip_impression` row. |
| Suggested words sync | Same capture: no suggestion row. |
| Two devices diverge | Two replicas apply the same op set with randomized network delays and offline gaps; their synced tables are byte-identical afterwards. |
| A merge moves an already-placed item | Every item placed before a concurrent op keeps its `(page, slot_index)`. |
| Sync writes the core map | `core_cell` snapshot before and after any sync is identical. |
| An unallowed device reads or writes a board | A request signed by an unknown key is rejected, and a removed device's next write is rejected. |
| Communication depends on sync | With the relay unreachable, every tap speaks and every edit saves locally. |

## 11. Founder rulings (2026-09-22)

All five asked questions were answered ("all agreed"):

1. **Recovery sheet:** yes (§ 9).
2. **iPad backup:** accepted as a second recovery path (§ 9).
3. **History across devices:** no. History stays on the device (§ 2).
4. **Retention:** never deleted for payment; deleted on request; idle
   boards after 3 years with in-app warnings (§ 6).
5. **Free vs paid:**
   - **Free for every board:** encrypted backup, the recovery sheet, and
     restore. "A voice is not rented" includes the vocabulary
     (`docs/product/Pricing_And_Packaging.md` § 1). A free board has one
     linked device at a time; restoring onto a new device moves the board
     there.
   - **Pip Lifetime:** more than one linked device, the web editor, and
     Draw it for me (`docs/product/Word_Library.md` § 6.1).

On iOS, the Lifetime unlock is an in-app purchase (Apple requires it for
digital unlocks). **UNVERIFIED:** how school and grant purchases (Apple
School Manager volume purchase) interact with it. Check before pricing
ships.
