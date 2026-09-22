# Pip AAC — Agent Workflow

Applies to agents, humans, and CI. This file is the router. Put durable policy
in routed docs; add links here, not long prose.

## Default Loop

```text
Read route -> name slice + truth owner + proof -> edit narrowly -> focused proof
-> deslop -> code audit -> log durable lessons -> commit when saving
```

No silent WIP: if work stops mid-slice, leave a short status note naming scope,
files touched, proof state, and next action.
→ `docs/operations/Execution-Playbook.md` § Progress Note Format

## First Routing

| Task type | Read first |
| --- | --- |
| New feature, product idea, rough spec | `docs/workflows/SSOT_Founder_Input_Workflow.md` + `docs/workflows/SSOT_Feature_Workflow.md` + `docs/product/Design_Invariants.md` |
| Sprint or phase execution | `docs/phases/README.md` (§ Next + live index) + `docs/operations/Execution-Playbook.md` |
| Completed phase archive or stale phase docs | `docs/operations/Execution-Playbook.md` § Phase Archive + `docs/archive/phases/README.md` |
| Bug report or broken workflow | `docs/operations/Debugger.md` |
| Running tests, proof selection, the full wall | `docs/operations/Testing.md` |
| Code cleanup, maintainability, file hygiene | `docs/operations/code-maintainer/SKILL.md` |
| Pre-closeout architecture review | `docs/operations/Code_Audit.md` |
| Hunk-level cleanup after product work | `docs/operations/Deslop.md` |
| Product vocabulary and durable truths | `docs/product/SSOT.md` |
| Visual design: tokens, tiles, brand marks | `docs/product/Design_System.md` |
| Vision, roadmap, monetization | `docs/strategy/Vision.md` + `docs/strategy/Roadmap.md` |
| Stack, commands, local setup | `docs/operations/TechStack.md` |
| Repo conventions | `docs/operations/Contributing.md` |
| Commits, Codex handoff queue, Cursor git automation | `docs/operations/Execution-Playbook.md` § Commits & Codex Commit Handoff |
| Doc claim trustworthiness, BUILT/DECIDED/PROPOSED tags | `docs/operations/Doc_Claim_Taxonomy.md` |
| Repo layout | `docs/FOLDER_MAP.md` |
| Working rules and doc archive boundary | `docs/WORKING_RULES.md` |
| Local preview / wrangler / localhost | `docs/operations/TechStack.md` § Local preview |

## Doc claims

Untagged prose that asserts how the system works is **untrusted by default**. Tag
durable claims **BUILT** (true now + `file:line` or commit sha), **DECIDED**
(founder ruling + date; may be unbuilt), or **PROPOSED** (idea only). Full
taxonomy: `docs/operations/Doc_Claim_Taxonomy.md`.

**Never assert system behavior from a grep count or a code comment. Trace from an
entrypoint and cite the call path.**

Citation lint: **BUILT** `scripts/check_doc_citations.mjs` (wired into `npm run check`).

## Codex Commit Handoff

Hookless agents (Codex CLI) must not `git add` or `git commit` directly at slice
close. Interactive IDE agents (Cursor, Antigravity) commit directly — see
`docs/operations/Execution-Playbook.md` § Commits & Codex Commit Handoff.

## Project Laws

- Founder/user input is intent, not final authority.
- UI and API responses may render truth; they must not invent durable product truth.
- Prompt prose may request work; it must not be the only owner of semantics.
- Generated output is derived. Change the source, then regenerate.
- Every feature slice needs one owner-visible Works Test or an explicit proof
  waiver.
- **Measure the actual thing, not the system's report of it.** A test that
  asserts what the code says it did is the code grading its own homework — green
  test theater. Assert against an instrument the code cannot influence, or state
  plainly that the claim is unproven.
- Every non-trivial bug fix names the truth owner, lie-prone layer, and missing
  proof before editing.
- Maintenance preserves behavior unless the task is explicitly a bug fix.
- Do not mix broad cleanup into a feature or bug fix.
- Prefer deterministic checks over recurring agent judgment.
- **Trust the agent** on well-packeted work. Fix lying sources and plumbing; do
  not infantilize capable editors with guardrail religion.
- Before proposing platform surfaces (APIs, linters, JSON rules), run
  `docs/product/Design_Invariants.md` and prefer routed docs + live CLI topics
  first.
- Agents preview with `npm run dev:agent`. `npm run dev` is the founder browse
  copy — do not kill it or reuse `.wrangler/slot-0`.
- **Interactive IDE agents commit directly** with `git add <paths>` and
  `git commit`. Hookless agents enqueue per the handoff queue.

## Running Tests

```text
scripts/test.sh <paths>    iterate — lock, wedge detector, process-group reaping
node --test <files>        auto-routed into the above, transparently
npm run check:fast         cheap gates, reports ALL failures
npm run check              closeout wall — all gates, every failure in one pass
scripts/test.sh --heavy    heavy test set; CI may run on every push
```

Binding rules: `docs/operations/Testing.md`.

New shells need the guard: `bash scripts/install-test-guard.sh` (idempotent),
then verify with `bash scripts/check-test-guard-liveness.sh` in a **new** shell.

## High-Risk Stops

Ask before proceeding when the change could affect privacy, credentials,
publishing/destructive actions, billing, regulated health/legal/financial
claims, or user data retention.
