# Execution Playbook

Pair this with exactly one target doc or explicit user request. Process lives
here; scope and product truth live in the target.

## Modes

| Mode | Trigger | Behavior |
| --- | --- | --- |
| Direct | Ordinary implementation request | Implement the smallest useful slice, then close out. The session types it itself — delegation overhead is not worth it below packet size. |
| Packet | Ambiguous feature/sprint request | Produce a feature or task packet before code. Route fully-determined packets per § Lane Routing. |
| Orchestrated | User asks to orchestrate, run a chain, or use workers | Separate implementer, deslop, audit, and closeout roles when tooling exists; tier each role per § Lane Routing. |

## Slice Packet

Use before non-trivial product work.

```text
Slice:
Goal:
Out of scope:
Truth owner:
Lie-prone layer:
Works Test:
Proof command:
Missing proof / waiver:
Done when:
```

When the slice routes to a delegate lane (§ Lane Routing), the packet gains
three fields and must be **self-contained** — the delegate shares none of the
session's conversation context:

```text
Files:         # exact paths to create or modify
Interfaces:    # signatures, types, or shapes the code must match
Constraints:   # conventions, locked contracts, things not to touch
```

A packet you can't finish writing is a signal the decision isn't made yet —
that is session work, not a reason to hand the ambiguity to a cheaper lane.

### Surface owner (required when the slice touches a screen)

Any slice touching a user-visible surface adds one field:

```text
Surface owner:   # the ONE module that owns this surface's state
```

**A packet that cannot name one is a consolidation signal, not a fix.** Stop and
consolidate the surface first; do not dispatch the symptom.

**Why (2026-08-11, Phase 132).** Eight symptom-shaped packets were dispatched at
one screen in a day. Each worker did the correct thing — extract a pure,
unit-testable function — so each fix added a module. The result was five
independent derivation sites answering "what should this owner see", two of them
disagreeing on what "live" meant, and a screen that showed a warning above copy
saying the site was ready. Every slice was individually clean. The surface was
incoherent.

The failure is in the packet shape, not the workers: **"fix this symptom" has no
owner in it, so nobody can tell whether the fix belongs to something that
already exists.**

## Lane Routing (Model Economics)

Roles are tiered relative to the session — this doc never names models. Tier
aliases live in exactly one place: the agent frontmatter under
`.claude/agents/`. The session model is whatever the human picked; every rule
below survives any model-lineup change.

| Role | Tier | How |
| --- | --- | --- |
| Architect (decompose, packet, route, judge proof) | Session | The session itself. Emits judgment, not volume. |
| Implementer | Cheap | `.claude/agents/implementer.md` — takes a self-contained packet, returns a report with real proof output. |
| Deslop | Cheap | Same lane: hand it the touched hunks plus `docs/operations/Deslop.md`. Hunk-scoped cleanup is fully packet-determined. |
| Broad exploration / search | Cheap, read-only | Delegate sweeps; keep only conclusions in the session context. |
| Advisor | Session tier, fresh context | `.claude/agents/fresh-skeptic.md` — see § Advisor Stops. |
| Audit, closeout | As already specified | `Code_Audit.md` and this doc own their rules. |

Deciding rule: how much does the outcome depend on judgment the packet can't
capture? Little → the cheap lane; the proof catches mechanical failure. A lot
(architecture, locked-contract surfaces, debugging hypotheses) → stays with
the session. Escalation is deliberate, per slice, never a fixed binding.

The delegate's report is a claim, not evidence: read the diff and re-run the
proof before accepting. If the delegate's work fails proof, send back a
**corrected packet** — never hand-fix its bugs at session price; that is the
routing failure in disguise.

## Execution Order

1. Read `AGENTS.md` and the routed docs.
2. Inspect current state before planning new structure (broad sweeps go to a
   cheap read-only agent; the session keeps conclusions, not file dumps).
3. Name the smallest owner-visible slice.
4. Name the truth owner and proof path.
5. Edit narrowly — or route a fully-determined packet per § Lane Routing.
6. Run focused proof while iterating (`docs/operations/Testing.md`).
7. Run deslop for hunk-level cleanup.
8. Run Code Audit for non-trivial product or architecture changes.
9. Update durable docs/logs only when the lesson should survive the turn.
10. If changed work should be saved, commit directly with `git add` and `git commit` (Antigravity/interactive agents) or enqueue Codex commit handoff and wait for `done` (hookless Codex CLI).
11. **If the founder asked for live / shipped / production / end-to-end:**
    ship per `docs/operations/TechStack.md` once a deploy path exists —
    do not end the slice at commit or push alone.

## Commits & Codex Commit Handoff

**Antigravity, Cursor, and interactive IDE agents commit directly via `git add` and `git commit`.** Never use the commit queue.

**Hookless agents (Codex CLI) only:** When Codex finishes work that should be saved locally, it uses the queue at
`.wmd/commit-queue.jsonl` instead of staging or committing directly:

```text
python3 scripts/commit_handoff_queue.py request \
  --message "<commit message>" \
  --path <explicit-file> \
  --path <explicit-file> \
  --wait
```

Queue items record `id`, `repo`, expected `branch`, explicit `paths`,
`commit_message`, `status`, timestamps, `commit_sha`, and `failure_reason`.
Pending items are processed automatically while Cursor is open via hooks
installed by `bash scripts/install_commit_queue_watcher.sh`: `sessionStart`
starts a repo-local poll watcher on `.wmd/commit-queue.jsonl` (2s interval);
`stop` drains once immediately. Run the installer once per clone; restart Cursor
after install. Optional LaunchAgent covers headless Codex waits when the repo is
outside macOS protected folders or Full Disk Access is granted to the repo
Python. Manual fallback: `python3 scripts/commit_handoff_queue.py process-next`.

End-of-slice workflow for Codex:

1. Inspect `git status --short` and list only files changed by the current
   slice.
2. Use one request for a single logical change. Use multiple `request --wait`
   calls for natural commit chunks; every request must name explicit files.
3. Run the request with `--wait`. Never run `git add`, `git commit`, or
   `git push` directly.
4. If the item is `failed`, read `failure_reason` with
   `python3 scripts/commit_handoff_queue.py status <id>`, fix the concrete
   issue, and enqueue a new request with explicit paths.
5. If waiting times out, leave a progress note naming the queue item `id`,
   changed files, proof state, and next action.

Binding rules:

- Cursor stages only listed paths, commits once, and never pushes.
- Unrelated dirty files are normal and must not block handoff.
- Pre-existing staged changes fail the handoff because `git commit` would sweep
  them in.
- Cursor verifies the expected branch before staging.
- Codex polls the queue item by `id` until `done`, `failed`, or the timeout; on
  `done`, Codex closeout is complete for that slice.
- A saved Codex slice means the queue item reached `done`; otherwise closeout
  must name the save waiver, failed handoff, or timeout.
- A red wall test you did not write is still yours to clear or quarantine.
  Stash once to prove it is `HEAD` (`git stash push` the slice, `scripts/test.sh`
  the failing file, `git stash pop`). Then fix a false-positive gate, or write
  a `docs/operations/debugger/QUARANTINE.md` row with owner, expiry, and proof.
  Do not ask whether to `--skip-green-wall` to save unrelated work.

## Closeout

Closeout is complete when all are true:

- The requested slice is done or clearly blocked.
- `npm run check` green, or the blocker is explicit (including quarantine with
  valid expiry).
- Focused proof ran during the slice; the wall is the final proof scope.
- No unrelated cleanup is mixed into the diff.
- Deslop findings are fixed or explicitly not applicable.
- Code Audit is `CLEAN`, or the reason it did not run is stated.
- New durable lessons are logged in `DEBUGLOG`, maintainer logs, SSOT, or phase
  docs.
- **Creation check:** For format, schema, or architecture decisions, verified what site/artifact creation actually emits (`Folder_Native_Design_Invariants.md` §1e).
- Changed work that should be saved has a Codex commit handoff item marked
  `done`, or the save waiver/blocker is explicit.
- **If the founder asked for live ship:** production deploy completed and
  smoke-checked, or deploy failed with a concrete error (not a handoff checklist).
  See `docs/operations/Deployment_Runbook.md` § Live ship closeout.

## Post-mortem: the dead-code cleanup round — KILLED 2026-08-07

**Do not restart this. Read this section before proposing any repo-wide
cleanup, dead-code audit, or "let's simplify the sprawl" initiative.**

### What happened

The founder observed that this repo carries far more surface than the running
product (measured: 42 packages, 87 product contracts, 88 active phase docs, for
a product with **zero users**), and that dead code is an SSOT violation because
unreachable code is a false claim about how the system works. Both observations
are TRUE and remain true.

A round was started to fix it: build a reachability tool, produce a proven
kill-list, delete in verified batches.

**Result after five slices: ZERO files deleted, and +185,746 lines ADDED to the
repo** — most of it a generated report committed as source. The round made the
thing it was measuring worse, by its own metric.

### Why it failed — the mechanism, not the excuse

Every slice ended with some version of *"the instrument is not trustworthy
enough to delete from yet."* Each reason was individually real:

1. The first parser regexed raw source and matched the word "import" inside
   comments — replaced with esbuild's metafile.
2. All 422 package `exports` counted as entrypoints, hiding dead internals —
   fixed with an export-vs-import cross-check.
3. Container entrypoints (`CMD ["node","server.mjs"]`) were never walked, so a
   live export read as dead — removing it would have broken container boot.

Each fix was correct. **The pattern was the failure.** Perfecting the measuring
device felt like progress and produced none. Deletion work with no users has no
deadline pressure to expose that drift, and none was supplied.

**The tell, and it appeared twice in consecutive slices:** *"still not safe to
delete from yet."* A second occurrence of that sentence should end the round.

### If someone tries again, the bar

- **Do not build an instrument first.** Delete something small and real, verify
  with `npm run check`, repeat. Tooling only after manual deletion proves too
  slow — not before.
- **Never commit generated reports.** A build artifact in git is the same
  disease as the dead code being hunted.
- **With zero users, old dead code costs nothing at runtime.** The re-discovery
  tax is real but is paid mostly on **docs**, not code — 175 contract and phase
  docs versus ~1,087 live source files. Point any future effort at prose first.
- **A ratchet that prevents NEW dead code is a different, cheaper idea** than
  archaeology on old dead code, and is only worth building attached to work
  already happening.

### What was actually kept

Two findings, worth more than the tool that produced them:

- **Container entrypoints are invisible to static analysis here.** A Dockerfile
  is recorded as a config reference, but the process it starts is not walked.
  Anything reasoning about "what code is reachable" must account for this.
- **Dead exports cleanup is slice-scoped** — remove only exports deadened by the
  current slice; `npm run check` must stay green after each removal.

Deslop's existing rule — *"fix dead code introduced by the slice"* — stands
unchanged and needs no instrument.

## Phase Closeout

`docs/phases/` is **live work only**. Git history is the archive: a finished
phase doc is deleted, not moved.

### Do this on closeout (required)

When a phase reaches `Status: Complete` (or Superseded), finish closeout in
this order:

1. Confirm exit gates are checked or explicitly waived in the phase closeout.
2. **Extract** durable product truth into `docs/product/SSOT.md` or the owning
   product contract.
3. **Sever** every live inbound link to the phase file — repoint at the living
   owner, or demote to plain text (`phase 104, in git history`).
4. `git rm` the phase doc. The closeout commit message names the phase, final
   status, and proof, so `git log -- docs/phases/<file>` finds it.
5. **Remove** the phase's row from the live index in `docs/phases/README.md`.
   If § Next named it as the critical path, replace that cell with the new
   next slice — do not leave a "done" narrative behind.
6. Run `rg "docs/phases/<deleted file>"` and confirm no stale live route
   remains.
7. Run `npm run lint:phase-freshness`.

### Do not do this (common agent failure)

- **Do not** add an "Archived / Superseded", "What shipped", or closeout essay
  to `docs/phases/README.md`. That file is a queue + thin live index, not a
  changelog.
- **Do not** leave a completed phase doc in `docs/phases/` with a pointer /
  tombstone stub.
- **Do not** paste session cold-start narratives into the live README when a
  phase finishes — update § Next in place (replace); history lives in git.

## Advisor Stops

Technical commitment boundaries get a fresh-context second opinion before the
session commits. Consult `.claude/agents/fresh-skeptic.md` (read-only, verdict
under 300 words) when:

- committing to an architecture, data migration, schema/API shape, or refactor
  strategy;
- the same problem has resisted two distinct attempts;
- declaring a multi-step deliverable done (once, before closeout).

Pass it the decision, the constraints, and the options considered. Act on the
verdict or surface the disagreement to the human — never silently ignore it.
Advisor Stops are technical; business boundaries go to § Human Stops.

## Human Stops

Stop and ask when the next action changes product scope, deletes user data,
touches secrets, changes privacy/security posture, creates regulated
health/legal/financial claims, or requires choosing between two business
meanings.

**Not a stop:** production deploy when the founder already asked for the slice
to be live — that is agent closeout, not a permission prompt.

Not stops: ordinary refactors, audit findings, missing tests that can be added,
format failures, proof failures with an obvious local fix, or **deploying after
an explicit live-ship request**.

## Progress Note Format

```text
Scope:
Changed:
Verified:
Left:
Next:
```
