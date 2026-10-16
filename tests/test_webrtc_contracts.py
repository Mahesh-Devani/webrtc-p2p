"""
tests/test_webrtc_contracts.py
==============================
Automated regression tests for WebRTC core lifecycle, transceivers,
SDP a=msid attributes, screen share encoding, and DataChannel flow control.
"""

import re
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class TestWebRtcContracts(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.core_content = (PROJECT_ROOT / 'webrtc-core.js').read_text(encoding='utf-8')
        cls.ui_content = (PROJECT_ROOT / 'ui-controller.js').read_text(encoding='utf-8')

    def test_datachannel_labels_and_wiring(self):
        """All 4 DataChannels (p2p-sig, p2p-chat, p2p-files, p2p-input) must be wired."""
        channels = ['p2p-sig', 'p2p-chat', 'p2p-files', 'p2p-input']
        for ch in channels:
            self.assertIn(f"createDataChannel('{ch}'", self.core_content,
                          f"webrtc-core.js must create DataChannel '{ch}' in createOffer()")

        # Verify wireChannel handles all 4 channels
        self.assertIn("channel.label === 'p2p-sig'", self.core_content)
        self.assertIn("channel.label === 'p2p-chat'", self.core_content)
        self.assertIn("channel.label === 'p2p-files'", self.core_content)
        self.assertIn("channel.label === 'p2p-input'", self.core_content)

    def test_webrtc_transceiver_direction_logic(self):
        """Transceivers must set sendonly for tracks being sent and inactive for unused tracks."""
        self.assertIn("tc.direction = 'sendonly'", self.core_content,
                      "addLocalStream must set direction = 'sendonly' for active sender tracks")
        self.assertIn("tc.direction = 'inactive'", self.core_content,
                      "addLocalStream must set direction = 'inactive' for unassigned transceivers")

    def test_create_offer_recvonly_transceivers_for_rd(self):
        """createOffer({ receiveVideo: true }) must add recvonly transceivers for remote desktop."""
        self.assertIn("pc.addTransceiver('video', { direction: 'recvonly' })", self.core_content)
        self.assertIn("pc.addTransceiver('audio', { direction: 'recvonly' })", self.core_content)

    def test_screenshare_high_quality_settings(self):
        """Desktop screen share must set contentHint='detail' and 15 Mbps max bitrate."""
        self.assertIn("screenTrack.contentHint = 'detail'", self.core_content,
                      "Screen sharing must set contentHint to 'detail' for crisp text")
        self.assertIn("maxBitrate = 15_000_000", self.core_content,
                      "Video sender must configure 15 Mbps max bitrate for remote desktop")
        self.assertIn("maxFramerate = 60", self.core_content,
                      "Video sender must target 60 FPS")

    def test_file_transfer_backpressure_watermarks(self):
        """Backpressure watermarks: BUFFER_HIGH = 256KB, BUFFER_LOW = 64KB, drain check."""
        self.assertIn("BUFFER_HIGH = 256 * 1024", self.core_content, "BUFFER_HIGH watermark must be 256KB")
        self.assertIn("BUFFER_LOW = 64 * 1024", self.core_content, "BUFFER_LOW watermark must be 64KB")
        self.assertIn("waitForBufferDrain(dcFiles, 0)", self.core_content,
                      "Sender must await waitForBufferDrain(dcFiles, 0) before sending _fileEnd")
        self.assertIn("bufferedamountlow", self.core_content,
                      "Sender must listen to bufferedamountlow event when paused")

    def test_client_autoplay_recovery_logic(self):
        """Client must have autoplay recovery with audio fallback (muted retry)."""
        self.assertIn("dom.remoteVideo.muted = true", self.ui_content,
                      "ui-controller.js must retry muted if browser autoplay blocks unmuted audio")
        self.assertIn("dom.remoteVideo.play()", self.ui_content,
                      "ui-controller.js must call play() on remote video")


if __name__ == '__main__':
    unittest.main()
