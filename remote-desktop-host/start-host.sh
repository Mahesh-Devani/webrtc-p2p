#!/usr/bin/env bash
# ==============================================================================
# P2P Connect — Remote Desktop Host Daemon Launcher
# ==============================================================================
# Starts:
#   1. Local HTTP server on port 8080 (if not already running)
#   2. Native OS Input Bridge (ws://127.0.0.1:9999)
#   3. Chromium/Chrome in unattended app mode with automatic screen capture
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_ROOT="$( dirname "$DIR" )"

echo "=========================================================="
echo " 🖥️  P2P Connect — Unattended Host Daemon"
echo "=========================================================="

# 1. Check & start web server (HTTP on 8080 preferred for zero-warning local WebSocket)
HOST_URL="http://localhost:8080/host.html"

if nc -z 127.0.0.1 8080 2>/dev/null; then
    echo "✓ Web server already active on http://localhost:8080"
    HOST_URL="http://localhost:8080/host.html"
elif nc -z 127.0.0.1 8443 2>/dev/null; then
    echo "✓ HTTPS server active on https://localhost:8443"
    HOST_URL="https://localhost:8443/host.html"
else
    echo "▶ Starting local web server on port 8080..."
    ( cd "$PROJECT_ROOT" && nohup python3 -m http.server 8080 ) >/dev/null 2>&1 &
    HTTP_PID=$!
    echo $HTTP_PID > /tmp/p2p-http.pid
    sleep 1
    echo "✓ Local web server started (PID $HTTP_PID)"
    HOST_URL="http://localhost:8080/host.html"
fi

# 2. Check & start native input bridge (ws://127.0.0.1:9999)
if nc -z 127.0.0.1 9999 2>/dev/null; then
    echo "✓ Input bridge already active on ws://127.0.0.1:9999"
else
    echo "▶ Starting zero-dependency native input bridge (bridge.py)..."
    nohup python3 -u "$DIR/bridge.py" > /tmp/p2p-bridge.log 2>&1 &
    BRIDGE_PID=$!
    echo $BRIDGE_PID > /tmp/p2p-bridge.pid
    
    # Wait up to 3 seconds for port 9999 to listen
    for i in {1..15}; do
        if nc -z 127.0.0.1 9999 2>/dev/null; then
            break
        fi
        sleep 0.2
    done
    echo "✓ Native input bridge started (PID $BRIDGE_PID, log: /tmp/p2p-bridge.log)"
fi

# 3. Locate Chrome / Chromium binary
CHROME_BIN=""
if [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [ -f "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" ]; then
    CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
elif [ -f "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" ]; then
    CHROME_BIN="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
elif which google-chrome >/dev/null 2>&1; then
    CHROME_BIN="$(which google-chrome)"
elif which chromium-browser >/dev/null 2>&1; then
    CHROME_BIN="$(which chromium-browser)"
elif which chromium >/dev/null 2>&1; then
    CHROME_BIN="$(which chromium)"
fi

HOST_PROFILE="$HOME/.p2p-connect-host-profile"
mkdir -p "$HOST_PROFILE"

OS="$(uname -s)"

if [ "$OS" = "Darwin" ]; then
    # On macOS, using 'open -a' invokes Chrome through macOS LaunchServices.
    # This ensures Chrome runs under its own system identity (with its standard Screen Recording permissions),
    # rather than as a restricted child process of Terminal which triggers 'Could not start video source'.
    echo "✓ Opening Host Agent in Google Chrome via macOS LaunchServices..."
    if [ -d "/Applications/Google Chrome.app" ]; then
        open -a "Google Chrome" "$HOST_URL"
    elif [ -d "/Applications/Brave Browser.app" ]; then
        open -a "Brave Browser" "$HOST_URL"
    elif [ -d "/Applications/Microsoft Edge.app" ]; then
        open -a "Microsoft Edge" "$HOST_URL"
    else
        open "$HOST_URL"
    fi
else
    # Linux (with optional X11 auto-select)
    CHROME_FLAGS=(
      --app="$HOST_URL"
      --user-data-dir="$HOST_PROFILE"
      --auto-select-desktop-capture-source="Entire screen"
      --ignore-certificate-errors
      --no-first-run
      --no-default-browser-check
    )
    "$CHROME_BIN" "${CHROME_FLAGS[@]}" >/dev/null 2>&1 &
    CHROME_PID=$!
    echo $CHROME_PID > /tmp/p2p-chrome.pid
fi

echo "=========================================================="
echo " ✅ Host Daemon is RUNNING"
echo "    - Web App:      $HOST_URL"
echo "    - Native Input: ws://127.0.0.1:9999"
echo "=========================================================="
echo "=========================================================="
