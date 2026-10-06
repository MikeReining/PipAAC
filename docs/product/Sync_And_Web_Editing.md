# Sync and web editing

**Direction DECIDED 2026-09-22** (founder: "a user can create and edit
things on a computer and then have them also on their iPad"). **Rulings
DECIDED 2026-09-22** (§ 11). The web sync relay, encrypted backups, pairing and recovery are built and live.
The current contracts below include the 2026-10-04 reliability audit fixes.
Native iOS integration remains a separate platform slice.

**Working-tree amendment, awaiting delegated verification and deployment:**
the resumable card journal, atomic guarded card/epoch publication, relay-side
removal obligation and explicit submit-epoch checks described below are
implemented but have not shipped from this session. The prior deployed
reliability fixes remain live. The current handoff names the verification gate.
Intake: `docs/founder/2026-09-22_Customization_Library_Sync.md`.
Execution: phase 011 (in git history).

**Amended 2026-09-23 (§ 12):** supporter accounts, many users per device,
the QR card instead of 24 words, one price per user. The sync unit this
doc calls a **board** is a **user** (the person who speaks); "boards" in
product copy means pages again. Where § 12 disagrees with an earlier
section, § 12 wins. Intake: `docs/founder/2026-09-23_Accounts_And_Pricing.md`.
Execution: `docs/phases/015_Accounts_And_One_Price.md`.
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

The unit of sync is **one user**: one learner profile and everything the
adults authored for that person. Pages belong to that user.

| Syncs (adult-authored) | Never syncs |
| --- | --- |
| `personal_entity` and its photos | `learner_event_log`, `sentence`, `strip_impression` (what the child said: history never leaves the device, `docs/strategy/Dual_Engine_Predictive_Intelligence.md` § 4.1) |
| `board_group`, `group_label`, `group_cell` (groups, names, placements) | `prediction_weights` (learned from that child's own taps on that device) |
| `clip_override` and its audio | Suggested words (`docs/product/Word_Library.md` § 8: on the device only) |
| Picture overrides and masking (hidden words) | Partner words (never stored at all) |
| `entity_enrichment` (so it is never re-asked, `docs/product/Personal_Entities.md` § Enrichment) | The catalog (each device has its own copy of the same version) |
| Profile settings: voice, presentation mode, Jev sharing, suggestions toggle | The Parent Corner PIN and biometrics (per device) |
| Daily stats totals, counts only (DECIDED 2026-09-23, `docs/product/Stats_And_Progress.md` § 6.2) | |

**DECIDED 2026-09-22:** history stays on the device. A restored or new
device starts learning again. That is cheap, and it keeps the promise that
what the child said never leaves the device.

## 3. A board, devices and keys

- A **user** has a random id and an AES-256-GCM **user key** for each
  epoch. On a device holding the 128-bit recovery root, `getUserKey`
  derives an epoch key through HKDF (`deriveEpochKey`). A paired device
  receives wrapped epoch keys and holds no root. Missing historical
  keys fail explicitly; sync must never invent replacements for them.
- Each **device** has an ECDSA signing pair and an ECDH transport pair
  in IndexedDB `pip-keys`; private keys are non-extractable.
  `getDeviceIdentity` fingerprints the signing public key for `device_id`.
  Identity, root and epoch-key creation are coordinated by named locks
  (`navigator.locks` across tabs, in-process serialization otherwise).
- The server knows user ids and public keys. It never holds a user key,
  recovery root, name, photo or recording in the clear. The native iOS
  secure-store adapter is planned; the browser implementation ships today.

### Pairing (adding a device) — **BUILT** (011 slice 5; flipped 2026-10-04)

1. On the device that already has the person, Settings → Team & devices
   → **Add a device** shows an 8-character code, a QR, and **Send the
   link instead**. **BUILT**: `POST /pair` opens a `PairingLobby` DO
   named by the code for 10 minutes; the QR and the link are
   `<origin>/join#CODE`. A free user (one device) gets the Pip Lifetime
   door instead of a code — the relay's entitlement decides.
2. The new device types the code: on the welcome (**Enter a code**), in
   Team & devices (**Join with a code**), or at `<origin>/join`. A phone
   camera on the QR opens the link and needs no typing. **BUILT**:
   `POST /pair/:code/claim` stores the new device's `device_id`, signing
   pubkey, dh pubkey, and name ("Mac · Chrome"); first claim wins.
3. The offering device, polling `GET /pair/:code`, sees the claim and
   hands over the key with no further tap — the code on its own screen
   was the consent. **BUILT**: `POST /users/:id/devices` (with the name)
   + `wrapUserKey` (ephemeral ECDH → AES-GCM wrap) → `POST
   /pair/:code/grant`; the new device unwraps with `unwrapUserKey`,
   stores the key, replaces its untouched welcome placeholder (no
   duplicate person), and `initSync` drains the confirmed log.

The code never carries the user key, so a photo of the screen is useless
after the pairing window closes (10 minutes) or once it is claimed. The
code is shown on the device that already has the person because that is
the device the adult is holding when they decide to add one; the new
device has nothing to show yet (founder 2026-10-04).

### Linked devices and revoke — **BUILT** (011 slice 5)

Settings → Team & devices lists each device. **Remove** deletes its
relay registration and closes its live sockets immediately. The same
relay mutation records `rotate_min_epoch`, so an interrupted client
cannot forget that encryption still needs rotating. A removed device
keeps what it already downloaded.

A remaining owner holding the **current** recovery root derives the next
key and wraps it for every remaining device (`completeRemovalRotation`,
`public/shared/rotation.mjs`). A paired owner has no root and leaves the
relay obligation for a root holder. Signed `POST /keys` validates the
root's proof when supplied; an owner holding a retired root cannot
silently rotate under the wrong card. `GET /devices/self` returns every
historical device grant (`wrapped_keys`) and `current_epoch`, so a device
that missed several rotations opens each era and catches its outgoing
client up even if no new op arrives. Keys stay at `user/<id>/key_e<n>`.

Proof: `src/worker/rotation.test.mjs`,
`src/board/sync_snapshot.test.mjs`, `src/worker/relay.heavy.test.mjs`.

## 4. What travels: an encrypted op log

Every adult edit is already a function call on one write owner
(`public/shared/groups.mjs` for groups, entities, placements and synced
settings). **BUILT** (011 slice 1): each write owner records its call as
an **op** in `sync_op` via `recordOp` (`public/shared/ops.mjs`):

```text
{ op_id, device_id, kind: "create_entity" | "rename_entity" |
  "retire_entity" | "restore_entity" | "set_entity_photo" |
  "place_item" | "move_item" | "swap_items" | "remove_item" |
  "create_group" | "delete_group" | "move_group" | "swap_groups" | "reorder_groups" |
  "set_setting" | "set_override" | …, args }
```

- Ops carry intent — the ids, slots and timestamps the write generated —
  and `applyOp` replays them through the same write owners, suppressing
  re-recording. Placement ops land at their slot if free, else the next
  free slot; an op never displaces an item already placed.
- Ops are encrypted with the epoch's user key before they leave the device.
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
  **043 C amendment (built):** uploads are durable — `syncUploadBlob`
  queues the sha in the device keystore (`blobq/<user>`) so a kill,
  an offline edit, or a pre-link add never loses it; `drainBlobs` runs
  at boot and every recover, removing an entry after the relay holds the bytes; a locally missing
  sha heals *from* the relay
  instead of re-uploading. Only ten proven misses (local bytes absent
  and relay 404) may drop an unrecoverable entry; available local bytes
  and transient network errors retain the obligation. Queue mutations
  serialize within the running sync handle. Failed drains re-arm;
  `syncHealth().mediaPending`/`mediaError` surface the queue.
- Retire, never delete, fits: a removal is an op, and the retired row
  keeps its bytes (`docs/product/Vocabulary_Masking_And_Safety.md` § 3.2).

### 027 group-state amendment — decided 2026-09-27, BUILT 2026-09-28

027 A2 adds layout coordinates to group ops and puts `group_membership`,
`group_cell` (per board size), seed installation records, visibility, and the
top-row setting in the synced state. The reserved cells (top row, frame) are
never stored per group, so they sync nothing of their own. A newly restored
device loads saved installation markers before seeding; empty or pruned groups
stay that way after import and replay. The seed-install op carries the installed
memberships and positions, so replay never re-derives them from a newer catalog.
A Cells change is one op that writes the new size's missing positions.

**Compatibility:** the 027 schema break originally reset pre-change databases.
Current releases preserve family edits. Legacy NULL-watermark baselines
and the damaged 095302a3 starter artifact have explicit repair paths in
`ops.mjs`; they must not be repaired by indiscriminate reseeding.

Local group edits never target other groups. Multi-board add carries explicit
selected destination IDs and chosen positions as one operation; replay resolves
occupied cells with the same deterministic geometry owner. Identity, photo, and
recording edits stay shared. Crypto, relay access, history privacy, and user
data retention are unchanged.

Built ops (`public/shared/ops.mjs`): `seed_install` (first confirmed install
wins), `place_item` with per-size `cells`, `add_to_groups`, `move_item` /
`swap_items` / `remove_item` with `layout`, `set_group_hidden`, and `set_layout`
carrying `groupCells`; a group op without `layout`/`cells` predates 027 and is
skipped on every replica. `SYNCED_TABLES` adds `group_membership` and
`group_seed_install`. Durable group semantics live in Motor_Grid_And_Art
§ Groups. No runtime block membership or linked-edit ops.

## 5. Ordering and merging: one order, same functions

The relay assigns the intended order; every replica uses the same write
owners to replay operations (`public/shared/ops.mjs`). The relay is built.

- **Sequence numbers are sparse.** Deduplicated submissions can consume
  AUTOINCREMENT values. A numerical gap alone is not evidence of lost
  operations. `GET /ops` supplies `snap_seq` so recovery can distinguish
  snapshot-covered/pruned history from numbers that never existed.
- **Local edits apply immediately.** `recordOp` appends to `sync_op`;
  `relay_seq IS NULL` means pending. A relay acknowledgment assigns a
  sequence; it does not prove the corresponding state was applied or saved.
- **Replay checkpoints live in the DB.** `drainOps` restores
  `sync_baseline`, applies confirmed ops whose `sync_op.applied` flag is
  still zero in sequence order (seed installs first), then re-applies
  pending edits. The replay, flags, new baseline and pending reapplication
  commit together. `sync_baseline.applied_seq` describes applied coverage;
  already applied operations must never re-run over the advancing baseline.
- **Fetch coverage has a separate owner.** The registry's `sync.cursor`
  advances only after a fetched batch applies and the DB flush succeeds.
  WebSocket pushes apply and persist without moving that cursor. Boot
  lowers an overclaiming cursor to the DB checkpoint; it never raises one
  merely because the DB saw a later push. Save failures leave coverage
  behind and surface through `syncHealth().ingestError`.
- **One recovery flow.** Boot, socket open/reopen, `online` and visibility
  all enter `recover`: fetch → decrypt → apply → persist → advance cursor
  → flush → reconcile/drain media. Fetch and submit batches are 200 ops;
  submits share one in-flight promise. Failed submits retry automatically
  with bounded backoff (eight retries), then await the next wake or edit.
  A raised snapshot watermark with a missing tail, including an empty
  tail, adopts the bridging snapshot or reports a named failure.

- **Ops carry intent, not results.** "Place Cooper in People" means "the
  next free slot when applied". "Move `cup` to page 0 slot 12" means
  "slot 12 if free; if another item took it, the next free slot". An
  op never displaces an item another device already placed. **BUILT** —
  `applyOp` resolves each op against live state; a target gone under
  merge (deleted group, never-created entity) degrades to the nearest
  honest intent. **027 amendment (built):** writes into deleted groups
  skip for both senses and entities; they do not silently file into My Words.
- **Invariants hold after every op**, because every op runs through the
  same write owner. **027 amendment (built):** one membership per
  group/item, one occupant per board size/page/slot, no writes to reserved cells,
  and no placement edits to other groups. Zero placements is allowed; built-in
  words may be removed locally. Group ops never write the core map.
- **Last writer wins on plain fields.** Two adults renaming Cooper: the
  later sequence number wins, and the earlier name stays in history (the
  schema supersedes and never deletes).

Concurrent edits to the same group are rare (two adults, same minute,
same page). When they happen, one item lands in the next free slot. That
is the only case where a merge can put an item somewhere its adult did not
choose, and it never moves an item that was already placed.

**Delivery order and the replay anchor (fixed 2026-10-05).**
Per-op `applied` flags dedupe but do not order, and an applied op must
never re-run over a baseline that already contains it (a swap replayed
twice undoes itself). The durable split: `sync_baseline` row 1 is the
derived post-fold baseline; row 2 is the stable replay anchor — the
post-catalog origin, replaced by each adopted snapshot — whose
`applied_seq` is a coverage floor.

A pushed op only overlays onto live state; it is never folded and never
moves coverage. A fetched page folds the retained tail above the floor
and at or below the page's max, in relay order, into the baseline —
push residue above the page stays overlay until a page covers it. Ops
arriving at or below the anchor floor are claimed inside the snapshot
and never replay, so a covered create cannot resurrect a deleted group.
When a persisted wound survives from the pre-anchor repair (an
unapplied op below applied coverage), the drain rebuilds the retained
tail over the anchor instead of in place; with no anchor row it refuses
loudly, and recovery rewinds the cursor to the floor so a snapshot
adoption can install one. Flags, the baseline, and pending-edit
reapplication commit in one transaction; a failing replay rolls all of
it back.

Proof: `src/board/sync_order_review.test.mjs` — non-idempotent swap
convergence across push-first delivery, snapshot coverage surviving an
empty drain, covered history never resurrecting, failed-repair flag
preservation, a persisted close/reopen across the repair, and the
anchorless wound refusing until adoption installs one — plus
`node scripts/probes/sync_delivery_order.mjs` (later-push-first,
own-ack-first, snapshot-tail all converge to "Newer", pending edits
kept).

**Also fixed 2026-10-05:** fetched coverage is capped at the last row in
the current page, rather than a higher pushed watermark; a failed DB
save stops that catch-up pass. Media uses a separate retry counter
(30 seconds up to 5 minutes), retains transient obligations and
serializes reconciliation with queue appends/drains.

**Snapshots.** `maybeSnapshot` waits until the fetch-verified cursor is
at least 500 sequences beyond the previous upload and equals
`appliedSeqOf(db)`. It seals **the stored baseline**, never live tables
with pending edits. The inner payload is `{v: SNAPSHOT_V, seq, snap}`;
format 1 is current, a missing version means legacy format 1, and a
newer format must fail without claiming coverage.

`adoptSnapshot(tables, seq)` flags covered ops, stamps the DB watermark,
and reapplies pending edits. Registry coverage moves only after that DB
persists. `stats_day` counts travel with the other synced tables; raw
sentence and tap history stay local.

The relay writes immutable `s/<user>/<seq>` objects and advances its
committed `(snapshot_key, snapshot_seq)` pointer after external I/O and
rechecking sequence coverage. Same-seq uploads cannot rewrite published
bytes. Pruning uses the committed pointer, not an in-flight upload.
Legacy `s/<user>` snapshots remain readable.

Proof: `src/board/sync_watermark.test.mjs`,
`src/board/sync_snapshot.test.mjs`, `src/board/sync_reliability.test.mjs`,
`src/worker/relay.heavy.test.mjs`.

## 6. The relay (Cloudflare)

| Piece | Holds |
| --- | --- |
| Worker | Pairing endpoints, auth (each request is signed by a device key the board has allowed) |
| Durable Object per board | Sequence counter, the allowed device list, recent ciphertext ops, live fan-out over WebSocket |
| R2 | Encrypted snapshots and blobs (photos, recordings) |

**BUILT** (011 slice 4): `src/worker/relay.js` — `UserRelay` DO
(`RELAY` binding, `new_sqlite_classes`), R2 `BLOBS` bucket. Routes under
`/users/...`: `POST /users` creates a user and registers the creator's
device; `POST /devices` adds a device (signed by an allowed one);
`POST /ops` assigns `relay_seq`, stores the sealed envelope, fans it out
over the WebSocket (`GET /ws`, signed via query params — browsers cannot
set WS headers); `GET /ops?after=N&limit=200` is the paged offline catch-up; `PUT/GET
/blobs/:sha` and `PUT/GET /snapshot` stream sealed bytes to/from R2.
Auth: ECDSA P-256 signature over `method\npath\nts\nsha256(body)` in
`x-pip-*` headers, 10-minute freshness window, verified against the
allowed-device list in DO storage. Client: `public/shared/sync_client.mjs`.

**BUILT** (013 slice 4): the ws also carries live modeling — a sealed
`{t:"model"}` message a linked device sends upstream, which the DO
rebroadcasts to the user's other sockets stamped `from` the sender's
device id (`src/worker/relay.js` `webSocketMessage`). It is transient:
never stored, never in the op log. Client send/receive:
`sendModel`/`onModel` in `public/shared/sync.mjs`.

**BUILT** (015 slices 6–7 relay legs, 2026-09-23): `POST /entitlement`
activates a user-bound license (`src/worker/license.mjs`, HMAC over
`pip-lifetime:<userId>` against `PIP_LICENSE_SECRET` — the dev path;
verified Stripe/Apple purchases mint the same seam when slice 6 lands
its billing half). `POST /devices` on a free user with a linked device
answers `403 upgrade_required`; `POST /restore` on a free user replaces
the device set (the sheet moves the user; on Lifetime it adds).
`DELETE /users/:id` schedules deletion at +30 days, `POST /undelete`
cancels; `GET /devices/self` carries `entitlement`, `delete_at`, and
`idle_delete_at`.

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

**BUILT** (2026-09-23): all four rules run on the relay. `last_seen` is
stamped on every signed request; a daily Durable-Object alarm runs
`retentionSweep(now)`, which destroys a board only for the two causes
above (`destroy()` deletes R2 `b/<user>/*`, legacy `s/<user>`, every
immutable `s/<user>/<seq>` backup, the current card's `ri/` proof-index
entry, and the DO's own storage — nothing about entitlement ever reaches
it). Proof: `entitlement.test.mjs` plants each namespace and asserts its
removal. A proof-index entry orphaned by an interrupted index write is
keyed by hash and unlistable per user — it can only dangle; destroy
cannot enumerate it.
The warning rides `GET /devices/self` as `idle_delete_at`, computed from
the previous `last_seen` so a returning device still sees it once.
Pruning applies only to ops covered by `snapshot_seq` and older than 30
days — with no snapshot nothing is pruned. Supporter-email warnings
remain for the accounts slices (§ 12). Proofs:
`src/worker/entitlement.test.mjs` (cap, move, boundaries, undo, prune),
`scripts/probes/entitlement_probe.mjs` (Parent Corner activate/delete/
undo against the live relay).

## 7. The web editor

**2026-09-29:** the editor's layout is rebuilt in
`docs/phases/031_Board_Editor.md` (the board is the editor; one add-or-find
field; pages list; card on selection). Sync and live behavior below are
unchanged.

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

In the browser, SQLite edits persist through the per-user IndexedDB
export (`public/db.js`, `public/shared/users.mjs`); the previous export
is kept for recovery. Pending operations and media are obligations still
held locally, not proof of a completed relay backup. Browser eviction can
lose unuploaded edits. Relay-accepted state restores from snapshot plus
log; a lost device identity needs pairing, an account join or the card.
"Saved" depends on local persistence, inbound health and media as well
as pending op counts (`editorStatus`, `public/board/editor-find.js`).

## 8. Many boards (SLPs)

*Superseded 2026-09-23: DECIDED, § 12.4.*

**BUILT.** One device holds a registry and separate SQLite database/key scope
per user (§ 12.4). Sharing one user does not share another.

## 9. Recovery: when every device is gone

*Amended 2026-09-23: the 24 words leave the UI; the QR card is the
restore path (§ 12.5), and a supporter account restores without any
card (§ 12.3). The recovery root and its derivation stay.*

**DECIDED 2026-09-22.** This keeps the "zero loss" promise in
`docs/strategy/Vision.md` § 4.4 without accounts.

- **QR card, free for every user.** When backup is turned on, the
  Parent Corner shows a printable QR card that carries the recovery root. On a new device, **Restore a user** downloads and
  decrypts the user. The app reminds the family to print or save it,
  and they can show it again from any linked device that holds the
  recovery root (see the amendment below).

**BUILT 2026-10-01** (amends 015 slice 3). The card is a QR plus the
**12 recovery words** (128-bit root + 4-bit checksum, BIP-0039 list).
The words alone are the code: the QR and the email carry one link,
`<origin>/#restore=<word-word-…-word>` (`cardLink`,
`public/shared/recovery.mjs`). The fragment never reaches a server;
tapping it opens Restore with the words filled in, and the adult presses
Restore (above the first-run welcome on a new device). The relay
finds the user from the proof: `POST /restore` looks up R2
`ri/<sha256(proof)>` → user id, written at bootstrap and replaced on
Replace card (`restoreByProof`, `indexProof`, `src/worker/restore.js`)
— keyed by the hash because the proof is itself the credential. The
person's name rides the synced profile (`learner_profile.person_name`),
so a restored device comes back named. Card UI: **Email** (phones: share sheet; desktop: Gmail
compose), **Copy link**, **Print**, and **More…** (Save image, Replace
card…) (`showCard`, `public/board/recovery-ui.js`). Pasting tolerates
spaces, commas, hyphens, newlines. No users existed, so the 43-char
code, 24-word sheets and the user-id-in-code format no longer parse. The
link may sit in a mailbox: this guards an AAC board, not funds. Every
epoch's user key derives from the root by HKDF (`deriveEpochKey`).

- The relay stores only `SHA-256(root ‖ "pip-recovery-v1")`, written at
  user bootstrap. `POST /users/:id/restore` is the one unsigned call
  besides bootstrap: it trades the proof for device registration at the
  current epoch, returns `moved` (a free user's other devices were
  unlinked — the restored device says so on first boot) and
  `recovery_bundle`, then the restored device drains the op log like
  any linked device (`src/worker/relay.js`; `restoreDevice` in
  `public/shared/sync_client.mjs`). The relay never sees a key.
- Restore UI: Parent corner → Backup → Restore a user → **Scan the
  card** (camera, `BarcodeDetector`), **Choose a photo** of the card,
  or paste the code (`restoreFlow`, `scanBitmap` in `public/board/recovery-ui.js`).
  The dialog warns that a free-user restore unlinks the other devices.
- **Replace card:** `replaceRecoveryCard` first persists
  `rotation/<user>` in the device keystore: old/new roots, target epoch,
  wrapped device grants and the historical-key bundle sealed to the new
  root. It imports held relay grants before building that bundle, so a
  stale UI epoch does not truncate history. Signed `POST /recovery`
  checks the expected old proof and next epoch, then commits proof,
  bundle and device grants/epoch together in one relay SQL transaction
  (`src/worker/rotation.mjs`). The proof index is external R2: it is
  repaired by an idempotent replay of the same staged request after a
  lost response or interrupted write. The relay still validates the
  proof itself; an obsolete index entry confers no restore authority.
- `resumeRecoveryCard` retries the same card on boot/reconnect, before
  submitting edits and before displaying the card. After acknowledgment
  it retires the old root idempotently, installs the new root/key,
  saves the registry epoch and rekeys the live client. Only then does
  it delete the journal. Competing replacements fail `recovery_conflict`
  instead of overwriting another owner's card. A competing removal
  rotation restages the same new root at the current epoch for retry.
- Updated clients explicitly submit their sealing epoch. The relay
  rejects a stale epoch before inserting an operation, preserving the
  outbox for retry. Legacy clients that omit that field or use split
  card replacement remain compatible; the stronger guarantees require
  the updated client. No root or plaintext key leaves the device.
- **Amendment to "any linked device can show it":** only a device
  holding the recovery root can print the card — the device that set
  up sync, or a device restored from a card. If every paired device
  held the root, it could re-derive every future epoch key and
  removing a device would be cosmetic. A paired device sees an honest
  "print it on the device that set up sync" instead.
- Proof: `src/board/recovery.test.mjs` (12-word round-trip, checksum,
  root/epoch derivation); `src/worker/rotation.test.mjs` (interruption
  after each durable step, lost responses, competing proofs, stale
  sealing epoch, fresh-root decryption of both eras);
  `src/worker/recovery.heavy.test.mjs` (local Cloudflare runtime,
  old card denied, new card restores the full backlog).
  Real iPad kill/relaunch and camera/photo scanning remain device proof.
- **The iPad's own backup counts too.** On the iOS app, Apple's device
  backup (iCloud or computer) restores the app's data and the Keychain
  user key. That is Apple's backup, not our sync, and it is a second path.
- Without the card, a linked device, or a device backup, the user is
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

1. **Recovery (the QR card):** yes (§ 9).
2. **iPad backup:** accepted as a second recovery path (§ 9).
3. **History across devices:** no. History stays on the device (§ 2).
4. **Retention:** never deleted for payment; deleted on request; idle
   boards after 3 years with in-app warnings (§ 6). **BUILT** on the
   relay (2026-09-23, § 6 note).
5. **Free vs paid:** *(superseded 2026-09-23 by
   `docs/product/Pricing_And_Packaging.md` § 4)*
   - **Free for every user:** encrypted backup, the QR card, and
     restore. "A voice is not rented" includes the vocabulary
     (`docs/product/Pricing_And_Packaging.md` § 1). A free board has one
     linked device at a time; restoring onto a new device moves the board
     there. **BUILT** (2026-09-23): the cap and the move are enforced by
     the relay, not the UI (§ 6).
   - **Pip Lifetime:** more than one linked device, the web editor, and
     Draw it for me (`docs/product/Word_Library.md` § 6.1).

On iOS, the Lifetime unlock is an in-app purchase (Apple requires it for
digital unlocks). *Resolved 2026-09-23:* a consumable per user, schools
through license codes (`docs/product/Pricing_And_Packaging.md` § 4.5).

## 12. Accounts, users and the QR card (2026-09-23)

**DECIDED 2026-09-23** (not built; founder: "all approved"). Intake:
`docs/founder/2026-09-23_Accounts_And_Pricing.md`. Execution:
`docs/phases/015_Accounts_And_One_Price.md`. The engineering in § 12.3–
§ 12.5 is the proposed design, confirmed or changed by the 015 slices.

### 12.1 Words

| Use | Means | Was |
| --- | --- | --- |
| **user** | the person who speaks with Pip ("Add user"); the unit of sync, backup and price | board |
| **supporter** | an adult who helps a user: parent, grandparent, SLP, teacher | adult, linked device owner |
| **boards / groups** | pages inside one user | (unchanged) |
| **user key** | the key that locks one user's words, photos and recordings | board key |
| **QR card** | the printable, emailable QR that restores or shares one user | recovery sheet |

### 12.2 What stays

§ 2 (what syncs; history never leaves the device), § 4–§ 7 (op log,
merge, relay, web editor), the pairing and Allow flow (§ 3) and § 10's
bans. The server still never reads a name, photo, recording, word or
group name. Each user has its own key, so sharing one child with an SLP
never shares a sibling.

### 12.3 Supporter accounts

- A supporter signs in with **email and a passkey** (Face ID, Touch ID,
  Windows Hello). The child's device never signs in, and speaking never
  waits on an account or a network.
- An account holds: the email, passkeys, the users it supports, an
  **account key pair**, and purchases.
- **Keys stay end to end.** The account's private key is sealed under a
  key the passkey produces on the device (WebAuthn PRF); the server stores
  only the sealed key. Each user's key is wrapped to each supporting
  account's public key, the way it is wrapped to devices today (§ 3). On a
  new laptop: sign in, Face ID, and every user appears with its keys.
- **Without PRF** (some authenticators lack it): email sign-in still
  shows the users and purchases; the keys arrive by an Allow on another
  device (§ 3) or by scanning a QR card.
- **Email is the contact channel** for receipts and the idle-deletion
  warning (§ 6), which today can only be shown in the app.
- **Removing a supporter** from a user rotates the user key, as removing a
  device does (§ 3), and re-wraps it to the remaining accounts and devices.
- **No WorkOS.** The passkey unlock has to run in our own code; sign-in
  email goes through Cloudflare. A district asking for single sign-on or
  rostering reopens this.
- Adult emails are the only new personal data the server holds. A
  supporter deletes their account from settings.
- **Owner and Team** (**BUILT 2026-09-28**, founder ruling). A supporter
  joins as Team: every edit, no management. Owners (untagged devices,
  or accounts marked owner) alone add/remove devices and supporters,
  rotate keys, replace the card, and delete the board (anyone may set
  the license — amended 2026-10-02, Design_System § Settings);
  the relay returns 403 `owner_only` otherwise and keeps the last owner
  (409 `last_owner`). A Team device's join tokens are stamped with its
  account. Contract and UI: `docs/product/Design_System.md` § Settings.
- **A supporter is only a supporter.** Deleting a supporter account
  removes that account's access and nothing else: the user, its words,
  its license, its QR card and its devices are untouched. The user owns
  the license, whoever paid (founder, 2026-09-23).
- **BUILT** (015 slice 4, 2026-09-25): the account service is a
  `SupporterAccounts` Durable Object — a `dir` object (email→account,
  link tokens, challenges, sessions, dev mailbox) plus `acct:<id>`
  objects (passkey credentials, `acct_pub`, `sealed_priv`, account-wide
  PRF salt, wrapped user keys + sealed profiles) — behind
  `/accounts/*` routes (`src/worker/accounts.js`, `src/worker/index.js`).
  ES256 WebAuthn assertions verify server-side — challenge, origin, RP
  id, user presence, signature (`src/worker/webauthn.mjs`). Register and
  credential-add require the challenge a claimed email link minted;
  register is insert-only so account keys can't be overwritten. The
  account private key seals under HKDF(passkey PRF) on the device —
  `sealAccountPriv`/`openAccountPriv` (`public/shared/sync_crypto.mjs`);
  the relay never sees it. Client: `public/shared/account.mjs`; Parent
  Corner "Supporter account" row — hidden on a device whose active user
  is a synced home user (`public/board/devices-ui.js` `renderAccount`). A device
  that signs in joins each unlocked user's relay with a single-use
  **join token** a linked device minted (`POST /join_tokens` →
  `POST /users/:id/devices` with `join_token`; relay stores SHA-256
  only; `src/worker/relay.js`). Locked imports carry `sync.userId` but
  no key — the user list marks them "needs an Allow or QR card" with no
  Switch. An unlocked import whose token join fails carries
  `sync.pendingJoin`; it remains local-only until a successful join
  clears that marker. A failed re-import cannot downgrade an existing
  proven link. Live-proven: `scripts/probes/account_probe.mjs` (virtual
  authenticators, real wrangler dev — restore-with-keys, no-PRF lock,
  payload scan).
- **BUILT** (015 slice 5, 2026-09-23): supporters **on a user**. The
  owner invites by email (`POST /accounts/:id/invites`); the invitee's
  link runs the normal sign-in then waits — nothing reaches them until
  a device that has the user taps **Allow**, which registers their
  account on the user's relay (`POST /users/:id/supporters`), wraps the
  held epoch keys to its public key, and grants tagged join tokens.
  The supporters list per user lives in Parent Corner
  (`public/board/devices-ui.js` `renderSupporters`); the invite table
  and lifecycle live on the `dir` object (`src/worker/accounts.js`).
  **Remove** cascades on the relay — `via_acct`/`for_acct` tags delete
  the supporter's devices and unused join tokens — revokes the
  account-side grant, then rotates the user key re-wrapped to remaining
  devices and regranted to remaining supporter accounts
  (`syncRekey` re-seals the running client under the new epoch;
  `public/shared/sync.mjs`). Live-proven:
  `scripts/probes/supporters_probe.mjs` — S edits reach P; after
  removal S's real-device read and write get 403 and epoch-2 ops stay
  sealed under the key S never received.

### 12.4 Many users on one device and one account

- An SLP signs in once and sees a list of clients; a parent sees each
  child. Tap a user to see that user's boards. Nobody logs out.
- A child's device opens straight to its own user. A user switcher lives
  in the Parent Corner, never on the child's screen: landing on a
  sibling's layout breaks motor planning.
- History, prediction weights and suggestions stay per user and per
  device (§ 2); nothing crosses users.
- **BUILT** (015 slice 2, 2026-09-24): one device holds many users. A
  registry in IndexedDB `pip-users` (`public/shared/users.mjs`) keeps
  one `user/<id>` row each — id, name, photo, this device's home flag,
  last-opened, sync state (`{userId, epoch, cursor}`) — plus `db/<id>`
  serialized databases. The open user's database runs in memory and
  exports to `db/<id>` on a 300 ms write debounce with
  `pagehide`/`visibilitychange` flushes (`public/db.js`). Keys scope
  per user: `user/<id>/key_e<n>` and `user/<id>/root`
  (`public/shared/sync_crypto.mjs`). Boot resolves session override →
  home → single → picker, then takes a `pip-user-<id>` Web Lock — a
  second tab on the same user is told, not allowed
  (`public/board.js`). Parent Corner → Users switches, names, sets the
  home user, removes a local copy, and adds users. The registry id is
  the relay id: `POST /users` accepts it and bootstrap refuses an
  already-initialized user (`src/worker/relay.js`). `pip_sync`, kvvfs
  and flat key names migrate into the first registry row on first boot.
  **043 A amendment (built):** `db/<id>` keeps a `db/<id>.prev` copy of
  the last database that opened cleanly — an unreadable primary
  restores it and self-heals on the next flush. A read that *fails*
  (transient IndexedDB error) is not corruption: the board boots
  temporary with saves blocked so a bad save never overwrites good
  stored bytes; `dbHealth()` and the editor status line surface it.
- **Measured 2026-09-23:** one user's database is about 1.0 MB (999,424
  bytes with 680 senses); export and reload each take under 1 ms.
  Per-user isolation, switching, the Web Lock and the kvvfs migration
  are live-proven (`scripts/probes/users_probe.mjs`).

### 12.5 The QR card

- Replaces the 24-word sheet. The card is a QR plus a short text code
  for a device with no camera. Print it, save it as an image, or email it
  to yourself or anyone.
- **Scan to restore.** A new device scans the card and the user syncs
  down. On a free user, a device that is not signed in as a supporter
  becomes the user's own device and replaces the old one; the one free
  supporter stays (`docs/product/Pricing_And_Packaging.md` § 4.2).
- **The card is a house key.** Whoever holds it has full access to that
  user; sharing the card is sharing access. The founder accepted this
  (2026-09-23). **Replace card** issues a new one and the old card stops
  working.
- The recovery root and its per-epoch derivation (§ 9) stay; only the
  encoding and the restore gesture change.

**BUILT 2026-09-25** (015 slice 3) — the card, scan/photo/paste
restore, save/share/print, and Replace card with the epoch-key bundle
are in § 9's BUILT block. Camera scanning is gated on
`BarcodeDetector`; camera-less devices paste the code.

### 12.6 Free vs paid

Owned by `docs/product/Pricing_And_Packaging.md` § 4: \$49 once per user,
every supporter free once paid, a free user gets its own device + one
supporter + 10 words of its own,
backup and QR restore always free.
