# Code Audit

Readonly architecture checkpoint before non-trivial closeout or founder smoke.
It checks whether the slice is structurally safe, not whether the code is pretty.

## When It Runs

Run after focused proof and deslop when a change touches product behavior,
durable state, generated output, API contracts, routing, auth, publishing,
payments, privacy/security, or more than one module.

Skip only for `T0` copy/paint fixes, docs-only edits, or process-only changes
that do not alter runtime behavior.

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `CLEAN` | Closeout may proceed. |
| `REFACTOR REQUIRED` | Fix findings in the same slice, then re-audit. |
| `INCONCLUSIVE` | Gather missing evidence, then re-audit. |

## Rubric

1. One job per file. A touched file should have a sentence-sized responsibility.
2. No half extractions. If a helper was added, the caller lost the job.
3. No duplicate truth. Semantic ownership exists in one durable place.
   **Evaluated at SURFACE scope, not diff scope.** When the slice touches a
   user-visible surface, enumerate every module that already decides something
   for that surface and state whether this slice makes it N+1. A slice adding
   one module is almost always clean inside its own diff — the duplication lives
   in files the diff never shows. See § Surface scope.
4. No silent fallbacks. Required semantic data fails loud or blocks safely.
5. Proof matches claim. The test/command covers the owner-visible behavior, not
   only a convenient helper.
6. Creation matches architecture. When changing formats, schemas, or contracts, creation emits the new thing — renderers or editors supporting both forms must not hide that creation is still emitting the old format (`Folder_Native_Design_Invariants.md` §1e).

## Surface scope

Rule 3 is a claim about a **surface**, and it is unanswerable while looking at
one place. When a slice touches a screen, "Scope reviewed" must list the surface
and the modules already deciding for it — not only the changed files.

**Why (2026-08-11, Phase 132).** One screen accumulated five independent
derivation sites over eight slices in a day, two of which disagreed about what
"live" meant. Every one of those slices audited **CLEAN**, correctly: at diff
scope each added a single well-formed module with one job. The rule was right;
its scope defeated it.

Concretely, for a slice touching a surface:

```text
Surface:            # the screen or flow
Already deciding:   # every module that answers part of "what does the owner see"
This slice makes it: # N -> N+1, or N -> N-1
```

`N -> N+1` is not automatically a REFACTOR REQUIRED, but it must be stated and
justified. Silence is the failure mode this section exists to remove.

## Audit Packet

```text
Verdict: CLEAN | REFACTOR REQUIRED | INCONCLUSIVE
Scope reviewed:
Proof reviewed:
Findings:
- [P0-P3] file:line - issue; required action
Residual risk:
```

