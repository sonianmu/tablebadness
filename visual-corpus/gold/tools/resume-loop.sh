#!/bin/sh
# Re-run the Gold pipeline until every scenario is complete. Quota exhaustion: wait WAIT s; other failures: wait 600 s.
cd "$(dirname "$0")/../.."
for i in $(seq 1 ${TRIES:-30}); do
  echo "attempt $i $(date)"
  sh gold/tools/run.sh > gold/runs/_logs/loop-$i.log 2>&1
  if node gold/tools/progress.mjs; then echo "complete $(date)"; exit 0; fi
  if grep -q "exhausted" gold/runs/_logs/loop-$i.log; then sleep ${WAIT:-3600}; else sleep 600; fi
done
echo "gave up $(date)"; node gold/tools/progress.mjs
