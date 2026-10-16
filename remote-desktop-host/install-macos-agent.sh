#!/usr/bin/env bash
# ==============================================================================
# P2P Connect — macOS LaunchAgent Installer
# ==============================================================================
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
exec "$DIR/install-service.sh" "$@"
