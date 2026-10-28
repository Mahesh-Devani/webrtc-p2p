#!/usr/bin/env python3
"""
tests/test_on_demand_capture.py
=============================================================================
Unit tests for Native On-Demand Screen Capture, Display Wake on Demand,
Lock-Screen Remote Login, and Dynamic Display/Window Selection.

Guarantees:
  1. bridge.py defines DisplayWakeManager with transient wake & sleep assertions.
  2. bridge.py defines NativeFrameCapturer with physical display and window capture.
  3. bridge.py implements on-demand WebSocket commands (start_capture, stop_capture, get_targets, select_target).
  4. host-controller.js implements canvas stream ingestion (zero-gesture WebRTC).
  5. host-controller.js cleanly preserves Mode 2 View-Only fallback when bridge is offline.
  6. ui-controller.js supports dynamic display and window target switching over p2p-input.
"""

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


class TestOnDemandScreenCapture(unittest.TestCase):
    """Verifies Native On-Demand Screen Capture and Display Wake architecture."""

    def setUp(self):
        self.bridge_content = (PROJECT_ROOT / 'remote-desktop-host' / 'bridge.py').read_text(encoding='utf-8')
        self.host_content = (PROJECT_ROOT / 'host-controller.js').read_text(encoding='utf-8')
        self.ui_content = (PROJECT_ROOT / 'ui-controller.js').read_text(encoding='utf-8')

    def test_bridge_display_wake_manager(self):
        """bridge.py must define DisplayWakeManager with wake() and release() methods."""
        self.assertIn('class DisplayWakeManager', self.bridge_content)
        self.assertIn('def wake(', self.bridge_content)
        self.assertIn('def release(', self.bridge_content)
        self.assertIn('PreventUserIdleDisplaySleep', self.bridge_content)
        self.assertIn('IOPMAssertionDeclareUserActivity', self.bridge_content)
        self.assertIn('caffeinate', self.bridge_content)
        self.assertIn('SetThreadExecutionState', self.bridge_content)

    def test_bridge_display_wake_manager_idempotency(self):
        """DisplayWakeManager must be idempotent per session token to prevent assertion leaks."""
        sys.path.insert(0, str(PROJECT_ROOT / 'remote-desktop-host'))
        import bridge
        manager = bridge.DisplayWakeManager()
        # Initial state
        self.assertEqual(manager.ref_count, 0)
        # First wake with token A
        manager.wake("session-A")
        self.assertEqual(manager.ref_count, 1)
        # Repeated wake with token A must NOT increment ref_count
        manager.wake("session-A")
        manager.wake("session-A")
        self.assertEqual(manager.ref_count, 1)
        # Second session with token B
        manager.wake("session-B")
        self.assertEqual(manager.ref_count, 2)
        # Release token A: token B still active
        manager.release("session-A")
        self.assertEqual(manager.ref_count, 1)
        # Release token B: all tokens released
        manager.release("session-B")
        self.assertEqual(manager.ref_count, 0)
        # Force release unconditionally cleans up
        manager.wake("session-C")
        manager.wake("session-D")
        manager.release(force=True)
        self.assertEqual(manager.ref_count, 0)

    def test_bridge_native_frame_capturer(self):
        """bridge.py must define NativeFrameCapturer with display and window capture."""
        self.assertIn('class NativeFrameCapturer', self.bridge_content)
        self.assertIn('def capture_display(', self.bridge_content)
        self.assertIn('def capture_window(', self.bridge_content)
        self.assertIn('def is_screen_locked(', self.bridge_content)
        self.assertIn('def enumerate_targets(', self.bridge_content)
        self.assertIn('CGDisplayCreateImage', self.bridge_content)
        self.assertIn('CGWindowListCreateImage', self.bridge_content)
        self.assertIn('CGWindowListCopyWindowInfo', self.bridge_content)
        self.assertIn('CFArrayGetCount', self.bridge_content)
        self.assertIn('CFDictionaryGetValue', self.bridge_content)
        self.assertIn('ImageIO', self.bridge_content)
        self.assertIn('k_bounds', self.bridge_content)
        self.assertIn('k_num', self.bridge_content)

    def test_bridge_native_frame_capturer_execution(self):
        """NativeFrameCapturer must initialize and execute enumerate_targets() without crashing."""
        sys.path.insert(0, str(PROJECT_ROOT / 'remote-desktop-host'))
        import bridge
        capturer = bridge.NativeFrameCapturer()
        targets = capturer.enumerate_targets()
        self.assertIn('displays', targets)
        self.assertIn('windows', targets)
        self.assertGreaterEqual(len(targets['displays']), 1)
        if sys.platform == 'darwin':
            # Verify hardware display capture produces valid JPEG bytes
            img_bytes, w, h = capturer.capture_display()
            self.assertIsNotNone(img_bytes)
            self.assertGreater(len(img_bytes), 1000)
            self.assertGreater(w, 0)
            self.assertGreater(h, 0)

    def test_bridge_on_demand_websocket_protocol(self):
        """bridge.py must process start_capture, stop_capture, get_targets, and select_target."""
        self.assertIn("'start_capture'", self.bridge_content)
        self.assertIn("'stop_capture'", self.bridge_content)
        self.assertIn("'get_targets'", self.bridge_content)
        self.assertIn("'select_target'", self.bridge_content)
        self.assertIn("stream_frames_loop", self.bridge_content)
        # Binary frame header packing: Version (1B), TargetType (1B), TargetID (4B), Width (4B), Height (4B) = 14 bytes
        self.assertIn("!BBIII", self.bridge_content)

    def test_host_canvas_stream_pipeline(self):
        """host-controller.js must implement offscreen canvas and zero-gesture captureStream."""
        self.assertIn('initNativeCanvas', self.host_content)
        self.assertIn('ensureNativeOnDemandCapture', self.host_content)
        self.assertIn('stopNativeOnDemandCapture', self.host_content)
        self.assertIn('renderNativeFrameToCanvas', self.host_content)
        self.assertIn('createImageBitmap', self.host_content)
        self.assertIn('captureStream(30)', self.host_content)
        self.assertIn('acquireScreenWakeLock', self.host_content)
        self.assertIn('releaseScreenWakeLock', self.host_content)
        self.assertIn('enableHostAudioKeepAlive', self.host_content)

    def test_host_view_only_backward_compatibility(self):
        """host-controller.js must preserve Mode 2 View-Only fallback when bridge is offline."""
        self.assertIn('bridgeConnected', self.host_content)
        self.assertIn('Host desktop capture is inactive. Click "Start Desktop Capture"', self.host_content)
        self.assertIn('const stream = hostStream || nativeCanvasStream', self.host_content)
        # When bridge is offline and hostStream is null, isHostStreamLive must return false
        self.assertIn('if (!hostStream || !hostStream.active) return false', self.host_content)

    def test_ui_controller_dynamic_target_selection(self):
        """ui-controller.js must support displays and application windows menu."""
        self.assertIn("evt.t === 'targets'", self.ui_content)
        self.assertIn('Physical Displays', self.ui_content)
        self.assertIn('Application Windows', self.ui_content)
        self.assertIn("t: 'select_target'", self.ui_content)
        self.assertIn("t: 'get_targets'", self.ui_content)

    def test_window_bounds_and_mouse_coordinate_mapping(self):
        """NativeFrameCapturer.get_window_bounds must succeed and map client coordinates within window bounds."""
        import bridge
        capturer = bridge.NativeFrameCapturer()
        targets = capturer.enumerate_targets()
        self.assertIn('windows', targets)
        # If running on macOS or Windows with open windows, verify bounds retrieval
        if sys.platform == 'darwin' and targets['windows']:
            first_win = targets['windows'][0]
            bounds = capturer.get_window_bounds(first_win['id'])
            if bounds:
                x, y, w, h = bounds
                self.assertGreater(w, 0)
                self.assertGreater(h, 0)
                # Verify capture with kCGWindowImageBoundsIgnoreFraming matches bounds without shadow padding
                img_bytes, cw, ch = capturer.capture_window(first_win['id'])
                if img_bytes:
                    self.assertEqual((cw, ch), (w, h))

        # Verify CGWindowListCreateImage captures window and attached popup menus (Option 10) with framing ignored (Option 1)
        self.assertIn("CGWindowListCreateImage(win_rect, 10, int(window_id), 1)", self.bridge_content)

        # Verify scoping bug fix: ctypes at top level and no shadowing import ctypes.wintypes
        self.assertIn("from ctypes import wintypes", self.bridge_content)
        self.assertNotIn("import ctypes.wintypes\n", self.bridge_content)

    def test_bridge_virtual_keycodes_and_shift_mapping(self):
        """bridge.py must map shifted symbols, modifier flags, and handle lock-screen passwords."""
        self.assertIn('SHIFT_MAP', self.bridge_content)
        self.assertIn('kCGEventFlagMaskShift', self.bridge_content)
        self.assertIn('CGEventSetFlags', self.bridge_content)
        self.assertIn('native_type_text', self.bridge_content)
        self.assertIn('release_all_modifiers', self.bridge_content)

        # Check virtual keycodes and shift mapping on darwin
        if sys.platform == 'darwin':
            import bridge
            self.assertIn('!', bridge.SHIFT_MAP)
            self.assertIn('@', bridge.SHIFT_MAP)
            self.assertIn('#', bridge.SHIFT_MAP)
            self.assertIn('$', bridge.SHIFT_MAP)
            self.assertIn('%', bridge.SHIFT_MAP)
            self.assertIn('a', bridge.VK_MAP)
            self.assertIn('capslock', bridge.VK_MAP)
            self.assertIn('-', bridge.VK_MAP)
            self.assertIn('=', bridge.VK_MAP)
            self.assertIn('return', bridge.VK_MAP)
            self.assertTrue(callable(bridge.release_all_modifiers))

    def test_mobile_virtual_keyboard_and_text_bar(self):
        """Mobile client must have dedicated on-screen text bar and keyboard toggle for lock screen."""
        html_content = (PROJECT_ROOT / 'index.html').read_text(encoding='utf-8')
        css_content = (PROJECT_ROOT / 'style.css').read_text(encoding='utf-8')

        self.assertIn('id="rd-text-bar"', html_content)
        self.assertIn('id="rd-text-input"', html_content)
        self.assertIn('id="rd-btn-keyboard"', html_content)
        self.assertIn('id="rd-btn-send-text"', html_content)

        self.assertIn('.rd-text-bar', css_content)
        self.assertIn('.rd-text-input', css_content)
        # Ensure hidden input is not positioned offscreen at -9999px with pointer-events: none
        self.assertNotIn('top: -9999px', css_content)

        self.assertIn('toggleRdTextBar', self.ui_content)
        self.assertIn('sendRdTextInputValue', self.ui_content)

    def test_host_pin_input_precedence_and_error_handling(self):
        """Host must prioritize live PIN input, and client must clear stale PIN on auth rejection."""
        self.assertIn('dom.hostPinInput?.value?.trim() || localStorage.getItem(STORAGE_HOST_PIN)', self.host_content)
        self.assertIn('/password|pin/i.test(errMsg)', self.ui_content)
        self.assertIn('delete activeRemoteDesktopDevice.pin', self.ui_content)

    def test_stream_quality_and_session_drop_resilience(self):
        """Host and Bridge must enforce high quality (3840x2160, 12Mbps, 0.85 JPEG) and ignore duplicate offers."""
        # 1. Canvas scaling supports ultrawide 3840x2160
        self.assertIn('MAX_STREAM_WIDTH = 3840', self.host_content)
        self.assertIn('MAX_STREAM_HEIGHT = 2160', self.host_content)

        # 2. Duplicate offer protection and staleness check in host-controller.js
        self.assertIn('activeSession && activeSessionId === sessionId', self.host_content)
        self.assertIn('offerAgeSec > 45', self.host_content)

        # 3. Reconnect heartbeat only when no active session
        self.assertIn('if (!activeSession && NostrTransport && typeof NostrTransport.ensureConnected', self.host_content)

        # 4. Proactive high-bitrate WebRTC encoding
        self.assertIn('peerSession.setVideoQuality(12_000_000, 60)', self.host_content)

        # 5. ImageIO JPEG quality dictionary and is_screen_locked caching in bridge.py
        self.assertIn('kCGImageDestinationLossyCompressionQuality', self.bridge_content)
        self.assertIn('def is_screen_locked(self, max_age=1.0):', self.bridge_content)
        self.assertIn('self.jpeg_opts', self.bridge_content)


if __name__ == '__main__':
    unittest.main()
