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
        self.assertIn('caffeinate', self.bridge_content)
        self.assertIn('SetThreadExecutionState', self.bridge_content)

    def test_bridge_native_frame_capturer(self):
        """bridge.py must define NativeFrameCapturer with display and window capture."""
        self.assertIn('class NativeFrameCapturer', self.bridge_content)
        self.assertIn('def capture_display(', self.bridge_content)
        self.assertIn('def capture_window(', self.bridge_content)
        self.assertIn('def enumerate_targets(', self.bridge_content)
        self.assertIn('CGDisplayCreateImage', self.bridge_content)
        self.assertIn('CGWindowListCreateImage', self.bridge_content)
        self.assertIn('CGWindowListCopyWindowInfo', self.bridge_content)
        self.assertIn('CFArrayGetCount', self.bridge_content)
        self.assertIn('CFDictionaryGetValue', self.bridge_content)
        self.assertIn('ImageIO', self.bridge_content)

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


if __name__ == '__main__':
    unittest.main()
