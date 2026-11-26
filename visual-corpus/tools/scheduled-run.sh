#!/bin/sh
# Delayed resume: wait, clear the "exhausted" marks, then run the whole resumable pipeline on one model.
cd "$(dirname "$0")/.."
sleep "${DELAY:-14400}"
rm -f runs/_exhausted.json
echo "start $(date)"
VC_MODELS=codex/gpt-6.1-terra VC_THINKING=medium VC_SCALE=0.75 JOBS=${JOBS:-8} sh tools/run-all.sh
echo "end $(date)"
