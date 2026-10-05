# Quarantine

Tests or behaviors temporarily excluded from the green wall. Every row needs an
owner, expiry, and proof path back to green.

| Item | Owner | Expiry | Proof to clear |
| --- | --- | --- | --- |

## Cleared

| Item | Cleared | Proof |
| --- | --- | --- |
| Stable replay anchor, snapshot coverage and failed-repair rollback (`src/board/sync_order_review.test.mjs`) | 2026-10-05 | All six scenarios pass as real assertions: swap convergence under push-first delivery, snapshot coverage surviving an empty drain, covered history never resurrecting, failed-repair flag preservation, persisted close/reopen, anchorless wound refusing until adoption. Anchor model: `sync_baseline` id=2 (origin/adopted) in `public/shared/ops.mjs`. |
| Rename-only later-push-first delivery (`src/board/sync_delivery_order.test.mjs`) | 2026-10-04 | Delivered probe covers push-first/own-ack-first/snapshot-tail renames and pending edits. Broader convergence reopened 2026-10-05 above; this proof does not cover non-idempotent swaps or retained snapshot history. |
