#!/usr/bin/env bash
# A test simulator that is silent and windowless: its own iPad (A16),
# booted headless (no Simulator.app window), with the device-wide
# PipMuted default the app's PipSpeaker obeys (volume 0, same timing).
#
#   scripts/ios/test_sim.sh create <name>   -> prints the udid
#   scripts/ios/test_sim.sh mute <udid>     -> mute an existing simulator
#   scripts/ios/test_sim.sh delete <udid>
#
# Never `open -a Simulator`: xcodebuild and `simctl io screenshot` work
# without the window, and the window steals the developer's focus.
set -euo pipefail

mute() {
  xcrun simctl bootstatus "$1" -b >/dev/null
  xcrun simctl spawn "$1" defaults write -g PipMuted -bool YES
}

case "${1:-}" in
  create)
    name="${2:?usage: test_sim.sh create <name>}"
    runtime=$(xcrun simctl list runtimes -j | /usr/bin/python3 -c '
import json, sys
rs = [r for r in json.load(sys.stdin)["runtimes"] if r["platform"] == "iOS" and r["isAvailable"]]
print(sorted(rs, key=lambda r: [int(x) for x in r["version"].split(".")])[-1]["identifier"])')
    udid=$(xcrun simctl create "$name" "iPad (A16)" "$runtime")
    mute "$udid"
    echo "$udid"
    ;;
  mute) mute "${2:?usage: test_sim.sh mute <udid>}" ;;
  delete)
    xcrun simctl shutdown "${2:?usage: test_sim.sh delete <udid>}" 2>/dev/null || true
    xcrun simctl delete "$2"
    ;;
  *) echo "usage: test_sim.sh create <name> | mute <udid> | delete <udid>" >&2; exit 2 ;;
esac
