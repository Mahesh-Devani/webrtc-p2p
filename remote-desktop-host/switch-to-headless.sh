#!/usr/bin/env bash
# ==============================================================================
# P2P Connect — Switch to 24/7 Silent Headless Background Service (Approach A)
# ==============================================================================
# Installs/starts the macOS LaunchAgent running in 24/7 background mode.
# ==============================================================================

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "=========================================================="
echo " 🛡️  Switching to 24/7 Headless Background Service (Approach A)"
echo "=========================================================="

"$DIR/install-service.sh"

echo ""
echo "=========================================================="
echo " ✅ 24/7 Silent Background Service is now RUNNING!"
echo "    - Runs silently in the background with zero open browser windows"
echo "    - Automatically starts on system boot and login"
echo "    - To switch back to interactive browser tab mode at any time:"
echo "        ./remote-desktop-host/switch-to-interactive.sh"
echo "=========================================================="
