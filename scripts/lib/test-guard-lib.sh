#!/usr/bin/env bash
# Shared helpers for the test-runner guard (test.sh + kill-stale-tests.sh).
# Sourced, not executed. Every ps invocation forces LC_ALL=C so output format
# never depends on the caller's locale. Plain indexed arrays only (no
# `declare -A`) — this repo's scripts must run under macOS's stock bash 3.2,
# which has no associative arrays.
#
# Ported from Allnighter/scripts/lib/test-guard-lib.sh (S118-S00). The
# generic process-table helpers (age_seconds, pid_running, group_alive,
# kill_pid_escalate, kill_process_group, list_matching_pids,
# sweep_matching_processes) are unchanged. matches_pattern is rewritten:
# Allnighter matched a single fixed Swift package/xctest bundle name; Ikiro
# has no such fixed target, so matching is scoped to *this repo* instead —
# by a `node` process whose argv carries this repo's absolute
# scripts/test_bootstrap.mjs or scripts/run_unit_tests.mjs path (test.sh
# always execs with $ROOT-absolute paths, so a stray/unrelated `node --test`
# elsewhere on the machine never matches), or by a genuine scripts/test.sh
# wrapper invocation. Callers must set ROOT before sourcing this file.

# matches_pattern CMDLINE — true if CMDLINE is a genuine Ikiro test-guard
# runner (spawned by, or is, this repo's scripts/test.sh) and not a dev
# server or unrelated tooling.
#
# Never a bare substring search anywhere in the line — anchored on argv
# position, same discipline as Allnighter's matcher (a bystander shell that
# merely mentions "node --test" in its command line, e.g. `grep`, an editor
# buffer, or a commit message, must never look like a runner). A process
# must match one of two concrete shapes:
#   (a) a node runner spawned by test.sh  — argv0 basename IS node, and a
#       later argument IS this repo's absolute scripts/test_bootstrap.mjs or
#       scripts/run_unit_tests.mjs path.
#   (b) a genuine scripts/test.sh wrapper — argv0 is a shell interpreter and
#       argv1 IS (absolute-or-relative) this repo's scripts/test.sh.
matches_pattern() {
  local cmdline="$1"

  # Never-kill list — explicit bail-out even though the positive shapes
  # below would not otherwise match these. Encoded in code per the Works
  # Test requirement, not left as a comment-only promise.
  local never_kill
  for never_kill in "npm run dev:studio" "wrangler" "next dev" "next start" "next start" "alln serve"; do
    [[ "$cmdline" == *"$never_kill"* ]] && return 1
  done

  local -a words
  read -r -a words <<< "$cmdline"
  [[ "${#words[@]}" -ge 1 ]] || return 1

  local argv0="${words[0]}"
  local argv0_base="${argv0##*/}"

  # (a) a node process spawned by scripts/test.sh (targeted run or --all
  # delegate). Only test.sh's own exec line embeds $ROOT/scripts/test_bootstrap.mjs
  # or $ROOT/scripts/run_unit_tests.mjs in argv, so this is repo-scoped by
  # construction — never a pattern match on "node --test" alone.
  if [[ "$argv0_base" == "node" ]]; then
    local bootstrap_marker="$ROOT/scripts/test_bootstrap.mjs"
    local runner_marker="$ROOT/scripts/run_unit_tests.mjs"
    local i w
    for (( i = 1; i < ${#words[@]}; i++ )); do
      w="${words[$i]}"
      if [[ "$w" == "$bootstrap_marker" ]] || [[ "$w" == "$runner_marker" ]]; then
        return 0
      fi
    done
    return 1
  fi

  # (b) a genuine scripts/test.sh wrapper invocation (direct execution via
  # shebang, or `bash scripts/test.sh ...`, both show up as
  # "<shell> <script-path> ..." in `ps`).
  if [[ "${#words[@]}" -ge 2 ]]; then
    local argv1="${words[1]}"
    if [[ "$argv0_base" == "bash" || "$argv0_base" == "sh" || "$argv0_base" == "zsh" ]] \
       && { [[ "$argv1" == "$ROOT/scripts/test.sh" ]] || [[ "$argv1" == "scripts/test.sh" ]]; }; then
      return 0
    fi
  fi

  return 1
}

# list_matching_pids [EXCLUDE_PID] — echoes "pid cmdline" lines for every live
# process whose cmdline matches_pattern, one per line. Excludes EXCLUDE_PID
# (typically $$), every ANCESTOR of EXCLUDE_PID up to pid 1, AND every
# DESCENDANT of EXCLUDE_PID — never just the exact pid.
#
# Both directions matter, for the same underlying reason: never treat a
# process in the caller's own lineage as a legitimate kill target.
#   - Ancestors: a sweep launched from a child of a matching-shaped process
#     must not kill its own parent/caller.
#   - Descendants: scanning the process table at all forks a transient helper
#     (this very function's own `ps` invocation, run via process
#     substitution). Until that helper finishes exec'ing into `ps`, it is a
#     genuine, live child that still carries its PARENT's full inherited
#     argv — so when EXCLUDE_PID's own cmdline happens to match the runner
#     shape (a live scripts/test.sh process scanning for other
#     scripts/test.sh processes is the textbook case), that helper looks,
#     for a real and reproducible window, exactly like another independent
#     match. A genuinely orphaned runner from a PAST invocation is never a
#     descendant of the CURRENT invocation, so excluding descendants never
#     hides a real target.
#
# Exactly one `ps -axo pid=,ppid=,command=` snapshot is taken and reused for
# both the family-tree computation and the match scan.
list_matching_pids() {
  local exclude_pid="${1:-}"
  local -a snap_pid=() snap_ppid=() snap_cmd=()
  local pid ppid cmdline

  # Plain `read` (default IFS) — NOT `${line%% *}` — because macOS `ps`
  # right-pads the numeric pid/ppid columns with leading spaces for short
  # pids, which makes a manual `%%` split yield an empty field. `read -r pid
  # ppid cmdline` strips leading whitespace and folds everything past the
  # second field into cmdline regardless of digit width.
  while read -r pid ppid cmdline; do
    [[ -z "$pid" ]] && continue
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    snap_pid+=("$pid")
    snap_ppid+=("${ppid:-0}")
    snap_cmd+=("$cmdline")
  done < <(LC_ALL=C ps -axo pid=,ppid=,command= 2>/dev/null || true)

  local family=" "
  if [[ -n "$exclude_pid" ]]; then
    family=" $exclude_pid "
    local i

    # Ancestors: walk the in-memory ppid map up to pid 1. No further
    # forking — everything needed is already in snap_pid/snap_ppid.
    local cur="$exclude_pid" found
    while [[ -n "$cur" ]] && [[ "$cur" != "1" ]]; do
      found=""
      for (( i = 0; i < ${#snap_pid[@]}; i++ )); do
        if [[ "${snap_pid[$i]}" == "$cur" ]]; then
          found="${snap_ppid[$i]}"
          break
        fi
      done
      [[ -z "$found" ]] && break
      [[ "$family" == *" $found "* ]] && break  # cycle guard
      family="$family$found "
      cur="$found"
    done

    # Descendants: breadth-first over the in-memory ppid map, starting from
    # exclude_pid. Also purely in-memory — no forking. Deliberately
    # index-based (never a bare `"${arr[@]}"` expansion that might be
    # zero-length) — under `set -u`, bash 3.2 treats expanding an EMPTY
    # array via `[@]` as an unbound-variable error; `${#arr[@]}` and indexed
    # `${arr[$i]}` access stay safe at any length, including zero.
    local -a frontier=("$exclude_pid")
    local -a next_frontier=()
    local fi f
    while [[ "${#frontier[@]}" -gt 0 ]]; do
      next_frontier=()
      for (( fi = 0; fi < ${#frontier[@]}; fi++ )); do
        f="${frontier[$fi]}"
        for (( i = 0; i < ${#snap_pid[@]}; i++ )); do
          if [[ "${snap_ppid[$i]}" == "$f" ]] && [[ "$family" != *" ${snap_pid[$i]} "* ]]; then
            family="$family${snap_pid[$i]} "
            next_frontier+=("${snap_pid[$i]}")
          fi
        done
      done
      frontier=()
      for (( fi = 0; fi < ${#next_frontier[@]}; fi++ )); do
        frontier+=("${next_frontier[$fi]}")
      done
    done
  fi

  local i
  for (( i = 0; i < ${#snap_pid[@]}; i++ )); do
    pid="${snap_pid[$i]}"
    [[ "$family" == *" $pid "* ]] && continue
    matches_pattern "${snap_cmd[$i]}" || continue
    kill -0 "$pid" 2>/dev/null || continue
    printf '%s %s\n' "$pid" "${snap_cmd[$i]}"
  done
}

# age_seconds PID — echoes elapsed seconds since PID started, parsed from
# `ps -o etime=` ([[dd-]hh:]mm:ss — locale-independent, unlike lstart).
# Returns non-zero (and prints nothing) if the probe fails; callers MUST NOT
# treat that as age=0.
age_seconds() {
  local pid="$1"
  local etime
  etime="$(LC_ALL=C ps -p "$pid" -o etime= 2>/dev/null | tr -d '[:space:]')"
  [[ -n "$etime" ]] || return 1

  local dpart="0" rest="$etime"
  if [[ "$etime" == *-* ]]; then
    dpart="${etime%%-*}"
    rest="${etime#*-}"
  fi

  local a b c
  IFS=':' read -r a b c <<< "$rest"
  local hours="0" mins secs
  if [[ -n "$c" ]]; then
    hours="$a"; mins="$b"; secs="$c"
  elif [[ -n "$b" ]]; then
    mins="$a"; secs="$b"
  else
    return 1
  fi

  [[ "$dpart" =~ ^[0-9]+$ ]] || return 1
  [[ "$hours" =~ ^[0-9]+$ ]] || return 1
  [[ "$mins" =~ ^[0-9]+$ ]] || return 1
  [[ "$secs" =~ ^[0-9]+$ ]] || return 1

  echo $(( (10#$dpart) * 86400 + (10#$hours) * 3600 + (10#$mins) * 60 + (10#$secs) ))
}

# pid_running PID — true only if PID is alive AND not a zombie. `kill -0`
# alone is not enough: a process that has already exited but has not yet
# been reaped by its own parent (a zombie) still holds a live PID entry, so
# `kill -0` on it keeps returning success. Callers polling their OWN child's
# liveness should use this instead of a bare `kill -0`, then `wait` promptly
# once it returns false.
pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  local stat
  stat="$(LC_ALL=C ps -o stat= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
  [[ "$stat" == Z* ]] && return 1
  return 0
}

# group_alive PGID — true if any live process reports this process group.
group_alive() {
  local pgid="$1"
  [[ -n "$pgid" ]] || return 1
  LC_ALL=C ps -axo pgid= 2>/dev/null | tr -d ' ' | grep -qx "$pgid"
}

# kill_pid_escalate PID — TERM, wait ~3s, KILL if still alive, verify.
# Echoes "killed" / "gone" / "survived" to stdout for the caller to log.
kill_pid_escalate() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null || { echo "gone"; return 0; }
  kill -TERM "$pid" 2>/dev/null || true
  local waited=0
  while [[ "$waited" -lt 3 ]] && kill -0 "$pid" 2>/dev/null; do
    sleep 1
    waited=$((waited + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null || true
    sleep 1
  fi
  if kill -0 "$pid" 2>/dev/null; then
    echo "survived"
    return 1
  fi
  echo "killed"
  return 0
}

# kill_process_group PGID — TERM the whole group, wait ~3s, KILL if any
# member survives. Used by test.sh, which owns its runner's pgid.
kill_process_group() {
  local pgid="$1"
  [[ -n "$pgid" ]] || return 0
  kill -TERM -- "-$pgid" 2>/dev/null || true
  local waited=0
  while [[ "$waited" -lt 3 ]] && group_alive "$pgid"; do
    sleep 1
    waited=$((waited + 1))
  done
  if group_alive "$pgid"; then
    kill -KILL -- "-$pgid" 2>/dev/null || true
    sleep 1
  fi
  group_alive "$pgid" && return 1
  return 0
}

# sweep_matching_processes [EXCLUDE_PID] — unconditional TERM/wait/KILL sweep
# of every live process matching matches_pattern, regardless of age. Used as
# a preflight and echoes any pid that survives KILL to stdout.
sweep_matching_processes() {
  local exclude_pid="${1:-}"
  local line pid cmdline
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    pid="${line%% *}"
    cmdline="${line#* }"
    echo "test-guard: preflight sweep — killing pid=$pid: $cmdline" >&2
    if ! kill_pid_escalate "$pid" >/dev/null; then
      echo "$pid"
    fi
  done < <(list_matching_pids "$exclude_pid")
}
