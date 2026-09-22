# Sync and web editing

**Direction DECIDED 2026-09-22** (founder: "a user can create and edit
things on a computer and then have them also on their iPad"). **The design
below is PROPOSED** until the founder rules on § 11. Not built.
Intake: `docs/founder/2026-09-22_Customization_Library_Sync.md`.
Execution: `docs/phases/011_Sync_And_Web_Editing.md`.
Platforms: `docs/product/Platforms_iOS_And_Web.md`.

This file replaces the PROPOSED pairing sketch in
`docs/phases/002_Core_Board_And_Customize.md` § Out of scope and the
"Phase 003 — Multi-Device Pairing" entry in `docs/strategy/Roadmap.md`.
It keeps their principles: no account, a QR introduction, per-device keys,
Cloudflare carries only ciphertext, and not iCloud.

It touches credentials, privacy and user-data retention (`AGENTS.md`
§ High-Risk Stops). Nothing here is built before the § 11 rulings.

---

## 1. What it is for

1. **Edit on a computer, speak on the iPad.** A parent or SLP adds 40
   words by pasting them, drags in photos, records names, and rearranges
   groups at a desk. The child's iPad has all of it the next time it is
   online.
2. **More than one adult.** Mom's phone, Dad's laptop and the school SLP
   edit the same board.
3. **A broken iPad is not a lost voice.** A new device restores the board
   (§ 9).

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

Open: whether history should sync between the family's own devices so the
strip learns once (§ 11 Q3). The default is no.

## 3. No accounts: a board, devices and keys

- A **board** has a random id and a random **board key** (256-bit,
  symmetric). The board key encrypts everything that leaves a device.
- Each **device** has its own key pair, kept in the platform's secure
  store (iOS Keychain; a non-extractable WebCrypto key in the browser).
- The server knows board ids and device public keys. It never holds the
  board key, a name, a photo or a recording in the clear.

### Pairing (adding a device)

1. The new device (a laptop browser, say) opens Pip and chooses **Link to
   a board**. It shows a QR code and an 8-character code. Both carry only
   its public key and a short-lived pairing id.
2. On an already-linked device, in the Parent Corner, the adult scans
   the QR or types the code. The linked device shows **"Allow Chrome on
   MacBook to edit Ava's board?"** Nothing happens until Allow.
3. On Allow, the linked device encrypts the board key to the new device's
   public key and sends it through the relay. The new device downloads
   the snapshot and the log (§ 5).

The QR never contains the board key, so a photo of the screen is useless
after the pairing window closes (starting value: 10 minutes). The
direction is reversed from the old sketch (the linked device scans, the new
device shows) because a laptop has no camera to scan with, and the iPad
does.

### Linked devices and revoke

Parent Corner → **Linked devices** lists each device's name and when it was
last seen. **Remove** makes the relay reject that device, and rotates the
board key: a remaining device makes a new key, encrypts it to each
remaining device, and new ops use it. A removed device keeps what it had
already downloaded. That is stated honestly in the UI, not hidden.

## 4. What travels: an encrypted op log

Every adult edit is already a function call on one write owner
(`public/shared/groups.mjs` for groups; the entity save in
`public/board.js`). Sync records each of those calls as an **op**:

```text
{ op_id, device_id, kind: "place_item" | "move_item" | "swap_items" |
  "remove_item" | "create_group" | "rename_entity" | "set_photo" |
  "set_override" | "set_setting" | …, args }
```

- Ops are encrypted with the board key before they leave the device.
- A photo or recording is a separate encrypted **blob**. The op carries
  its content hash, not its bytes.
- Retire, never delete, fits: a removal is an op, and the retired row
  keeps its bytes (`docs/product/Vocabulary_Masking_And_Safety.md` § 3.2).

## 5. Ordering and merging: one order, same functions

**The rule:** every device applies the same ops, in the same order,
through the same functions. Identical input gives identical state, so the
devices converge by construction, not by a merge heuristic.

- **The relay orders.** A Cloudflare Durable Object per board gives each
  op it accepts the next sequence number. It cannot read the ops. It only
  orders and stores ciphertext.
- **Local edits apply at once** (optimistic) and are marked pending.
- **When confirmed ops arrive**, the device undoes its pending ops,
  applies the confirmed ones in sequence order, then re-applies its
  pending ops on top (a rebase), and sends them.
- **Ops carry intent, not results.** "Place Cooper in People" means "the
  next free slot when applied". "Move `cup` to page 0 slot 12" means
  "slot 12 if free; if another item took it, the next free slot". An
  op never displaces an item another device already placed.
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

What the server can see: board id, device public keys, op sizes and times,
blob sizes. What it cannot see: any name, photo, recording, word, group
name or setting.

Retention: ops older than the latest snapshot are deleted after 30 days
(starting value). A board with no device seen for 18 months is deleted
after an in-app warning to any device that returns. Both are
**PROPOSED** (§ 11 Q4).

## 7. The web editor

The same web app, laid out for a computer when the screen is wide:

- **Library** full-screen with search, the tabs from
  `docs/product/Word_Library.md` § 3, and the word card as a side panel.
- **Bulk paste** (`docs/product/Word_Library.md` § 5.4) and
  **drag-and-drop** photos: drop 12 files and each becomes a draft word
  named from the file name, ready to correct.
- **Groups editor** showing the real 10×6 page, so drag-to-move shows
  exactly the coordinates the child will see.
- **Record my own** from the laptop microphone.
- **Live.** With the iPad online, an edit reaches it in seconds. With the
  iPad offline, it arrives on the next connect.

In the browser, the synced copy on the relay is the durable one. The
browser's local database is a cache that can be rebuilt from snapshot plus
log, because browsers may evict site storage. If the browser's device key
is lost, the adult links the browser again. Nothing on the board is lost.

## 8. Many boards (SLPs)

**PROPOSED, later.** An SLP's laptop links to many boards and switches
between them. Each board has its own key. The SLP's device is one allowed
device on each board, and the family can remove it.

## 9. Recovery: when every device is gone

The old sketch said: if every linked device is lost, the board is gone.
`docs/strategy/Vision.md` § 4.4 promises zero loss. Both cannot hold.

**PROPOSED:** a **recovery key**. At first sync the Parent Corner shows a
printable recovery sheet (a QR plus 24 words) that holds the board id and
the board key. On a new device, **Restore from recovery sheet** downloads
and decrypts the board. Without the sheet, and with no linked device, the
board is gone. We cannot recover it, and the UI says so.

On the iOS app, the iPad's own backup (iCloud or computer) also restores
the app's data with the board key in the Keychain. That is Apple's
backup, not our sync (§ 11 Q2).

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

## 11. Founder rulings needed before building

1. **Recovery sheet (§ 9):** yes or no. Without it, "zero loss" in the
   Vision must be removed.
2. **iPad backup:** accept Apple's device backup as a second recovery
   path on iOS?
3. **History across the family's devices:** keep it on the device
   (default), or sync it encrypted so prediction learns once?
4. **Retention (§ 6):** 30-day op pruning and 18-month idle deletion, or
   other numbers?
5. **Pricing:** sync and web editing are in Pip Lifetime
   (`docs/product/Pricing_And_Packaging.md` § 2). Does a free board get
   any sync at all, for example a recovery sheet only?
