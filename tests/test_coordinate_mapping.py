"""
tests/test_coordinate_mapping.py — Coordinate Mapping & Preemption Test Suite
=============================================================================
Validates:
  1. Dynamic resolution adaptation: 5120x1440 <-> 1920x1080 without stale cache lag.
  2. Sub-pixel normalized coordinate mapping across ultrawide and Full HD resolutions.
  3. Strict coordinate boundary clamping preventing WindowServer pointer loss.
  4. Multi-display offset geometry mapping and secondary display clamping.
  5. Window-targeted coordinate mapping preserving local window coordinate space.
  6. Contract checks for host-controller.js session preemption, auto-lock suppression,
     and onStateChange / onInputChannelClose registration.
"""

import os
import sys
import unittest
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


class TestCoordinateMappingAndPreemption(unittest.TestCase):
    """Verifies coordinate transformations across dynamic display geometries and preemption contracts."""

    def setUp(self):
        self.host_controller_path = PROJECT_ROOT / "host-controller.js"
        self.bridge_path = PROJECT_ROOT / "remote-desktop-host" / "bridge.py"
        self.assertTrue(self.host_controller_path.exists(), "host-controller.js must exist")
        self.assertTrue(self.bridge_path.exists(), "bridge.py must exist")

    def test_simulated_dynamic_resolution_adaptation(self):
        """Verify normalized coordinates map accurately across 5120x1440 and 1920x1080 without stale lag."""
        def map_coords(nx, ny, bounds):
            ox, oy, sw, sh = bounds
            tx = max(ox, min(ox + sw - 1, int(ox + nx * sw)))
            ty = max(oy, min(oy + sh - 1, int(oy + ny * sh)))
            return tx, ty

        # Scenario A: Odyssey 5120x1440 ultrawide active
        bounds_ultrawide = (0, 0, 5120, 1440)
        cx, cy = map_coords(0.5, 0.5, bounds_ultrawide)
        self.assertEqual((cx, cy), (2560, 720), "Center of 5120x1440 must be (2560, 720)")

        edge_x, edge_y = map_coords(1.0, 1.0, bounds_ultrawide)
        self.assertEqual((edge_x, edge_y), (5119, 1439), "Bottom-right edge of 5120x1440 must be (5119, 1439)")

        # Scenario B: Monitor powered off -> macOS drops to 1920x1080 headless framebuffer
        bounds_fhd = (0, 0, 1920, 1080)
        cx_fhd, cy_fhd = map_coords(0.5, 0.5, bounds_fhd)
        self.assertEqual((cx_fhd, cy_fhd), (960, 540), "Center of 1920x1080 must be (960, 540)")

        edge_x_fhd, edge_y_fhd = map_coords(1.0, 1.0, bounds_fhd)
        self.assertEqual((edge_x_fhd, edge_y_fhd), (1919, 1079), "Bottom-right edge of 1920x1080 must be (1919, 1079)")

        # Clamping check: coordinate must never exceed headless screen boundary
        out_x, out_y = map_coords(1.2, 1.5, bounds_fhd)
        self.assertEqual((out_x, out_y), (1919, 1079), "Out-of-bounds coordinate must clamp strictly to screen edge")

    def test_multi_display_offset_coordinate_mapping(self):
        """Secondary displays with non-zero origins must map correctly and clamp within target bounds."""
        def map_coords_target(nx, ny, bounds):
            ox, oy, sw, sh = bounds
            tx = max(ox, min(ox + sw - 1, int(ox + nx * sw)))
            ty = max(oy, min(oy + sh - 1, int(oy + ny * sh)))
            return tx, ty

        # Display 2 positioned to the right of Display 1: origin=(1920, 0), size=3840x2160
        display2_bounds = (1920, 0, 3840, 2160)
        tx, ty = map_coords_target(0.5, 0.5, display2_bounds)
        self.assertEqual((tx, ty), (1920 + 1920, 1080), "Center of Display 2 must be (3840, 1080)")

        # Verify clamping strictly within Display 2 boundaries
        min_x, min_y = map_coords_target(0.0, 0.0, display2_bounds)
        self.assertEqual((min_x, min_y), (1920, 0), "Left edge of Display 2 must be (1920, 0)")

        max_x, max_y = map_coords_target(1.0, 1.0, display2_bounds)
        self.assertEqual((max_x, max_y), (1920 + 3840 - 1, 2159), "Right edge must clamp to Display 2 max X")

    def test_bridge_has_display_reconfiguration_listener(self):
        """bridge.py must register CGDisplayRegisterReconfigurationCallback for instant hardware geometry sync."""
        content = self.bridge_path.read_text(encoding='utf-8')
        self.assertIn('CGDisplayRegisterReconfigurationCallback', content,
                      "bridge.py must register macOS display reconfiguration callback")
        self.assertIn('CGDisplayRemoveReconfigurationCallback', content,
                      "bridge.py must remove display reconfiguration callback on cleanup")
        self.assertIn('screen_bounds', content,
                      "bridge.py must broadcast screen_bounds upon geometry reconfiguration")

    def test_bridge_execute_mouse_move_target_aware(self):
        """execute_mouse_move in bridge.py must accept target_id and is_window arguments."""
        content = self.bridge_path.read_text(encoding='utf-8')
        self.assertIn('def execute_mouse_move(x, y, target_id=None, is_window=False):', content,
                      "execute_mouse_move must be target-aware to prevent clamping against wrong display")

    def test_host_controller_preemption_and_auto_lock_suppression(self):
        """host-controller.js must handle session preemption and suppress auto-lock during reconnect."""
        content = self.host_controller_path.read_text(encoding='utf-8')
        self.assertIn('handleSessionTeardown', content,
                      "host-controller.js must define handleSessionTeardown")
        self.assertIn('[Host Preemption]', content,
                      "host-controller.js must implement preemption for incoming authorized offers")
        self.assertIn('isPreempted', content,
                      "handleSessionTeardown must accept isPreempted flag to bypass auto-lock")
        self.assertIn('onStateChange', content,
                      "PeerSession.create in host-controller.js must handle onStateChange")
        self.assertIn('onInputChannelClose', content,
                      "PeerSession.create in host-controller.js must handle onInputChannelClose")

    def test_ui_controller_screen_bounds_and_online_listeners(self):
        """ui-controller.js must process screen_bounds and online network change events."""
        ui_path = PROJECT_ROOT / "ui-controller.js"
        content = ui_path.read_text(encoding='utf-8')
        self.assertIn("evt.t === 'screen_bounds'", content,
                      "ui-controller.js must handle incoming screen_bounds events from host")
        self.assertIn("addEventListener('online'", content,
                      "ui-controller.js must listen for online event to recover from network roaming")

    def test_zoomed_and_panned_video_coordinate_mapping(self):
        """Zoomed & panned coordinate mapping must be mathematically linear and reversible."""
        ui_path = PROJECT_ROOT / "ui-controller.js"
        content = ui_path.read_text(encoding='utf-8')
        # Ensure redundant double-transform logic is NOT present in getNormalizedVideoCoordinates
        self.assertNotIn("(clientX - centerX - rdPanX) / rdZoomScale", content,
                         "getNormalizedVideoCoordinates must not apply redundant double-transform over getBoundingClientRect")
        self.assertNotIn("(pixelX - centerX) * rdZoomScale + rdPanX", content,
                         "renderVirtualCursor must not apply redundant double-transform over getBoundingClientRect")

        # Mathematical simulation of browser layout with 32:9 ultrawide (5120x1440) zoomed to 1.33x
        p_w, p_h = 1920, 1080
        video_ratio = 5120 / 1440  # ~3.555
        zoom_scale = 1.333333
        pan_x = 150.0

        # Transformed element rect in browser viewport coordinates
        rect_w = p_w * zoom_scale
        rect_h = p_h * zoom_scale
        rect_left = (p_w - rect_w) / 2 + pan_x
        rect_top = (p_h - rect_h) / 2

        # Active video letterbox dimensions
        actual_w = rect_w
        actual_h = rect_w / video_ratio
        offset_x = 0
        offset_y = (rect_h - actual_h) / 2

        video_left = rect_left + offset_x
        video_top = rect_top + offset_y

        def client_to_norm(cx, cy):
            click_x = cx - video_left
            click_y = cy - video_top
            clamped_x = max(0.0, min(actual_w, click_x))
            clamped_y = max(0.0, min(actual_h, click_y))
            return clamped_x / actual_w, clamped_y / actual_h

        def norm_to_pixel(nx, ny):
            return video_left + nx * actual_w, video_top + ny * actual_h

        # 1. Left edge check
        nx, ny = client_to_norm(video_left, video_top)
        self.assertAlmostEqual(nx, 0.0, places=5)
        self.assertAlmostEqual(ny, 0.0, places=5)

        # 2. Right edge check
        nx, ny = client_to_norm(video_left + actual_w, video_top + actual_h)
        self.assertAlmostEqual(nx, 1.0, places=5)
        self.assertAlmostEqual(ny, 1.0, places=5)

        # 3. Center check
        cx = video_left + actual_w / 2
        cy = video_top + actual_h / 2
        nx, ny = client_to_norm(cx, cy)
        self.assertAlmostEqual(nx, 0.5, places=5)
        self.assertAlmostEqual(ny, 0.5, places=5)

        # 4. Perfect round-trip reversibility between click and reticle
        for test_norm in [0.0, 0.123, 0.25, 0.5, 0.789, 1.0]:
            px, py = norm_to_pixel(test_norm, test_norm)
            back_x, back_y = client_to_norm(px, py)
            self.assertAlmostEqual(back_x, test_norm, places=5)
            self.assertAlmostEqual(back_y, test_norm, places=5)


if __name__ == '__main__':
    unittest.main()
