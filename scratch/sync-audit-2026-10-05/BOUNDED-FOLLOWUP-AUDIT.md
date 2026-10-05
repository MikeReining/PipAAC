# Follow-up sync delivery audit — 2026-10-05

Reviewed HEAD `692bd890` and the founder's pasted delivery report for
`4edc127e`, `9d239f09`, `202cb350`, and `692bd890`.
At closeout, unrelated picture/card work had landed as `12a1de48`; the
sync changes prepared here remain uncommitted.

Verdict: the prior two P1 repairs and the foreign-op constraint repair are
present in source. More work is required: the new deadline wrappers release
retry ownership while the original work can continue, and epoch publication
still races the active client's sealing key. Do not claim all earlier audit
items are closed.

This is a source audit, not an independent runtime reproduction. The delivery
report describes 70/70 focused tests, fast gates, two local browser profiles,
offline/reconnect, and production browser A plus a Node peer B. Those are
stronger evidence than a root-page/source smoke, but do not cover the
interleavings below or actual iPad/Desktop hardware convergence.

## Repairs that look addressed

- Browser replay: `board.js` calls `initSync`; incoming ingest calls
  `drainOps`; newness now uses `seen.all(op_id)` inside its transaction,
  independent of `.run()`'s return. The browser adapter guards empty bindings.
- Anchor upgrade: `bootDb` → migration/catalog import → `ensureBaseline`
  deletes `{}` placeholder anchors and creates an origin anchor only when the
  baseline is stamped zero. `drainOps` also treats a placeholder as missing.
  The fabricated trusted anchor identified in the previous review is removed.
- Foreign operations: `drainOps` uses `ON CONFLICT(op_id) DO NOTHING`, not bare
  `OR IGNORE`. The schema admits nonempty foreign IDs; other failed constraints
  throw before effects commit. The report includes actual production recovery
  of previously ignored `probe_*` operations. No further defect in these three
  repairs was identified in this review.

## P1 — timeouts release ownership without stopping old work

Truth owner: the physical operation holding the flush/creation/rotation lock,
and the transaction that commits key or registry state. Lie-prone layer:
settlement of the wrapper promise being treated as completion of that work.
Missing proof: time out an operation, start a retry, then release the original.

Call paths and concrete interleavings:

1. `recordOp` → `scheduleFlush` → `flush` → `withDeadline(runFlush())`
   (`sync.mjs:263–297`). At 45 seconds the wrapper rejects and clears
   `flushing`; a retry can start while the first `runFlush` is still alive.
   Its eventual continuation still calls `confirmOps`, `maybeSnapshot`, clears
   `flushError`, resets retry counts and schedules work. An older attempt can
   erase a newer attempt's failure or run nested recovery/rotation effects.
   Several individually bounded 30-second seams can also exceed the 45-second
   aggregate watchdog without any seam being permanently wedged.
2. `getDeviceIdentity` / `getUserKey` / recovery-root creation → `underLock`
   (`sync_crypto.mjs:92–103`). The Map follows the raced promise. In the
   in-process fallback, expiry releases serialization while a paused creator
   can still write its generated value after a retry stores another winner.
   With Web Locks, an expired queued request is not cancelled and can later
   acquire the lock and run its callback after its caller reported failure.
3. Card replacement/removal recovery → `rotation.mjs:13–21` `locked` has the
   same wrapper-ownership issue. Late callbacks can still journal, alter roots,
   call the relay and save the registry. A guard only around the outer flush
   cannot fence those nested durable side effects.
4. Registry/DB writes → `openUserStore` (`users.mjs:37–42`), and key writes →
   `openKeyStore` (`sync_crypto.mjs:67–72`), race a deadline without aborting
   their IndexedDB transactions. A pending `dbp` can resolve AFTER expiry and
   start a write that the caller already believes failed. An already-started
   write can commit after the failure/retry. Neither wrapper handles
   `tx.onabort`, so an explicit transaction abort need not settle it promptly.

The existing stalled-submit test never releases the old submit. It proves
that the wrapper surfaces an error and retries, not that late work is safe.

Repair: carry cancellation/operation ownership through these boundaries.
Cancel expired queued Web Lock requests; prohibit transaction starts after
expiry, abort cancellable transactions, and handle abort completion. Where
physical cancellation is unavailable, keep true ownership until completion or
use a durable compare-and-set/fencing contract that prevents obsolete writes.
Fence old flush status/confirmation/publication continuations. Treat a lost
network acknowledgement as an uncertain commit and reconcile idempotently.
Keep honest stalled status and a safe retry path; merely deleting deadlines
reintroduces the wedge. A blanket outer generation check is insufficient.

Required regressions: paused creator → timeout → retry → release old creator;
expired queued Web Lock → release holder; delayed IDB open and write → expiry
and newer write → release old work; explicit IDB abort; delayed submit → expiry
and retry → late old response. Assert actual stored winners, ciphertext,
pending/confirmed rows and health state, including a newer retry failure that
must not be cleared by the old attempt. Retain the never-settling stall proof.

## P1 — epoch/key/client are published across awaits

Truth owner: one consistent active sealing state. Lie-prone layer: mutable
`epoch` and a relay client that closes over a different key.

`sync.mjs:76–82` `rekey` assigns `epoch`/`cfg.epoch` BEFORE awaiting the new
key. `keyFor` at lines 132–136 similarly publishes epoch before awaiting the
key and registry save, rebuilding the client afterward. During those waits,
`runFlush` can call the old client's `submit(..., newEpoch)`. The real
`sync_client.mjs:110–114` seals with its captured `userKey`; the relay at
`relay.js:706–709` checks the declared epoch, not the plaintext key. Thus it
can accept ciphertext labelled epoch 2 but sealed under epoch 1, which another
device selects the wrong key to open. Competing rekeys can also finish in the
opposite order and replace the client with an older key.

Repair: obtain the target key first, then publish epoch/key/client together
without an intervening await. Re-check monotonicity after awaiting; make
registry updates safe against late saves, coordinating with the timeout fix.
Preserve historical-key lookup and grant catch-up. Test a blocked epoch-2 key
lookup while a real sealing client submits; then race rekeys to 2 and 3 with
completion reversed. Assert actual ciphertext decrypts under its declared
epoch and the active state never regresses. The reliability harness's relay
stub ignores constructor key options, so it cannot by itself prove this.

## P2 — fetch deadlines disappear without AbortSignal.timeout

`bounded.mjs:24–27` falls back to plain `fetch` when the native helper is
unavailable. All relay-client requests use that helper. Recovery's
`fetchOps`/snapshot/blob calls can therefore hang outside the flush watchdog,
holding the ingest queue indefinitely. The native branch also replaces a
caller's existing signal, which would break propagated cancellation.

Repair with an AbortController fallback and combined caller/deadline
cancellation. Include response-body consumption in the bound, not just
receipt of headers. Test native-helper absence, already-aborted callers,
abort during the request, and headers received while the body stalls. Do not
assume a particular supported iPad runtime implements the native helper.

## Small changes prepared by this reviewer — UNVERIFIED

- `public/shared/sync_crypto.mjs`: creation-lock cleanup now attaches to the
  already-handled `tail`, instead of discarding the rejecting promise returned
  by `run.finally`. This fixes an extra unhandled rejection on a handled
  creation failure; it does NOT fix timeout ownership.
- `public/shared/sync.mjs`: capture the sealing epoch before awaiting blob,
  snapshot and live-message encryption, and label the result with that captured
  value. This fixes the earlier label race; atomic active-client publication
  above remains open.
- `src/board/sync_crypto.test.mjs`: one handled-creation-failure/retry case.
- `src/board/sync_reliability.test.mjs`: two delayed-key/rekey cases check blob
  and live labels AND decrypt the actual captured ciphertext with the original
  independently held key. Snapshot interleaving coverage still needs adding.
- `LINE_BUDGET.json`: only the two files grown by this narrow edit were updated.
- `docs/operations/debugger/DEBUGLOG.md`: records the pending status honestly.

No tests, syntax checks, gates, browser actions, commits or deployment were
performed by this reviewer. Public SW artifacts are intentionally not
regenerated yet: other work modified public UI/db/media files in the shared
checkout during the review and then landed as `12a1de48`. Generate artifacts
from the intended final shipping state, and preserve any newer parallel work.

## Other open work and proof gaps

- P2: `docs/operations/debugger/SUPPORTER_REGRANT_RESUME.md` still applies.
  Relay rotation completion does not durably refresh account-side supporter
  bundles. Finish the cross-service obligation/resume slice, including kill
  after relay rotation and fresh supporter sign-in. No account/credential
  architecture was changed in this review.
- `scripts/probes/sync_delivery_order.mjs` still implements `ownAckThenFetch`
  with the same foreign `drainOps(..., {fetched:false})` as its push branch.
  Use a locally pending edit and actual `confirmOps`/submit acknowledgement
  followed by an earlier fetched op. Existing own-echo coverage is useful but
  does not replace this acknowledgement ordering scenario.
- The delivery report needed manual SW update/unregister/reload to pick up
  fresh modules. Prove normal installed-client upgrade with pending offline
  edits, keeping storage and SW registration intact. Record the active build,
  persisted edits and peer convergence. Cache clearing is not upgrade proof.
- Actual iPad ↔ Desktop, background/foreground, kill/relaunch and retention
  pagination/concurrent snapshot-write proofs remain delegated. Do not claim
  them from Node tests or from a browser plus Node peer.

## Receiving-developer execution packet

1. Read AGENTS.md, Debugger.md, Testing.md and this report. Preserve current
   uncommitted work. This reviewer changed only the six tracked paths listed
   above; the parallel UI/db/media work and pre-existing scratch files have
   another owner. Review path/hunk ownership before any staging or deployment.
2. Verify the small prepared changes first, then implement separate narrow
   slices for safe cancellation/retry ownership and consistent active sealing
   state. Cover the fetch fallback in the cancellation slice. Add the concrete
   failing regressions above before claiming a fix; use actual stores/crypto
   and the shipped browser adapter where applicable.
3. Install/check the test guard in a new shell as Testing.md requires. Run
   focused protected tests, sequentially:

   ```sh
   scripts/test.sh src/board/sync_crypto.test.mjs src/board/sync_reliability.test.mjs src/board/sync_snapshot.test.mjs
   scripts/test.sh src/board/sync_order_review.test.mjs src/board/sync_delivery_order.test.mjs src/board/sync_watermark.test.mjs
   ```

   Add affected rotation, registry/IDB and transport regression files to the
   focused proof. Do not run the full wall without separate founder approval.
4. Coordinate shared-checkout edits, regenerate SW outputs with
   `node scripts/sw/sw_manifest.mjs`, and run `npm run check:fast`. Refresh
   affected source-derived artifacts and line budgets only as required. Never
   deploy unrelated unverified edits just because they are in the checkout.
5. With `npm run dev:agent`, prove two disposable linked browser profiles
   visibly converge in BOTH directions through real WASM `bootDb`/`initSync`,
   including Sonja's Numbers board with custom “and”, offline edit/reconnect,
   late completion after timeout, rotation during outbound work, and reopening
   persisted rows. Plain `/` preserves family edits; do not use reseed or
   storage clearing as recovery. Leave founder preview/slot-0 untouched.
6. Commit only deliberate slice paths/hunks using the interactive developer's
   normal workflow. The reviewer must not stage, commit or mutate the queue.
   Deploy verified changes (Wrangler login is resolved), smoke production
   `https://app.pipaac.org`, record served version/SW build and repeat actual
   peer convergence on disposable users. Root 200/source text is supplementary.
7. Return commit IDs, exact focused outcomes, real browser observations,
   deployment identity, upgrade observations and remaining hardware/account
   work. Keep the supporter-regrant slice separately tracked until delivered.
