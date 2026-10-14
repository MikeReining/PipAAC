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
  # ENVIRONMENT=development opens the Worker's dev mailbox (044 C5 account scenario reads the "email" there).
  printf 'PIP_LICENSE_SECRET=e2e-local-secret\nENVIRONMENT=development\n' > .dev.vars
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
WORKER="http://127.0.0.1:$PORT"
PROXY_PID=""
# Every scenario talks to the Worker through scripts/ios/e2e_proxy.mjs: it
# forwards, and the control file <dir>/proxy-mode can cut blob downloads
# mid-transfer or take the relay "down" (044 C4).
start_proxy() { # <dir>  -> sets BASE
  echo pass > "$1/proxy-mode"
  rm -f "$1/proxy.port"
  node scripts/ios/e2e_proxy.mjs "$PORT" "$1/proxy-mode" "$1/proxy.port" > "$1/proxy.log" 2>&1 &
  PROXY_PID=$!
  for _ in $(seq 1 50); do [ -s "$1/proxy.port" ] && break; sleep 0.1; done
  BASE="http://127.0.0.1:$(cat "$1/proxy.port")"; [ -n "${PIP_E2E_NOPROXY:-}" ] && BASE="$WORKER"
}
stop_proxy() { [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null; PROXY_PID=""; }

# The iPad's SQLite FILE for a person (relay user id, or the home person).
ipad_dump() { # <dir> <relayUserId|-> <out>
  local ID
  if [ "$2" = "-" ]; then
    ID="$(python3 -c "import json;r=json.load(open('$1/ipad/people.json'))['users'];print(next(u['id'] for u in r if u.get('home')))")"
  else
    ID="$2"
  fi
  node scripts/ios/e2e_dump.mjs "$1/ipad/Users/$ID.sqlite" "$3"
}

compare() { # <peerdump> <ipaddump> <label>
  wc -l "$1" "$2" | head -2 | awk '{print $2": "$1" lines"}'
  if diff -u "$1" "$2" > "$1.diff"; then
    echo "DIFF ipad vs $3: IDENTICAL"
  else
    echo "DIFF ipad vs $3: DIFFERENT"; head -40 "$1.diff"; FAIL=1
  fi
}

xcode_test() { # <dir> <Class/test> [extra env...]
  local D="$1" T="$2"; shift 2
  env TEST_RUNNER_PIP_E2E_DIR="$D" TEST_RUNNER_PIP_E2E_BASE="$BASE" "$@" \
    xcodebuild test-without-building -project apps/PipAAC/PipAAC.xcodeproj -scheme PipAAC \
    -configuration Release -destination "id=$UDID" -derivedDataPath "$DD" \
    -parallel-testing-enabled NO \
    -only-testing:"PipAACUITests/$T" \
    -resultBundlePath "$D/result.xcresult" > "$D/xcodebuild.log" 2>&1
}

run_scenario() { # <name> <Class/test> <peer-scenario> <dumps...>
  local name="$1" test="$2" scn="$3"; shift 3
  local D="$RUN/$name"; mkdir -p "$D"
  echo; echo "== scenario: $name ($test)"
  start_proxy "$D"
  node scripts/ios/e2e_web_peer.mjs host "$D" "$BASE" "$SECRET" "$scn" > "$D/peer.log" 2>&1 &
  local PEER=$!
  xcode_test "$D" "$test"
  local XC=$?
  grep -E "E2E-|Test Case.*(passed|failed)|error:" "$D/xcodebuild.log" | head -20
  wait "$PEER" 2>/dev/null
  tail -5 "$D/peer.log"
  [ -s "$D/proxy-mode.log" ] && { echo "proxy log:"; cat "$D/proxy-mode.log"; }
  stop_proxy
  [ "$XC" = 0 ] || { echo "XCUITest FAILED ($XC) - see $D/xcodebuild.log"; FAIL=1; return; }

  ipad_dump "$D" - "$D/ipad.dump"
  for f in "$@"; do compare "$D/$f.dump" "$D/ipad.dump" "$f"; done
  echo "stats_day lines on iPad: $(grep -c '^stats_day' "$D/ipad.dump")"
  if [ "$name" = media ]; then
    echo "blob files the app saved (name = sha256, checked here by shasum):"
    for f in "$D"/ipad/blobs/*; do
      [ "$(shasum -a 256 "$f" | cut -d' ' -f1)" = "$(basename "$f")" ] \
        && echo "  OK   $(basename "$f") $(wc -c < "$f") bytes" || { echo "  BAD  $f"; FAIL=1; }
    done
  fi
}

# Two linked people on one iPad: two node "web devices", own dirs, one proxy.
run_two_people() {
  local D="$RUN/two-people"; mkdir -p "$D/A" "$D/B"
  echo; echo "== scenario: two-people (SyncMediaE2ETests/testTwoPeopleSwitch)"
  start_proxy "$D"
  PEER_NAME=Alpha node scripts/ios/e2e_web_peer.mjs host "$D/A" "$BASE" "$SECRET" person > "$D/A/peer.log" 2>&1 &
  local PA=$!
  PEER_NAME=Beta node scripts/ios/e2e_web_peer.mjs host "$D/B" "$BASE" "$SECRET" person > "$D/B/peer.log" 2>&1 &
  local PB=$!
  mkdir -p "$D/A/ipad"   # the app's data dir is <A>/ipad
  xcode_test "$D/A" "SyncMediaE2ETests/testTwoPeopleSwitch" TEST_RUNNER_PIP_E2E_DIR_B="$D/B"
  local XC=$?
  grep -E "E2E-|Test Case.*(passed|failed)|error:" "$D/A/xcodebuild.log" | head -20
  wait "$PA" "$PB" 2>/dev/null
  tail -3 "$D/A/peer.log"; tail -3 "$D/B/peer.log"
  stop_proxy
  [ "$XC" = 0 ] || { echo "XCUITest FAILED ($XC) - see $D/A/xcodebuild.log"; FAIL=1; return; }
  local UA UB
  UA="$(python3 -c "import json;print(json.load(open('$D/A/person.json'))['userId'])")"
  UB="$(python3 -c "import json;print(json.load(open('$D/B/person.json'))['userId'])")"
  ipad_dump "$D/A" "$UA" "$D/ipad-A.dump"
  ipad_dump "$D/A" "$UB" "$D/ipad-B.dump"
  compare "$D/A/peer.dump" "$D/ipad-A.dump" "person A's web device"
  compare "$D/B/peer.dump" "$D/ipad-B.dump" "person B's web device"
}

# PIP_E2E_ONLY=both-ways|offline|media|two-people|restore-words|restore-scan|account runs one scenario (debugging).
only() { [ -z "${PIP_E2E_ONLY:-}" ] || [ "$PIP_E2E_ONLY" = "$1" ]; }
only both-ways && run_scenario both-ways SyncE2ETests/testLinkAndSyncBothWays both-ways peer peer2
only offline && run_scenario offline SyncE2ETests/testOfflineCatchUp offline peer
only media && run_scenario media SyncMediaE2ETests/testMediaBothWays media peer
only two-people && run_two_people
# 044 C5: restore a fresh iPad from the recovery card - typed words, then a scanned card image.
only restore-words && run_scenario restore-words SyncE2ETests/testRestoreFromWords restore peer
only restore-scan && run_scenario restore-scan SyncE2ETests/testRestoreByScanningTheCard restore peer

# 044 C5: Settings -> Your account against the local Worker (no peer). The simulator cannot finish a
# passkey ceremony, so this proves link -> claim -> the passkey step, and a clean failure after it.
run_account() {
  if ! curl -s "$WORKER/accounts/dev/mailbox?email=probe@example.com" | grep -q no_mail; then
    echo; echo "== scenario: account SKIPPED - the Worker's dev mailbox is closed (ENVIRONMENT is not development in .dev.vars)"
    return
  fi
  local D="$RUN/account"; mkdir -p "$D"
  echo; echo "== scenario: account (AccountUITests)"
  start_proxy "$D"
  # The XCUITest runner is under ATS; this reads the Worker's dev mailbox (the "email") for it.
  ( for _ in $(seq 1 600); do
      if [ -f "$D/email.txt" ]; then
        curl -s "$WORKER/accounts/dev/mailbox?email=$(cat "$D/email.txt")" \
          | python3 -c 'import json,sys; print(json.load(sys.stdin)["link"])' > "$D/link.tmp" \
          && mv "$D/link.tmp" "$D/link.txt"; break
      fi; sleep 0.2; done ) &
  xcode_test "$D" "AccountUITests" && echo "account UI: PASS" || { echo "account UI: FAIL - see $D/xcodebuild.log"; FAIL=1; }
  stop_proxy
}
only account && run_account

echo; [ "$FAIL" = 0 ] && echo "E2E RESULT: PASS" || echo "E2E RESULT: FAIL"
echo "artifacts: $RUN"
exit $FAIL
