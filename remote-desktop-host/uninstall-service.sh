#!/usr/bin/env bash
# ==============================================================================
# P2P Connect — Background Service Uninstaller (macOS & Linux)
# ==============================================================================

set -e

PLIST_NAME="com.p2pconnect.host.plist"
TARGET_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME"
SYSTEMD_SERVICE="p2pconnect-host.service"
TARGET_SYSTEMD="$HOME/.config/systemd/user/$SYSTEMD_SERVICE"

echo "=========================================================="
echo " 🛑 Uninstalling P2P Connect Background Service"
echo "=========================================================="

OS="$(uname -s)"

if [ "$OS" = "Darwin" ]; then
    if [ -f "$TARGET_PLIST" ]; then
        echo "▶ Unloading service from macOS launchd..."
        launchctl unload "$TARGET_PLIST" 2>/dev/null || true
        rm -f "$TARGET_PLIST"
        echo "✓ Removed $TARGET_PLIST"
    else
        echo "• Service plist not found in ~/Library/LaunchAgents."
    fi
elif [ "$OS" = "Linux" ]; then
    if [ -f "$TARGET_SYSTEMD" ]; then
        echo "▶ Disabling systemd user service..."
        systemctl --user stop "$SYSTEMD_SERVICE" 2>/dev/null || true
        systemctl --user disable "$SYSTEMD_SERVICE" 2>/dev/null || true
        rm -f "$TARGET_SYSTEMD"
        systemctl --user daemon-reload
        echo "✓ Removed $TARGET_SYSTEMD"
    else
        echo "• systemd service unit not found."
    fi
fi

# Stop any running bridge or web server processes
if [ -f "/tmp/p2p-bridge.pid" ]; then
    kill "$(cat /tmp/p2p-bridge.pid)" 2>/dev/null || true
    rm -f /tmp/p2p-bridge.pid
fi

if [ -f "/tmp/p2p-http.pid" ]; then
    kill "$(cat /tmp/p2p-http.pid)" 2>/dev/null || true
    rm -f /tmp/p2p-http.pid
fi

echo "✅ Background service uninstalled successfully."
