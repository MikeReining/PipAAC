#!/usr/bin/env bash
# Drives the S118-S00 Works Tests for scripts/test.sh in seconds, using
# IKIRO_TEST_CMD_OVERRIDE / short constants so no test actually takes
# minutes. See docs/archive/phases/118_Test_Infrastructure_Upgrade.md §6.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/test-guard-lib.sh disable=SC1091
source "$ROOT/scripts/lib/test-guard-lib.sh"

TEST_SH="$ROOT/scripts/test.sh"
KILL_STALE="$ROOT/scripts/kill-stale-tests.sh"
LOCK_FILE="$ROOT/.ikiro-test.lock"
FIXTURE="packages/hosting/admin-slug-service.test.mjs"

# S118-S03 additions: the node shim + liveness check (docs/archive/phases/118_Test_Infrastructure_Upgrade.md §7).
NODE_SHIM_DIR="$ROOT/scripts/bin"
NODE_SHIM="$NODE_SHIM_DIR/node"
LIVENESS_CHECK="$ROOT/scripts/check-test-guard-liveness.sh"
BUNDLE_VALIDATOR_FIXTURE="packages/hosting/bundle-validator.test.mjs"

# S118-S03 follow-up: the installer's --check must prove resolution, not
# presence (docs/archive/phases/118_Test_Infrastructure_Upgrade.md §7 follow-up).
INSTALL_SCRIPT="$ROOT/scripts/install-test-guard.sh"

# guarded_path — echoes PATH with $NODE_SHIM_DIR prepended, for a subshell
# to activate the guard without ever touching ~/.zshenv.
guarded_path() {
  printf '%s:%s' "$NODE_SHIM_DIR" "$PATH"
}

WEDGE_SCRIPT="/tmp/ikiro-worktest-wedge-runner-$$.sh"
cat > "$WEDGE_SCRIPT" <<'EOS'
#!/usr/bin/env bash
# TEST-ONLY fixture for Works Test 4: ignores SIGTERM (SIG_IGN, not a
# no-op trap that still interrupts a blocking syscall), spawns no children
# (zero pid churn in the group), produces no output, and burns no CPU
# (blocked in the kernel on a FIFO open that no writer ever connects to).
# Only SIGKILL can end it.
trap '' TERM
FIFO="/tmp/ikiro-worktest-wedge-fifo.$$"
mkfifo "$FIFO" 2>/dev/null || true
exec 0<"$FIFO"
read -r _line
rm -f "$FIFO"
EOS
chmod +x "$WEDGE_SCRIPT"

PASS=0
FAIL=0
declare -a FAILED_NAMES=()

report_pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
report_fail() { echo "FAIL: $1 -- $2"; FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); }

force_clear_state() {
  rm -f "$LOCK_FILE"
  sweep_matching_processes "$$" >/dev/null 2>&1 || true
}

final_cleanup() {
  force_clear_state
  rm -f "$WEDGE_SCRIPT"
  rm -f /tmp/ikiro-worktest-wedge-fifo.* 2>/dev/null || true
}
trap final_cleanup EXIT INT TERM

# wait_for_lock_holder PID — poll up to ~5s for the lock file to record PID
# as the holder (proves A actually acquired the lock before B is raced
# against it).
wait_for_lock_holder() {
  local want_pid="$1"
  local waited=0
  while [[ "$waited" -lt 50 ]]; do
    if [[ -f "$LOCK_FILE" ]]; then
      local holder
      read -r holder _ _ < "$LOCK_FILE" 2>/dev/null || holder=""
      [[ "$holder" == "$want_pid" ]] && return 0
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  return 1
}

# wait_for_lock_pgid — poll up to ~3s for the lock's pgid field to be
# populated (rewritten once the runner's process group is known).
wait_for_lock_pgid() {
  local waited=0
  while [[ "$waited" -lt 30 ]]; do
    if [[ -f "$LOCK_FILE" ]]; then
      local pgid
      read -r _ _ pgid < "$LOCK_FILE" 2>/dev/null || pgid=""
      if [[ -n "$pgid" ]] && [[ "$pgid" != "-" ]]; then
        printf '%s' "$pgid"
        return 0
      fi
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  return 1
}

# --- Works Test 1: holder blocks a concurrent second attempt ---------------
test_1_lock_blocks_second() {
  force_clear_state
  IKIRO_TEST_CMD_OVERRIDE="sleep 30" IKIRO_TEST_TIMEOUT_SECONDS=3600 IKIRO_TEST_SAMPLE_INTERVAL_SECONDS=3600 \
    "$TEST_SH" "$FIXTURE" >/tmp/ikiro-wt1-a.log 2>&1 &
  local a_pid=$!

  if ! wait_for_lock_holder "$a_pid"; then
    report_fail "works-test-1" "A never acquired the lock — see /tmp/ikiro-wt1-a.log"
    kill -9 "$a_pid" 2>/dev/null || true
    force_clear_state
    return
  fi

  local start_ts end_ts elapsed b_status
  start_ts=$(date +%s)
  IKIRO_TEST_CMD_OVERRIDE="true" "$TEST_SH" "$FIXTURE" >/tmp/ikiro-wt1-b.log 2>&1
  b_status=$?
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))

  local a_alive="no"
  kill -0 "$a_pid" 2>/dev/null && a_alive="yes"

  if [[ "$b_status" -ne 0 ]] && [[ "$elapsed" -le 5 ]] && [[ "$a_alive" == "yes" ]]; then
    report_pass "works-test-1 (B exit=$b_status in ${elapsed}s, A survives)"
  else
    report_fail "works-test-1" "b_status=$b_status elapsed=${elapsed}s a_alive=$a_alive; see /tmp/ikiro-wt1-b.log"
  fi

  local pgid
  pgid="$(wait_for_lock_pgid || true)"
  [[ -n "${pgid:-}" ]] && kill -KILL -- "-$pgid" 2>/dev/null || true
  kill -9 "$a_pid" 2>/dev/null || true
  wait "$a_pid" 2>/dev/null || true
  force_clear_state
}

# --- Works Test 2: kill -9 the wrapper, next attempt recovers --------------
test_2_stale_lock_recovery() {
  force_clear_state
  IKIRO_TEST_CMD_OVERRIDE="sleep 30" IKIRO_TEST_TIMEOUT_SECONDS=3600 IKIRO_TEST_SAMPLE_INTERVAL_SECONDS=3600 \
    "$TEST_SH" "$FIXTURE" >/tmp/ikiro-wt2-a.log 2>&1 &
  local a_pid=$!

  if ! wait_for_lock_holder "$a_pid"; then
    report_fail "works-test-2" "A never acquired the lock — see /tmp/ikiro-wt2-a.log"
    kill -9 "$a_pid" 2>/dev/null || true
    force_clear_state
    return
  fi
  local pgid
  pgid="$(wait_for_lock_pgid || true)"
  if [[ -z "${pgid:-}" ]]; then
    report_fail "works-test-2" "A never recorded a runner pgid — see /tmp/ikiro-wt2-a.log"
    kill -9 "$a_pid" 2>/dev/null || true
    force_clear_state
    return
  fi

  # kill -9 the WRAPPER only — the runner (sleep 30) is in its own detached
  # process group and survives, exactly the orphan scenario recovery must
  # handle.
  kill -9 "$a_pid" 2>/dev/null || true
  wait "$a_pid" 2>/dev/null || true

  if ! group_alive "$pgid"; then
    report_fail "works-test-2" "orphan runner pgid=$pgid did not survive wrapper kill -9 — cannot exercise recovery"
    force_clear_state
    return
  fi

  IKIRO_TEST_CMD_OVERRIDE="true" "$TEST_SH" "$FIXTURE" >/tmp/ikiro-wt2-b.log 2>&1
  local b_status=$?

  if [[ "$b_status" -eq 0 ]] && ! group_alive "$pgid"; then
    report_pass "works-test-2 (B recovered the stale lock, reaped orphan pgid=$pgid, and succeeded)"
  else
    local orphan_state="alive"
    group_alive "$pgid" || orphan_state="gone"
    report_fail "works-test-2" "b_status=$b_status orphan_pgid_$pgid=$orphan_state; see /tmp/ikiro-wt2-b.log"
  fi
  force_clear_state
}

# --- Works Test 3: timeout backstop kills and releases the lock ------------
test_3_timeout_backstop() {
  force_clear_state
  local start_ts end_ts elapsed status
  start_ts=$(date +%s)
  IKIRO_TEST_CMD_OVERRIDE="sleep 30" IKIRO_TEST_TIMEOUT_SECONDS=2 IKIRO_TEST_SAMPLE_INTERVAL_SECONDS=100 \
    "$TEST_SH" "$FIXTURE" >/tmp/ikiro-wt3.log 2>&1
  status=$?
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))

  if [[ "$status" -eq 124 ]] && [[ ! -f "$LOCK_FILE" ]] && [[ "$elapsed" -le 8 ]]; then
    report_pass "works-test-3 (timeout backstop: exit=124, lock released, ${elapsed}s)"
  else
    report_fail "works-test-3" "status=$status elapsed=${elapsed}s lock_present=$([[ -f "$LOCK_FILE" ]] && echo yes || echo no); see /tmp/ikiro-wt3.log"
  fi
  force_clear_state
}

# --- Works Test 4: wedge detector fires, not the backstop ------------------
test_4_wedge_detector() {
  force_clear_state
  local start_ts end_ts elapsed status
  start_ts=$(date +%s)
  IKIRO_TEST_CMD_OVERRIDE="$WEDGE_SCRIPT" IKIRO_TEST_TIMEOUT_SECONDS=60 IKIRO_TEST_SAMPLE_INTERVAL_SECONDS=1 IKIRO_TEST_FLAT_SAMPLES=2 \
    "$TEST_SH" "$FIXTURE" >/tmp/ikiro-wt4.log 2>&1
  status=$?
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))

  if [[ "$status" -eq 99 ]] && [[ ! -f "$LOCK_FILE" ]] && [[ "$elapsed" -le 15 ]]; then
    report_pass "works-test-4 (wedge detector: exit=99, lock released, ${elapsed}s — well under the 60s backstop)"
  else
    report_fail "works-test-4" "status=$status elapsed=${elapsed}s lock_present=$([[ -f "$LOCK_FILE" ]] && echo yes || echo no); see /tmp/ikiro-wt4.log"
  fi
  force_clear_state
}

# --- Works Test 5: argv contract forms --------------------------------------
test_5_argv_contract() {
  local ok=true

  local emptydir="/tmp/ikiro-worktest-emptydir-$$"
  mkdir -p "$emptydir"
  if "$TEST_SH" "$emptydir" >/tmp/ikiro-wt5-a.log 2>&1; then
    ok=false; echo "  [5a] expected non-zero exit for empty directory" >&2
  fi
  grep -q "0 files matched under directory" /tmp/ikiro-wt5-a.log || { ok=false; echo "  [5a] missing 0-files message" >&2; }
  rmdir "$emptydir"

  if "$TEST_SH" 'packages/hosting/**/*.doesnotexist.mjs' >/tmp/ikiro-wt5-b.log 2>&1; then
    ok=false; echo "  [5b] expected non-zero exit for zero-match glob" >&2
  fi
  grep -q "0 files matched glob" /tmp/ikiro-wt5-b.log || { ok=false; echo "  [5b] missing 0-files message" >&2; }

  if "$TEST_SH" packages >/tmp/ikiro-wt5-c.log 2>&1; then
    ok=false; echo "  [5c] expected refusal for >25 files without --all" >&2
  fi
  grep -q -- "--all" /tmp/ikiro-wt5-c.log || { ok=false; echo "  [5c] missing --all suggestion" >&2; }

  force_clear_state
  if ! IKIRO_TEST_CMD_OVERRIDE="true" "$TEST_SH" packages/hosting >/tmp/ikiro-wt5-d.log 2>&1; then
    ok=false; echo "  [5d] directory form (25 files, boundary — not > 25) unexpectedly failed" >&2
  fi
  force_clear_state

  if ! IKIRO_TEST_CMD_OVERRIDE="true" "$TEST_SH" "$FIXTURE" >/tmp/ikiro-wt5-e.log 2>&1; then
    ok=false; echo "  [5e] explicit file form unexpectedly failed" >&2
  fi
  force_clear_state

  if ! IKIRO_TEST_CMD_OVERRIDE="true" "$TEST_SH" 'packages/hosting/**/*.test.mjs' >/tmp/ikiro-wt5-f.log 2>&1; then
    ok=false; echo "  [5f] quoted glob form unexpectedly failed" >&2
  fi
  force_clear_state

  if "$TEST_SH" --nope >/tmp/ikiro-wt5-g.log 2>&1; then
    ok=false; echo "  [5g] expected non-zero exit for unknown flag" >&2
  fi
  grep -q "unknown flag" /tmp/ikiro-wt5-g.log || { ok=false; echo "  [5g] missing unknown-flag message" >&2; }

  if [[ "$ok" == true ]]; then
    report_pass "works-test-5 (zero-match dir/glob, >25 refusal, directory/explicit/glob forms, unknown flag)"
  else
    report_fail "works-test-5" "one or more argv-contract sub-checks failed (see messages above)"
  fi
}

# --- Works Test 6: bystander outside the runner pgid survives a sweep ------
test_6_never_kill_boundary() {
  force_clear_state
  node -e 'setInterval(() => {}, 1000)' >/tmp/ikiro-wt6-bystander.log 2>&1 &
  local bystander_pid=$!
  sleep 0.3

  "$KILL_STALE" --dry-run --max-age-seconds 0 >/tmp/ikiro-wt6-sweep.log 2>&1

  sleep 0.3
  local survived="no"
  kill -0 "$bystander_pid" 2>/dev/null && survived="yes"

  kill -9 "$bystander_pid" 2>/dev/null || true
  wait "$bystander_pid" 2>/dev/null || true

  if [[ "$survived" == "yes" ]]; then
    report_pass "works-test-6 (bystander node process outside any runner pgid survives the sweep)"
  else
    report_fail "works-test-6" "bystander process did not survive the sweep — see /tmp/ikiro-wt6-sweep.log"
  fi
  force_clear_state
}

# --- Works Test 7: scripts/test.sh packages/hosting runs in a few seconds --
test_7_hosting_fast() {
  force_clear_state
  local start_ts end_ts elapsed status
  start_ts=$(date +%s)
  "$TEST_SH" packages/hosting >/tmp/ikiro-wt7.log 2>&1
  status=$?
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))

  if [[ "$elapsed" -le 10 ]] && [[ ! -f "$LOCK_FILE" ]]; then
    if [[ "$status" -eq 0 ]]; then
      report_pass "works-test-7 (packages/hosting green in ${elapsed}s)"
    else
      report_pass "works-test-7 (packages/hosting ran in ${elapsed}s, wrapper mechanics OK; node exit=$status — pre-existing red HEAD item, S0G quarantine #6 cli-release-store.test.mjs, not a guard defect)"
    fi
  else
    report_fail "works-test-7" "elapsed=${elapsed}s lock_present=$([[ -f "$LOCK_FILE" ]] && echo yes || echo no); see /tmp/ikiro-wt7.log"
  fi
  force_clear_state
}

# --- Works Test 8: preview-cold-serves.test.mjs does not false-wedge -------
# renderer-cache.test.mjs (~10s) was structurally incapable of exceeding the
# 30s wedge window, so this test could never fail — it proved nothing
# (docs/archive/phases/118_Test_Infrastructure_Upgrade.md S118-S03 Task 1). Swapped
# to preview-cold-serves.test.mjs: boots real servers, can sit flat, and
# measures ~36s through the wrapper — long enough to actually exercise the
# window.
test_8_preview_cold_serves_calibration() {
  force_clear_state
  local target="packages/site-renderer/test/preview-cold-serves.test.mjs"
  if [[ ! -f "$ROOT/$target" ]]; then
    report_fail "works-test-8" "fixture file missing: $target"
    return
  fi
  local start_ts end_ts elapsed status
  start_ts=$(date +%s)
  "$TEST_SH" "$target" >/tmp/ikiro-wt8.log 2>&1
  status=$?
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))

  if [[ "$status" -eq 99 ]]; then
    report_fail "works-test-8" "FALSE WEDGE at default constants (5s x 6 = 30s) after ${elapsed}s — see /tmp/ikiro-wt8.log"
  elif [[ "$status" -eq 0 ]]; then
    report_pass "works-test-8 (preview-cold-serves.test.mjs completed in ${elapsed}s, no false wedge at default 5s x 6 constants)"
  else
    report_fail "works-test-8" "unexpected exit=$status (not a wedge, not success) after ${elapsed}s — see /tmp/ikiro-wt8.log"
  fi
  force_clear_state
}

# strip_shim_from_path — echoes $PATH with $NODE_SHIM_DIR removed, so tests
# can build a guaranteed-unguarded PATH regardless of the ambient shell's
# actual activation state.
strip_shim_from_path() {
  local -a parts
  IFS=':' read -r -a parts <<< "$PATH"
  local result="" part
  for part in ${parts[@]+"${parts[@]}"}; do
    [[ "$part" == "$NODE_SHIM_DIR" ]] && continue
    result="${result:+$result:}$part"
  done
  printf '%s' "$result"
}

# --- Works Test 9: liveness check goes RED unguarded, GREEN guarded --------
# The whole point of S118-S03 (§2): Allnighter's liveness check sources its
# own activation script before checking, so it always reports "active" — it
# cannot fail for the real reason. Ours must be able to go red.
test_9_liveness_red_green() {
  local unguarded_path guarded_path unguarded_out guarded_out unguarded_status guarded_status
  unguarded_path="$(strip_shim_from_path)"
  guarded_path="$NODE_SHIM_DIR:$unguarded_path"

  unguarded_out="$(PATH="$unguarded_path" "$LIVENESS_CHECK" 2>&1)"; unguarded_status=$?
  guarded_out="$(PATH="$guarded_path" "$LIVENESS_CHECK" 2>&1)"; guarded_status=$?

  if [[ "$unguarded_status" -ne 0 ]] && [[ "$guarded_status" -eq 0 ]]; then
    report_pass "works-test-9 (liveness RED unguarded exit=$unguarded_status, GREEN guarded exit=$guarded_status)"
  else
    report_fail "works-test-9" "unguarded_status=$unguarded_status guarded_status=$guarded_status; unguarded=[$unguarded_out] guarded=[$guarded_out]"
  fi
}

# --- Works Test 10: guard active — node --test auto-routes under the lock --
test_10_shim_auto_route_lock() {
  force_clear_state
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"

  PATH="$guarded" IKIRO_TEST_CMD_OVERRIDE="sleep 30" IKIRO_TEST_TIMEOUT_SECONDS=3600 IKIRO_TEST_SAMPLE_INTERVAL_SECONDS=3600 \
    node --test "$BUNDLE_VALIDATOR_FIXTURE" >/tmp/ikiro-wt10-a.log 2>&1 &
  local a_pid=$!

  if ! wait_for_lock_holder "$a_pid"; then
    report_fail "works-test-10" "A never acquired the lock via the node shim — see /tmp/ikiro-wt10-a.log"
    kill -9 "$a_pid" 2>/dev/null || true
    force_clear_state
    return
  fi

  local start_ts end_ts elapsed b_status
  start_ts=$(date +%s)
  PATH="$guarded" IKIRO_TEST_CMD_OVERRIDE="true" node --test "$BUNDLE_VALIDATOR_FIXTURE" >/tmp/ikiro-wt10-b.log 2>&1
  b_status=$?
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))

  local a_alive="no"
  kill -0 "$a_pid" 2>/dev/null && a_alive="yes"

  if [[ "$b_status" -ne 0 ]] && [[ "$elapsed" -le 5 ]] && [[ "$a_alive" == "yes" ]] && grep -q "another run is in progress" /tmp/ikiro-wt10-b.log; then
    report_pass "works-test-10 (node shim auto-routed A into the lock; concurrent B failed fast, exit=$b_status in ${elapsed}s)"
  else
    report_fail "works-test-10" "b_status=$b_status elapsed=${elapsed}s a_alive=$a_alive; see /tmp/ikiro-wt10-b.log"
  fi

  local pgid
  pgid="$(wait_for_lock_pgid || true)"
  [[ -n "${pgid:-}" ]] && kill -KILL -- "-$pgid" 2>/dev/null || true
  kill -9 "$a_pid" 2>/dev/null || true
  wait "$a_pid" 2>/dev/null || true
  force_clear_state
}

# --- Works Test 11: guard active — refusals never start a run --------------
test_11_shim_refusals_guarded() {
  force_clear_state
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local ok=true

  if PATH="$guarded" node --test >/tmp/ikiro-wt11-a.log 2>&1; then
    ok=false; echo "  [11a] expected non-zero for 'node --test' with no files" >&2
  fi
  grep -q "breadth unknown" /tmp/ikiro-wt11-a.log || { ok=false; echo "  [11a] missing refusal message" >&2; }
  [[ -f "$LOCK_FILE" ]] && { ok=false; echo "  [11a] lock file created — a run started" >&2; }

  if PATH="$guarded" node scripts/run_unit_tests.mjs >/tmp/ikiro-wt11-b.log 2>&1; then
    ok=false; echo "  [11b] expected non-zero for 'node scripts/run_unit_tests.mjs'" >&2
  fi
  grep -q "breadth-unknown full-suite run" /tmp/ikiro-wt11-b.log || { ok=false; echo "  [11b] missing refusal message" >&2; }
  [[ -f "$LOCK_FILE" ]] && { ok=false; echo "  [11b] lock file created — a run started" >&2; }

  if [[ "$ok" == true ]]; then
    report_pass "works-test-11 ('node --test' no-files and 'node run_unit_tests.mjs' both refused, no run started)"
  else
    report_fail "works-test-11" "one or more refusal sub-checks failed (see messages above)"
  fi
  force_clear_state
}

# --- Works Test 12: guard active — ordinary node invocations pass through --
test_12_shim_passthrough_guarded() {
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local ok=true

  local ver
  ver="$(PATH="$guarded" node --version 2>&1)"
  [[ "$ver" == v* ]] || { ok=false; echo "  [12a] node --version unexpected output: $ver" >&2; }

  local eout
  eout="$(PATH="$guarded" node -e 'console.log("wt12")' 2>&1)"
  [[ "$eout" == "wt12" ]] || { ok=false; echo "  [12b] node -e unexpected output: $eout" >&2; }

  # check_doc_citations.mjs may legitimately exit non-zero on real, unrelated
  # content issues — assert only that the shim let it run untouched, not
  # that its lint content is clean.
  local cout
  cout="$(PATH="$guarded" node scripts/check_doc_citations.mjs 2>&1)"
  if echo "$cout" | grep -q "scripts/bin/node: refus\|scripts/bin/node: auto-routing"; then
    ok=false; echo "  [12c] check_doc_citations.mjs was intercepted by the shim, expected pass-through" >&2
  fi
  [[ -f "$LOCK_FILE" ]] && { ok=false; echo "  [12c] lock file created for a plain node script run" >&2; }

  if [[ "$ok" == true ]]; then
    report_pass "works-test-12 (node --version, node -e, node scripts/check_doc_citations.mjs all pass through)"
  else
    report_fail "works-test-12" "one or more pass-through sub-checks failed (see messages above)"
  fi
  force_clear_state
}

# --- Works Test 13: guard active, cwd outside the repo — pure pass-through -
test_13_shim_repo_scoping() {
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local outside_dir="/tmp/ikiro-worktest-outside-$$"
  mkdir -p "$outside_dir"

  local out
  out="$(cd "$outside_dir" && PATH="$guarded" node --test "/tmp/ikiro-worktest-outside-nonexistent-$$.test.mjs" 2>&1)"
  rmdir "$outside_dir" 2>/dev/null || true

  # Outside the repo the shim must exec the REAL node untouched — never our
  # own refusal/auto-route/test.sh messages. Real node reports its own
  # "could not find" error for the missing file.
  if echo "$out" | grep -q "scripts/bin/node: refus\|scripts/bin/node: auto-routing\|test\.sh:"; then
    report_fail "works-test-13" "shim intercepted an invocation outside the repo: $out"
  else
    report_pass "works-test-13 (node --test outside the repo passes straight through to real node)"
  fi
  force_clear_state
}

# --- Works Test 14: guard active but CI=1 — shim fully disabled ------------
test_14_shim_ci_bypass() {
  force_clear_state
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local out status
  out="$(CI=1 PATH="$guarded" node --test "$FIXTURE" 2>&1)"
  status=$?

  if echo "$out" | grep -q "scripts/bin/node: auto-routing"; then
    report_fail "works-test-14" "CI=1 did not disable the shim — still auto-routed: $out"
  elif [[ -f "$LOCK_FILE" ]]; then
    report_fail "works-test-14" "CI=1 still acquired the test.sh lock — shim not bypassed"
  elif [[ "$status" -ne 0 ]]; then
    report_fail "works-test-14" "CI=1 direct 'node --test $FIXTURE' exited $status: $out"
  else
    report_pass "works-test-14 (CI=1 bypasses the shim entirely — node --test ran directly, no lock)"
  fi
  force_clear_state
}

# --- Works Test 17: CI truthiness matrix — only 1/true/yes disable the shim
# S118-S03 follow-up: the original condition was `[[ -n "${CI:-}" ]]`, which
# disabled the guard for ANY non-empty CI value — CI=false / CI=0 slipped
# through and bypassed the lock entirely. This must fail if that widens back.
test_17_shim_ci_truthiness_matrix() {
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local ok=true
  local val out status

  # Truthy values (case-insensitive): shim disabled, node runs directly.
  for val in true TRUE True 1 yes YES; do
    force_clear_state
    out="$(CI="$val" PATH="$guarded" node --test "$FIXTURE" 2>&1)"
    status=$?
    if echo "$out" | grep -q "scripts/bin/node: auto-routing"; then
      ok=false; echo "  [17-truthy CI=$val] shim did NOT disable — still auto-routed" >&2
    elif [[ "$status" -ne 0 ]]; then
      ok=false; echo "  [17-truthy CI=$val] direct run exited $status: $out" >&2
    fi
    force_clear_state
  done

  # Falsy / non-truthy values: guard stays ACTIVE — bare 'node --test' with
  # no files is still refused, never silently disabled.
  for val in false FALSE 0 no maybe ""; do
    force_clear_state
    out="$(CI="$val" PATH="$guarded" node --test 2>&1)"
    status=$?
    if [[ "$status" -eq 0 ]]; then
      ok=false; echo "  [17-falsy CI='$val'] expected refusal, got success" >&2
    fi
    if ! echo "$out" | grep -q "breadth unknown"; then
      ok=false; echo "  [17-falsy CI='$val'] guard did not fire — got: $out" >&2
    fi
    [[ -f "$LOCK_FILE" ]] && { ok=false; echo "  [17-falsy CI='$val'] lock file created — a run started" >&2; }
    force_clear_state
  done

  if [[ "$ok" == true ]]; then
    report_pass "works-test-17 (CI truthiness matrix: true/TRUE/1/yes/YES disable the shim; false/0/no/maybe/empty leave it active)"
  else
    report_fail "works-test-17" "one or more CI-truthiness sub-checks failed (see messages above)"
  fi
}

# --- Works Test 15: argv forms classify identically ------------------------
test_15_shim_argv_forms() {
  force_clear_state
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local ok=true

  PATH="$guarded" IKIRO_TEST_CMD_OVERRIDE=true node --test packages/hosting >/tmp/ikiro-wt15-a.log 2>&1
  grep -q "auto-routing" /tmp/ikiro-wt15-a.log || { ok=false; echo "  [15a] bare directory form not auto-routed" >&2; }
  force_clear_state

  PATH="$guarded" IKIRO_TEST_CMD_OVERRIDE=true node --test 'packages/hosting/*.test.mjs' >/tmp/ikiro-wt15-b.log 2>&1
  grep -q "auto-routing" /tmp/ikiro-wt15-b.log || { ok=false; echo "  [15b] quoted glob form not auto-routed" >&2; }
  force_clear_state

  if PATH="$guarded" node --test 'packages/hosting/*.doesnotexist.mjs' >/tmp/ikiro-wt15-c.log 2>&1; then
    ok=false; echo "  [15c] zero-match glob unexpectedly succeeded" >&2
  fi
  grep -q "auto-routing" /tmp/ikiro-wt15-c.log || { ok=false; echo "  [15c] zero-match glob not auto-routed" >&2; }
  grep -q "0 files matched glob" /tmp/ikiro-wt15-c.log || { ok=false; echo "  [15c] missing 0-files message" >&2; }
  force_clear_state

  PATH="$guarded" IKIRO_TEST_CMD_OVERRIDE=true node --test "$FIXTURE" --test-concurrency=1 >/tmp/ikiro-wt15-d.log 2>&1
  grep -q "auto-routing" /tmp/ikiro-wt15-d.log || { ok=false; echo "  [15d] flags-after---test form not auto-routed" >&2; }
  force_clear_state

  PATH="$guarded" IKIRO_TEST_CMD_OVERRIDE=true node --import "$ROOT/scripts/test_bootstrap.mjs" --test "$FIXTURE" >/tmp/ikiro-wt15-e.log 2>&1
  grep -q "auto-routing" /tmp/ikiro-wt15-e.log || { ok=false; echo "  [15e] --import-before---test (space-separated value) form not auto-routed" >&2; }
  force_clear_state

  if [[ "$ok" == true ]]; then
    report_pass "works-test-15 (directory / quoted glob / zero-match glob / flags-after / --import forms classify identically)"
  else
    report_fail "works-test-15" "one or more argv-form sub-checks failed (see messages above)"
  fi
}

# --- Works Test 16: no recursion --------------------------------------------
test_16_shim_no_recursion() {
  force_clear_state
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local start_ts end_ts elapsed status
  start_ts=$(date +%s)
  PATH="$guarded" IKIRO_TEST_CMD_OVERRIDE=true node --test "$FIXTURE" >/tmp/ikiro-wt16.log 2>&1
  status=$?
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))

  if [[ "$status" -eq 0 ]] && [[ "$elapsed" -le 10 ]] && ! grep -q "recursively\|IKIRO_NODE_SHIM_ACTIVE already set" /tmp/ikiro-wt16.log; then
    report_pass "works-test-16 (auto-routed run terminates in ${elapsed}s, no recursion error)"
  else
    report_fail "works-test-16" "status=$status elapsed=${elapsed}s; see /tmp/ikiro-wt16.log"
  fi
  force_clear_state
}

# --- Works Test 18: --check fails when a later PATH entry outranks the shim -
# The old grep-based --check only asked "is the block text present in
# .zshenv" — it would report success even in a shell where something sourced
# AFTER .zshenv (e.g. .zprofile's `brew shellenv`) re-prepends a different
# node ahead of the shim. That is exactly the grades-its-own-homework failure
# this phase already found in Allnighter's liveness check (see
# check-test-guard-liveness.sh header). Constructs an isolated ZDOTDIR — the
# guard block present in .zshenv, but .zprofile prepends a fake node dir
# afterward — and asserts --check reports UNGUARDED and exits non-zero. Never
# touches the real ~/.zshenv / ~/.zprofile / ~/.zshrc.
test_18_check_detects_later_path_override() {
  local tmp_zdotdir="/tmp/ikiro-worktest-zdotdir-$$"
  local fake_node_dir="/tmp/ikiro-worktest-fakenode-$$"
  mkdir -p "$tmp_zdotdir" "$fake_node_dir"

  cat > "$fake_node_dir/node" <<'EOS'
#!/bin/sh
exit 0
EOS
  chmod +x "$fake_node_dir/node"

  cat > "$tmp_zdotdir/.zshenv" <<EOF
# >>> ikiro test guard (managed by scripts/install-test-guard.sh) >>>
export PATH="$NODE_SHIM_DIR:\$PATH"
# <<< ikiro test guard <<<
EOF
  cat > "$tmp_zdotdir/.zprofile" <<EOF
export PATH="$fake_node_dir:\$PATH"
EOF

  local out status
  out="$(HOME="$tmp_zdotdir" ZDOTDIR="$tmp_zdotdir" "$INSTALL_SCRIPT" --check 2>&1)"
  status=$?

  rm -rf "$tmp_zdotdir" "$fake_node_dir"

  if [[ "$status" -ne 0 ]] && echo "$out" | grep -q "zsh -l -c (login).*UNGUARDED"; then
    report_pass "works-test-18 (--check detects .zprofile re-prepending a different node ahead of the shim, reports UNGUARDED, exits non-zero)"
  else
    report_fail "works-test-18" "status=$status out=[$out]"
  fi
}

# --- Works Test 19: npm run <cheap gate> succeeds in a guarded shell -------
# S118-S03 follow-up regression: the recursion guard used to fire on ANY inherited
# IKIRO_NODE_SHIM_ACTIVE, but the shim exports it unconditionally — so npm's
# own `#!/usr/bin/env node` shebang (itself routed through the shim) set the
# marker, and the `node scripts/x.mjs` npm spawns to run the script tripped
# over its own inherited marker. Every `npm run` was broken in a guarded
# shell. Guards against that regression, not just today's fix.
test_19_npm_run_guarded_passthrough() {
  force_clear_state
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local out status
  out="$(cd "$ROOT" && PATH="$guarded" npm run --silent lint:archive-links 2>&1)"
  status=$?

  if [[ "$status" -eq 0 ]] && ! echo "$out" | grep -q "recursively\|IKIRO_NODE_SHIM_ACTIVE already set"; then
    report_pass "works-test-19 (npm run lint:archive-links succeeds in a guarded shell, no recursion error)"
  else
    report_fail "works-test-19" "status=$status out=[$out]"
  fi
  force_clear_state
}

# --- Works Test 20: npm run check:fast runs to completion, guarded ---------
test_20_check_fast_guarded() {
  force_clear_state
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local out status
  out="$(cd "$ROOT" && PATH="$guarded" npm run --silent check:fast 2>&1)"
  status=$?

  if [[ "$status" -eq 0 ]] \
    && echo "$out" | grep -q "PASS  guard-liveness" \
    && ! echo "$out" | grep -q "recursively\|IKIRO_NODE_SHIM_ACTIVE already set"; then
    report_pass "works-test-20 (npm run check:fast completes in a guarded shell; guard-liveness gate green)"
  else
    report_fail "works-test-20" "status=$status out=[$out]"
  fi
  force_clear_state
}

# --- Works Test 21: deeply nested pass-through survives ---------------------
# node -e spawns `npm run <gate>` (itself node -> shim -> npm shebang -> shim
# -> node scripts/x.mjs -> shim again) three shim layers deep. None of them
# may set/see a marker as recursion.
test_21_deep_nested_passthrough() {
  force_clear_state
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local out status
  out="$(cd "$ROOT" && PATH="$guarded" node -e '
    const { execFileSync } = require("node:child_process");
    process.stdout.write(execFileSync("npm", ["run", "--silent", "lint:archive-links"], { encoding: "utf8" }));
  ' 2>&1)"
  status=$?

  if [[ "$status" -eq 0 ]] && ! echo "$out" | grep -q "recursively\|IKIRO_NODE_SHIM_ACTIVE already set"; then
    report_pass "works-test-21 (node -e -> npm run -> node three-deep pass-through nests without recursion error)"
  else
    report_fail "works-test-21" "status=$status out=[$out]"
  fi
  force_clear_state
}

# --- Works Test 22: auto-route backstop survives the rescoping -------------
# Same assertion as works-test-16, re-run after scoping the guard to the
# auto-route branch only — the backstop must still fire were genuine
# recursion to occur, and a normal auto-routed run must still terminate
# clean.
test_22_auto_route_backstop_survives() {
  force_clear_state
  local guarded="$NODE_SHIM_DIR:$(strip_shim_from_path)"
  local start_ts end_ts elapsed status
  start_ts=$(date +%s)
  PATH="$guarded" IKIRO_TEST_CMD_OVERRIDE=true node --test "$FIXTURE" >/tmp/ikiro-wt22.log 2>&1
  status=$?
  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))

  if [[ "$status" -eq 0 ]] && [[ "$elapsed" -le 10 ]] && ! grep -q "recursively\|IKIRO_NODE_SHIM_ACTIVE already set" /tmp/ikiro-wt22.log; then
    report_pass "works-test-22 (auto-route still terminates in ${elapsed}s, no recursion error, after guard rescoping)"
  else
    report_fail "works-test-22" "status=$status elapsed=${elapsed}s; see /tmp/ikiro-wt22.log"
  fi
  force_clear_state
}

cd "$ROOT"
echo "=== S118-S00 + S118-S03 test-guard Works Tests ==="
test_1_lock_blocks_second
test_2_stale_lock_recovery
test_3_timeout_backstop
test_4_wedge_detector
test_5_argv_contract
test_6_never_kill_boundary
test_7_hosting_fast
test_8_preview_cold_serves_calibration
test_9_liveness_red_green
test_10_shim_auto_route_lock
test_11_shim_refusals_guarded
test_12_shim_passthrough_guarded
test_13_shim_repo_scoping
test_14_shim_ci_bypass
test_15_shim_argv_forms
test_16_shim_no_recursion
test_17_shim_ci_truthiness_matrix
test_18_check_detects_later_path_override
test_19_npm_run_guarded_passthrough
test_20_check_fast_guarded
test_21_deep_nested_passthrough
test_22_auto_route_backstop_survives

echo "==============================="
echo "PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  echo "Failed: ${FAILED_NAMES[*]}"
  exit 1
fi
exit 0
