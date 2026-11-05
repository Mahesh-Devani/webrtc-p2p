"""
tests/e2e/test_remote_desktop_lifecycle_e2e.py — Headless Chrome Remote Desktop Ungraceful Disconnect & Preemption E2E
=====================================================================================================================
Verifies that:
  1. Host establishes a Remote Desktop session with Client 1.
  2. Client 1 abruptly closes the browser tab (ungraceful disconnect / crash simulation).
  3. Client 2 reconnects using an authorized credential / PIN.
  4. Host automatically supersedes the stale session via authorized preemption, accepts
     Client 2, grants remote control, and streams video WITHOUT requiring a host page refresh.
  5. The host display sleep assertion remains protected during preemption (no premature auto-lock).

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
from tests.e2e.test_remote_desktop_capture_e2e import ThreadedMockBridge, ThreadedMockRelay, QuietHTTPHandler, TINY_JPEG


class TestRemoteDesktopLifecycleE2E(unittest.TestCase):
    """End-to-end headless Chrome test for ungraceful client tab disconnect and authorized preemption."""

    @classmethod
    def setUpClass(cls):
        chrome_bin = find_chrome_binary()
        if not chrome_bin:
            raise unittest.SkipTest("Google Chrome or Chromium binary not found on host machine.")

        cls.httpd = socketserver.TCPServer(("127.0.0.1", 0), QuietHTTPHandler)
        cls.http_port = cls.httpd.server_address[1]
        cls.http_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.http_thread.start()
        cls.app_url = f"http://127.0.0.1:{cls.http_port}"

        cls.relay = ThreadedMockRelay()
        cls.relay.start()
        cls.relay_url = cls.relay.get_url()

        cls.bridge = ThreadedMockBridge(port=0)
        cls.bridge.start()
        cls.bridge_url = cls.bridge.get_url()

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "bridge"):
            cls.bridge.stop()
        if hasattr(cls, "relay"):
            cls.relay.stop()
        if hasattr(cls, "httpd"):
            cls.httpd.shutdown()
            cls.httpd.server_close()

    def test_ungraceful_tab_close_and_authorized_preemption(self):
        """Host must cleanly supersede an ungracefully terminated session when an authorized client reconnects."""
        session_host = None
        session_client1 = None
        session_client2 = None

        try:
            # 1. Launch Host in Headless Chrome connected to mock bridge & relay
            session_host = HeadlessChromeSession(port=9331)
            session_host.start()
            host_page_url = f"{self.app_url}/host.html?bridge={self.bridge_url}&relay={self.relay_url}&relay-only=1"
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

            # 3. Wait for Host OS Bridge connection
            bridge_pill_text = tab_host.wait_for_condition(
                "(() => { const el = document.getElementById('host-bridge-pill'); return (el && el.innerText.toUpperCase().includes('ACTIVE')) ? el.innerText : null; })()",
                timeout=8.0,
                description="Host Bridge active indicator"
            )
            self.assertIn("ACTIVE", bridge_pill_text.upper())

            # 4. Retrieve Host's 64-char hex pubkey
            host_pk = tab_host.wait_for_condition(
                "(() => { const pk = localStorage.getItem('p2p-host-pubkey') || document.getElementById('host-pubkey-display')?.title; return (pk && /^[0-9a-f]{64}$/i.test(pk.trim())) ? pk.trim() : null; })()",
                timeout=8.0,
                description="Host 64-char hex pubkey"
            )
            self.assertTrue(bool(host_pk) and len(host_pk) == 64, f"Invalid Host pubkey: {host_pk}")

            # 5. Launch Client 1 and establish Remote Desktop connection
            session_client1 = HeadlessChromeSession(port=9332)
            session_client1.start()
            client1_url = f"{self.app_url}/index.html?relay={self.relay_url}&relay-only=1&remoteHost={host_pk}#pin={test_pin}"
            tab_client1 = session_client1.open_tab(client1_url)

            try:
                rd_active1 = tab_client1.wait_for_condition(
                    "(() => { const tb = document.getElementById('rd-toolbar'); return (tb && !tb.classList.contains('hidden')) ? true : null; })()",
                    timeout=15.0,
                    description="Remote desktop toolbar visible on Client 1"
                )
                self.assertTrue(rd_active1, "Client 1 failed to establish remote desktop session")
            except Exception as e:
                h_logs = tab_host.evaluate("window.DiagnosticLogger ? window.DiagnosticLogger.getLogs().slice(-20) : []")
                c_logs = tab_client1.evaluate("window.DiagnosticLogger ? window.DiagnosticLogger.getLogs().slice(-20) : []")
                print(f"\n[DIAGNOSTIC REPORT]\nHost Logs:\n{json.dumps(h_logs, indent=2)}\nClient 1 Logs:\n{json.dumps(c_logs, indent=2)}")
                raise e

            # Verify Host shows active remote session
            host_status = tab_host.wait_for_condition(
                "(() => { const s = document.getElementById('host-status-text'); return (s && s.textContent.trim().toUpperCase().includes('ACTIVE')) ? s.textContent.trim() : null; })()",
                timeout=10.0,
                description="Host status text active"
            )
            self.assertIn("ACTIVE", host_status.upper(), f"Host status should be active: {host_status}")

            # 6. SIMULATE UNGRACEFUL DISCONNECT: Terminate Client 1 abruptly without sending session_ended
            print("\n[Test Lifecycle] Simulating abrupt ungraceful tab close (killing Client 1 browser process)...")
            session_client1.stop()
            session_client1 = None
            time.sleep(0.5)

            # 7. Immediately Launch Client 2 (reconnect / new session from authorized peer)
            print("[Test Lifecycle] Launching Client 2 to reconnect with the host...")
            session_client2 = HeadlessChromeSession(port=9333)
            session_client2.start()
            client2_url = f"{self.app_url}/index.html?relay={self.relay_url}&relay-only=1&remoteHost={host_pk}#pin={test_pin}"
            tab_client2 = session_client2.open_tab(client2_url)

            # 8. Assert Client 2 connects successfully via Preemption without host refresh!
            rd_active2 = tab_client2.wait_for_condition(
                "(() => { const tb = document.getElementById('rd-toolbar'); return (tb && !tb.classList.contains('hidden')) ? true : null; })()",
                timeout=15.0,
                description="Remote desktop toolbar visible on Client 2 after preemption"
            )
            self.assertTrue(rd_active2, "Client 2 failed to connect — host likely blocked offer due to stale session lock")

            # 9. Verify Host shows active session with Client 2
            host_status2 = tab_host.wait_for_condition(
                "(() => { const s = document.getElementById('host-status-text'); return (s && s.textContent.trim().toUpperCase().includes('ACTIVE')) ? s.textContent.trim() : null; })()",
                timeout=10.0,
                description="Host status text active after preemption"
            )
            self.assertIn("ACTIVE", host_status2.upper(), f"Host status should be active after preemption: {host_status2}")

            # 10. Assert Bridge did NOT receive lock_screen during preemption
            bridge_msgs = self.bridge.get_received_messages()
            lock_msgs = [m for m in bridge_msgs if m.get("t") == "lock_screen"]
            self.assertEqual(len(lock_msgs), 0, f"Host should NOT trigger lock_screen during preemption reconnect: {lock_msgs}")

            print("[Test Lifecycle] SUCCESS: Authorized client preemption verified cleanly without host refresh!")

        finally:
            if session_host:
                session_host.stop()
            if session_client1:
                session_client1.stop()
            if session_client2:
                session_client2.stop()


if __name__ == "__main__":
    unittest.main()
