#!/usr/bin/env bash
# 044 C3 Works Test: the native iPad app links with a "web device" and syncs
# both ways against the LOCAL Worker relay. Never touches production, never
# calls a paid API (pairing/sync endpoints only).
#
#   scripts/ios/e2e_sync.sh <simulator-udid> [derivedDataPath]
#
# 1. npm run dev:agent            (a local Worker on 21088-21098; never `npm run dev`)
# 2. scripts/ios/e2e_web_peer.mjs (real sync.mjs + sync_crypto.mjs in node,
#                                  own node:sqlite db) coordinating by files
# 3. xcodebuild test -only-testing:PipAACUITests/SyncE2ETests/<test>
# 4. node scripts/ios/e2e_dump.mjs on the iPad's SQLite FILE (not via the app),
#    then diff of the sorted SYNCED_TABLES dumps.
set -u
UDID="${1:?usage: e2e_sync.sh <simulator-udid> [derivedDataPath]}"
DD="${2:-/tmp/pipaac-dd-e2e}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
RUN="$(mktemp -d /tmp/pip-e2e.XXXXXX)"
echo "run dir: $RUN"

# The relay's lifetime check needs PIP_LICENSE_SECRET (a local Worker var).
# A worktree has no .dev.vars; make a minimal one (no paid keys) and remove it after.
MADE_VARS=0
if [ ! -f .dev.vars ]; then
  printf 'PIP_LICENSE_SECRET=e2e-local-secret\n' > .dev.vars
  MADE_VARS=1
fi
SECRET="$(grep '^PIP_LICENSE_SECRET=' .dev.vars | head -1 | cut -d= -f2-)"

set -m
npm run dev:agent > "$RUN/worker.log" 2>&1 &
WPID=$!
cleanup() {
  kill -TERM -"$WPID" 2>/dev/null
  pkill -f "wrangler.js dev --ip 127.0.0.1 --port ${PORT:-0} " 2>/dev/null
  [ "$MADE_VARS" = 1 ] && rm -f .dev.vars
}
trap cleanup EXIT

PORT=""
for _ in $(seq 1 120); do
  PORT="$(sed -n 's/.*Ready on http:\/\/127.0.0.1:\([0-9]*\).*/\1/p' "$RUN/worker.log" | head -1)"
  [ -n "$PORT" ] && break
  sleep 1
done
[ -n "$PORT" ] || { echo "worker did not start"; tail -20 "$RUN/worker.log"; exit 2; }
BASE="http://127.0.0.1:$PORT"
echo "local Worker: $BASE"

echo "== build for testing"
xcodebuild build-for-testing -project apps/PipAAC/PipAAC.xcodeproj -scheme PipAAC \
  -configuration Release -destination "id=$UDID" -derivedDataPath "$DD" \
  -parallel-testing-enabled NO > "$RUN/build.log" 2>&1 || { tail -30 "$RUN/build.log"; exit 3; }

FAIL=0
run_scenario() { # <name> <test> <peer-scenario> <dumps...>
  local name="$1" test="$2" scn="$3"; shift 3
  local D="$RUN/$name"; mkdir -p "$D"
  echo; echo "== scenario: $name ($test)"
  node scripts/ios/e2e_web_peer.mjs host "$D" "$BASE" "$SECRET" "$scn" > "$D/peer.log" 2>&1 &
  local PEER=$!
  TEST_RUNNER_PIP_E2E_DIR="$D" TEST_RUNNER_PIP_E2E_BASE="$BASE" \
    xcodebuild test-without-building -project apps/PipAAC/PipAAC.xcodeproj -scheme PipAAC \
    -configuration Release -destination "id=$UDID" -derivedDataPath "$DD" \
    -parallel-testing-enabled NO \
    -only-testing:"PipAACUITests/SyncE2ETests/$test" \
    -resultBundlePath "$D/result.xcresult" > "$D/xcodebuild.log" 2>&1
  local XC=$?
  grep -E "E2E-|Test Case.*(passed|failed)|error:" "$D/xcodebuild.log" | head -20
  wait "$PEER" 2>/dev/null
  tail -5 "$D/peer.log"
  [ "$XC" = 0 ] || { echo "XCUITest FAILED ($XC) - see $D/xcodebuild.log"; FAIL=1; return; }

  local ID; ID="$(python3 -c "import json,sys;r=json.load(open('$D/ipad/people.json'))['users'];print(next(u for u in r if u.get('home'))['id'])")"
  node scripts/ios/e2e_dump.mjs "$D/ipad/Users/$ID.sqlite" "$D/ipad.dump"
  for f in "$@"; do wc -l "$D/$f.dump" | awk '{print $2": "$1" lines"}'; done
  wc -l "$D/ipad.dump" | awk '{print $2": "$1" lines"}'
  for f in "$@"; do
    if diff -u "$D/$f.dump" "$D/ipad.dump" > "$D/$f.diff"; then
      echo "DIFF ipad vs $f: IDENTICAL"
    else
      echo "DIFF ipad vs $f: DIFFERENT"; head -40 "$D/$f.diff"; FAIL=1
    fi
  done
  echo "stats_day lines on iPad: $(grep -c '^stats_day' "$D/ipad.dump")"
}

# PIP_E2E_ONLY=both-ways|offline runs one scenario (debugging).
[ "${PIP_E2E_ONLY:-both-ways}" = both-ways ] && run_scenario both-ways testLinkAndSyncBothWays both-ways peer peer2
[ "${PIP_E2E_ONLY:-offline}" = offline ] && run_scenario offline testOfflineCatchUp offline peer

echo; [ "$FAIL" = 0 ] && echo "E2E RESULT: PASS" || echo "E2E RESULT: FAIL"
echo "artifacts: $RUN"
exit $FAIL
