# Pip AAC sync audit — October 4, 2026

**Verdict: REFACTOR REQUIRED.** The original missing-seed defect is already assigned elsewhere. This audit identifies twelve additional finding groups. The most urgent work is replay/checkpoint correctness, trustworthy snapshots, and key lifecycle/revocation. No application source, production user data, accounts, or deployments were changed by this audit. This folder contains audit artifacts only.

**Scope and evidence.** Traced browser boot and per-person persistence (`board.js`, `db.js`, `users.mjs`); adult write owners and operation recording; relay submission, catch-up and WebSockets; baseline/replay and snapshots; R2 media and retention; pairing; accounts and join tokens; device/supporter removal; QR recovery; editor save status. Real application functions were exercised with temporary SQLite databases and synthetic data. The client probes execute the actual `sync.mjs` source with controlled network/storage/lifecycle seams and real crypto/operation modules. Worker probes execute actual `UserRelay` and `PairingLobby` methods with Node SQLite and local R2/socket substitutes. These are deterministic code-level reproductions, not real iPad or live Cloudflare integration proof.

The audit began at HEAD `dda2c87799805529dac1ce22e0cc20354c6d5304`; later HEAD was `8f298e7bbf9bef7170383a3340602a9b4146e6bb`. Another developer's seed repair appeared in the working tree during the audit. Client and state probes were rerun after that change. The duplicate-replay defect remains. Public production client files were fetched read-only: `sync.mjs`, `sync_client.mjs`, `ops.mjs`, `sync_crypto.mjs`, `db.js`, `editor-find.js`, and `recovery-ui.js` matched their then-current workspace bytes. See `production-client-manifest.json`. Worker deployment equivalence was not verified; worker findings apply to the reviewed source.

Each finding below names its truth owner, misleading boundary, reproduction or remaining proof gap, and fix boundary. P1 means urgent reliability/security work; P2 means important follow-up. No finding implies that a real family's data was accessed or that the described loss has already happened to a particular user.

| ID | Priority | Finding |
| --- | --- | --- |
| F01 | P1 | Confirmed operations replay twice; swaps undo themselves and recordings can retire |
| F02 | P1 | Sync cursors can advance without durable data |
| F03 | P1 | Snapshots can claim edits they do not contain |
| F04 | P1 | Fully pruned backlogs with no tail never recover from snapshots |
| F05 | P1 | Key rotation breaks encryption, missed epochs, and QR recovery |
| F06 | P1 | Pairing drops the key epoch |
| F07 | P1 | Revoked WebSockets remain active; sender identity is lost |
| F08 | P1 | Concurrent snapshot uploads can regress the relay's backup |
| F09 | P2 | Snapshots omit synced progress totals |
| F10 | P2 | Temporary failures can strand edits or drop media from the retry queue |
| F11 | P1 | The editor can say “Saved” while sync is failing |
| F12 | P2 | Linking/sign-in can become stuck after a lost response or exhausted join tokens |

## F01 — confirmed history is applied again to a baseline that already contains it

**Owner:** `public/shared/ops.mjs`, `drainOps` (currently lines 393–437); `sync_baseline` in `src/board/schema.sql`. **Misleading boundary:** a confirmed-operation log entry is treated as an operation that still needs applying.

`drainOps` restores the stored baseline, replays every locally logged confirmed operation, saves that resulting state as the new baseline, then restores pending edits. The next drain starts from the updated baseline but replays the same confirmed history again. There is no baseline sequence watermark. The live-push path followed by the catch-up fetch naturally supplies repeated deliveries; different devices can have different numbers of drains.

**Reproduced:** create boards A/B at index slots 80/81, swap, sequence the operation stream, then drain the same stream twice. First drain gives A=81/B=80; second gives A=80/B=81. Also create a word, rename it to Middle then New, and record a New-name override. The second drain replays historical renames and changes that recording from `ready` to `superseded`; the ready override becomes null. Both reproductions still fail with the concurrent seed repair present. See `state-results.json`.

**Fix boundary:** persist a baseline watermark and apply only the ordered suffix after it. Keep confirmed state and pending local edits distinct. Repeated delivery, HTTP acknowledgment and WebSocket echo must produce the same state. Do not merely make swaps no-ops: this is a replay/checkpoint defect affecting multiple write owners. Preserve operation order and make the complete rebase atomic.

**Required regression:** swaps, moves, multiple renames plus recordings, and create/delete/recreate histories must be unchanged after duplicate drains, differently batched delivery, and restart. Compare real tables and ready playback references on both replicas.

## F02 — failed persistence still advances the cursor; snapshot adoption bypasses persistence

**Owner:** the serialized DB and its applied checkpoint. **Boundary:** `public/shared/sync.mjs:227–243`, `269–278`, `296–300`; `public/db.js:130–150`; registry writes in `users.mjs`.

`db.js` flush returns `false` when saving is blocked or fails. `ingest` awaits it but ignores that boolean and advances/saves the registry cursor anyway. Snapshot adoption saves its cursor without awaiting the DB flush at all. Registry and DB bytes are separate transactions. Restoring `db/<id>.prev` also restores older DB state without restoring its matching cursor.

**Reproduced:** injected persistence result `false`; entity exists only in memory but registry cursor advances 1→2. Separately, adopting snapshot 500 with no tail advances cursor to 500 with zero calls to the persistence hook. See `client-results.json`. Previous-copy/checkpoint mismatch is source-traced, not separately crash-tested here.

**Impact:** termination or fallback to an older local copy can leave the saved cursor ahead of the actual saved board. Recovery then asks only for newer edits and skips the missing ones.

**Fix boundary:** put the authoritative checkpoint inside the durable DB state, or atomically persist bytes and checkpoint in one IndexedDB transaction. Check successful persistence explicitly. Snapshot adoption must follow the same durability rule. A previous-copy restore must resume from that copy's checkpoint. Preserve blocked-save behavior; never overwrite a family's unreadable saved copy.

**Required regression:** IndexedDB failure, blocked saves, termination at each checkpoint boundary, snapshot-only boot, and corrupt-primary restoration. Restart must recover every edit the checkpoint claims.

## F03 — snapshots use maximum observed sequence rather than a complete applied prefix

**Owner:** confirmed state at a known relay sequence. **Boundary:** `public/shared/sync.mjs:190–197` and `252–263`.

`maybeSnapshot` uses `MAX(relay_seq)` and “no pending operations” as sufficient evidence of complete confirmed state. A device can submit its own operation and receive sequence 501 while never receiving 2–500. The upload can therefore exclude those other devices' edits while claiming to cover them. The relay's retention sweep subsequently prunes old operations covered by that claimed watermark (`relay.js:800–807`).

A second path reaches the same problem: `adoptSnapshot` overwrites current state without immediately reapplying pending edits. If the fetch tail is empty, `ingest` does no drain. `flush` then confirms those pending edits without putting them back into state and may publish a snapshot omitting them.

**Reproduced:** cursor=1, local confirmed sequences=[1,501], snapshot watermark=501. Separately, a pending entity erased by snapshot adoption is marked confirmed at 501 while absent from both the DB and the new 501 snapshot. See `client-results.json`.

**Fix boundary:** publish only a contiguous, durably applied confirmed state at its exact checkpoint. Catch up/rebase before snapshot eligibility; never infer completeness from maximum sequence or absence of pending rows. Reapply pending edits even when snapshot recovery has no tail, while keeping them out of the confirmed snapshot until correctly integrated.

**Required regression:** missed foreign edits followed by a successful own submit; snapshot adoption with pending edits and an empty tail; two competing devices; snapshot restore after retention pruning. Confirm the restored board contains every edit covered by the watermark.

## F04 — pruning recovery depends on a non-empty tail

**Owner:** relay log coverage and snapshot watermark. **Boundary:** `sync.mjs:288–304`; `relay.js:673–680`.

A returning device with a nonzero cursor consults a snapshot only if a fetched row reveals a gap. If all missed operations were pruned and no new operations exist, the returned list is empty and no snapshot is requested. `GET /ops` computes `latest` from remaining rows rather than a durable high-water mark; that can be zero after pruning. The client ignores that field in any case.

**Reproduced:** cursor=1; available snapshot=500 contains a synthetic entity; returned tail is empty. Recovery stays at 1 and never restores that entity. See `client-results.json`.

**Fix boundary:** relay catch-up must expose authoritative latest/pruned-through/snapshot coverage independently of remaining rows. Recover whenever the checkpoint is behind pruned coverage, even with an empty tail. An unavailable or unreadable required snapshot must block catch-up honestly; full replay is not available after pruning.

**Required regression:** completely pruned log, partial pruning, empty tail, lost/invalid snapshot, and a returning device after a long offline period.

## F05 — key lifecycle has several independent breaks

**Owner:** user/epoch key mapping and recovery access. **Boundary:** `sync.mjs:79–93`, `sync_client.mjs:106–109`, `relay.js:620–660`, device/card removal flows.

1. **Stale outgoing client after inbound rotation.** `keyFor` updates `epoch` and `userKey` but does not recreate `client`. `relayClient.submit` closes over its original key. The relay stamps operations with its current epoch regardless of the actual sealing key. Reproduced after receiving an epoch-2 edit: the next local edit opens with epoch 1, fails with epoch 2, and local registry epoch says 2 (`client-results.json`).
2. **Missed intermediate epoch.** The relay stores only one current wrapped key per device. If a device holding epoch 1 returns after rotations to 2 and 3, `keyFor(2)` fetches epoch 3 and returns that key to decrypt epoch 2. Reproduced decryption failure and stalled cursor. Subsequent attempts to read an unstored old epoch call `getUserKey`, which can generate an unrelated random key.
3. **A paired owner can break the QR card.** Devices paired by an owner receive epoch keys but no recovery root. They are still Owners and may remove devices/supporters. The removal flow calls `getUserKey(nextEpoch)`; without the root this creates a random key. A card-only restore derives that epoch from the root and gets a different key. Reproduced with real crypto: the original card's derived key cannot open the paired-owner-generated epoch-2 operation (`state-results.json`).
4. **Replace card does not rekey the running sync client.** `recovery-ui.js:171–196` rotates the relay and local registry, but never calls `syncRekey`; unlike the device/supporter removal flows, its mount does not receive that function. This is source-traced; the exact replace-card UI was not clicked in a browser during this audit.
5. **Newly paired devices receive only the current key.** `devices-ui.js:922–925` hands over one key. They then fetch historical operations, snapshots and media, which may still need earlier epochs. Correcting the missing epoch in F06 alone will not repair this history-access problem.

**Fix boundary:** establish one rotation/grant protocol used by device removal, supporter removal and card replacement. Each envelope's declared epoch must match the actual sealing key; reject stale writers safely before accepting unreadable operations. Fetch existing keys explicitly: a missing historical key must never mint a random replacement. Authorized returning/new devices need the historical epochs required by their restore. Maintain card recoverability without distributing the recovery root to ordinary paired devices. Make interrupted/concurrent rotations resumable.

**Required regression:** edits from every remaining device after each rotation path; offline device missing two rotations; pair after rotation with old snapshots/media; removal by a paired owner; card-only restore afterward; termination midway through rotation. Include real encrypted payload opening and playable restored media, not just registry epoch assertions.

## F06 — the pairing lobby discards the epoch

**Owner:** pairing grant contract. **Boundary:** `src/worker/lobby.js:44–53`, grant insertion/status response; `devices-ui.js:780–794`.

The offering device sends `epoch`. The lobby's grant table, insertion and returned grant omit it. The new device defaults to epoch 1, even if the supplied key is actually epoch 3.

**Reproduced:** submitted grant epoch=3; returned grant has no epoch; receiver's default=1. See `worker-results.json`.

**Fix boundary:** persist and return a validated key epoch through the entire grant contract; repair any already-persisted epoch mislabeling without generating replacement keys. Coordinate with F05 for historical keys.

**Required regression:** pair at epochs 1 and 3; read existing data; make a new edit; confirm both devices open the ciphertext under the same epoch.

## F07 — removal does not revoke active WebSockets, and attachments lose the device ID

**Owner:** relay device authorization. **Boundary:** `relay.js:172–200`, `268–277`, `518–526`, `637–642`, `817–827`.

Deleting a device/supporter removes database authorization but does not close its accepted sockets. `broadcast` sends to every socket without checking authorization. `webSocketMessage` rebroadcasts model messages without checking whether the sender remains allowed. Independently, `verify` returns a device-ID string, but upgrade code reads `wsDevice.device_id`, storing an undefined sender attachment.

**Reproduced:** after deleting a synthetic device row, its existing socket receives new operation envelopes and its model message is rebroadcast. An authenticated upgrade captures attachment `{}` rather than the authenticated ID. Node rejects the final HTTP 101 construction, so that latter probe verifies the actual attachment assignment before the runtime-specific response boundary, not a real WebSocket handshake (`worker-results.json`).

**Impact:** removal does not end the live connection's authority. Correct key rotation can prevent reading new plaintext, but it does not fix ongoing envelope delivery or old-key model-message injection. Combined with F05, the privacy consequences are more serious.

**Fix boundary:** store the actual verified identity, close all revoked sockets on every revocation path (including account deletion/free restore), and enforce current authorization on receive and broadcast. Do not treat socket-upgrade authentication as permanent authority.

**Required regression:** keep a removed device's real socket open; verify no new delivery and no accepted model messages. Exercise supporter cascade and restore moves as well as direct removal.

## F08 — overlapping snapshot uploads can regress the backup and prune watermark

**Owner:** relay snapshot pointer/watermark. **Boundary:** `relay.js:697–711`.

The handler checks `seq > snapshot_seq`, awaits an R2 write to the same object key, then updates metadata. Older and newer requests can both pass the check before either completes. A slower older request can overwrite the newer object and metadata.

**Reproduced controlled schedule:** pause seq=500's R2 write, complete seq=600, then release 500. Both stored snapshot and watermark regress from 600 to 500 (`worker-results.json`). Cloudflare documents that requests can interleave across awaited external I/O, including R2; see [Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/). Live Cloudflare overlap verification remains to be added.

**Fix boundary:** upload immutable versioned objects, then atomically advance a committed pointer after rechecking the watermark. Keep object and committed sequence consistent across overlaps and termination. A SQL transaction alone cannot roll back an external R2 overwrite.

**Required regression:** controlled reversed completion order; termination between object upload and pointer commit; subsequent prune and complete restore.

## F09 — progress totals disappear from snapshot restores

**Owner:** synced `stats_day` rows. **Boundary:** `ops.mjs:316–323`; `stats.mjs` daily write/op path.

`put_stats_day` syncs daily totals, but `snapshotSynced` does not include `stats_day`. After corresponding operations are pruned, a new/restored supporter device cannot recover those historical totals. Raw communication history correctly remains device-local; this finding concerns the counts explicitly intended to sync.

**Reproduced:** source has a day/device total; its snapshot has no stats table; adopted snapshot contains no daily rows (`state-results.json`).

**Fix boundary:** snapshot the explicitly synced day/device/count fields and restore them correctly. Keep `reported` device-local. Never solve this by syncing raw child history.

**Required regression:** two devices' totals, snapshot, prune, fresh restore, and correct combined totals. Confirm raw events/sentences are absent from captured sync payloads.

## F10 — temporary failures can strand the outbox and discard media retry entries

**Owner:** pending operation/media queues. **Boundary:** `sync.mjs:139–163`, `190–207`, `288–319`.

An edit's timed `flush` catches failure but schedules no retry. With the WebSocket still open and no further edits, visibility/online event or incoming traffic, a brief HTTP failure can strand that edit. Media failures are all counted toward the ten-attempt drop threshold, including ordinary upload failures when local bytes still exist. The comment limits that policy to missing/unrecoverable bytes, but the catch does not.

**Reproduced:** one failed submit leaves a pending edit and no retry timer. Ten transient blob upload failures leave an empty queue despite local bytes still being available (`client-results.json`). Reconciliation on a later recovery may requeue referenced media; the defect is loss of retry obligation during the idle session, not proof that the bytes are immediately deleted.

**Fix boundary:** bounded automatic retry/backoff for pending operations and transient media errors. Retain media obligations until confirmed upload or explicitly diagnosed unrecoverable loss. Serialize durable queue read-modify-write operations so concurrent queues/drains cannot overwrite entries. Avoid a retry storm.

**Required regression:** temporary 5xx/timeout with an open socket and no user activity; two concurrent media additions; recovery after long offline upload failures; missing local bytes distinguished from reachable local bytes.

## F11 — “Saved” hides receive failures and can precede local durability

**Owner:** actual durable local save and sync health. **Boundary:** `board.js:1484–1492`, `board/editor-find.js:15–21`.

`syncHealth` tracks `ingestError`, `mediaError`, and whether running, but the editor's state adapter forwards only `flushError` and `mediaPending`. The status helper declares “Saved” from zero pending/queued rows. Confirmed but unapplied incoming operations therefore appear saved. Dropped media with a retained error can do the same. Local DB dirty/in-flight save state is not provided either; before the 300 ms persistence flush, an unsynced edit can already say “Saved on this device.”

**Reproduced:** an unknown incoming operation makes actual replay throw; pending count is zero and editorStatus returns “✓ Saved” (`client-results.json`). The injected operation represents an incompatible newer client or damaged operation; this is not a claim that a current writer normally emits that kind.

**Fix boundary:** render receive failure, missing keys, media failure, and pending/in-flight local persistence distinctly from healthy durable state. Preserve the existing rule that status must not claim another device received an edit without evidence. A bad/unsupported op must not silently turn the status green.

**Required regression:** real status rendering after failed replay, failed/blocked local persistence, missing epoch, and missing media. An operation count alone is insufficient proof of success.

## F12 — user bootstrap and account joins cannot reliably recover from delivery failures

**Owner:** relay registration and local linked state. **Boundary:** `devices-ui.js:102–122`; `relay.js:212–234`; `account.mjs:189–232`; `devices-ui.js:384–393`.

If bootstrap commits but its response is lost, the local user still appears unlinked; retrying the same user/device returns 409 conflict. Separately, account import can successfully unwrap keys while every join token is expired/used. `importAccountUsers` returns `joined:false`, but the sign-in UI counts only `unlocked`, and still reports that the users were added. It stores linked configuration and can expose a switchable profile even though relay reads remain forbidden. The finite token pool has no recovery protocol for that state.

**Reproduced:** same-device bootstrap retry returns 409 (`worker-results.json`). Exhausted-token behavior is source-traced; add the account-flow integration test before closing it.

**Fix boundary:** make bootstrap safely idempotent for the rightful signing identity without admitting unrelated devices. Persist staged linking state and resume after lost responses. Distinguish decrypted keys from successful registration; renew/replace join authorization through the existing trusted account/device flows when tokens are exhausted.

**Required regression:** lose the successful bootstrap response; retry without clearing storage; sign in with all join tokens expired/consumed; restore accurate status and sync access without requiring a family reset.

## Additional risks and proof gaps

- **Unversioned snapshot/schema compatibility.** Raw snapshot tables are restored by iterating every current table name. Removing `supporter_name` from a synthetic older snapshot produces `snap[t] is not iterable` (`state-results.json`). A raw catalog-era snapshot can also include profile references that depend on a newer voice/catalog. Catching that error and falling back to full replay cannot restore pruned history. Add a versioned restore contract/migration and mixed-version tests. This audit did not identify a real affected old snapshot.
- **Concurrent device identity creation.** `getDeviceIdentity` performs an unlocked read→generate→put. Three concurrent initial calls returned three different identities while only one was stored (`state-results.json`). `board.js` and sync initialization have separate callers; tab/process startup needs a cross-context guard. User keys and recovery roots have the same creation pattern. The primitive race is reproduced; an actual normal-use browser boot that loses a registered identity is not proven here.
- **Non-atomic rebase failure.** `restoreSynced` commits before the complete replay and pending reapplication. A later unsupported operation can leave a partial board saved while the cursor remains behind. Stage/validate or atomically commit the entire rebase; test failures after several valid operations, not only failure before any changes.
- **Unbounded work and overlapping submit.** `fetchOps` returns all remaining rows; each flush scans the whole local log, submits all pending rows, and timer flushes are outside the serialized recovery queue. Local confirmed history is never compacted against a baseline watermark. Test long-lived users, delayed overlapping submits, partial batch refusal, catalog upgrades, and stale clients. Performance or per-device ordering failure under those scenarios was not benchmarked in this audit.
- **Rotation interruptions/parallel owners.** Removal, card proof replacement, key generation, grant upload, local cfg save and rekey are separate steps. Use relay-current epoch rather than stale UI state, stage changes, and prove resume after each interruption. Account grants and recovery bundles must remain valid when an owner rotates from a paired device.
- **State/copy compatibility.** The sync owner doc still contains “not built/PROPOSED” labels and dates inconsistent with built code. It repeats the flawed baseline algorithm as intended behavior. Correct the canonical docs after the protocol is fixed, then make tests enforce that protocol rather than the old prose.

## Why the present proof missed these defects

- `src/board/sync_merge.test.mjs` largely compares replicas after one combined drain. Its repeated-drain assertion checks that one pending placement survives; it does not compare the whole resulting state. It does not exercise a duplicate confirmed swap or a multi-rename recording.
- `scripts/probes/sync_recovery_probe.mjs` verifies synthetic entity existence. It does not verify board placement, coordinates, playable recordings, or complete snapshots.
- Snapshot tests invoke helpers and check a sequential stale PUT; they do not execute actual `maybeSnapshot` eligibility with a gap or overlap R2 writes. Comparing snapshots also misses any synced table omitted from the snapshot list, such as stats.
- Rotation tests manually supply correct keys/clients and verify cryptographic helpers. They do not cover stale runtime-client closures, multiple missed epochs, pairing after rotation, a paired owner rotating, or the real Replace card wiring.
- “Green” helper tests and relay acknowledgment are therefore insufficient evidence for the product claim that the same person's edited board survives sync and restore.

## Recommended fix order and acceptance contract

1. **Correct the replay/checkpoint protocol (F01/F02).** Establish one durable owner of baseline sequence, applied-through checkpoint, confirmed prefix and pending outbox. Replay each operation once and commit state/checkpoint together. Coordinate directly with the already-assigned seed repair; do not reimplement that repair in another slice.
2. **Make snapshots trustworthy and recoverable (F03/F04/F08/F09).** Snapshot complete confirmed state at its applied checkpoint, commit immutable versioned snapshots, and restore across empty/pruned tails. Snapshot all explicitly synced fields, including counts.
3. **Repair key lifecycle and access (F05/F06/F07).** One epoch-grant/rotation flow, correct pairing epoch/history, recovery-safe rotations, and revocation of active connections.
4. **Make failures self-recovering and visible (F10/F11/F12).** Honest local-save/receive/media status; automatic bounded retries; resumable/idempotent registration and token recovery.
5. **Run a release acceptance scenario through real browsers.** Two independent profiles edit Sonja-like Numbers plus a custom board in both directions; move/swap/rename; attach a photo and recording; confirm actual visible coordinates and playable media; repeat deliveries; edit offline; terminate mid-save/sync; reconnect; snapshot/prune/restore into a third empty profile; rotate/revoke/pair and repeat. The actual iPad Safari/PWA path must be checked as well. No acceptance test should use `?reseed` for customization survival: it intentionally removes edits in built-in groups. Founder visual review remains `http://localhost:21087/?reseed`; persistence/sync proof uses plain `/` and isolated test profiles.

**Regression law:** A relay acknowledgment or maximum observed sequence is never proof that the corresponding board state was applied and durably saved. A checkpoint/snapshot may claim only the complete persisted prefix it actually contains. Multiple deliveries and different batching must converge to the same board, media references, and synced settings.

Convert the reproductions into wall-reachable focused regression tests before each fix, show them failing before and passing after, update DEBUGLOG/regression laws, follow the repository's test-approval and commit-handoff rules, then deploy the authorized fix and verify the live surface. This audit itself changes no deployed surface.

## Reproduction artifacts

`client-probes.mjs`, `worker-probes.mjs`, `state-probes.mjs` and corresponding JSON outputs are included beside this report. They use synthetic data and no paid APIs or production credentials. Imports are absolute paths for this checkout. The client script writes outputs to `/private/tmp/pip-sync-audit-2026-10-04`; create that directory first if rerunning after cleanup.

```sh
mkdir -p /private/tmp/pip-sync-audit-2026-10-04
node --experimental-vm-modules /Users/mike/dev/PipAAC/scratch/sync-audit-2026-10-04/client-probes.mjs
node /Users/mike/dev/PipAAC/scratch/sync-audit-2026-10-04/worker-probes.mjs
node /Users/mike/dev/PipAAC/scratch/sync-audit-2026-10-04/state-probes.mjs
```

These are standalone diagnostic probes, not a replacement for repository regression tests or hardware verification. No full test wall, paid batch, production mutation, or deployment was run for the audit.
