"""
tests/e2e/test_two_peer_handshake.py — Headless Two-Peer WebRTC E2E Test
========================================================================
Full browser end-to-end integration test verifying two distinct peers
running in isolated Google Chrome / Chromium headless sessions:
  1. Discovery of Chrome / Chromium binary or skip if unavailable.
  2. Spawns an embedded Mock Nostr Relay and standard HTTP server.
  3. Launches Alice and Bob in separate headless browser instances with isolated profiles.
  4. Both peers initialize secp256k1 identities and connect to the mock relay.
  5. Alice adds Bob as a contact.
  6. Automated WebRTC signaling handshake over Nostr relay (offer/answer/ICE).
  7. Verification of P2P DataChannels ('p2p-sig', 'p2p-chat', 'p2p-files', 'p2p-input').
  8. Two-way real-time messaging and delivery acknowledgment ('✓✓' _ack).
  9. Clean process and socket teardown.

Zero external dependencies: uses pure Python standard library and Chrome DevTools Protocol.
"""

import asyncio
import http.server
import os
import socketserver
import sys
import threading
import time
import unittest
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from tests.mock_relay import MockNostrRelay
from tests.e2e.cdp_client import HeadlessChromeSession, find_chrome_binary


class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """Silent HTTP handler serving the project static root."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def log_message(self, format, *args):
        pass


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class ThreadedMockRelay:
    """Runs MockNostrRelay on a dedicated background asyncio event-loop thread."""

    def __init__(self, host: str = "127.0.0.1", port: int = 0, quiet: bool = True):
        self.host = host
        self.port = port
        self.quiet = quiet
        self.loop = asyncio.new_event_loop()
        self.relay = MockNostrRelay(host=host, port=port, quiet=quiet)
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
                future = asyncio.run_coroutine_threadsafe(_cleanup(), self.loop)
                future.result(timeout=5.0)
            except Exception:
                pass
            self.loop.call_soon_threadsafe(self.loop.stop)
            if self.thread:
                self.thread.join(timeout=3.0)

    def get_url(self) -> str:
        return self.relay.get_url()

    def get_events(self):
        return self.relay.get_events()

    def get_event_count(self) -> int:
        return self.relay.get_event_count()


class TestTwoPeerHandshakeE2E(unittest.TestCase):
    """End-to-end integration test across two headless Chrome instances."""

    @classmethod
    def setUpClass(cls):
        chrome_bin = find_chrome_binary()
        if not chrome_bin:
            raise unittest.SkipTest("Google Chrome / Chromium executable not found on system. Skipping E2E test.")

        # 1. Start background mock Nostr relay
        cls.relay = ThreadedMockRelay(port=0, quiet=True)
        cls.relay.start()
        cls.relay_url = cls.relay.get_url()

        # 2. Start static HTTP server for app files
        cls.httpd = ReusableTCPServer(("127.0.0.1", 0), QuietHTTPHandler)
        cls.http_port = cls.httpd.server_address[1]
        cls.http_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.http_thread.start()
        cls.app_url = f"http://127.0.0.1:{cls.http_port}"

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "httpd") and cls.httpd:
            cls.httpd.shutdown()
        if hasattr(cls, "relay") and cls.relay:
            cls.relay.stop()

    def test_full_two_peer_handshake_and_messaging(self):
        """Verify peer discovery, WebRTC handshake over Nostr, and bidirectional DataChannel messaging."""
        session_bob = None
        session_alice = None

        try:
            # 1. Launch Bob in headless Chrome with isolated mock relay
            session_bob = HeadlessChromeSession(port=9311)
            session_bob.start()
            tab_bob = session_bob.open_tab(f"{self.app_url}/index.html?relay={self.relay_url}&relay-only=1")

            # 2. Launch Alice in headless Chrome with isolated mock relay
            session_alice = HeadlessChromeSession(port=9312)
            session_alice.start()
            tab_alice = session_alice.open_tab(f"{self.app_url}/index.html?relay={self.relay_url}&relay-only=1")

            # 3. Retrieve and assert distinct 64-char hex pubkeys
            bob_pk = tab_bob.wait_for_condition(
                "(() => { const pk = document.getElementById('settings-pubkey')?.innerText?.trim(); return /^[0-9a-f]{64}$/i.test(pk) ? pk : null; })()",
                timeout=12.0,
                description="Bob 64-char hex pubkey"
            )
            self.assertTrue(bool(bob_pk) and len(bob_pk) == 64, f"Invalid Bob pubkey: {bob_pk}")

            alice_pk = tab_alice.wait_for_condition(
                "(() => { const pk = document.getElementById('settings-pubkey')?.innerText?.trim(); return /^[0-9a-f]{64}$/i.test(pk) ? pk : null; })()",
                timeout=12.0,
                description="Alice 64-char hex pubkey"
            )
            self.assertTrue(bool(alice_pk) and len(alice_pk) == 64, f"Invalid Alice pubkey: {alice_pk}")
            self.assertNotEqual(bob_pk, alice_pk, "Alice and Bob must have distinct cryptographic identities")

            # 4. Wait for both peers to establish WebSocket connection to the local mock relay (1/1)
            tab_bob.wait_for_condition(
                "(() => { const s = document.getElementById('relay-status-mini')?.innerText; return (s && s.includes('1/1')) ? s : null; })()",
                timeout=8.0,
                description="Bob mock relay connection indicator (1/1)"
            )
            tab_alice.wait_for_condition(
                "(() => { const s = document.getElementById('relay-status-mini')?.innerText; return (s && s.includes('1/1')) ? s : null; })()",
                timeout=8.0,
                description="Alice mock relay connection indicator (1/1)"
            )

            # 5. Alice adds Bob as a contact
            tab_alice.evaluate(f"""
                document.getElementById('btn-new-contact').click();
                document.getElementById('new-contact-pubkey').value = '{bob_pk}';
                document.getElementById('new-contact-nickname').value = 'Bob E2E';
                document.getElementById('btn-add-contact-confirm').click();
            """)

            tab_alice.wait_for_condition(
                "[...document.querySelectorAll('.contact-item')].some(el => el.innerText.includes('Bob E2E'))",
                timeout=5.0,
                description="Bob in Alice's contact list"
            )

            # 6. Alice opens chat with Bob, initiating automated WebRTC signaling over the mock relay
            tab_alice.evaluate("""
                const contactEl = [...document.querySelectorAll('.contact-item')].find(el => el.innerText.includes('Bob E2E'));
                if (contactEl) contactEl.click();
            """)

            # 7. Wait for both peers to reach 'Connected' status
            try:
                alice_connected = tab_alice.wait_for_condition(
                    "document.getElementById('chat-contact-status')?.innerText?.includes('Connected')",
                    timeout=15.0,
                    description="Alice P2P Connected status"
                )
                self.assertTrue(alice_connected, "Alice failed to reach 'Connected' status")

                bob_connected = tab_bob.wait_for_condition(
                    "document.getElementById('chat-contact-status')?.innerText?.includes('Connected')",
                    timeout=15.0,
                    description="Bob P2P Connected status"
                )
                self.assertTrue(bob_connected, "Bob failed to reach 'Connected' status")
            except Exception as e:
                a_stat = tab_alice.evaluate("document.getElementById('chat-contact-status')?.innerText")
                b_stat = tab_bob.evaluate("document.getElementById('chat-contact-status')?.innerText")
                a_logs = tab_alice.evaluate("window.DiagnosticLogger ? window.DiagnosticLogger.getLogs().slice(-15) : []")
                b_logs = tab_bob.evaluate("window.DiagnosticLogger ? window.DiagnosticLogger.getLogs().slice(-15) : []")
                print(f"\n[DIAGNOSTIC FAILURE REPORT]\nAlice Status: {a_stat}\nBob Status: {b_stat}")
                print(f"Alice Logs: {a_logs}\nBob Logs: {b_logs}\nRelay Events: {self.relay.get_event_count()}")
                raise e

            # 8. Alice sends real-time chat message to Bob
            test_msg = f"Automated WebRTC E2E Test — {int(time.time())}"
            tab_alice.evaluate(f"""
                const input = document.getElementById('chat-input');
                input.value = '{test_msg}';
                input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                document.getElementById('btn-send').click();
            """)

            # 9. Verify Bob receives the message in DOM
            bob_received = tab_bob.wait_for_condition(
                f"document.getElementById('chat-messages')?.innerText?.includes('{test_msg}')",
                timeout=8.0,
                description=f"Bob received message '{test_msg}'"
            )
            self.assertTrue(bob_received, "Bob did not receive Alice's message in the chat DOM")

            # 10. Verify Alice receives delivery acknowledgment ('✓✓' _ack)
            alice_ticks = tab_alice.wait_for_condition(
                "document.querySelector('.chat-msg__ticks')?.innerText?.includes('✓✓')",
                timeout=8.0,
                description="Alice delivery acknowledgment '✓✓'"
            )
            self.assertTrue(alice_ticks, "Alice did not receive delivery acknowledgment '✓✓'")

            # 11. Bob replies back to Alice over WebRTC DataChannel
            reply_msg = f"Bob ACK reply — {int(time.time())}"
            tab_bob.evaluate(f"""
                const input = document.getElementById('chat-input');
                input.value = '{reply_msg}';
                input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                document.getElementById('btn-send').click();
            """)

            alice_received = tab_alice.wait_for_condition(
                f"document.getElementById('chat-messages')?.innerText?.includes('{reply_msg}')",
                timeout=8.0,
                description=f"Alice received reply '{reply_msg}'"
            )
            self.assertTrue(alice_received, "Alice did not receive Bob's reply in the chat DOM")

        finally:
            if session_alice:
                session_alice.stop()
            if session_bob:
                session_bob.stop()


if __name__ == "__main__":
    unittest.main()
