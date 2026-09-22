---
name: code-maintainer
description: Behavior-preserving file/module/doc hygiene for Ikiro.
---

# Code Maintainer

Code Maintainer reduces future change cost without changing behavior. It is
whole-file/module hygiene, not closeout deslop and not bug fixing unless the
user explicitly asks for a bug fix.

No single scanner defines repo health. A silent signal advances the next lens;
it never proves global completion. The loop has batches and epochs, not an end.

## When To Use

- "run code maintainer";
- "clean this file/module";
- "find maintenance candidates";
- repeated agent confusion around a file/doc;
- large, mixed, high-churn, or proof-hostile files.

## Scope Modes

| Mode | Trigger | Output |
| --- | --- | --- |
| Scout | No path named | Readonly ranked candidates. |
| Maintain | Path named | Behavior-preserving cleanup in that scope. |
| Split plan | File is large/mixed/risky | Extraction map, no code movement. |
| Friction | Proof or commands keep failing nearby | Remove verification drag first. |
| Journal | After a meaningful batch | Append `RUNLOG.md` alongside the durable change. A no-op run prints its report or writes ignored local telemetry; it does not grow committed history on its own. |

## CSS Surface Escalation

Hand-owned CSS is a bug surface, not a cosmetic exception. A CSS file above
900 lines, or above 500 lines while owning four or more selector namespace
families, is a Structure finding even when `long_lines` or `broad_names` are
suppressed as lexical noise.

Required output for a `css_surface` finding:

- a split plan naming surface ownership and proof before movement;
- a completed extraction with a thin import barrel and focused proof; or
- an explicit queue row/waiver naming why the large surface remains cheaper
  than the split.

Suppressing CSS property-list noise must be signal-specific. Do not suppress
`file_size` or `css_surface` for hand-owned CSS unless the split is already
complete, the remaining file is only an import barrel, or a dated waiver exists.

## Lens Model

| # | Lens | Question | Primary signal |
| --- | --- | --- | --- |
| 1 | Structure | Does this file do one job? Is it navigable? | `scripts/code_maintainer_scan.py` with suppressions |
| 2 | Duplication | What logic exists in 2+ places? | `scripts/health/duplication_scan.mjs` when available; judgment mode until then |
| 3 | Dead weight | What is exported/kept but never used? | `scripts/health/dead_exports_scan.mjs` when available; queue rows only |
| 4 | Doc truth | Do the docs agents actually load still tell the truth? | `scripts/health/doc_drift_scan.mjs` when available |
| 5 | Contract conformance | Is each contract-doc law enforced by a gate or test? | Contract-doc walk with concrete file:line output |
| 6 | Proof debt | Are high-churn files untested? Are gates wired into `npm run check`? | `scripts/churn_report.mjs --hotspots` when available |
| 7 | Consistency deep-read | Which stale area has naming, error-shape, or pattern drift? | `LEDGER.md` when available; judgment mode until then |
| 8 | Friction | What keeps confusing agents or breaking proof commands? | Debug/RUNLOG proof failures and skipped findings |

## Lens Selection

- Every regular RUNLOG entry records `Lens: <name> (index k)` and the next
  regular batch runs index `(k + 1) % 8` by default.
- Lookback batches record `Lens: lookback` and do not advance the pointer.
- Until a detector exists, run that lens in judgment mode or skip with a RUNLOG
  note naming the missing detector. Missing-detector skips do not block epoch
  closure until the detector milestone ships.
- A founder-named scope, priority queue row, or health evidence may override
  the pointer. Record one-line override justification; the displaced lens runs
  next.
- Anti-starvation: an epoch closes only after every available lens has run at
  least once since the previous epoch boundary.
- Judgment lenses must emit concrete artifacts: queue rows with file:line
  evidence, suppressions, ratchet candidates, or fixes. Prose-only conclusions
  are invalid.

## Required Workflow

1. Read `AGENTS.md`, `docs/operations/Contributing.md`, this doc, the last 3
   RUNLOG entries, open queue rows, and `DYNAMIC_RULES.json`.
2. Inspect `git status --short`; do not touch unrelated dirty files.
3. Determine the lens from the RUNLOG pointer, unless an override applies.
4. Establish scope. If no path is named and the lens is Structure, run:

   ```bash
   python3 scripts/code_maintainer_scan.py --top 15
   ```

5. Run or inspect the lens signal and triage against suppressions.
6. Find 1-2 local exemplars before editing.
7. Record baseline: lines, obvious jobs, lens signal, proof command.
8. For non-trivial code movement, write the proof contract first.
9. Fix the top 1-3 behavior-preserving findings, or record an honest no-op.
10. Findings that need behavior/product decisions become `needs-founder` queue
    rows instead of autonomous edits.
11. Write suppressions for every inspected false positive. Update queue rows.
12. Ask the ratchet question in the report: "What deterministic check would
    have caught this class earlier?" If a class has 3+ RUNLOG occurrences,
    building the check is the batch deliverable.
13. Run formatter/proof if available and relevant.
14. Rerun scanner or detector on touched paths.
15. Append `RUNLOG.md` with lens name, pointer, proof, skipped findings, queue
    changes, and next lens pointer.

## Rubric

- One job per file/function.
- Prefer deletion before abstraction.
- Collapse duplicate truth.
- Rename vague identifiers.
- Flatten accidental branching when local style supports it.
- Remove stale comments, banners, and TODOs.
- Keep public behavior and API shape stable.
- Do not optimize for negative LOC if meaning gets worse.
- LOC delta is never sufficient evidence. Extraction batches state the
  ownership/navigation benefit in one sentence; future lookbacks grade that
  sentence. Barrel-only splits are No-ops.

## Guardrails

- MUST preserve behavior unless explicitly fixing a bug.
- MUST NOT edit generated artifacts by hand.
- MUST NOT mix unrelated cleanup into product work.
- MUST NOT split a file without a proof path.
- MUST NOT create repo-wide style law here; update the owning doc.
- MUST NOT hide missing proof behind confidence prose.
- MUST NOT produce a bookkeeping-only commit. A commit must touch at least one
  durable, non-ledger file: a fix, a detector, a gate, or a spec. The commit
  handoff refuses commits whose staged changes are only `RUNLOG.md`,
  `HEALTH.md`, `HOTSPOT-PROOF-MAP.md`, or `.wmd/` plumbing.
- MUST NOT edit the automation control plane during an ordinary run
  (commit-handoff scripts, Cursor hooks, queue plumbing). Touching that
  machinery requires an explicit, human-named maintenance task; the handoff
  rejects such paths unless the request is submitted with `--allow-control-plane`.
- MUST NOT run continuously or as a self-restarting goal. Maintenance is
  batch-and-epoch, human-initiated; a "run forever" loop is the failure mode
  that floods the queue and stalls dev work.

## Proof Contract

```text
Claim:
Protected invariant:
Truth owner:
Lie-prone layer:
Forbidden regression:
Required proof:
Exact command:
Missing proof:
Verdict: PROOF_READY | PROOF_DEBT | PLAN_ONLY
```

## Outcome Classes

| Class | Meaning |
| --- | --- |
| Reduction | Fewer lines/concepts, same behavior. |
| Clarification | Similar size, clearer ownership. |
| Extraction | More files, better one-job ownership. |
| Guardrail | Small addition prevents future drift. |
| No-op | Inspected; no worthwhile change. |

## Batch Completion Rule

A batch is done when it produced at least one of:

- 1-3 proven, behavior-preserving fixes;
- a new detector, gate, or split plan;
- an honest no-op record naming inspected signals, dismissals/suppressions, and
  the next lens pointer.

A no-op outcome is reported, not committed. Only batches that produce a durable,
non-ledger change (a fix, detector, gate, spec, queue row, or suppression) append
a committed `RUNLOG.md` entry. RUNLOG is the audit trail for meaningful batches,
never a heartbeat for empty runs.

Banned closing claims: "loop complete" and "repo clean". The correct closeout
shape is: `Batch N (lens X) complete; queue has M open rows; next regular batch
runs lens Y.`

## Lookback Rule

Every 5th batch (`20`, `25`, `30`, ...):

1. Re-verify the stated benefit of each batch since the previous lookback and
   grade `HOLDING | REGRESSED | NEEDS_FOLLOWUP`; regressions become priority
   queue rows. Re-run recorded proof commands where local proof can run.
2. Review suppressions past `review_after_batch`: renew with fresh evidence or
   delete.
3. Review `promotion_candidates`: any pattern with 3+ occurrences gets a gate
   this batch or a queue row explaining why not.
4. Run `node scripts/health/health_report.mjs --append`; explain every
   significant delta.
5. Queue governance: if open rows grew at this lookback and the previous one,
   the next epoch is a burn-down epoch. Regular batches pull from the queue and
   do not add new detectors/fronts until the trend reverses.
6. Answer the self-improvement question in RUNLOG: which lens produced the
   most/least real findings this epoch, and what changes in this skill,
   detectors, or suppressions follow?

## Detector Promotion Test

An advisory detector graduates into `npm run check` only when one of these is
true:

- a full epoch of triage shows post-suppression findings are consistently real
  (no more than roughly 1 in 5 dismissed), or
- it encodes a specific 3+ recurrence pattern with evidence paths, such as the
  operation-utils gate.

Promotion is a Lookback-batch decision recorded in RUNLOG. Dead-export findings
are never auto-removed; deletion requires a later proof slice and becomes
`needs-founder` if reachability is uncertain.

## Report

```text
Scope:
Class:
Files touched:
Behavior guarantee:
Proof:
Before/after signal:
Skipped findings:
Ratchet question:
Lens:
Next lens:
Next maintenance pressure:
```
