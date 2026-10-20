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
        cls.html_content = (PROJECT_ROOT / 'index.html').read_text(encoding='utf-8')

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

    def test_peer_session_return_members_defined(self):
        """All members returned by PeerSession.create must be declared in create() scope."""
        match = re.search(r'function create\(cfg = \{\}\)\s*\{(.*?)return\s*\{([^}]+)\};\s*\}', self.core_content, re.DOTALL)
        self.assertIsNotNone(match, "PeerSession.create return block must exist")
        body = match.group(1)
        returned_props = [p.strip().rstrip(',') for p in match.group(2).splitlines() if p.strip() and not p.strip().startswith('//')]
        self.assertGreater(len(returned_props), 20, "PeerSession.create must return public interface methods")
        for prop in returned_props:
            prop_name = prop.split(':')[0].strip()
            pattern = re.compile(rf'\b(function|const|let|var)\s+{prop_name}\b')
            self.assertTrue(pattern.search(body), f"Member '{prop_name}' returned by PeerSession.create is not declared in create() scope!")


    def test_remote_audio_controls_and_perf_hud(self):
        """Package 1: Audio controls (slider/mute) and live stream performance HUD."""
        # Functions in ui-controller.js
        self.assertIn("function applyRemoteAudioVolume", self.ui_content)
        self.assertIn("function applySavedRemoteAudioSettings", self.ui_content)
        self.assertIn("function initRemoteAudioControls", self.ui_content)
        self.assertIn("function startPerfHudStats", self.ui_content)
        self.assertIn("function stopPerfHudStats", self.ui_content)
        self.assertIn("function updatePerfHud", self.ui_content)
        self.assertIn("session?.getRawPC?.() || session?.pc", self.ui_content)
        self.assertIn("await pc.getStats()", self.ui_content)

        # Elements in index.html
        self.assertIn('id="rd-btn-audio"', self.html_content)
        self.assertIn('id="rd-audio-slider"', self.html_content)
        self.assertIn('id="rd-btn-audio-mute-toggle"', self.html_content)
        self.assertIn('id="rd-btn-perf-hud"', self.html_content)
        self.assertIn('id="rd-perf-hud-overlay"', self.html_content)
        self.assertIn('id="rd-stat-rtt"', self.html_content)
        self.assertIn('id="rd-stat-fps"', self.html_content)
        self.assertIn('id="rd-stat-bitrate"', self.html_content)

    def test_mobile_touch_mode_and_soft_keys(self):
        """Package 2: Mobile touch engine (direct vs trackpad) and soft modifier keys."""
        # Functions in ui-controller.js
        self.assertIn("function setRdTouchMode", self.ui_content)
        self.assertIn("function renderVirtualCursor", self.ui_content)
        self.assertIn("let rdTouchMode =", self.ui_content)
        self.assertIn("let virtualCursor =", self.ui_content)
        self.assertIn("let isDirectDragging =", self.ui_content)
        self.assertIn("const latchedModifiers =", self.ui_content)
        self.assertIn("function unlatchAllModifiers", self.ui_content)
        self.assertIn("function initMobileTouchAndSoftKeys", self.ui_content)
        self.assertIn("rdTouchMode === 'trackpad' || document.pointerLockElement === v", self.ui_content)
        self.assertIn("dist <= 25", self.ui_content)
        self.assertIn("trackpadTwoFinger", self.ui_content)
        self.assertIn("initialPinchDistance", self.ui_content)
        self.assertIn("function respondFromAiSupportAgent", self.ui_content)
        self.assertIn("triggerCursorClickAnimation", self.ui_content)
        self.assertIn("directDragPending", self.ui_content)
        self.assertIn("isDoubleTap", self.ui_content)

        # Elements in index.html
        self.assertIn('id="rd-btn-touch-mode"', self.html_content)
        self.assertIn('id="rd-virtual-cursor"', self.html_content)
        self.assertIn('id="rd-btn-soft-keys-toggle"', self.html_content)
        self.assertIn('id="rd-soft-keys-bar"', self.html_content)
        self.assertIn('id="rd-hidden-input"', self.html_content)
        self.assertIn('class="rd-point-cursor"', self.html_content)

    def test_sidebar_live_host_status_ping(self):
        """Package 3: Live host status badges in sidebar and fleet ping mechanism."""
        # Functions in ui-controller.js
        self.assertIn("const hostStatusMap = new Map()", self.ui_content)
        self.assertIn("function updateHostStatusBadge", self.ui_content)
        self.assertIn("async function pingAllRemoteDevices", self.ui_content)
        self.assertIn("signal.type === 'host_pong'", self.ui_content)

        # Elements in index.html
        self.assertIn('id="btn-refresh-remote-status"', self.html_content)

    def test_standard_video_call_does_not_open_rd_window(self):
        """Standard video/audio call must display normal call controls and NOT Remote Desktop mode."""
        # startCall must remove call-overlay--rd and hide rdToolbar
        self.assertIn("dom.callOverlay?.classList.remove('call-overlay--rd')", self.ui_content)
        self.assertIn("hide(dom.rdToolbar)", self.ui_content)

        # acceptIncomingCall must NOT force rdToolbar
        self.assertNotIn("show(dom.rdToolbar);\n    attachRemoteVideoInputListeners();\n    dom.btnEndCall", self.ui_content)

        # onRemoteStream must check isRdStream separately from normal mediaActive calls
        self.assertIn("if (isRdStream) {", self.ui_content)
        self.assertIn("// Standard Call (Audio / Video Call between peers):", self.ui_content)


if __name__ == '__main__':
    unittest.main()


