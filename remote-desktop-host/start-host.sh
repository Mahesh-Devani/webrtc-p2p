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

# Auto-sync latest web assets and bridge if running from persistent install with access to project root
if [ -f "$DIR/.project_root" ]; then
    P_ROOT="$(cat "$DIR/.project_root")"
    if [ -d "$P_ROOT" ] && [ -f "$P_ROOT/host.html" ]; then
        cp "$P_ROOT/host.html" "$DIR/web/" 2>/dev/null || true
        cp "$P_ROOT"/*.js "$DIR/web/" 2>/dev/null || true
        cp "$P_ROOT"/*.css "$DIR/web/" 2>/dev/null || true
        if [ -f "$P_ROOT/remote-desktop-host/bridge.py" ]; then
            cp "$P_ROOT/remote-desktop-host/bridge.py" "$DIR/bridge.py" 2>/dev/null || true
        fi
    fi
fi

if [ -d "$DIR/web" ]; then
    WEB_DIR="$DIR/web"
elif [ -f "$DIR/../host.html" ]; then
    WEB_DIR="$( cd "$DIR/.." >/dev/null 2>&1 && pwd )"
else
    WEB_DIR="$DIR"
fi

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
    ( cd "$WEB_DIR" && nohup python3 -m http.server 8080 ) >/dev/null 2>&1 &
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

HOST_PROFILE="$HOME/.p2p-connect-host/chrome-profile"
mkdir -p "$HOST_PROFILE"

OS="$(uname -s)"
IS_DAEMON=0
IS_BRIDGE_ONLY=0
for arg in "$@"; do
    if [ "$arg" = "--daemon" ] || [ "$arg" = "-d" ]; then
        IS_DAEMON=1
    elif [ "$arg" = "--bridge-only" ] || [ "$arg" = "-b" ]; then
        IS_BRIDGE_ONLY=1
    fi
done

if [ "$IS_BRIDGE_ONLY" -eq 1 ]; then
    # ── Bridge-Only Supervisor Mode (Background Native Bridge for Interactive Tabs) ──
    echo "=========================================================="
    echo " 🔌 P2P Connect — Bridge-Only Background Supervisor"
    echo "    - Web Server:  http://localhost:8080"
    echo "    - Native Port: ws://127.0.0.1:9999"
    echo "    - Mode:        Ready for Interactive Browser Tabs"
    echo "=========================================================="

    cleanup() {
        echo "[Supervisor] Terminating services..."
        [ -f /tmp/p2p-http.pid ] && kill "$(cat /tmp/p2p-http.pid)" 2>/dev/null || true
        [ -f /tmp/p2p-bridge.pid ] && kill "$(cat /tmp/p2p-bridge.pid)" 2>/dev/null || true
        exit 0
    }
    trap cleanup SIGTERM SIGINT SIGHUP

    while true; do
        if ! nc -z 127.0.0.1 9999 2>/dev/null; then
            echo "[!] Native bridge not listening on 9999! Reviving..."
            python3 -u "$DIR/bridge.py" >> /tmp/p2p-bridge.log 2>&1 &
            echo $! > /tmp/p2p-bridge.pid
        fi
        sleep 3
    done

elif [ "$IS_DAEMON" -eq 1 ]; then
    # ── Daemon Mode (Approach A: Headless 24/7 Background Service) ─────────
    echo "▶ Launching Silent Headless Host Worker (Approach A)..."
    DAEMON_URL="http://localhost:8080/host.html?daemon=1"
    CHROME_PID=""

    # Defensively clear stale Chrome singleton lock if process is dead
    cleanup_stale_chrome_lock() {
        if [ -f "$HOST_PROFILE/SingletonLock" ] || [ -L "$HOST_PROFILE/SingletonLock" ]; then
            LOCK_TARGET="$(readlink "$HOST_PROFILE/SingletonLock" 2>/dev/null || true)"
            LOCK_PID="$(echo "$LOCK_TARGET" | awk -F'-' '{print $NF}')"
            if [ -z "$LOCK_PID" ] || ! kill -0 "$LOCK_PID" 2>/dev/null; then
                echo "[!] Clearing stale Chrome profile lock (PID ${LOCK_PID:-unknown})"
                rm -f "$HOST_PROFILE"/Singleton* 2>/dev/null || true
            fi
        fi
    }

    if [ -n "$CHROME_BIN" ]; then
        cleanup_stale_chrome_lock
        "$CHROME_BIN" \
          --app="$DAEMON_URL" \
          --window-position=-30000,-30000 \
          --window-size=1920,1080 \
          --user-data-dir="$HOST_PROFILE" \
          --remote-debugging-port=9222 \
          --disable-background-timer-throttling \
          --disable-renderer-backgrounding \
          --disable-backgrounding-occluded-windows \
          --disable-features=WebRtcDtlsStunPiggybacking,PaintHolding \
          --allow-insecure-localhost \
          --use-fake-ui-for-media-stream \
          --autoplay-policy=no-user-gesture-required \
          --enable-logging=stderr \
          --v=1 \
          --no-first-run \
          --no-default-browser-check \
          > /tmp/p2p-daemon.log 2>&1 &
        CHROME_PID=$!
        echo $CHROME_PID > /tmp/p2p-chrome.pid
        echo "✓ Silent Background Host Worker active (Refined Approach A, PID $CHROME_PID)"
    else
        echo "[!] Warning: Chrome binary not found. Cannot launch host worker."
    fi

    cleanup() {
        echo "[Supervisor] Terminating services..."
        [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
        [ -f /tmp/p2p-http.pid ] && kill "$(cat /tmp/p2p-http.pid)" 2>/dev/null || true
        [ -f /tmp/p2p-bridge.pid ] && kill "$(cat /tmp/p2p-bridge.pid)" 2>/dev/null || true
        exit 0
    }
    trap cleanup SIGTERM SIGINT SIGHUP

    echo "=========================================================="
    echo " ✅ P2P Connect Host 24/7 Supervisor Running (Refined Approach A)"
    echo "    - Mode:        Silent App Mode (Offscreen Window, Dedicated Profile)"
    echo "    - Dashboard:   http://localhost:8080/host.html"
    echo "    - Input Port:  ws://127.0.0.1:9999"
    echo "    - Log File:    /tmp/p2p-daemon.log"
    echo "=========================================================="

    # Supervise loop: automatically revives bridge.py or Chrome Worker if either ever crashes
    while true; do
        BRIDGE_PID="$(cat /tmp/p2p-bridge.pid 2>/dev/null || true)"
        if [ -z "$BRIDGE_PID" ] || ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
            if ! nc -z 127.0.0.1 9999 2>/dev/null; then
                echo "[!] Native bridge not listening on 9999! Reviving..."
                python3 -u "$DIR/bridge.py" >> /tmp/p2p-bridge.log 2>&1 &
                echo $! > /tmp/p2p-bridge.pid
            fi
        fi

        if [ -n "$CHROME_PID" ] && ! kill -0 "$CHROME_PID" 2>/dev/null; then
            echo "[!] Background Host worker crashed! Reviving..."
            cleanup_stale_chrome_lock
            "$CHROME_BIN" \
              --app="$DAEMON_URL" \
              --window-position=-30000,-30000 \
              --window-size=1920,1080 \
              --user-data-dir="$HOST_PROFILE" \
              --remote-debugging-port=9222 \
              --disable-background-timer-throttling \
              --disable-renderer-backgrounding \
              --disable-backgrounding-occluded-windows \
              --disable-features=WebRtcDtlsStunPiggybacking,PaintHolding \
              --allow-insecure-localhost \
              --use-fake-ui-for-media-stream \
              --autoplay-policy=no-user-gesture-required \
              --enable-logging=stderr \
              --v=1 \
              --no-first-run \
              --no-default-browser-check \
              >> /tmp/p2p-daemon.log 2>&1 &
            CHROME_PID=$!
            echo $CHROME_PID > /tmp/p2p-chrome.pid
        fi
        sleep 3
    done

else
    # ── Interactive Mode (Standard GUI Browser Launch) ──────────────────────
    if [ "$OS" = "Darwin" ]; then
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
fi
