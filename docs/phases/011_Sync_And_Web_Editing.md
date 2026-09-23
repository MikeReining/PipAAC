# Phase 011 — Sync and web editing

**Status:** Code-complete. Slices 1–8 built and proven (see their Works
Test notes). Slice 9 moved to `docs/phases/015_Accounts_And_One_Price.md`
slices 6–7 after the 2026-09-23 rulings (accounts, one price per user).
Archive once 015 no longer cites this doc's Works Tests.

**Direction DECIDED 2026-09-22** (founder: "a user can create and edit
things on a computer and then have them also on their iPad"). Rulings
**DECIDED 2026-09-22**; engineering design proposed, in
`docs/product/Sync_And_Web_Editing.md`. Intake:
`docs/founder/2026-09-22_Customization_Library_Sync.md`.

This phase touches credentials, privacy and data retention
(`AGENTS.md` § High-Risk Stops). The founder ruled on all of them
(`docs/product/Sync_And_Web_Editing.md` § 11). Any change to those rulings
stops the phase for a new founder call.

| Topic | Owner |
| --- | --- |
| What syncs, keys, pairing, ordering, relay, recovery, bans | `docs/product/Sync_And_Web_Editing.md` |
| iOS app and web app differences | `docs/product/Platforms_iOS_And_Web.md` |
| The synced tables | `docs/product/Language_And_Voice_Schema.md` |
| The editor's screens | `docs/product/Word_Library.md` |

Needs 009 slices 1–3 (the Library is what the web editor shows).

## Vocabulary for code and docs

*Superseded 2026-09-23: "board" for the sync unit is now "user", and
supporters have accounts (`docs/phases/015_Accounts_And_One_Price.md`
§ Vocabulary). The table below is kept as history.*

| Use | Never use |
| --- | --- |
| board, linked device, Link to a board, Allow | account, login, cloud profile |
| op, snapshot, relay | event sourcing, CRDT (in product copy) |
| recovery sheet | backup code, password |

---

## Slice 0 — Founder rulings (done 2026-09-22)

Recorded in `docs/product/Sync_And_Web_Editing.md` § 11: recovery sheet
yes; iPad backup accepted; history stays on the device; never deleted for
payment, idle deletion after 3 years; backup and restore free, more than
one device and the web editor in Pip Lifetime.

## Slice 1 — Every adult edit is an op

Goal: each write owner (group functions, entity save, card edits,
overrides, settings) records an op in a local `sync_op` table, and
replaying the ops from an empty board rebuilds the synced tables exactly.

Truth owner: `docs/product/Sync_And_Web_Editing.md` § 4.

Lie-prone layer: an edit path that writes a table directly and skips the
op. The test finds it by comparing replay with reality, not by listing
functions.

Works Test: run a seeded random sequence of 500 edits across every edit
path. Replay the recorded ops into a fresh database. The synced tables
(§ 2) are byte-identical to the original. Run with a new seed in CI each
time and print the seed on failure.

**Works Test (proven 2026-09-23):** `src/board/sync_op.test.mjs` — a
mulberry32-seeded 500-edit storm across all 14 edit paths, replayed into
a fresh catalog baseline: `personal_entity`, `board_group`, `group_cell`,
`clip_override`, `entity_enrichment`, and the synced profile columns are
byte-identical. Rerun with `SYNC_SEED=<n>`; `SYNC_DEBUG=1` prints the
first diverging rows. Passed 7 seeds at authoring. The storm caught one
real bug: the never-orphan landing stamped a fresh `added_at`, so the
landing now carries the removed placement's timestamp (it is the same
add re-filed).

## Slice 2 — One order, same functions (merge)

Goal: two replicas that apply the same confirmed ops in sequence order,
with their own pending ops rebased on top, converge.

Truth owner: `docs/product/Sync_And_Web_Editing.md` § 5.

Works Test (property, no network): two replicas each make random edits
offline, including collisions (same slot, same entity renamed, a group
deleted while the other adds to it). Interleave their ops through a fake
relay in random orders. After both drain: synced tables byte-identical, no
orphan entity, no item that was already placed moved, core snapshot
unchanged.

**Works Test (proven 2026-09-23):** `src/board/sync_merge.test.mjs` —
two replicas, forced collisions (same cell slot, same entity renamed on
both, `grp_doomed` deleted on one while the other places into it, the
same index slot claimed twice) plus a 120-edit storm each. A fake relay
merges the streams preserving per-device order and assigns `relay_seq`;
`drainOps` rebases: restore the `sync_baseline` snapshot, apply the
confirmed stream in relay order, re-apply pending ops. All seven synced
tables are byte-identical across replicas, no orphan entity, built-in
membership and `core_cell` unchanged; a second drain of the same stream
is idempotent. Passed 7 seeds at authoring (`SYNC_SEED=<n>` to rerun,
`SYNC_DEBUG=1` prints diverging rows). The merge storm caught the same
class of bug slice 1 did: the taken-slot `place_item` fallback stamped a
fresh `added_at` — it now carries the op's own timestamp.

## Slice 3 — Keys and encryption

Goal: device key pairs in the platform secure store, a board key, ops and
blobs encrypted before they leave.

Works Test: capture every outgoing payload in a scripted session that
adds Cooper with a photo and a recording. No payload contains "Cooper", a
group name, or bytes hashing to the original photo or recording.
Decrypting with the board key returns the ops.

**Works Test (proven 2026-09-23):** `src/board/sync_crypto.test.mjs` —
a scripted session adds Cooper, places him, sets a photo and a recording;
every sealed payload (op envelopes + blob envelopes) is scanned for
"Cooper", group names, the blob SHA-256s, and the raw blob bytes — none
leak. `openOp`/`openBlob` with the board key return the ops and bytes
verbatim; a different board key, a truncated ciphertext, a wrong IV, and
a forged blob hash all fail closed. Device identity: one ECDSA + ECDH
pair per install in the platform keystore (IndexedDB `pip-keys`), private
keys non-extractable, `device_id` = SHA-256 fingerprint of the signing
public key — recorded on every op. Live browser probe confirmed the app
boots clean and the device record persists with non-extractable keys.

## Slice 4 — The relay

Goal: a Cloudflare Worker, a Durable Object per board (sequence, allowed
devices, WebSocket fan-out), and R2 for snapshots and blobs.

Files: `src/worker/index.js` (routes), a new Durable Object module in
src/worker, `wrangler.jsonc` (bindings).

Works Test: two clients against a local `wrangler dev` relay. Client A
edits and client B receives the op within 2 s. A request signed by an
unknown key gets 403. Client B goes offline, A edits 20 times, and B
reconnects and matches A.

**Works Test (proven 2026-09-23):** `src/worker/relay.heavy.test.mjs` —
spawns real `wrangler dev` (isolated `--persist-to`), two device clients
with real key pairs. A creates the board, allows B; B is 403 until then.
A submits a Cooper op → B's WebSocket receives it inside 2 s, and the
envelope decrypts to the real op only under the board key. Unsigned and
unknown-device requests get 403. B disconnects, A submits 40 more ops,
B's `fetchOps` catch-up returns all 41 in `relay_seq` order. A sealed
8 KB blob round-trips through local R2 and opens byte-identical.
Heavy: named explicitly or via `scripts/test.sh --heavy`.

## Slice 5 — Pairing, linked devices, revoke

Goal: the new device shows a QR and a code; a linked device scans or
types it, the adult taps Allow, and the board key travels encrypted to
the new device. Linked devices list with Remove (rotates the key).

Works Test: pair a browser client through the real flow. Before Allow,
the new device can read nothing. After Allow it syncs. Remove it, and its
next write is rejected. Ops after removal are encrypted with a key it
never received.

**Works Test (proven 2026-09-23):**
`src/worker/pairing.heavy.test.mjs` drives the relay+lobby path — code
request, pending status, Allow (device register + wrapped-key grant),
unwrap-and-sync, Remove → 403 on reads and writes, epoch-2 rotation where
the removed device's key opens nothing. The browser proof was two
headless-Chrome devices on a live `wrangler dev` copy: the new device
showed an 8-char code and QR through the real Parent-corner UI, the
linked device typed the code and tapped Allow, an adult edit made on A
(`Add to My Words → New → Syncproof`) appeared in B's `group_cell` within
seconds, Remove rotated the epoch to 2 and B's post-removal edit never
reached A. UI: Parent corner → Linked devices (`Add a device` /
`Link this device`); pairing code + QR in `#pairform`;
`public/shared/sync.mjs` is the device loop (catch-up, debounced flush
via the `recordOp` sink, WebSocket drain, epoch pickup). QR encoder is
vendored at `public/vendor/qrcode.mjs`.

## Slice 6 — Photos and recordings

Goal: blobs upload encrypted, download lazily, and are verified by content
hash.

Works Test: a photo added on A shows on B. Corrupt one byte of the stored
blob, and B rejects it and shows the name and color, not a broken image.

**DONE.** `savePhoto` is content-addressed (`blob:<sha256>` in OPFS
`blobs/`; legacy `opfs:photos/` keys still read); `loadPhotoURL` lazy-
fetches a miss through the registered fetcher — `GET /blobs/:sha`,
`openBlob` under the envelope's epoch, SHA-256 verified on open — and
returns no URL when bytes are missing or corrupt, so the tile keeps its
name and color. Uploads seal under the current epoch and ride behind
their op. `src/worker/blob.heavy.test.mjs` (real wrangler dev + local
R2): A's PNG round-trips to B byte-identical, the stored envelope is
ciphertext, a tampered byte or forged hash rejects, an unknown sha 404s,
and epoch-1 blobs still open after rotation while new blobs seal at
epoch 2. Live proof: two paired headless-Chrome devices on a real agent
copy — a photo file through A's add form landed on B with the same
`blob:<sha>` key and rendered as real pixels in the tile.

## Slice 7 — The web editor

Goal: on a wide screen the web app opens to the Library with the side-panel
card, bulk paste, drag-and-drop photos, and the real 10×6 group editor
(`docs/product/Sync_And_Web_Editing.md` § 7).

Owner-visible Works Test: on a laptop browser linked to an iPad, paste 10
words into Food and drop 3 photos into Family. Within seconds the iPad
shows them in the same slots the laptop shows. Automated half: a headless
browser client and a second client against the local relay. The same
paste yields byte-identical `group_cell` rows on both.

**DONE.** On `min-width: 1100px` the app opens to the editor
(`body.editor`, `setView("editor")`): the Library overlay and the word
card overlay are reparented into the editor's left and right panes — same
nodes, same listeners — and the middle pane renders the real 10×6 group
grid with Edit-mode gestures always on (drag move/swap, × remove, tap
opens the card; `itemCell` takes a `ctx` so the editor drives the same
gestures without touching the child's Edit flag). Bulk paste and photo
drop live in `public/shared/bulk.mjs`: `resolvePasteRows` resolves each
line exactly (own entity, catalog sense, or `new — needs a picture`;
fuzzy misses never place), collapses duplicate rows, and marks rows
already in the target group; `applyPasteRows` writes through
`createEntity`/`placeItem`, so every pasted row is a normal op. Dropped
image files become draft entities named from the file (`nameFromFile`),
photo bytes through `savePhoto` → `blob:<sha>` → `syncUploadBlob`.
Unit proof: `src/board/web_editor.test.mjs` — resolution, dedupe,
already-placed skip, op counts, and byte-identical `group_cell` after op
replay on a second replica. Live proof: a 1400px headless Chrome opened
the editor, paired through the real UI with an 820px board client, pasted
10 lines into Food (6 placed — 4 were already seeded) and dropped 3 PNGs
into People; the iPad-side client's `group_cell` rows were byte-identical
and all three photo tiles rendered real `<img>`s. The iPad paste box and
multi-photo picker remain with 009 slices 7–8.

## Slice 8 — Recovery sheet

Goal: print or save the recovery sheet. Restore on a fresh device from it.
Free for every board.

Works Test: build a board, sync it, destroy every client, restore from the
sheet on a new client. Synced tables are byte-identical to before. History
is absent (it never synced), and the UI says so.

**DONE** — mechanism and proof in `docs/product/Sync_And_Web_Editing.md`
§ 9 (BUILT 2026-09-23). The sheet carries the board id + 24 words encoding
a recovery root; every epoch key derives from it, so a sheet survives
device-removal rotations. The relay stores only the root's proof and
trades it for device registration at `POST /boards/:id/restore`. Live
proof: browser A linked, added a word, spoke a sentence, showed the
sheet; fresh-profile browser C pasted the payload and restored —
synced tables byte-identical, history tables empty, and the restore
confirmation says speech history never leaves a device. Wrong proof →
403. One spec amendment recorded in § 9: only root-holding devices can
re-print the sheet.

## Slice 9 — Free and Lifetime

*Moved 2026-09-23 to `docs/phases/015_Accounts_And_One_Price.md` slices
6–7, under the new price (`docs/product/Pricing_And_Packaging.md` § 4).
Kept as history.*

Goal: a free board has backup, restore and one linked device; Pip
Lifetime allows more linked devices and the web editor. Retention rules
run on the relay.

Works Test:
1. On a free board, pairing a second device is refused by the relay (not
   only the UI), with a clear upgrade message. Restoring onto a new device
   moves the board there and unlinks the old one.
2. A Lifetime board pairs a second device.
3. A board whose entitlement lapses or never existed keeps its snapshot and
   blobs. The retention job deletes none of them.
4. The retention job deletes only a board requested for deletion (after
   the 30-day undo) or with no device seen for 3 years. A fixture board
   seen 2 years 11 months ago survives. A device returning in the last 6
   months gets the warning.

## Out of scope

Multi-board SLP switching (now DECIDED, 015 slice 2). Real-time co-editing cursors. Syncing history (ruled out
2026-09-22). The iOS app shell (`docs/product/Platforms_iOS_And_Web.md` § 3).
