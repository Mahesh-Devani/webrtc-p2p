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
PROJECT_ROOT="$( dirname "$DIR" )"
PLIST_NAME="com.p2pconnect.host.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"
INSTALL_DIR="$HOME/.p2p-connect-host"

echo "=========================================================="
echo " ⚙️  Installing P2P Connect Host as macOS Background Service"
echo "=========================================================="

mkdir -p "$LAUNCH_AGENTS_DIR"

# Unload existing agent if currently active
if launchctl list | grep -q "com.p2pconnect.host" 2>/dev/null; then
    echo "▶ Unloading existing service..."
    launchctl unload "$TARGET_PLIST" 2>/dev/null || true
fi

# Deploy service files to user application directory ($HOME/.p2p-connect-host)
# Note: macOS TCC restricts launchd from accessing ~/Documents, ~/Desktop, and ~/Downloads.
# Running from ~/.p2p-connect-host bypasses TCC sandbox restrictions cleanly.
echo "▶ Deploying host daemon to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/web"
echo "$PROJECT_ROOT" > "$INSTALL_DIR/.project_root"

cp "$DIR/bridge.py" "$INSTALL_DIR/bridge.py"
cp "$DIR/start-host.sh" "$INSTALL_DIR/start-host.sh"
cp "$DIR/uninstall-service.sh" "$INSTALL_DIR/uninstall-service.sh"

if [ -f "$PROJECT_ROOT/host.html" ]; then
    cp "$PROJECT_ROOT/host.html" "$INSTALL_DIR/web/" 2>/dev/null || true
    cp "$PROJECT_ROOT"/*.js "$INSTALL_DIR/web/" 2>/dev/null || true
    cp "$PROJECT_ROOT"/*.css "$INSTALL_DIR/web/" 2>/dev/null || true
    if [ -f "$PROJECT_ROOT/nostr.bundle.js" ]; then
        cp "$PROJECT_ROOT/nostr.bundle.js" "$INSTALL_DIR/web/" 2>/dev/null || true
    fi
elif [ -d "$DIR/web" ]; then
    cp -R "$DIR/web/"* "$INSTALL_DIR/web/" 2>/dev/null || true
fi

if [ -f "$PROJECT_ROOT/cert.pem" ]; then
    cp "$PROJECT_ROOT/cert.pem" "$PROJECT_ROOT/key.pem" "$INSTALL_DIR/" 2>/dev/null || true
fi

chmod +x "$INSTALL_DIR/start-host.sh" "$INSTALL_DIR/bridge.py"
echo "✓ Host daemon deployed to $INSTALL_DIR"

IS_BRIDGE_ONLY=0
for arg in "$@"; do
    if [ "$arg" = "--bridge-only" ] || [ "$arg" = "-b" ]; then
        IS_BRIDGE_ONLY=1
    fi
done

SERVICE_ARG="--daemon"
SERVICE_DESC="Silent Headless (Zero Windows / Tabs)"
if [ "$IS_BRIDGE_ONLY" -eq 1 ]; then
    SERVICE_ARG="--bridge-only"
    SERVICE_DESC="Bridge-Only (Interactive Browser Tabs)"
fi

# Generate LaunchAgent plist file pointing to $INSTALL_DIR/start-host.sh
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
        <string>$INSTALL_DIR/start-host.sh</string>
        <string>$SERVICE_ARG</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
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
echo "    - Mode:        $SERVICE_DESC"
echo "    - Auto-starts: YES (on user login & crash recovery)"
echo "    - Web App:     http://localhost:8080/host.html"
echo "    - Log files:   /tmp/p2pconnect-host.log"
echo "    - Error files: /tmp/p2pconnect-host.err"
echo ""
echo " Useful commands:"
echo "   • Check status: launchctl list | grep com.p2pconnect.host"
echo "   • Stop service: launchctl unload $TARGET_PLIST"
echo "   • Start service: launchctl load $TARGET_PLIST"
echo "   • Uninstall:    ./remote-desktop-host/uninstall-service.sh"
echo "=========================================================="
