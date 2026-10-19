"""
tests/e2e/cdp_client.py — Zero-Dependency Chrome DevTools Protocol Client
========================================================================
Controls Google Chrome / Chromium instances in headless mode using the native
Chrome DevTools Protocol (CDP) over WebSockets and HTTP. Requires zero external
Python packages (pure standard library: socket, urllib, json, base64, subprocess).

Supports:
  - Automatic Chrome binary discovery across macOS, Linux, and Windows.
  - Isolated temporary user profile directory per session.
  - Full tab lifecycle: create tab, navigate, evaluate JS, wait for conditions.
  - Media permissions bypass (--use-fake-ui-for-media-stream, --use-fake-device-for-media-stream).
"""

import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional


def find_chrome_binary() -> Optional[str]:
    """Find the path to the Google Chrome or Chromium executable on the system."""
    # 1. Environment variable override
    env_bin = os.environ.get("CHROME_BIN")
    if env_bin and os.path.exists(env_bin):
        return env_bin

    # 2. System-specific locations
    candidates = []
    if sys.platform == "darwin":
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            os.path.expanduser("~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        ]
    elif sys.platform.startswith("linux"):
        for name in ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]:
            p = shutil.which(name)
            if p:
                return p
        candidates = [
            "/usr/bin/google-chrome",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
            "/snap/bin/chromium",
        ]
    elif sys.platform in ("win32", "cygwin"):
        for prefix in [os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA")]:
            if prefix:
                candidates.extend([
                    os.path.join(prefix, "Google", "Chrome", "Application", "chrome.exe"),
                    os.path.join(prefix, "Chromium", "Application", "chrome.exe"),
                ])

    for c in candidates:
        if os.path.exists(c):
            return c

    for name in ["google-chrome", "chromium", "chrome"]:
        p = shutil.which(name)
        if p:
            return p

    return None


class CdpTab:
    """Manages a single browser page/tab via Chrome DevTools Protocol."""

    def __init__(self, target_id: str, ws_url: str, cdp_port: int):
        self.target_id = target_id
        self.ws_url = ws_url
        self.cdp_port = cdp_port
        self._cmd_id = 0

    def send_command(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Send a raw CDP JSON-RPC command over WebSocket and return the result."""
        parsed = urllib.parse.urlparse(self.ws_url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or self.cdp_port
        path = parsed.path

        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(15.0)
        s.connect((host, port))

        # Perform WebSocket upgrade
        sec_key = base64.b64encode(os.urandom(16)).decode("utf-8")
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {sec_key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        s.sendall(req.encode("utf-8"))

        # Read handshake response
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = s.recv(1024)
            if not chunk:
                s.close()
                raise ConnectionError("CDP WebSocket handshake failed: server closed socket")
            resp += chunk

        self._cmd_id += 1
        payload = json.dumps({
            "id": self._cmd_id,
            "method": method,
            "params": params or {}
        }).encode("utf-8")

        # Encode masked frame
        mask = os.urandom(4)
        masked_data = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        length = len(payload)

        if length < 126:
            header = bytes([0x81, 0x80 | length]) + mask
        elif length < 65536:
            header = bytes([0x81, 0x80 | 126, (length >> 8) & 0xFF, length & 0xFF]) + mask
        else:
            header = bytes([0x81, 0x80 | 127]) + length.to_bytes(8, "big") + mask

        s.sendall(header + masked_data)

        # Read response frame(s) until we receive matching id response
        while True:
            head = b""
            while len(head) < 2:
                chunk = s.recv(2 - len(head))
                if not chunk:
                    break
                head += chunk
            if len(head) < 2:
                s.close()
                raise ConnectionError("Premature EOF reading CDP frame header")

            b0, b1 = head[0], head[1]
            payload_len = b1 & 0x7F
            if payload_len == 126:
                ext = s.recv(2)
                payload_len = int.from_bytes(ext, "big")
            elif payload_len == 127:
                ext = s.recv(8)
                payload_len = int.from_bytes(ext, "big")

            body = b""
            while len(body) < payload_len:
                chunk = s.recv(min(8192, payload_len - len(body)))
                if not chunk:
                    break
                body += chunk

            msg_text = body.decode("utf-8", errors="ignore")
            try:
                msg_json = json.loads(msg_text)
                if msg_json.get("id") == self._cmd_id:
                    s.close()
                    if "error" in msg_json:
                        raise RuntimeError(f"CDP command {method} failed: {msg_json['error']}")
                    return msg_json
            except json.JSONDecodeError:
                continue

    def evaluate(self, expression: str) -> Any:
        """Evaluate a JavaScript expression synchronously in the tab context."""
        res = self.send_command("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
        })
        result = res.get("result", {}).get("result", {})
        if "value" in result:
            return result["value"]
        return None

    def wait_for_condition(
        self,
        expression: str,
        timeout: float = 12.0,
        poll_interval: float = 0.25,
        description: str = "condition"
    ) -> Any:
        """Poll a JavaScript expression until it returns a truthy value or timeout expires."""
        start = time.time()
        while time.time() - start < timeout:
            try:
                val = self.evaluate(expression)
                if val:
                    return val
            except Exception:
                pass
            time.sleep(poll_interval)
        raise TimeoutError(f"Timed out after {timeout}s waiting for {description}: {expression}")

    def close(self):
        """Close this tab via HTTP endpoint."""
        try:
            url = f"http://127.0.0.1:{self.cdp_port}/json/close/{self.target_id}"
            urllib.request.urlopen(url, timeout=3.0)
        except Exception:
            pass


class HeadlessChromeSession:
    """Manages the lifecycle of a headless Chrome process and its CDP connection."""

    def __init__(self, port: int = 9222, binary: Optional[str] = None):
        self.port = port
        self.binary = binary or find_chrome_binary()
        if not self.binary:
            raise FileNotFoundError(
                "Could not locate Google Chrome or Chromium executable. "
                "Set CHROME_BIN environment variable to the executable path."
            )

        self._user_data_dir = tempfile.mkdtemp(prefix="p2p_chrome_e2e_")
        self._process: Optional[subprocess.Popen] = None
        self._tabs: List[CdpTab] = []

    def start(self):
        """Launch headless Chrome with CDP remote debugging port."""
        cmd = [
            self.binary,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-background-networking",
            "--disable-default-apps",
            "--disable-extensions",
            "--disable-sync",
            "--disable-translate",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-first-run",
            "--safebrowsing-disable-auto-update",
            # Network & proxy settings: bypass proxies for local testing
            "--proxy-server=direct://",
            "--proxy-bypass-list=*",
            "--allow-insecure-localhost",
            # Auto-grant fake audio/video streams for WebRTC testing without prompts
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            f"--user-data-dir={self._user_data_dir}",
            f"--remote-debugging-port={self.port}",
            "about:blank"
        ]

        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        # Wait for CDP endpoint to become responsive
        endpoint_url = f"http://127.0.0.1:{self.port}/json/version"
        deadline = time.time() + 10.0
        connected = False
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(endpoint_url, timeout=1.0) as resp:
                    if resp.status == 200:
                        connected = True
                        break
            except Exception:
                time.sleep(0.2)

        if not connected:
            self.stop()
            raise TimeoutError(f"Headless Chrome failed to open CDP port {self.port} within 10s")

    def open_tab(self, url: str) -> CdpTab:
        """Create a new browser tab navigating to the specified URL."""
        new_url = f"http://127.0.0.1:{self.port}/json/new?{urllib.parse.quote(url, safe='')}"
        req = urllib.request.Request(new_url, method="PUT")
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        target_id = data["id"]
        ws_url = data.get("webSocketDebuggerUrl")
        if not ws_url:
            ws_url = f"ws://127.0.0.1:{self.port}/devtools/page/{target_id}"

        tab = CdpTab(target_id, ws_url, self.port)
        self._tabs.append(tab)
        return tab

    def stop(self):
        """Terminate the Chrome process and clean up temporary user profile."""
        for tab in self._tabs:
            tab.close()
        self._tabs.clear()

        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=3.0)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass
            self._process = None

        if os.path.exists(self._user_data_dir):
            try:
                shutil.rmtree(self._user_data_dir, ignore_errors=True)
            except Exception:
                pass
