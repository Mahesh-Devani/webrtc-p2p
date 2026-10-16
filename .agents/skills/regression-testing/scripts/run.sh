#!/usr/bin/env bash
# run.sh — Helper script to execute P2P Connect regressions from the skill directory

set -e

# Find repo root: scripts -> regression-testing -> skills -> .agents -> repo root (4 levels)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

cd "$REPO_ROOT"
python3 run-regressions.py "$@"
