# Phase 001 — Harness Bootstrap

**Status:** Slice 1 complete (2026-09-21). Slice 2 (founder brief → live phase) not started.

**Successor (when slice 2 lands):** first executing phase doc under `docs/phases/`.

**Next:** Founder brief → SSOT + first executing phase doc (see `docs/phases/README.md` § Next).

## Goal

Stand up the shared Ikiro dev harness (agents router, docs tree, phases/backlog/
archive, code maintainer, test guard, commit handoff, CI green wall) so feature
work can start with proof from day one.

## Slices

| Slice | Scope | Works Test |
| --- | --- | --- |
| 1 | Repo harness: `AGENTS.md`, `docs/`, `scripts/`, Worker health stub, `.cursor/` hooks, `.github/workflows/check.yml` | `npm run check:fast` green after `npm ci` + test guard install |
| 2 | Founder brief → SSOT + first executing phase doc | Phase doc exists with § Slices table and one named Works Test |

## Notes

Slice 1 landed 2026-09-21: initial commit with harness + `GET /health` Worker stub.
