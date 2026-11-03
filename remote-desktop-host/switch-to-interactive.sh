#!/usr/bin/env bash
# ==============================================================================
# P2P Connect — Switch to Interactive Browser Tab Mode (Old Way)
# ==============================================================================
# 1. Stops any running headless background daemon
# 2. Ensures local web server (port 8080) and bridge (port 9999) are active
# 3. Launches http://localhost:8080/host.html in Chrome/Brave/Edge
# ==============================================================================

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PLIST_NAME="com.p2pconnect.host.plist"
TARGET_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "=========================================================="
echo " 🖥️  Switching to Interactive Browser Tab Mode (Old Way)"
echo "=========================================================="

# 1. Unload 24/7 headless background service if running
if launchctl list | grep -q "com.p2pconnect.host" 2>/dev/null; then
    echo "▶ Unloading 24/7 headless background service..."
    launchctl unload "$TARGET_PLIST" 2>/dev/null || true
    echo "✓ 24/7 headless service paused."
fi

# Stop any running headless Chrome worker
if [ -f /tmp/p2p-chrome.pid ]; then
    kill "$(cat /tmp/p2p-chrome.pid)" 2>/dev/null || true
    rm -f /tmp/p2p-chrome.pid
fi
pkill -f "host.html\?daemon=1" 2>/dev/null || true

# 2. Ensure bridge.py and web server are running and open interactive host tab
"$DIR/start-host.sh"

echo ""
echo "=========================================================="
echo " ✅ Interactive Browser Mode is now ACTIVE!"
echo "    - A visible tab has been opened at http://localhost:8080/host.html"
echo "    - You will see the live desktop preview and session status"
echo "    - Keep this browser tab open while accepting remote connections"
echo "    - To switch back to 24/7 headless background service at any time:"
echo "        ./remote-desktop-host/switch-to-headless.sh"
echo "=========================================================="
