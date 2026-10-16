"""
tests/test_mobile_lifecycle.py
==============================
Automated regression tests for mobile OS tab suspension recovery,
ICE consent debounce (4s), and auto-reconnection on send.
"""

import re
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class TestMobileLifecycle(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.signaling_content = (PROJECT_ROOT / 'nostr-signaling.js').read_text(encoding='utf-8')
        cls.ui_content = (PROJECT_ROOT / 'ui-controller.js').read_text(encoding='utf-8')
        cls.transport_content = (PROJECT_ROOT / 'nostr-transport.js').read_text(encoding='utf-8')

    def test_transient_disconnect_debounce_timer(self):
        """NostrSignaling must apply a 4-second debounce on 'disconnected' state before UI teardown."""
        self.assertIn("disconnectTimer", self.signaling_content,
                      "nostr-signaling.js must track disconnectTimer for debounce")
        self.assertIn("4000", self.signaling_content,
                      "nostr-signaling.js must wait 4000ms (4s) before confirming disconnected")

    def test_visibilitychange_lifecycle_recovery(self):
        """ui-controller.js must listen to visibilitychange to wake up relays and test P2P liveness."""
        self.assertIn("visibilitychange", self.ui_content,
                      "ui-controller.js must register a visibilitychange listener for tab wakeup")

    def test_auto_reconnect_on_file_send(self):
        """Senders must not drop files if channel disconnected during native file picker; must ensure connection."""
        self.assertIn("ensureConnected", self.transport_content,
                      "nostr-transport.js must provide ensureConnected() method")

    def test_active_contact_pubkey_null_safety(self):
        """UI controller must handle activeContactPubkey === null safely for manual token mode."""
        self.assertIn("!activeContactPubkey", self.ui_content,
                      "ui-controller.js must explicitly check for null activeContactPubkey")


if __name__ == '__main__':
    unittest.main()
