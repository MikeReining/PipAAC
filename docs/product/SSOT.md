# PipAAC SSOT

Single source of truth for durable product facts. Map facts → owner doc here;
do not duplicate long policy in `AGENTS.md`.

## Product identity

| Fact | Owner |
| --- | --- |
| Product name: **Pip AAC** (repo: PipAAC) | This file |
| **DECIDED 2026-09-21**. Relational Language Graph AAC with Multi-Surface Views (founder brief) | `docs/strategy/Vision.md` |
| **PROPOSED.** Primary domain `pippaac.org` (not registered in repo) | `docs/strategy/Vision.md` |
| **BUILT** (`src/worker/index.js:12-14`). Harness Worker exposes `GET /health` | `docs/operations/TechStack.md` |
| Dev harness (same family as LocalFlyers / WorkbookBench) | `docs/FOLDER_MAP.md`, `AGENTS.md` |
| Dev process | `docs/operations/` + `AGENTS.md` |
| Live work index | `docs/phases/README.md` |

## Engineering laws (pointer)

Cross-cutting: `docs/product/Design_Invariants.md`. Test rules: `AGENTS.md` § Running Tests.

## Agent discovery

- Router: `AGENTS.md`
- Slice execution: `docs/operations/Execution-Playbook.md`
- Bug intake: `docs/operations/Debugger.md`
- Maintenance: `docs/operations/code-maintainer/SKILL.md`
