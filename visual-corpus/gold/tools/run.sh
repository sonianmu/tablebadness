#!/bin/sh
# Gold pipeline runner: one model, no fallback. Resumable; re-run after a quota stop.
cd "$(dirname "$0")/../.."
export VC_MODELS=codex/gpt-6.1-terra VC_THINKING=medium VC_SCALE=${VC_SCALE:-1}
rm -f runs/_exhausted.json
node gold/tools/gold.mjs --jobs ${JOBS:-4} "$@"
