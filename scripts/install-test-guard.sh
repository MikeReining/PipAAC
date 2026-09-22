#!/usr/bin/env bash
# Idempotent installer for the repo-scoped test-guard PATH shim. Appends the
# same guarded block to every zsh startup file that can re-prepend PATH
# ahead of it, because on this machine .zshenv alone was proven insufficient
# (docs/archive/phases/118_Test_Infrastructure_Upgrade.md §7 follow-up, S118-S03):
#
#   .zshenv   sourced by EVERY zsh invocation (interactive or not, login or
#             not) — covers the baseline case.
#   .zprofile sourced for LOGIN shells only (interactive or not). This repo's
#             ~/.zprofile runs `eval "$(brew shellenv)"`, which unconditionally
#             re-prepends /opt/homebrew/bin AFTER .zshenv already ran — this is
#             what left the Claude Code Bash tool shell (measured: login=yes,
#             interactive=no, so .zshrc never sources for it at all) unguarded.
#   .zshrc    sourced for INTERACTIVE shells only (login or not). This repo's
#             ~/.zshrc line 1 does the same re-prepend for interactive shells
#             (a real terminal window).
#
# Together .zshenv + .zprofile + .zshrc cover all four combinations of
# login/interactive. Startup order is always zshenv, then (if login) zprofile,
# then (if interactive) zshrc — so both later files must carry the block for
# the guard to survive to the end of PATH construction.
#
# This script only WRITES to zsh startup files (or reports status with
# --check). It touches nothing else. It is meant to be run by hand — agents
# building this guard do not run it themselves.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHIM_DIR="$ROOT/scripts/bin"

# zsh resolves dotfiles relative to $ZDOTDIR if set, else $HOME — matching
# that rule (rather than hardcoding $HOME) is what lets the Works Test
# construct a fully isolated scenario via a ZDOTDIR override, never touching
# the real files.
ZDOTDIR_EFFECTIVE="${ZDOTDIR:-$HOME}"

MARK_START="# >>> ikiro test guard (managed by scripts/install-test-guard.sh) >>>"
MARK_END="# <<< ikiro test guard <<<"

# label:file pairs, in zsh startup order.
TARGET_LABELS=(zshenv zprofile zshrc)
TARGET_LINKS=("$ZDOTDIR_EFFECTIVE/.zshenv" "$ZDOTDIR_EFFECTIVE/.zprofile" "$ZDOTDIR_EFFECTIVE/.zshrc")

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
elif [[ "${1:-}" != "" ]]; then
  echo "usage: $0 [--check]" >&2
  exit 2
fi

# resolve_real_path PATH — follows symlinks (relative or absolute targets,
# multiple hops) without relying on GNU readlink -f, which stock macOS
# readlink does not support.
resolve_real_path() {
  local p="$1"
  while [[ -L "$p" ]]; do
    local dir target
    dir="$(cd "$(dirname "$p")" && pwd)"
    target="$(readlink "$p")"
    case "$target" in
      /*) p="$target" ;;
      *) p="$dir/$target" ;;
    esac
  done
  printf '%s' "$p"
}

print_block() {
  echo "$MARK_START"
  echo "export PATH=\"$SHIM_DIR:\$PATH\""
  echo "$MARK_END"
}

block_present_in() {
  local file="$1"
  [[ -f "$file" ]] && grep -qF "$MARK_START" "$file"
}

# --- install mode ------------------------------------------------------------
install_all() {
  local i label link real symlinked
  for (( i = 0; i < ${#TARGET_LABELS[@]}; i++ )); do
    label="${TARGET_LABELS[$i]}"
    link="${TARGET_LINKS[$i]}"
    real="$(resolve_real_path "$link")"
    symlinked=false
    [[ "$real" != "$link" ]] && symlinked=true

    if block_present_in "$real"; then
      if grep -qF "export PATH=\"$SHIM_DIR:\$PATH\"" "$real"; then
        echo "install-test-guard: $label — already installed at $real, leaving it untouched."
        continue
      fi
      # One shim owns `node` per machine, so the managed block is
      # last-install-wins: a block left by ANOTHER repo's install would
      # silently leave this repo unguarded forever ("already installed").
      # Rewrite the block in place to point here.
      local tmp
      tmp="$(mktemp)"
      awk -v s="$MARK_START" -v e="$MARK_END" -v shimdir="$SHIM_DIR" '
        $0 == s {
          print s
          print "export PATH=\"" shimdir ":$PATH\""
          print e
          inblock = 1
          next
        }
        inblock && $0 == e { inblock = 0; next }
        inblock { next }
        { print }
        END { if (inblock) exit 3 }
      ' "$real" > "$tmp" || {
        rm -f "$tmp"
        echo "install-test-guard: $label — unterminated guard block at $real; refusing to touch it." >&2
        exit 3
      }
      mv "$tmp" "$real"
      echo "install-test-guard: $label — rewrote a guard block owned by another repo at $real:"
      echo ""
      print_block
      echo ""
      continue
    fi

    {
      echo ""
      print_block
    } >> "$real"

    if [[ "$symlinked" == true ]]; then
      echo "install-test-guard: $label — $link is a symlink to $real (dotfiles-managed) — appended guard block there:"
    else
      echo "install-test-guard: $label — appended guard block to $real:"
    fi
    echo ""
    print_block
    echo ""
  done
  echo "install-test-guard: open a NEW shell (or run: exec zsh -l) then verify with:"
  echo "install-test-guard:   scripts/install-test-guard.sh --check"
  echo "install-test-guard:   scripts/check-test-guard-liveness.sh"
}

# --- check mode ---------------------------------------------------------------
# Presence of the block proves nothing on its own — a later startup file can
# still re-prepend a different node ahead of it. --check spawns a FRESH zsh
# of each relevant kind and asks where node actually resolves, exactly as
# that kind of shell would see it.
shim_dir_real="$(cd "$SHIM_DIR" 2>/dev/null && pwd -P || true)"

# check_one LABEL [zsh-flags...] — spawns `zsh <flags> -c 'command -v node'`
# with stdin from /dev/null (a -c command always exits after running,
# regardless of -i/-l, so this cannot block on a prompt) and reports
# GUARDED/UNGUARDED with the resolved path. Returns 0 if guarded, 1 if not.
check_one() {
  local label="$1"; shift
  local resolved resolved_dir guarded_word="UNGUARDED" ok=1
  resolved="$(zsh "$@" -c 'command -v node' </dev/null 2>/dev/null || true)"
  if [[ -n "$resolved" ]]; then
    resolved_dir="$(cd "$(dirname "$resolved")" 2>/dev/null && pwd -P || true)"
    if [[ -n "$resolved_dir" ]] && [[ -n "$shim_dir_real" ]] && [[ "$resolved_dir" == "$shim_dir_real" ]]; then
      guarded_word="GUARDED"
      ok=0
    fi
  fi
  printf 'install-test-guard: %-24s %-10s node -> %s\n' "$label" "$guarded_word" "${resolved:-<not found>}"
  return "$ok"
}

if [[ "$CHECK_ONLY" == true ]]; then
  echo "install-test-guard: --check tests where node actually resolves in fresh shells — block presence alone is not proof of activation."
  echo ""
  local_i=0
  for (( local_i = 0; local_i < ${#TARGET_LABELS[@]}; local_i++ )); do
    label="${TARGET_LABELS[$local_i]}"
    link="${TARGET_LINKS[$local_i]}"
    real="$(resolve_real_path "$link")"
    if block_present_in "$real"; then
      echo "install-test-guard: $label — block present at $real (informational only, not proof)"
    else
      echo "install-test-guard: $label — NOT installed, no guard block at $real (informational only)"
    fi
  done
  echo ""

  any_unguarded=false
  check_one "zsh -c (non-interactive)"     || any_unguarded=true
  check_one "zsh -l -c (login)"        -l  || any_unguarded=true
  check_one "zsh -i -c (interactive)"  -i  || any_unguarded=true
  echo ""

  if [[ -x "$SHIM_DIR/node" ]]; then
    echo "install-test-guard: $SHIM_DIR/node exists and is executable"
  else
    echo "install-test-guard: WARNING — $SHIM_DIR/node missing or not executable"
  fi

  if [[ "$any_unguarded" == true ]]; then
    echo "install-test-guard: UNGUARDED in at least one shell kind above — the guard is not fully active. Run: $0"
    exit 1
  fi
  echo "install-test-guard: GUARDED in every shell kind tested."
  exit 0
fi

install_all
