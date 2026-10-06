# Commit handover — native iOS planning

Please review and commit the remaining documentation changes below only.
The founder approved native Swift/SwiftUI, local Pip recordings, native
accessibility and full desktop customization through shared encrypted
sync, including pictures and recordings. Phase 044 plans implementation
through App Store release; native development has not started.

The platform owner, `docs/product/Platforms_iOS_And_Web.md`, was committed
by another process during preparation as `83c4caf1`. This Codex session
ran no staging, commit or commit-queue commands. Check current git status
before committing; preserve unrelated changes and use explicit paths.

Remaining scope:

```text
AGENTS.md
docs/FOLDER_MAP.md
docs/founder/2026-09-22_Customization_Library_Sync.md
docs/founder/2026-09-22_iPhone_Proposal.md
docs/operations/TechStack.md
docs/phases/043_Foundation_Hardening.md
docs/phases/044_Native_iOS_App.md
docs/phases/README.md
docs/product/SSOT.md
docs/strategy/Roadmap.md
docs/handovers/2026-10-06_Native_iOS_Docs.md
```

Verified: phase freshness, doc paths/scripts and local Markdown links
across the planning docs, plus whitespace checks. Stale native-versus-shell
decision gates were aligned; broken references to retired/held phases
were corrected in the touched docs. No runtime files changed, so no
deployment or runtime test was needed. Do not run the full wall solely
for this handover.

Suggested commit title: `docs: plan native iOS implementation and desktop parity`.
Stop after committing; implementation begins at phase 044 A in a separate
work session. Delete this temporary handover after it has been handled.
