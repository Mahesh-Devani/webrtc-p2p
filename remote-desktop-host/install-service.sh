#!/usr/bin/env bash
# ==============================================================================
# P2P Connect — Background Service Installer (macOS LaunchAgent)
# ==============================================================================
# Registers P2P Connect Host as an automatic background service on macOS.
# It starts automatically on login, keeps running in the background, and
# restarts automatically if terminated.
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PLIST_NAME="com.p2pconnect.host.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo "=========================================================="
echo " ⚙️  Installing P2P Connect Host as macOS Background Service"
echo "=========================================================="

mkdir -p "$LAUNCH_AGENTS_DIR"

# Unload existing agent if currently active
if launchctl list | grep -q "com.p2pconnect.host" 2>/dev/null; then
    echo "▶ Unloading existing service..."
    launchctl unload "$TARGET_PLIST" 2>/dev/null || true
fi

# Generate LaunchAgent plist file pointing to start-host.sh
cat <<EOF > "$TARGET_PLIST"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.p2pconnect.host</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$DIR/start-host.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/p2pconnect-host.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/p2pconnect-host.err</string>
    <key>ProcessType</key>
    <string>Interactive</string>
</dict>
</plist>
EOF

echo "✓ Created LaunchAgent: $TARGET_PLIST"

# Load and start service
launchctl load "$TARGET_PLIST"
echo "✓ Service loaded into macOS launchd!"

echo ""
echo "=========================================================="
echo " ✅ Background Service Installed & Running!"
echo "    - Auto-starts on login: YES"
echo "    - Log files:   /tmp/p2pconnect-host.log"
echo "    - Error files: /tmp/p2pconnect-host.err"
echo ""
echo " Useful commands:"
echo "   • Check status: launchctl list | grep com.p2pconnect.host"
echo "   • Stop service: launchctl unload $TARGET_PLIST"
echo "   • Start service: launchctl load $TARGET_PLIST"
echo "   • Uninstall:    ./remote-desktop-host/uninstall-service.sh"
echo "=========================================================="
