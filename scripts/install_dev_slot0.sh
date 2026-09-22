#!/usr/bin/env bash
# Keep the founder browse copy alive on this Mac.
#
#   bash scripts/install_dev_slot0.sh
#   bash scripts/install_dev_slot0.sh --uninstall
#   bash scripts/install_dev_slot0.sh --print-node
#
# Bookmark: http://localhost:8787
# Agents:   npm run dev:agent
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.shift.dev-slot0"
PLIST_DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_PATH="$HOME/Library/Logs/shift-dev-slot0.log"
usage() {
  sed -n '2,9p' "$0"
}

# PATH often starts with a repo test-guard shim (scripts/bin/node). launchd
# must invoke a real Node, not that wrapper.
resolve_node() {
  local candidate
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  while IFS= read -r candidate; do
    case "$candidate" in
      */scripts/bin/node) continue ;;
    esac
    if [[ -x "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done < <(type -ap node 2>/dev/null)
  return 1
}

PRINT_NODE=false
UNINSTALL=false
for arg in "$@"; do
  case "$arg" in
    --uninstall) UNINSTALL=true ;;
    --print-node) PRINT_NODE=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

NODE_BIN="$(resolve_node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "error: real node not found (refusing repo test-guard shims)" >&2
  exit 1
fi

NODE_BIN="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$NODE_BIN")"
NODE_DIR="$(dirname "$NODE_BIN")"
DEV_JS="$REPO_ROOT/scripts/dev.mjs"

if [[ "$PRINT_NODE" == true ]]; then
  echo "$NODE_BIN"
  exit 0
fi

uninstall() {
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST_DEST" 2>/dev/null || true
  rm -f "$PLIST_DEST"
  echo "ok: removed $LABEL"
}

if [[ "$UNINSTALL" == true ]]; then
  uninstall
  exit 0
fi

mkdir -p "$(dirname "$LOG_PATH")"
mkdir -p "$HOME/Library/LaunchAgents"
: >"$LOG_PATH"

if launchctl list "$LABEL" &>/dev/null; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

cat >"$PLIST_DEST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${DEV_JS}</string>
    <string>browse</string>
    <string>--service</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${NODE_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${REPO_ROOT}</string>
  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>2</integer>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST" 2>/dev/null || launchctl load "$PLIST_DEST"
launchctl kickstart "gui/$(id -u)/$LABEL" 2>/dev/null || true

echo "ok: installed $LABEL"
echo "  Bookmark http://localhost:8787"
echo "  Log      $LOG_PATH"
echo "  Agents   npm run dev:agent"
