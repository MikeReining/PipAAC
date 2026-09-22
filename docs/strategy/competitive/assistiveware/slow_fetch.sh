#!/bin/bash
# Sequential catch-up for videos the wedged `vvx sync` missed.
# One vvx sense at a time; 25s between successes, 90s after a failure.
set -u
DIR="/Users/mike/dev/PipAAC/docs/strategy/competitive/assistiveware"
cd "$DIR"
: > slow_fetch.log
touch slow_fetch.ndjson

while read -r id; do
  [ -z "$id" ] && continue
  url="https://www.youtube.com/watch?v=$id"
  echo "[$(date '+%T')] START $id" >> slow_fetch.log
  if vvx sense "$url" > "/tmp/vvx_sense_$id.json" 2>>slow_fetch.log; then
    cat "/tmp/vvx_sense_$id.json" >> slow_fetch.ndjson
    echo "" >> slow_fetch.ndjson
    rm -f "/tmp/vvx_sense_$id.json"
    echo "[$(date '+%T')] OK $id" >> slow_fetch.log
    sleep 25
  else
    echo "[$(date '+%T')] FAIL $id" >> slow_fetch.log
    sleep 90
  fi
done < missing_ids.txt

echo "[$(date '+%T')] DONE" >> slow_fetch.log
