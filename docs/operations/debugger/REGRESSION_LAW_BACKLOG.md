# Regression Law Backlog

Regression laws promoted from debugger patterns. Each entry must name a
`wallCommand` reachable from `npm run check` or `npm test`.

| Law | wallCommand | Status |
| --- | --- | --- |
| A flow that opened the device keyboard must never reveal the board in the same document — the welcome's Continue navigates (`location.replace`) and the tour resumes via the consumed `pip_tour` flag | `node --test src/board/onramp_exit.test.mjs` | open |
| An open or cleared sentence must not train next-word history, and a word that never followed the context must not inherit its lifetime share | `scripts/test.sh src/board/strip_history.test.mjs` | open |
| Synced tables may only be seeded by replayable truth — applied group state without a `seed_install` op in the device's own log is unrecoverable by a rebase | `node --test src/board/sync_seed_repair.test.mjs` | open |
| A relay acknowledgment or maximum observed sequence is never proof that the corresponding board state was applied and durably saved — coverage is claimed per-op (`applied` flag), the cursor moves only on fetch-verified drains after the DB flush, and repeated or sparse delivery converges identically | `node --test src/board/sync_watermark.test.mjs` | open |
| A published snapshot may contain only the durable baseline at its claimed seq — pending edits and push-applied ops can never ride a backup that disowns them; a fully pruned tail must adopt the bridging snapshot or fail loudly; published snapshot objects are immutable per seq and the pointer only advances | `node --test src/board/sync_snapshot.test.mjs` | open |
| The epoch an envelope declares must be the epoch it's sealed under, and every device must reach every historical epoch it was granted — a missing key is an error, never a minted replacement; a removed device's connection loses authority the moment its row is deleted, on receive and on broadcast | `scripts/test.sh src/worker/pairing.heavy.test.mjs src/board/sync_snapshot.test.mjs` | open |
| A pending edit may never be stranded by a transient submit failure — retries are bounded and automatic, and a media obligation only counts toward its drop cap when the bytes are proven gone (local miss + relay 404); every durable queue read-modify-write is serialized | `node --test src/board/sync_reliability.test.mjs` | open |
| "Saved" may never render while inbound replay failed, a media item died unrecoverably, or writes are unflushed — op counts alone are not proof of save success | `node --test src/board/editor_find.test.mjs` | open |
| Registration and join are idempotent for the rightful signer only — a lost response retries safely, a pubkey mismatch under a known device id is a conflict, a rejected join never burns the token, and a user without proven relay access is marked pendingJoin, never presented as synced | `scripts/test.sh src/worker/relay.heavy.test.mjs src/board/sync_reliability.test.mjs` | open |
