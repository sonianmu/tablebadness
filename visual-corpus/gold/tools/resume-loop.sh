#!/bin/sh
# Re-run the Gold pipeline until every scenario is complete; when the quota is exhausted, wait and try again.
cd "$(dirname "$0")/../.."
for i in $(seq 1 ${TRIES:-14}); do
  echo "attempt $i $(date)"
  sh gold/tools/run.sh > gold/runs/_logs/attempt-$i.log 2>&1
  tail -3 gold/runs/_logs/attempt-$i.log
  if ! grep -q "exhausted" gold/runs/_logs/attempt-$i.log; then echo "complete $(date)"; exit 0; fi
  sleep ${WAIT:-3600}
done
echo "gave up $(date)"
