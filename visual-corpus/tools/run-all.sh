#!/bin/sh
# Full resumable pipeline. Holdout is frozen before the research split runs.
set -u
cd "$(dirname "$0")/.."
J=${JOBS:-8}
node tools/design.mjs --split holdout,validation --jobs $J
node tools/design.mjs --split holdout,validation --rereview-policy scroll-allowed --jobs $J
node tools/design.mjs --split holdout,validation --redo-rejected --jobs $J
node tools/freeze.mjs --append || node tools/freeze.mjs
node tools/design.mjs --split research --jobs $J
node tools/design.mjs --split research --rereview-policy scroll-allowed --jobs $J
node tools/design.mjs --split research --redo-rejected --jobs $J
node tools/index.mjs
node tools/freeze.mjs --verify
node tools/freeze.mjs --set holdout-amendments --append || node tools/freeze.mjs --set holdout-amendments
