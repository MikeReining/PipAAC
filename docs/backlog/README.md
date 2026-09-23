# Backlog — docs that are not ready for execution

**Nothing in this folder is work.** No queue, no priority, no next action, no
owner.

Two kinds of doc live here, and the folder does not distinguish them because the
consequence is the same:

- **Never decided** — someone wrote an idea down and the founder never ruled.
- **Decided and on hold** — the thinking is finished, the founder ruled, and the
  build is deliberately parked. A held doc carries a HOLD banner naming who held
  it, when, and what would unhold it.

Either way it is not executing, so it is not in `docs/phases/`.

## The three destinations

Every phase doc answers two questions, in order.

| Question | Destination | Meaning |
| --- | --- | --- |
| Ready to execute? No — never decided, or decided and held | **`docs/backlog/`** (here) | Parked. Not work. |
| Decided, and **discharged**? Yes | `docs/archive/phases/` | Built, or explicitly dropped. |
| Decided, executing | `docs/phases/` | Live. Its README row names the literal next slice. |

Founder rule: **a phase is done when its decided work is built or explicitly
dropped.** Deferred and optional items never hold a doc open.

## Backlog is not the archive

Archive is a **link-sink**: live docs must not depend on archived docs for truth
(`npm run lint:archive-links`). Backlog is **not** a link-sink — `AGENTS.md` and
live docs may link here when a backlog doc still holds a durable ruling.

## What's here

| Doc | State | Why |
| --- | --- | --- |
| [012 — Playground (Canvas Mode)](012_Playground_Canvas_Mode.md) | Held (founder, 2026-09-22) | Weak clinical fit as written; see its HOLD banner for what would unhold it. |
