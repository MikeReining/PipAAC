#!/usr/bin/env bash
# Honest liveness probe for the test-runner PATH guard. Inspects the
# CALLER's inherited environment exactly as received — it must NEVER source
# an activation script or modify PATH first.
#
# Allnighter's version (check-test-guard-liveness.sh, verified 2026-08-05)
# sources its own activation script and THEN checks `command -v swift` — so
# it verifies the PATH it just set and always reports "active", even in a
# shell where the guard never actually bound. That is green test theater by
# this project's own law (AGENTS.md). This version must be able to fail for
# the real reason: red in a shell without scripts/bin on PATH, green with
# it. See docs/archive/phases/118_Test_Infrastructure_Upgrade.md §2.
set -euo pipefail

# Physical path on BOTH sides: macOS volumes are case-insensitive, so the
# logical cwd can spell the repo differently than `pwd -P` reports it
# (…/GitHub/… vs …/Github/…) and the string compare below would fail on
# casing alone — red in a perfectly guarded shell.
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SHIM_DIR="$ROOT/scripts/bin"

resolved="$(command -v node 2>/dev/null || true)"

resolved_dir=""
if [[ -n "$resolved" ]]; then
  resolved_dir="$(cd "$(dirname "$resolved")" 2>/dev/null && pwd -P || true)"
fi
shim_dir_real="$(cd "$SHIM_DIR" 2>/dev/null && pwd -P || true)"

# Case-insensitive compare: this volume is case-insensitive but
# case-preserving, and which spelling (…/GitHub/… vs …/Github/…) a path
# reports depends on the order directories were first accessed — the same
# directory can legitimately report both. Casing is not a guard failure.
resolved_lc="$(printf '%s' "$resolved_dir" | tr '[:upper:]' '[:lower:]')"
shim_lc="$(printf '%s' "$shim_dir_real" | tr '[:upper:]' '[:lower:]')"
if [[ -z "$resolved" ]] || [[ -z "$shim_dir_real" ]] || [[ "$resolved_lc" != "$shim_lc" ]]; then
  echo "check-test-guard-liveness: INACTIVE — this shell's 'node' does not resolve inside $SHIM_DIR." >&2
  echo "check-test-guard-liveness: got: ${resolved:-<not found>}" >&2
  echo "check-test-guard-liveness: run scripts/install-test-guard.sh, then open a NEW shell." >&2
  exit 1
fi

echo "check-test-guard-liveness: active (node -> $resolved)"
exit 0
