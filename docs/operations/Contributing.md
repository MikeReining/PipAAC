# Contributing

## Working Rules

- Read `AGENTS.md` before editing.
- Keep diffs scoped to the routed task.
- Do not rewrite unrelated user work.
- Prefer local patterns over imported architecture.
- Add abstractions only when they remove real duplication or clarify ownership.
- For high-risk behavior, write the proof plan before product code.

## Proof Rules

- Run the narrowest useful proof for the touched surface.
- If no proof command exists yet, name the missing proof in closeout.
- Do not claim behavior is proven by screenshots or render success alone.
- For UI behavior, prove the user gesture when practical, not only a helper
  function.

## Git Hygiene

- Main should remain reviewable.
- Stage explicit paths only.
- Do not sweep unrelated dirty files into commits.
- Mention unrun proof and residual risk in closeout.
- Codex agents enqueue commits through `scripts/commit_handoff_queue.py`; Cursor
  processes the queue. See `docs/operations/Execution-Playbook.md` § Codex
  commit handoff.

