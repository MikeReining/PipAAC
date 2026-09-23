#!/usr/bin/env bash
# Single-runner protected test wrapper: lock, wedge detector, process-group
# reaping, timeout backstop. Ported from Allnighter/scripts/swift-test.sh
# (S118-S00) — see scripts/lib/test-guard-lib.sh header for what changed and
# why. No HMAC token: this script execs the REAL node binary directly, so
# nothing needs to prove where a call came from.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/test-guard-lib.sh disable=SC1091
source "$ROOT/scripts/lib/test-guard-lib.sh"

LOCK_FILE="$ROOT/.test.lock"
SHIM_DIR="$ROOT/scripts/bin"
MAX_FILES_WITHOUT_ALL=25
# Distinct from a failing suite (exit 1) so a lock-blocked run is not grepped as green.
EXIT_LOCKED=75

# Backstop ceiling — the wedge detector below fires far sooner on a genuine
# deadlock. 900s comfortably exceeds the measured 556s full-suite wall
# (docs/archive/phases/118_Test_Infrastructure_Upgrade.md §3) so --all never trips it
# under normal conditions.
TIMEOUT_SECONDS="${TEST_TIMEOUT_SECONDS:-900}"

# Wedge detector: every SAMPLE_INTERVAL_SECONDS, compare the runner
# process-group's cumulative CPU time and the log file's size to the
# previous sample. FLAT_SAMPLE_LIMIT consecutive flat samples means
# deadlock, not "slow test". Calibrated starting point per §6: 5s x 6 = 30s
# (measured against packages/site-renderer/test/renderer-cache.test.mjs,
# the slowest file expected to remain in the default suite — see the
# calibration note in the S00 report).
SAMPLE_INTERVAL_SECONDS="${TEST_SAMPLE_INTERVAL_SECONDS:-5}"
FLAT_SAMPLE_LIMIT="${TEST_FLAT_SAMPLES:-6}"

TEST_PGID=""
TEST_CHILD_PID=""
TEST_TAIL_PID=""

usage() {
  cat >&2 <<'EOF'
usage: test.sh <dir|file.test.mjs>... [-- node-args...]
       test.sh 'quoted/glob/**/*.test.mjs'
       test.sh --all [-- node-args...]
       test.sh --heavy [-- node-args...]

  <dir>                recursively collect *.test.mjs, excluding *.heavy.test.mjs
  <file.test.mjs>...   explicit files, used as given (heavy files run if named directly)
  'glob/**/*.test.mjs' quoted glob, expanded by this wrapper, excluding *.heavy.test.mjs
  --all                delegate the full suite to scripts/run_unit_tests.mjs (also excludes heavy)
  --heavy              run ONLY *.heavy.test.mjs under the standard test roots
  --                    remainder passed to node verbatim
EOF
  exit 2
}

fail_locked() {
  local holder_pid="${1:-unknown}"
  local started_at="${2:-unknown}"
  echo "test.sh: another run is in progress (holder pid=$holder_pid, started=$started_at)." >&2
  echo "test.sh: do not retry or wait-loop; stop and report (Test Infrastructure Rule 5)." >&2
  exit "$EXIT_LOCKED"
}

# find_real_node — resolve the real node binary by walking PATH past
# scripts/bin (same find_real_binary logic as Allnighter's scripts/bin/swift).
# scripts/bin does not exist yet in this repo (S03 territory) but the lookup
# is written to skip it once it does, so no token/recursion issue lands
# later.
find_real_node() {
  local entry seen="" candidate=""
  local -a parts
  IFS=':' read -r -a parts <<< "$PATH"
  for entry in ${parts[@]+"${parts[@]}"}; do
    [[ -z "$entry" ]] && continue
    [[ "$entry" == "$SHIM_DIR" ]] && continue
    [[ "$entry" == */scripts/bin ]] && continue
    [[ ":$seen:" == *":$entry:"* ]] && continue
    seen="${seen:+$seen:}$entry"
    if [[ -x "$entry/node" ]]; then
      candidate="$entry/node"
      break
    fi
  done
  if [[ -z "$candidate" ]]; then
    echo "test.sh: could not find real node on PATH past $SHIM_DIR" >&2
    exit 127
  fi
  printf '%s' "$candidate"
}

# resolve_glob PATTERN — expand a quoted glob string this wrapper received
# literally (the caller's shell never touched it). "**" is bash-3.2-unsafe
# (no globstar), so a "**" pattern is translated to `find BASE -type f -name
# NAME`, where BASE is the literal prefix before "**" and NAME is the
# basename of whatever follows — this covers the documented
# 'packages/**/*.test.mjs' shape but does not honor an intermediate
# directory segment after "**" (e.g. '**/sub/*.test.mjs' matches *.test.mjs
# anywhere under BASE, not only under sub/). A single-level pattern (no
# "**") is expanded with `compgen -G`, which is bash-3.2-safe and — unlike
# unquoted shell expansion — never falls back to the literal pattern string
# when nothing matches.
resolve_glob() {
  local pattern="$1"
  if [[ "$pattern" == *"**"* ]]; then
    local base="${pattern%%\*\**}"
    base="${base%/}"
    [[ -z "$base" ]] && base="."
    local rest="${pattern#*\*\*}"
    rest="${rest#/}"
    local name
    name="$(basename -- "$rest")"
    find "$base" -type f -name "$name" 2>/dev/null
  else
    compgen -G "$pattern" 2>/dev/null || true
  fi
}

# collect_targets — populates the global FILES array from PATH_ARGS. Each
# directory/glob source is checked individually for a zero-match, so the
# error names the specific pattern that failed rather than an aggregate
# count. Explicit file arguments must name an existing file (missing path
# exits 2 before the lock is taken) and are NOT filtered for
# *.heavy.test.mjs — a heavy file named directly must still run.
# Directory/glob-collected *.heavy.test.mjs are excluded and counted in
# HEAVY_EXCLUDED_COUNT for the caller to report.
HEAVY_EXCLUDED_COUNT=0

collect_targets() {
  FILES=()
  HEAVY_EXCLUDED_COUNT=0
  local arg
  for arg in "${PATH_ARGS[@]}"; do
    if [[ -d "$arg" ]]; then
      local -a found=()
      while IFS= read -r f; do
        [[ -n "$f" ]] || continue
        if [[ "$f" == *.heavy.test.mjs ]]; then
          HEAVY_EXCLUDED_COUNT=$((HEAVY_EXCLUDED_COUNT + 1))
        else
          found+=("$f")
        fi
      done < <(find "$arg" -type f -name '*.test.mjs' 2>/dev/null | sort)
      if [[ "${#found[@]}" -eq 0 ]]; then
        echo "test.sh: 0 files matched under directory: $arg" >&2
        exit 1
      fi
      FILES+=("${found[@]}")
    elif [[ "$arg" == *"*"* ]]; then
      local -a found=()
      while IFS= read -r f; do
        [[ -n "$f" ]] || continue
        if [[ "$f" == *.heavy.test.mjs ]]; then
          HEAVY_EXCLUDED_COUNT=$((HEAVY_EXCLUDED_COUNT + 1))
        else
          found+=("$f")
        fi
      done < <(resolve_glob "$arg" | sort)
      if [[ "${#found[@]}" -eq 0 ]]; then
        echo "test.sh: 0 files matched glob: $arg" >&2
        exit 1
      fi
      FILES+=("${found[@]}")
    else
      if [[ ! -f "$arg" ]]; then
        echo "test.sh: no such test file: $arg" >&2
        exit 2
      fi
      FILES+=("$arg")
    fi
  done

  local -a deduped=()
  while IFS= read -r f; do
    [[ -n "$f" ]] && deduped+=("$f")
  done < <(printf '%s\n' "${FILES[@]+"${FILES[@]}"}" | sort -u)
  FILES=("${deduped[@]+"${deduped[@]}"}")

  if [[ "$HEAVY_EXCLUDED_COUNT" -gt 0 ]]; then
    echo "test.sh: excluded $HEAVY_EXCLUDED_COUNT heavy test file(s) (*.heavy.test.mjs) — run \`scripts/test.sh --heavy\`, or name a heavy file explicitly to run it." >&2
  fi
}

# HEAVY_TEST_ROOTS — same roots scripts/run_unit_tests.mjs collects from,
# duplicated here (bash, not node) so --heavy needs no node subprocess just
# to build a file list.
HEAVY_TEST_ROOTS=(scripts scripts/health src)

# collect_heavy_targets — populates FILES with every *.heavy.test.mjs under
# HEAVY_TEST_ROOTS. This is the execution owner for files collect_targets
# excludes: --heavy must find exactly what a directory/--all run skips.
collect_heavy_targets() {
  FILES=()
  local root
  for root in "${HEAVY_TEST_ROOTS[@]}"; do
    [[ -d "$ROOT/$root" ]] || continue
    local -a found=()
    while IFS= read -r f; do
      [[ -n "$f" ]] && found+=("$f")
    done < <(find "$ROOT/$root" -type f -name '*.heavy.test.mjs' 2>/dev/null | sort)
    FILES+=("${found[@]+"${found[@]}"}")
  done
  if [[ "${#FILES[@]}" -eq 0 ]]; then
    echo "test.sh: 0 heavy files found under: ${HEAVY_TEST_ROOTS[*]}" >&2
    exit 1
  fi
  local -a relative=("${FILES[@]#"$ROOT"/}")
  echo "test.sh: running ${#FILES[@]} heavy test file(s): ${relative[*]}" >&2
}

# --- lock/sweep, ordered lock-BEFORE-sweep -----------------------------
# Rev 3 had this backwards: sweeping first can kill a live holder before a
# second caller ever reports a lock conflict. Order is: (1) read the lock —
# a live holder means exit immediately, touch nothing; (2) only if the
# holder is dead/absent, reap its recorded orphan pgid and sweep any other
# stray runner scoped to this repo; (3) acquire.

# recover_stale_lock — if the lock's wrapper pid is dead, reap its recorded
# runner pgid (if still alive) and remove the lock. If the wrapper is still
# alive, this is a genuine conflict and the lock is left untouched — the
# caller decides whether to fail_locked.
recover_stale_lock() {
  [[ -f "$LOCK_FILE" ]] || return 0
  local holder_pid started_at holder_pgid
  read -r holder_pid started_at holder_pgid < "$LOCK_FILE" 2>/dev/null || holder_pid=""
  if [[ -n "$holder_pid" ]] && kill -0 "$holder_pid" 2>/dev/null; then
    return 0
  fi
  if [[ -n "${holder_pgid:-}" ]] && [[ "$holder_pgid" != "-" ]] && group_alive "$holder_pgid"; then
    echo "test.sh: wrapper pid=${holder_pid:-unknown} is dead but runner pgid=$holder_pgid is still alive — reaping orphan." >&2
    kill_process_group "$holder_pgid" || echo "test.sh: WARNING — orphan pgid=$holder_pgid survived SIGKILL" >&2
  fi
  rm -f "$LOCK_FILE"
  return 0
}

# preflight_sweep — unconditional sweep for live, repo-scoped orphaned
# runners not accounted for by the lock file (e.g. the lock was deleted by
# hand). Trusts the process table, never the lock file. Any survivor after
# TERM+KILL is a hard, named failure: refuse to start a new run on top of a
# runner that could not be cleared.
preflight_sweep() {
  sweep_matching_processes "$$" >/dev/null
  local remaining
  remaining="$(list_matching_pids "$$")"
  if [[ -n "$remaining" ]]; then
    echo "test.sh: HARD FAIL — runner(s) still present after preflight sweep, refusing to start a new run:" >&2
    echo "$remaining" >&2
    exit 1
  fi
}

acquire_lock() {
  # Step 1 — live holder means exit immediately, touch nothing.
  if [[ -f "$LOCK_FILE" ]]; then
    local holder_pid started_at holder_pgid
    read -r holder_pid started_at holder_pgid < "$LOCK_FILE" 2>/dev/null || holder_pid=""
    if [[ -n "$holder_pid" ]] && kill -0 "$holder_pid" 2>/dev/null; then
      fail_locked "$holder_pid" "${started_at:-unknown}"
    fi
  fi

  # Step 2 — holder dead/absent: reap its recorded orphan, then sweep.
  recover_stale_lock
  preflight_sweep

  # Step 3 — acquire.
  local started_at
  started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! ( set -o noclobber; printf '%s %s -\n' "$$" "$started_at" > "$LOCK_FILE" ) 2>/dev/null; then
    local holder_pid holder_started
    read -r holder_pid holder_started _ < "$LOCK_FILE" 2>/dev/null || holder_pid=""
    if [[ -n "$holder_pid" ]] && kill -0 "$holder_pid" 2>/dev/null; then
      fail_locked "$holder_pid" "${holder_started:-unknown}"
    fi
    recover_stale_lock
    if ! ( set -o noclobber; printf '%s %s -\n' "$$" "$started_at" > "$LOCK_FILE" ) 2>/dev/null; then
      read -r holder_pid holder_started _ < "$LOCK_FILE" 2>/dev/null || holder_pid=""
      fail_locked "${holder_pid:-unknown}" "${holder_started:-unknown}"
    fi
  fi
}

# write_lock_pgid PGID — rewrite the lock line to record the runner's
# process group once known (the lock is written before the runner starts,
# so there's a brief window where the pgid field is still "-"). Only
# rewrites a lock this wrapper still owns.
write_lock_pgid() {
  local pgid="$1"
  [[ -f "$LOCK_FILE" ]] || return 0
  local holder_pid started_at
  read -r holder_pid started_at _ < "$LOCK_FILE" 2>/dev/null || return 0
  [[ "$holder_pid" == "$$" ]] || return 0
  printf '%s %s %s\n' "$holder_pid" "$started_at" "$pgid" > "$LOCK_FILE"
}

release_lock() {
  if [[ -f "$LOCK_FILE" ]]; then
    local holder_pid
    read -r holder_pid _ < "$LOCK_FILE" 2>/dev/null || holder_pid=""
    if [[ "$holder_pid" == "$$" ]]; then
      rm -f "$LOCK_FILE"
    fi
  fi
}

stop_tail() {
  if [[ -n "$TEST_TAIL_PID" ]]; then
    kill "$TEST_TAIL_PID" 2>/dev/null || true
    wait "$TEST_TAIL_PID" 2>/dev/null || true
    TEST_TAIL_PID=""
  fi
}

# reap_runner — kill the ENTIRE process group of the current test run, not
# just the top pid. Used by every exit path (timeout, trap, wedge). Normal
# completion never calls this — it's already exited.
reap_runner() {
  stop_tail
  if [[ -n "$TEST_PGID" ]]; then
    kill_process_group "$TEST_PGID" || echo "test.sh: WARNING — runner pgid=$TEST_PGID survived SIGKILL" >&2
  fi
  TEST_CHILD_PID=""
  TEST_PGID=""
}

cleanup() {
  local status=$?
  reap_runner
  release_lock
  exit "$status"
}

# group_signature PGID — "<pid>:<cpu-time>,..." for every live member of
# PGID, sorted. A cheap proxy for "did ANY process in this run's group do
# work" — combined with log-file size, this is the wedge detector's whole
# progress signal.
group_signature() {
  local pgid="$1"
  LC_ALL=C ps -axo pgid=,pid=,time= 2>/dev/null | awk -v g="$pgid" '$1==g {print $2":"$3}' | sort | tr '\n' ','
}

# run_with_timeout CMD... — run CMD as its own process group, stream its
# output live, and enforce both the wedge detector and the timeout backstop.
run_with_timeout() {
  local -a cmd=("$@")
  if [[ -n "${TEST_CMD_OVERRIDE:-}" ]]; then
    # TEST-ONLY escape hatch: scripts/works-test-test-guard.sh sets this to
    # exec a fake runner (e.g. one that ignores SIGTERM, or one that wedges
    # on purpose) instead of a real node invocation, so the guard machinery
    # itself — process-group reaping, wedge detection, lock/pgid recovery —
    # can be proven in seconds instead of minutes. Never set this outside a
    # Works Test.
    # shellcheck disable=SC2206
    cmd=(${TEST_CMD_OVERRIDE})
  fi
  local log
  log="$(mktemp "${TMPDIR:-/tmp}/ikiro-test.XXXXXX")"

  # `set -m` (job control) makes the backgrounded job its OWN process group
  # (pgid == its own pid) instead of inheriting this wrapper's group. Do not
  # put `tee` in the runner's group — a pipeline's `$!` is the LAST element
  # (tee), so a timeout path built on that would kill tee and never touch
  # the actual runner, leaving a wedged process to live on as an orphan.
  set -m
  ( exec "${cmd[@]}" ) >"$log" 2>&1 &
  TEST_CHILD_PID=$!
  TEST_PGID=$TEST_CHILD_PID
  set +m
  write_lock_pgid "$TEST_PGID"

  # Live output, without putting `tail` in the runner's process group.
  tail -n +1 -f "$log" &
  TEST_TAIL_PID=$!

  local waited=0
  local since_sample=0
  local flat_count=0
  local have_baseline=false
  local last_sig="" last_size=-1
  local exit_code=0
  # pid_running, NOT a bare `kill -0` — the latter stays true for a zombie
  # (exited, not yet reaped), so a runner that finishes in microseconds
  # would otherwise sit unnoticed until the wedge detector eventually fired.
  while pid_running "$TEST_CHILD_PID"; do
    if [[ "$waited" -ge "$TIMEOUT_SECONDS" ]]; then
      echo "test.sh: timeout after ${TIMEOUT_SECONDS}s — killing pgid=$TEST_PGID (pid=$TEST_CHILD_PID)" >&2
      reap_runner
      rm -f "$log"
      return 124
    fi

    if [[ "$since_sample" -ge "$SAMPLE_INTERVAL_SECONDS" ]]; then
      since_sample=0
      local sig size
      sig="$(group_signature "$TEST_PGID")"
      size="$(wc -c < "$log" 2>/dev/null | tr -d ' ')"
      # The FIRST sample counts toward flat_count too (starts at 1, not
      # gated behind a separate baseline-only no-op sample) — Allnighter's
      # off-by-one made FLAT_SAMPLE_LIMIT actually require
      # FLAT_SAMPLE_LIMIT+1 samples. Do not reintroduce that.
      if [[ "$have_baseline" == true ]] && [[ "$sig" == "$last_sig" ]] && [[ "$size" == "$last_size" ]]; then
        flat_count=$((flat_count + 1))
      else
        flat_count=1
      fi
      have_baseline=true
      last_sig="$sig"
      last_size="$size"
      if [[ "$flat_count" -ge "$FLAT_SAMPLE_LIMIT" ]]; then
        echo "test.sh: WEDGED — pid=$TEST_CHILD_PID (pgid=$TEST_PGID) made no CPU or log progress across $FLAT_SAMPLE_LIMIT consecutive samples (~$((FLAT_SAMPLE_LIMIT * SAMPLE_INTERVAL_SECONDS))s). Killing process group, not waiting for the ${TIMEOUT_SECONDS}s backstop." >&2
        reap_runner
        rm -f "$log"
        return 99
      fi
    fi

    sleep 1
    waited=$((waited + 1))
    since_sample=$((since_sample + 1))
  done

  stop_tail
  wait "$TEST_CHILD_PID" || exit_code=$?
  TEST_CHILD_PID=""
  TEST_PGID=""
  rm -f "$log"
  return "$exit_code"
}

# --- argv -----------------------------------------------------------------

ALL_FLAG=false
HEAVY_FLAG=false
declare -a PATH_ARGS=()
declare -a EXTRA_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      ALL_FLAG=true
      shift
      ;;
    --heavy)
      HEAVY_FLAG=true
      shift
      ;;
    --)
      shift
      EXTRA_ARGS=("$@")
      break
      ;;
    -h|--help)
      usage
      ;;
    -*)
      echo "test.sh: unknown flag: $1" >&2
      exit 2
      ;;
    *)
      PATH_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ "$ALL_FLAG" == true ]] && [[ "$HEAVY_FLAG" == true ]]; then
  echo "test.sh: --all and --heavy are mutually exclusive" >&2
  exit 2
fi

if [[ "$ALL_FLAG" == true ]] && [[ "${#PATH_ARGS[@]}" -gt 0 ]]; then
  echo "test.sh: --all does not accept path arguments (got: ${PATH_ARGS[*]})" >&2
  exit 2
fi

if [[ "$HEAVY_FLAG" == true ]] && [[ "${#PATH_ARGS[@]}" -gt 0 ]]; then
  echo "test.sh: --heavy does not accept path arguments (got: ${PATH_ARGS[*]})" >&2
  exit 2
fi

if [[ "$ALL_FLAG" == false ]] && [[ "$HEAVY_FLAG" == false ]] && [[ "${#PATH_ARGS[@]}" -eq 0 ]]; then
  echo "test.sh: no paths given — pass files/directories/globs, or use --all for the full suite, or --heavy for the heavy set" >&2
  usage
fi

REAL_NODE="$(find_real_node)"

declare -a RUN_CMD=()
if [[ "$ALL_FLAG" == true ]]; then
  RUN_CMD=("$REAL_NODE" "$ROOT/scripts/run_unit_tests.mjs" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")
elif [[ "$HEAVY_FLAG" == true ]]; then
  declare -a FILES=()
  collect_heavy_targets
  # Heavy files each spawn a full wrangler dev; run serially — parallel
  # spawns exhaust a loaded dev machine and collide on shared ports.
  RUN_CMD=("$REAL_NODE" "--import" "$ROOT/scripts/test_bootstrap.mjs" "--test"
    "--test-concurrency=1" "${FILES[@]}" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")
else
  declare -a FILES=()
  collect_targets
  file_count="${#FILES[@]}"
  if [[ "$file_count" -eq 0 ]]; then
    echo "test.sh: pattern resolved to 0 files: ${PATH_ARGS[*]}" >&2
    exit 1
  fi
  if [[ "$file_count" -gt "$MAX_FILES_WITHOUT_ALL" ]]; then
    echo "test.sh: resolved $file_count files (> $MAX_FILES_WITHOUT_ALL) without --all — refusing." >&2
    echo "test.sh: narrow the pattern, or run scripts/test.sh --all for the full suite." >&2
    exit 1
  fi
  RUN_CMD=("$REAL_NODE" "--import" "$ROOT/scripts/test_bootstrap.mjs" "--test" "${FILES[@]}" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")
fi

acquire_lock
trap cleanup EXIT INT TERM

status=0
run_with_timeout "${RUN_CMD[@]}" || status=$?

exit "$status"
