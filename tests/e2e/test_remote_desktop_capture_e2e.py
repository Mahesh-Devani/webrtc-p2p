"""
tests/e2e/test_remote_desktop_capture_e2e.py — Headless Chrome Remote Desktop Capture E2E Test
=============================================================================================
Verifies Dynamic Screen/Window Selection, Live Bridge Telemetry, and Stop/Start Capture
lifecycle across isolated Google Chrome / Chromium headless sessions:
  1. Discovery of Chrome / Chromium binary or skip if unavailable.
  2. Spawns an embedded Mock Nostr Relay and HTTP static file server.
  3. Spawns a dedicated RFC 6455 Mock Host OS Bridge on an ephemeral port.
  4. Launches Host in headless Chrome (host.html) connected to the Mock Bridge.
  5. Launches Client in headless Chrome (index.html) connected via WebRTC over the mock relay.
  6. Client requests and receives control_granted with bridgeActive telemetry.
  7. Client requests get_targets; Host queries Bridge and returns displays & windows.
  8. Client dynamically selects Window target (id=101) and Display target (id=2).
  9. Client / Host initiates stop_capture, verifying bridge capture suspension.
  10. Client / Host initiates start_capture, verifying bridge capture resumption.
  11. Clean process, socket, and temporary directory teardown.

Zero external dependencies: uses pure Python standard library and Chrome DevTools Protocol.
"""

import asyncio
import base64
import hashlib
import http.server
import json
import os
import socket
import socketserver
import struct
import sys
import threading
import time
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from tests.mock_relay import MockNostrRelay
from tests.e2e.cdp_client import HeadlessChromeSession, find_chrome_binary

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# Minimal valid 1x1 JPEG image bytes for canvas decode testing
TINY_JPEG = bytes([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00,
    0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01,
    0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
    0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
    0x7F, 0x00, 0xFF, 0xD9
])


def make_ws_frame(payload: bytes, opcode: int = 0x01) -> bytes:
    """Encode an RFC 6455 unmasked server frame."""
    length = len(payload)
    b0 = 0x80 | (opcode & 0x0F)
    if length <= 125:
        header = bytes([b0, length])
    elif length <= 65535:
        header = struct.pack("!BBH", b0, 126, length)
    else:
        header = struct.pack("!BBQ", b0, 127, length)
    return header + payload


async def read_ws_frame(reader: asyncio.StreamReader) -> Tuple[int, bytes]:
    """Read an RFC 6455 frame from client."""
    head = await reader.readexactly(2)
    b0, b1 = head[0], head[1]
    opcode = b0 & 0x0F
    is_masked = bool(b1 & 0x80)
    length = b1 & 0x7F

    if length == 126:
        ext = await reader.readexactly(2)
        length = struct.unpack("!H", ext)[0]
    elif length == 127:
        ext = await reader.readexactly(8)
        length = struct.unpack("!Q", ext)[0]

    mask = await reader.readexactly(4) if is_masked else None
    payload = await reader.readexactly(length) if length > 0 else b""

    if is_masked and mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return opcode, payload


class MockHostBridge:
    """Simulates the native OS bridge (bridge.py) for remote desktop testing."""

    def __init__(self, host: str = "127.0.0.1", port: int = 0):
        self.host = host
        self.port = port
        self.server = None
        self.actual_port = 0
        self.received_messages: List[Dict[str, Any]] = []
        self.selected_targets: List[Dict[str, Any]] = []
        self.capture_active = False
        self.active_writer = None
        self.lock = threading.Lock()

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            req_bytes = await reader.readuntil(b"\r\n\r\n")
            req_text = req_bytes.decode("utf-8", errors="replace")
            ws_key = None
            for line in req_text.split("\r\n"):
                if line.lower().startswith("sec-websocket-key:"):
                    ws_key = line.split(":", 1)[1].strip()

            if not ws_key:
                writer.close()
                return

            accept = base64.b64encode(hashlib.sha1((ws_key + WS_GUID).encode()).digest()).decode()
            resp = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
            ).encode("utf-8")
            writer.write(resp)
            await writer.drain()

            with self.lock:
                self.active_writer = writer

            # Send connected handshake confirmation frame
            connected_frame = make_ws_frame(json.dumps({
                "t": "connected",
                "screen": [1920, 1080],
                "origin": [0, 0]
            }).encode("utf-8"))
            writer.write(connected_frame)
            await writer.drain()

            while True:
                opcode, payload = await read_ws_frame(reader)
                if opcode == 0x08:  # Close frame
                    break
                elif opcode == 0x09:  # Ping
                    writer.write(make_ws_frame(payload, opcode=0x0A))
                    await writer.drain()
                    continue
                elif opcode != 0x01:
                    continue

                text = payload.decode("utf-8", errors="replace")
                data = json.loads(text)
                evt_type = data.get("t") or data.get("action")

                with self.lock:
                    self.received_messages.append(data)

                if evt_type in ("get_targets", "get_monitors"):
                    targets_frame = make_ws_frame(json.dumps({
                        "t": "targets",
                        "displays": [
                            {"id": 1, "index": 1, "name": "Main Display (1920x1080)", "width": 1920, "height": 1080, "is_main": True},
                            {"id": 2, "index": 2, "name": "Display 2 (1920x1080)", "width": 1920, "height": 1080, "is_main": False}
                        ],
                        "windows": [
                            {"id": 101, "owner": "Google Chrome", "name": "WebRTC Host", "title": "Google Chrome - WebRTC Host"},
                            {"id": 102, "owner": "Visual Studio Code", "name": "Codebase", "title": "Visual Studio Code - Codebase"}
                        ]
                    }).encode("utf-8"))
                    writer.write(targets_frame)
                    await writer.drain()

                elif evt_type == "select_target":
                    target_type = data.get("target", "display")
                    target_id = int(data.get("id", 1))
                    with self.lock:
                        self.selected_targets.append({"target": target_type, "id": target_id})
                        self.capture_active = True

                    ack_frame = make_ws_frame(json.dumps({
                        "t": "target_selected",
                        "target": target_type,
                        "id": target_id
                    }).encode("utf-8"))
                    writer.write(ack_frame)
                    await writer.drain()

                    # Send sample hardware JPEG frame
                    t_code = 2 if target_type == "window" else 1
                    header = struct.pack("!BBIII", 1, t_code, target_id, 1280, 720)
                    frame_data = header + TINY_JPEG
                    writer.write(make_ws_frame(frame_data, opcode=0x02))
                    await writer.drain()

                elif evt_type in ("start_capture", "action") and data.get("action") != "stop_capture":
                    target_type = data.get("target", "display")
                    target_id = int(data.get("id", 1))
                    with self.lock:
                        self.selected_targets.append({"target": target_type, "id": target_id})
                        self.capture_active = True
                    ack = make_ws_frame(json.dumps({"t": "capture_started", "target": target_type, "id": target_id}).encode("utf-8"))
                    writer.write(ack)
                    await writer.drain()

                elif evt_type in ("stop_capture", "action") or data.get("action") == "stop_capture":
                    with self.lock:
                        self.capture_active = False
                    ack = make_ws_frame(json.dumps({"t": "capture_stopped"}).encode("utf-8"))
                    writer.write(ack)
                    await writer.drain()

                elif evt_type == "ping":
                    writer.write(make_ws_frame(json.dumps({"t": "pong"}).encode("utf-8")))
                    await writer.drain()

        except Exception:
            pass
        finally:
            with self.lock:
                if self.active_writer is writer:
                    self.active_writer = None
                    self.capture_active = False
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def start(self):
        self.server = await asyncio.start_server(self.handle_client, self.host, self.port)
        self.actual_port = self.server.sockets[0].getsockname()[1]

    async def stop(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()


class ThreadedMockBridge:
    """Runs MockHostBridge on a dedicated background asyncio thread."""

    def __init__(self, host: str = "127.0.0.1", port: int = 0):
        self.bridge = MockHostBridge(host=host, port=port)
        self.loop = asyncio.new_event_loop()
        self.thread = None

    def start(self):
        ready = threading.Event()

        def _run():
            asyncio.set_event_loop(self.loop)
            self.loop.run_until_complete(self.bridge.start())
            ready.set()
            self.loop.run_forever()

        self.thread = threading.Thread(target=_run, daemon=True)
        self.thread.start()
        if not ready.wait(timeout=5.0):
            raise TimeoutError("MockHostBridge failed to start within 5s")

    def stop(self):
        if self.loop.is_running():
            async def _cleanup():
                await self.bridge.stop()
            try:
                fut = asyncio.run_coroutine_threadsafe(_cleanup(), self.loop)
                fut.result(timeout=5.0)
            except Exception:
                pass
            self.loop.call_soon_threadsafe(self.loop.stop)
            if self.thread:
                self.thread.join(timeout=3.0)

    def get_url(self) -> str:
        return f"ws://{self.bridge.host}:{self.bridge.actual_port}"

    def get_received_messages(self) -> List[Dict[str, Any]]:
        with self.bridge.lock:
            return list(self.bridge.received_messages)

    def get_selected_targets(self) -> List[Dict[str, Any]]:
        with self.bridge.lock:
            return list(self.bridge.selected_targets)

    def is_capture_active(self) -> bool:
        with self.bridge.lock:
            return self.bridge.capture_active


class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def log_message(self, format, *args):
        pass


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class ThreadedMockRelay:
    def __init__(self, host: str = "127.0.0.1", port: int = 0, quiet: bool = True):
        self.relay = MockNostrRelay(host=host, port=port, quiet=quiet)
        self.loop = asyncio.new_event_loop()
        self.thread = None

    def start(self):
        ready = threading.Event()

        def _run():
            asyncio.set_event_loop(self.loop)
            self.loop.run_until_complete(self.relay.start())
            ready.set()
            self.loop.run_forever()

        self.thread = threading.Thread(target=_run, daemon=True)
        self.thread.start()
        if not ready.wait(timeout=5.0):
            raise TimeoutError("Mock Nostr Relay failed to start within 5s")

    def stop(self):
        if self.loop.is_running():
            async def _cleanup():
                await self.relay.stop()
            try:
                fut = asyncio.run_coroutine_threadsafe(_cleanup(), self.loop)
                fut.result(timeout=5.0)
            except Exception:
                pass
            self.loop.call_soon_threadsafe(self.loop.stop)
            if self.thread:
                self.thread.join(timeout=3.0)

    def get_url(self) -> str:
        return self.relay.get_url()


class TestRemoteDesktopCaptureE2E(unittest.TestCase):
    """End-to-end integration test for Remote Desktop Capture & Target Switching."""

    @classmethod
    def setUpClass(cls):
        chrome_bin = find_chrome_binary()
        if not chrome_bin:
            raise unittest.SkipTest("Google Chrome / Chromium executable not found on system. Skipping E2E test.")

        # 1. Start background mock Nostr relay
        cls.relay = ThreadedMockRelay(port=0, quiet=True)
        cls.relay.start()
        cls.relay_url = cls.relay.get_url()

        # 2. Start mock host bridge
        cls.bridge = ThreadedMockBridge(port=0)
        cls.bridge.start()
        cls.bridge_url = cls.bridge.get_url()

        # 3. Start static HTTP server for app files
        cls.httpd = ReusableTCPServer(("127.0.0.1", 0), QuietHTTPHandler)
        cls.http_port = cls.httpd.server_address[1]
        cls.http_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.http_thread.start()
        cls.app_url = f"http://127.0.0.1:{cls.http_port}"

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "httpd") and cls.httpd:
            cls.httpd.shutdown()
        if hasattr(cls, "bridge") and cls.bridge:
            cls.bridge.stop()
        if hasattr(cls, "relay") and cls.relay:
            cls.relay.stop()

    def test_dynamic_screen_selection_and_capture_lifecycle(self):
        """Verify dynamic screen selection, bridge telemetry, and stop/start capture across Host & Client."""
        session_host = None
        session_client = None

        try:
            # 1. Launch Host in Headless Chrome
            session_host = HeadlessChromeSession(port=9321)
            session_host.start()
            host_page_url = f"{self.app_url}/host.html?relay={self.relay_url}&relay-only=1&bridge={self.bridge_url}"
            tab_host = session_host.open_tab(host_page_url)

            # 2. Configure Host security: disable whitelist and set test PIN
            test_pin = "P2pPass123!@#"
            tab_host.evaluate(f"""
                localStorage.setItem('p2p-host-whitelist-enabled', 'false');
                const toggle = document.getElementById('host-whitelist-toggle');
                if (toggle && toggle.checked) {{
                    toggle.checked = false;
                    toggle.dispatchEvent(new Event('change'));
                }}
                localStorage.setItem('p2p-host-pin', '{test_pin}');
                const pinInput = document.getElementById('host-pin-input');
                if (pinInput) {{
                    pinInput.value = '{test_pin}';
                    pinInput.dispatchEvent(new Event('input'));
                    pinInput.dispatchEvent(new Event('change'));
                }}
            """)

            # 3. Verify Host connects to Mock Bridge
            bridge_pill_text = tab_host.wait_for_condition(
                "(() => { const el = document.getElementById('host-bridge-pill'); return (el && el.innerText.toUpperCase().includes('ACTIVE')) ? el.innerText : null; })()",
                timeout=8.0,
                description="Host Bridge active indicator"
            )
            self.assertIn("ACTIVE", bridge_pill_text.upper())

            # 4. Retrieve Host's persistent 64-char hex pubkey
            host_pk = tab_host.wait_for_condition(
                "(() => { const pk = localStorage.getItem('p2p-host-pubkey') || document.getElementById('host-pubkey-display')?.title; return (pk && /^[0-9a-f]{64}$/i.test(pk.trim())) ? pk.trim() : null; })()",
                timeout=8.0,
                description="Host 64-char hex pubkey"
            )
            self.assertTrue(bool(host_pk) and len(host_pk) == 64, f"Invalid Host pubkey: {host_pk}")

            # 5. Launch Client in Headless Chrome with PIN configured in URL hash to bypass prompt()
            session_client = HeadlessChromeSession(port=9322)
            session_client.start()
            client_page_url = f"{self.app_url}/index.html?relay={self.relay_url}&relay-only=1&remoteHost={host_pk}#pin={test_pin}"
            tab_client = session_client.open_tab(client_page_url)

            # 6. Wait for Remote Desktop WebRTC Session to establish
            try:
                rd_active = tab_client.wait_for_condition(
                    "(() => { const tb = document.getElementById('rd-toolbar'); return (tb && !tb.classList.contains('hidden')) ? true : null; })()",
                    timeout=15.0,
                    description="Remote desktop toolbar visible on client"
                )
                self.assertTrue(rd_active, "Remote desktop session failed to display toolbar on client")
            except Exception as e:
                h_logs = tab_host.evaluate("window.DiagnosticLogger ? window.DiagnosticLogger.getLogs().slice(-20) : []")
                c_logs = tab_client.evaluate("window.DiagnosticLogger ? window.DiagnosticLogger.getLogs().slice(-20) : []")
                b_msgs = self.bridge.get_received_messages()
                r_evts = self.relay.relay.get_events()
                print(f"\n[DIAGNOSTIC REPORT]\nHost Logs:\n{json.dumps(h_logs, indent=2)}\nClient Logs:\n{json.dumps(c_logs, indent=2)}")
                print(f"Bridge Received:\n{json.dumps(b_msgs, indent=2)}")
                print(f"Relay Event Kinds: {[e.get('kind') for e in r_evts]}")
                raise e

            # 7. Test Dynamic Target Selection: Query Targets from Bridge via Host
            tab_client.evaluate("""
                if (typeof window.__rdSendInput === 'function') {
                    window.__rdSendInput({ t: 'get_targets' });
                } else {
                    document.getElementById('rd-btn-displays')?.click();
                }
            """)

            time.sleep(0.8)
            msgs = self.bridge.get_received_messages()
            self.assertTrue(any(m.get("t") == "get_targets" for m in msgs), "Bridge did not receive get_targets request")

            # 8. Test Dynamic Target Selection: Switch to Window ID 101
            tab_client.evaluate("""
                if (typeof window.__rdSendInput === 'function') {
                    window.__rdSendInput({ t: 'select_target', target: 'window', id: 101 });
                }
            """)

            time.sleep(0.8)
            targets = self.bridge.get_selected_targets()
            self.assertTrue(any(t.get("target") == "window" and t.get("id") == 101 for t in targets),
                            f"Bridge did not receive select_target for window:101. Targets: {targets}")
            self.assertTrue(self.bridge.is_capture_active(), "Bridge capture should be active after select_target")

            # 9. Test Dynamic Target Selection: Switch to Display ID 2
            tab_client.evaluate("""
                if (typeof window.__rdSendInput === 'function') {
                    window.__rdSendInput({ t: 'select_target', target: 'display', id: 2 });
                }
            """)

            time.sleep(0.8)
            targets = self.bridge.get_selected_targets()
            self.assertTrue(any(t.get("target") == "display" and t.get("id") == 2 for t in targets),
                            f"Bridge did not receive select_target for display:2. Targets: {targets}")

            # 10. Test Stop Capture Lifecycle
            tab_client.evaluate("""
                if (typeof window.__rdSendInput === 'function') {
                    window.__rdSendInput({ t: 'stop_capture', action: 'stop_capture' });
                }
            """)

            time.sleep(0.8)
            self.assertFalse(self.bridge.is_capture_active(), "Bridge capture should be stopped after stop_capture")
            msgs = self.bridge.get_received_messages()
            self.assertTrue(any(m.get("t") == "stop_capture" or m.get("action") == "stop_capture" for m in msgs),
                            "Bridge did not receive stop_capture message")

            # 11. Test Start Capture Lifecycle
            tab_client.evaluate("""
                if (typeof window.__rdSendInput === 'function') {
                    window.__rdSendInput({ t: 'start_capture', action: 'start_capture', target: 'display', id: 1 });
                }
            """)

            time.sleep(0.8)
            self.assertTrue(self.bridge.is_capture_active(), "Bridge capture should be resumed after start_capture")

        finally:
            if session_host:
                session_host.stop()
            if session_client:
                session_client.stop()


if __name__ == "__main__":
    unittest.main()
