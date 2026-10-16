#!/usr/bin/env bash
# ==============================================================================
# P2P Connect — Linux systemd User Service Installer
# ==============================================================================
# Installs a systemd user service to automatically run the P2P Connect Host
# daemon or bridge on user login and keep it running in the background.
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
SERVICE_NAME="p2pconnect-host.service"
USER_SYSTEMD_DIR="$HOME/.config/systemd/user"
TARGET_SERVICE="$USER_SYSTEMD_DIR/$SERVICE_NAME"

echo "=========================================================="
echo " ⚙️  Installing P2P Connect Host as Linux systemd Service"
echo "=========================================================="

mkdir -p "$USER_SYSTEMD_DIR"

# Stop existing service if active
if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "▶ Stopping existing service..."
    systemctl --user stop "$SERVICE_NAME" || true
fi

# Create systemd service unit
cat <<EOF > "$TARGET_SERVICE"
[Unit]
Description=P2P Connect Remote Desktop Host
After=network.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=/bin/bash $DIR/start-host.sh
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

echo "✓ Created systemd service unit: $TARGET_SERVICE"

# Reload systemd user daemon, enable, and start service
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"
systemctl --user start "$SERVICE_NAME"

echo "✓ Service enabled and started via systemd!"

# Check if loginctl is available to enable lingering
if which loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$USER" 2>/dev/null || true
    echo "✓ Enabled user lingering (service persists without active SSH/GUI session)"
fi

echo ""
echo "=========================================================="
echo " ✅ Linux Background Service Installed & Running!"
echo ""
echo " Useful commands:"
echo "   • Check status: systemctl --user status $SERVICE_NAME"
echo "   • View logs:    journalctl --user -u $SERVICE_NAME -f"
echo "   • Stop service: systemctl --user stop $SERVICE_NAME"
echo "   • Restart:      systemctl --user restart $SERVICE_NAME"
echo "   • Uninstall:    systemctl --user disable --now $SERVICE_NAME && rm $TARGET_SERVICE"
echo "=========================================================="
