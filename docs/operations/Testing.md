# Testing

Owner doc for how proof is run in this repo. `AGENTS.md` carries one line
pointing here; everything below is the detail.

## Why this doc exists

Agents kept treating the full test wall as the closeout ritual. On 2026-09-03 an
agent ran it three times in one session — while working on the task of making the
wall *cheaper* — and the founder had to interrupt to stop it. Each run was ~10
minutes; each was answerable by one file's proof. Momentum died in the runner,
not in the product.

The rules below are the fix. They are not advice.

## Commands

```text
scripts/test.sh <paths>    iterate — lock, wedge detector, process-group reaping
node --test <files>        auto-routed into the above, transparently
npm run check:fast         cheap gates, reports ALL failures
npm run check              FULL WALL — founder-approved runs only (rule 8)
scripts/test.sh --heavy    heavy test set; nothing runs it automatically
```

Python tests run as `cd harvester && .venv/bin/python -m pytest <files>` —
`scripts/test.sh` is node-only despite the auto-route note above.

## Binding rules

1. **`scripts/test.sh` is the protected runner.** Bare `node --test` is
   **refused** by `scripts/bin/node` when the PATH guard is active.
2. **One test run per clone.** A second concurrent run fails fast.
3. **Iteration proof = `scripts/test.sh <paths>`.** Broad runs need `--all`.
4. **`npm run check` needs founder approval per run — see rule 8.** Closeout is
   NOT a trigger for it. We close a doc many times a day; a per-closeout wall is
   a ~10min tax on the most common event in the loop.
5. **A lock failure, wedge kill, or timeout is a STOP signal, not a retry
   signal.**
6. If the machine is wedged: `bash scripts/kill-stale-tests.sh`, then continue.
7. A red `HEAD` is a quarantine item with an owner and expiry, never a silent
   skip. The agent who hits it owns the next move: fix a false-positive gate, or
   write the quarantine row in `docs/operations/debugger/QUARANTINE.md`. Do not
   freeze at commit asking whether to skip the wall.
8. **The full wall needs founder approval. Every time. Ask, then wait.**

## Rule 8 in full

`LOCALFLYERS_FULL_SUITE=1 npm run check`, `scripts/test.sh --all`, and `npm test`
are founder-approved-only outside two callers: the CI workflow, which runs
only when dispatched by hand (DECIDED 2026-09-11 — nothing runs on push; 1,800
of 2,000 monthly minutes had gone to a red wall on `main` nobody read), and
`scripts/deploy_worker.sh` with `RUN_CLOSEOUT_WALL=1`. Nothing else.
Not "closing out a slice", not "chasing a cross-slice break", not before a
commit — **ask**.

Setting the env var yourself is not approval. The refusal message in
`scripts/test.sh` prints the override; printing it is not permission to use it.

Why the earlier, softer wording did not hold: the rule already said "no broad
runs without the founder's explicit ask" and the 2026-09-03 session ran the wall
three times anyway. The wall is ~10min against ~1s for the affected proof; at
this repo's cadence (491 commits in the 10 days to 2026-09-03) it is never the
routine gate.

**DECIDED** (founder, 2026-08-31; tightened to explicit per-run approval
2026-09-03).

## The unit of proof is a test, not a file

A file is the wrong floor: one file can hold 15 tests, and re-running all of them
to check a two-line edit is the same mistake as the wall, one order of magnitude
down.

```text
scripts/test.sh <file> -- --test-name-pattern "<name>"   one test
scripts/test.sh <file>                                   one file
npm run proof -- --path <file>                           affected proof
```

`scripts/test.sh` passes `-- <node-args>` straight through, so the pattern form
works today. Before re-running anything, ask what the *last* edit could have
broken and prove only that: a constant or a pure function is proven by importing
it, not by a test file. Run a whole file when the logic actually changed — not
again after an assertion-only follow-up.

## Test guard

New shells need the guard: `bash scripts/install-test-guard.sh` (idempotent),
then verify with `bash scripts/check-test-guard-liveness.sh` in a **new** shell.

## Related

- `docs/product/Design_Invariants.md` § 2 — one proof path; a gate must be seen
  to fail
- `docs/operations/debugger/QUARANTINE.md` — red-HEAD quarantine rows
- `docs/phases/test_infrastructure_process.md` — **PROPOSED** measurements and
  the affected-proof selection plan
