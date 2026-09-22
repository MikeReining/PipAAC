# Debugger

Debugger is the front door for bug reports. Its job is to stop symptom patches:
name the truth owner, lie-prone layer, and missing proof before editing.

## Intake

For every non-trivial bug:

1. Search `docs/operations/debugger/BUG_PATTERNS.json`.
2. Search `docs/operations/debugger/DEBUGLOG.md`.
3. Inspect current diff for the touched surface before hypothesizing (many regressions
   are caused by the previous fix on the same surface).
4. Classify tier.
5. Write the packet.

For `T3` and repeated bugs, prior art starts at step 1 — not a blank investigation.

### Loop budget

A worker may reclassify a bug at most twice. After that, stop, report conflicting
evidence, and ask for a boundary decision instead of continuing to patch.

After root cause, answer:

```text
What was the agent allowed to do that must never be allowed again?
```

That answer becomes a regression law with a wall-reachable command (see
`docs/operations/debugger/BUG_PATTERNS.json` and `REGRESSION_LAW_BACKLOG.md`).

Bug fingerprint:

```text
<surface/path> + <symptom> + <likely truth-owner/proof-gap>
```

## Tiers

| Tier | Use when | Required behavior |
| --- | --- | --- |
| `T0 Fast` | Copy, spacing, paint, focus, icon, z-index only | Fix surgically. |
| `T1 Boundary` | UI-visible navigation/read-only bug or simple uncertain bug | Name observed layer and likely truth owner. |
| `T2 SSOT` | Status, counts, readiness, publishing state, generated content, permissions, routing payloads, persisted data, or cross-layer state | Full packet before code. |
| `T3 Critical` | Data loss, privacy/security, credentials, billing, destructive publish/delete, regulated claims, or repeated bug | Full packet, regression audit, log entry. |

If unsure, classify higher for analysis; evidence may downgrade.

## Default Debug Law

If a visible bug involves status, counts, readiness, permissions, publishing,
generated content, ownership, or persisted state, first hypothesis is SSOT drift.

Disprove SSOT drift with positive evidence from the owner: schema, contract,
API response, persisted reload, generated type, fixture, or focused test. A
component read is not enough.

## Debug Packet

```text
Tier:
Symptom / repro:
Bug fingerprint:
Truth owner:
Lie-prone layer:
Regression considered:
Missing kill test / proof:
Fix boundary:
Proof command / founder test:
```

## Forbidden Moves

- Patch UI because a semantic value looks wrong before naming the owner.
- Add silent fallbacks around required semantic fields.
- Treat `ok: true`, screenshots, AI prose, visible row counts, or render success
  as durable proof.
- Combine unrelated cleanup with a bug fix.
- Hide a repeated bug without adding or naming regression proof.

## Closeout

For `T1-T3`, report:

```text
Tier:
Boundary verdict:
Proof gap:
Fix boundary:
RCA:
Proof:
Founder test:
```

Definition of done (replaces ad-hoc proof scope):

1. Kill test exists: red on pre-fix code, green after.
2. `npm run check` green locally (commit queue and pre-commit hook enforce).
3. CI green (`check` on push; `check:full` on main and nightly).
4. Founder-found or repeated bug: DEBUGLOG `Proof:` names a wall-reachable test
   (meta-gate enforces).
5. `T2`/`T3` or repeated: regression law with wall command, red-before/green-after
   evidence, or expiring blocker in `QUARANTINE.md`.
6. Founder test = confirmation of feel, never proof of correctness.

`Deferred proof` is not a terminal closeout state. If proof needs a click, ship
an automated click (`eval:studio-behavior-smoke` or a focused gate).

Append to `docs/operations/debugger/DEBUGLOG.md` for every repeated bug and
every `T3`.

