#!/bin/bash
set -u
DIR="/Users/mike/dev/PipAAC/docs/strategy/competitive/assistiveware"
cd "$DIR"
: > slow_fetch2.log
while read -r id; do
  [ -z "$id" ] && continue
  url="https://www.youtube.com/watch?v=$id"
  echo "[$(date '+%T')] START $id" >> slow_fetch2.log
  if vvx sense "$url" > "/tmp/vvx_sense_$id.json" 2>>slow_fetch2.log; then
    cat "/tmp/vvx_sense_$id.json" >> slow_fetch.ndjson
    echo "" >> slow_fetch.ndjson
    rm -f "/tmp/vvx_sense_$id.json"
    echo "[$(date '+%T')] OK $id" >> slow_fetch2.log
    sleep 60
  else
    echo "[$(date '+%T')] FAIL $id" >> slow_fetch2.log
    sleep 120
  fi
done < missing_pass2.txt
echo "[$(date '+%T')] DONE" >> slow_fetch2.log
