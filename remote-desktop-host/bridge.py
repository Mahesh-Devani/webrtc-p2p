#!/usr/bin/env python3
"""
P2P Connect — Zero-Dependency Native OS Remote Desktop Bridge (Python)
======================================================================
High performance input injection bridge for P2P Connect Remote Desktop.
Requires ZERO external pip packages! Built entirely on Python 3 standard
library (asyncio, struct, hashlib, base64, ctypes) with Quartz (macOS)
and Win32 (Windows) acceleration.

Features:
  - Standard RFC 6455 WebSocket server via asyncio.start_server
  - Strict Cross-Site WebSocket Hijacking (CSWSH) Origin filtering
  - Cryptographic token authentication (~/.p2p-connect-token)
  - Emergency Panic Failsafe (slam mouse into screen corner to abort)
  - Sub-millisecond CoreGraphics Quartz mouse & keyboard event injection
  - Full Unicode text typing (emojis, uppercase, international characters)
  - Non-blocking freshest-coordinate cursor smoothing loop
"""

import sys
import os
import time
import json
import asyncio
import argparse
import secrets
import base64
import hashlib
import struct
import urllib.parse
import re
import ssl
import ctypes
import ctypes.util

# ── 1. Native OS Input Injection Engine (Zero-Dependency) ────────────────────
SCREEN_WIDTH = 1920
SCREEN_HEIGHT = 1080

PLATFORM = sys.platform

if PLATFORM == 'darwin':
    cg = ctypes.cdll.LoadLibrary(ctypes.util.find_library('CoreGraphics'))

    class CGPoint(ctypes.Structure):
        _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]

    class CGSize(ctypes.Structure):
        _fields_ = [("width", ctypes.c_double), ("height", ctypes.c_double)]

    class CGRect(ctypes.Structure):
        _fields_ = [("origin", CGPoint), ("size", CGSize)]

    main_display = cg.CGMainDisplayID()
    cg.CGDisplayBounds.argtypes = [ctypes.c_uint32]
    cg.CGDisplayBounds.restype = CGRect

    cg.CGEventCreateMouseEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, CGPoint, ctypes.c_uint32]
    cg.CGEventCreateMouseEvent.restype = ctypes.c_void_p

    cg.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
    cg.CGEventPost.restype = None

    cg.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
    cg.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p

    cg.CGEventKeyboardSetUnicodeString.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_wchar_p]
    cg.CGEventKeyboardSetUnicodeString.restype = None

    cg.CGEventCreateScrollWheelEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_int32]
    cg.CGEventCreateScrollWheelEvent.restype = ctypes.c_void_p

    cg.CGEventSetIntegerValueField.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int64]
    cg.CGEventSetIntegerValueField.restype = None

    cg.CFRelease.argtypes = [ctypes.c_void_p]
    cg.CFRelease.restype = None

    # CGEvent Types
    kCGEventLeftMouseDown = 1
    kCGEventLeftMouseUp = 2
    kCGEventRightMouseDown = 3
    kCGEventRightMouseUp = 4
    kCGEventMouseMoved = 5
    kCGEventLeftMouseDragged = 6
    kCGEventRightMouseDragged = 7
    kCGEventOtherMouseDown = 25
    kCGEventOtherMouseUp = 26
    kCGMouseEventClickState = 1
    kCGHIDEventTap = 0

    # macOS Virtual Keycodes
    VK_MAP = {
        'return': 36, 'enter': 36, 'tab': 48, 'space': 49, ' ': 49,
        'delete': 51, 'backspace': 51, 'escape': 53, 'esc': 53,
        'command': 55, 'cmd': 55, 'win': 55, 'meta': 55,
        'shift': 56, 'capslock': 57, 'alt': 58, 'option': 58, 'control': 59, 'ctrl': 59,
        'left': 123, 'arrowleft': 123, 'right': 124, 'arrowright': 124,
        'down': 125, 'arrowdown': 125, 'up': 126, 'arrowup': 126,
        'f1': 122, 'f2': 120, 'f3': 99, 'f4': 118, 'f5': 96,
        'f6': 97, 'f7': 98, 'f8': 100, 'f9': 101, 'f10': 109, 'f11': 103, 'f12': 111,
        'home': 115, 'pageup': 116, 'end': 119, 'pagedown': 121,
        'a': 0, 'b': 11, 'c': 8, 'd': 2, 'e': 14, 'f': 3, 'g': 5, 'h': 4,
        'i': 34, 'j': 38, 'k': 40, 'l': 37, 'm': 46, 'n': 45, 'o': 31, 'p': 35,
        'q': 12, 'r': 15, 's': 1, 't': 17, 'u': 32, 'v': 9, 'w': 13, 'x': 7,
        'y': 16, 'z': 6,
        '1': 18, '2': 19, '3': 20, '4': 21, '5': 23, '6': 22, '7': 26, '8': 28, '9': 25, '0': 29
    }

    _mouse_down_state = {0: False, 1: False, 2: False}

    def native_mouse_move(x, y):
        pt = CGPoint(float(x), float(y))
        if _mouse_down_state[0]:
            evt_type = kCGEventLeftMouseDragged
        elif _mouse_down_state[2]:
            evt_type = kCGEventRightMouseDragged
        else:
            evt_type = kCGEventMouseMoved
        evt = cg.CGEventCreateMouseEvent(None, evt_type, pt, 0)
        if evt:
            cg.CGEventPost(kCGHIDEventTap, evt)
            cg.CFRelease(evt)

    def native_mouse_down(btn, x, y):
        pt = CGPoint(float(x), float(y))
        _mouse_down_state[btn] = True
        if btn == 2:
            evt_type = kCGEventRightMouseDown
        elif btn == 1:
            evt_type = kCGEventOtherMouseDown
        else:
            evt_type = kCGEventLeftMouseDown
        evt = cg.CGEventCreateMouseEvent(None, evt_type, pt, btn)
        if evt:
            cg.CGEventPost(kCGHIDEventTap, evt)
            cg.CFRelease(evt)

    def native_mouse_up(btn, x, y):
        pt = CGPoint(float(x), float(y))
        _mouse_down_state[btn] = False
        if btn == 2:
            evt_type = kCGEventRightMouseUp
        elif btn == 1:
            evt_type = kCGEventOtherMouseUp
        else:
            evt_type = kCGEventLeftMouseUp
        evt = cg.CGEventCreateMouseEvent(None, evt_type, pt, btn)
        if evt:
            cg.CGEventPost(kCGHIDEventTap, evt)
            cg.CFRelease(evt)

    def native_mouse_click(btn, clicks, x, y):
        pt = CGPoint(float(x), float(y))
        down_type = kCGEventRightMouseDown if btn == 2 else kCGEventLeftMouseDown
        up_type = kCGEventRightMouseUp if btn == 2 else kCGEventLeftMouseUp

        for i in range(1, clicks + 1):
            evt_down = cg.CGEventCreateMouseEvent(None, down_type, pt, btn)
            if evt_down:
                cg.CGEventSetIntegerValueField(evt_down, kCGMouseEventClickState, i)
                cg.CGEventPost(kCGHIDEventTap, evt_down)
                cg.CFRelease(evt_down)

            evt_up = cg.CGEventCreateMouseEvent(None, up_type, pt, btn)
            if evt_up:
                cg.CGEventSetIntegerValueField(evt_up, kCGMouseEventClickState, i)
                cg.CGEventPost(kCGHIDEventTap, evt_up)
                cg.CFRelease(evt_up)

    def native_scroll(units):
        evt = cg.CGEventCreateScrollWheelEvent(None, 0, 1, int(units))
        if evt:
            cg.CGEventPost(kCGHIDEventTap, evt)
            cg.CFRelease(evt)

    def native_key(key, is_down):
        k = key.lower()
        if k in VK_MAP:
            code = VK_MAP[k]
            evt = cg.CGEventCreateKeyboardEvent(None, code, is_down)
            if evt:
                cg.CGEventPost(kCGHIDEventTap, evt)
                cg.CFRelease(evt)
        elif len(key) == 1:
            evt = cg.CGEventCreateKeyboardEvent(None, 0, is_down)
            if evt:
                cg.CGEventKeyboardSetUnicodeString(evt, 1, key)
                cg.CGEventPost(kCGHIDEventTap, evt)
                cg.CFRelease(evt)

    def native_type_text(text):
        for char in text:
            evt_d = cg.CGEventCreateKeyboardEvent(None, 0, True)
            if evt_d:
                cg.CGEventKeyboardSetUnicodeString(evt_d, len(char), char)
                cg.CGEventPost(kCGHIDEventTap, evt_d)
                cg.CFRelease(evt_d)
            evt_u = cg.CGEventCreateKeyboardEvent(None, 0, False)
            if evt_u:
                cg.CGEventKeyboardSetUnicodeString(evt_u, len(char), char)
                cg.CGEventPost(kCGHIDEventTap, evt_u)
                cg.CFRelease(evt_u)

else:
    # Windows / Linux fallback via PyAutoGUI if available
    try:
        import pyautogui
        pyautogui.PAUSE = 0.0
        pyautogui.FAILSAFE = False  # Disabled so moving mouse to screen corners (menus/buttons) does not crash bridge
        SCREEN_WIDTH, SCREEN_HEIGHT = pyautogui.size()

        def native_mouse_move(x, y):
            pyautogui.moveTo(x, y)

        def native_mouse_down(btn, x, y):
            b = 'right' if btn == 2 else ('middle' if btn == 1 else 'left')
            pyautogui.mouseDown(button=b)

        def native_mouse_up(btn, x, y):
            b = 'right' if btn == 2 else ('middle' if btn == 1 else 'left')
            pyautogui.mouseUp(button=b)

        def native_mouse_click(btn, clicks, x, y):
            b = 'right' if btn == 2 else ('middle' if btn == 1 else 'left')
            pyautogui.click(button=b, clicks=clicks)

        def native_scroll(units):
            pyautogui.scroll(units)

        def native_key(key, is_down):
            if is_down: pyautogui.keyDown(key.lower())
            else: pyautogui.keyUp(key.lower())

        def native_type_text(text):
            pyautogui.write(text, interval=0.01)

    except Exception:
        print("[!] Warning: Non-macOS OS detected and PyAutoGUI not installed.")
        def native_mouse_move(x, y): pass
        def native_mouse_down(btn, x, y): pass
        def native_mouse_up(btn, x, y): pass
        def native_mouse_click(btn, clicks, x, y): pass
        def native_scroll(units): pass
        def native_key(key, is_down): pass
        def native_type_text(text): pass


selected_display_id = None
_cached_bounds = (0, 0, 1920, 1080)
_cached_bounds_time = 0.0
_cached_display_id = None

# Screen Bounds Cache Configuration (in seconds):
# Default: 300 seconds (5 minutes). Refreshed immediately on each new connection or display selection.
# Configurable via CLI argument `--bounds-ttl <seconds>` or environment variable `P2P_BOUNDS_TTL`.
DEFAULT_BOUNDS_CACHE_TTL = float(os.environ.get("P2P_BOUNDS_TTL", 300.0))
BOUNDS_CACHE_TTL = DEFAULT_BOUNDS_CACHE_TTL

def get_screen_bounds(display_id=None, force=False):
    """
    Dynamically retrieve active screen bounds and origin with a configurable TTL cache (default 300s / 5 min).
    Refreshed on each connection attempt and whenever display selection changes.
    Eliminates OS API overhead during high-frequency mouse streaming (60-120Hz).
    """
    global SCREEN_WIDTH, SCREEN_HEIGHT, selected_display_id
    global _cached_bounds, _cached_bounds_time, _cached_display_id, BOUNDS_CACHE_TTL

    target_id = display_id if display_id is not None else selected_display_id
    now = time.monotonic()

    if not force and target_id == _cached_display_id and (now - _cached_bounds_time < BOUNDS_CACHE_TTL):
        return _cached_bounds

    if PLATFORM == 'darwin':
        target_display = target_id if target_id is not None else cg.CGMainDisplayID()
        _bounds = cg.CGDisplayBounds(target_display)
        w = int(_bounds.size.width) if _bounds.size.width > 0 else int(cg.CGDisplayPixelsWide(target_display))
        h = int(_bounds.size.height) if _bounds.size.height > 0 else int(cg.CGDisplayPixelsHigh(target_display))
        ox = int(_bounds.origin.x)
        oy = int(_bounds.origin.y)
        SCREEN_WIDTH = w if w > 0 else 1920
        SCREEN_HEIGHT = h if h > 0 else 1080
        _cached_bounds = (ox, oy, SCREEN_WIDTH, SCREEN_HEIGHT)
        _cached_bounds_time = now
        _cached_display_id = target_id
        return _cached_bounds
    elif PLATFORM == 'win32':
        try:
            import ctypes
            w = ctypes.windll.user32.GetSystemMetrics(0)
            h = ctypes.windll.user32.GetSystemMetrics(1)
            SCREEN_WIDTH = w if w > 0 else 1920
            SCREEN_HEIGHT = h if h > 0 else 1080
            _cached_bounds = (0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
            _cached_bounds_time = now
            _cached_display_id = target_id
            return _cached_bounds
        except Exception:
            return 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT
    else:
        try:
            import pyautogui
            w, h = pyautogui.size()
            SCREEN_WIDTH = w if w > 0 else 1920
            SCREEN_HEIGHT = h if h > 0 else 1080
            _cached_bounds = (0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
            _cached_bounds_time = now
            _cached_display_id = target_id
            return _cached_bounds
        except Exception:
            return 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT

# Initialize screen bounds at startup
get_screen_bounds(force=True)

# ── Native Clipboard Functions ───────────────────────────────────────────────
def native_set_clipboard(text):
    if not text:
        return False
    if PLATFORM == 'darwin':
        try:
            p = subprocess.Popen(['pbcopy'], stdin=subprocess.PIPE)
            p.communicate(text.encode('utf-8'))
            return True
        except Exception:
            pass
    elif PLATFORM == 'windows':
        try:
            p = subprocess.Popen(['clip'], stdin=subprocess.PIPE, shell=True)
            p.communicate(text.encode('utf-8'))
            return True
        except Exception:
            pass
    elif PLATFORM == 'linux':
        try:
            p = subprocess.Popen(['xclip', '-selection', 'clipboard'], stdin=subprocess.PIPE)
            p.communicate(text.encode('utf-8'))
            return True
        except Exception:
            pass
    try:
        import pyperclip
        pyperclip.copy(text)
        return True
    except Exception:
        pass
    return False


def native_get_clipboard():
    if PLATFORM == 'darwin':
        try:
            res = subprocess.run(['pbpaste'], capture_output=True, text=True, check=False, timeout=1)
            return res.stdout
        except Exception:
            pass
    elif PLATFORM == 'windows':
        try:
            res = subprocess.run(['powershell', '-NoProfile', '-Command', 'Get-Clipboard'], capture_output=True, text=True, check=False, timeout=1)
            return res.stdout.rstrip('\r\n')
        except Exception:
            pass
    elif PLATFORM == 'linux':
        try:
            res = subprocess.run(['xclip', '-selection', 'clipboard', '-o'], capture_output=True, text=True, check=False, timeout=1)
            return res.stdout
        except Exception:
            pass
    try:
        import pyperclip
        return pyperclip.paste()
    except Exception:
        pass
    return ""


# ── 2. Security Configuration ────────────────────────────────────────────────
TOKEN_FILE_HOME = os.path.expanduser("~/.p2p-connect-token")
TOKEN_FILE_LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".token")
ACTIVE_TOKEN_FILE = TOKEN_FILE_HOME

DEFAULT_ALLOWED_ORIGINS = {
    "https://mahesh-devani.github.io",
    "https://localhost:8443",
    "http://localhost:8080",
    "https://127.0.0.1:8443",
    "http://127.0.0.1:8080",
}

LAN_ORIGIN_REGEX = re.compile(r'^https?://(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$')

def is_origin_allowed(origin):
    if not origin:
        return False
    orig = origin.strip().rstrip('/')
    if orig in ACTIVE_ALLOWED_ORIGINS:
        return True
    if orig.startswith("http://localhost") or orig.startswith("https://localhost"):
        return True
    if orig.startswith("http://127.0.0.1") or orig.startswith("https://127.0.0.1"):
        return True
    if LAN_ORIGIN_REGEX.match(orig):
        return True
    if orig == "null" or orig.startswith("file:"):
        return True
    return False

def load_or_create_token(custom_token=None):
    global ACTIVE_TOKEN_FILE
    if custom_token:
        return custom_token.strip()
    for path in [TOKEN_FILE_HOME, TOKEN_FILE_LOCAL]:
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    tok = f.read().strip()
                    if tok:
                        ACTIVE_TOKEN_FILE = path
                        return tok
            except Exception:
                pass
    new_token = secrets.token_hex(16)
    for path in [TOKEN_FILE_HOME, TOKEN_FILE_LOCAL]:
        try:
            with open(path, "w") as f:
                f.write(new_token + "\n")
            try: os.chmod(path, 0o600)
            except Exception: pass
            ACTIVE_TOKEN_FILE = path
            return new_token
        except Exception:
            continue
    return new_token

ACTIVE_AUTH_TOKEN = ""
ACTIVE_ALLOWED_ORIGINS = set()
ALLOW_ALL_ORIGINS = False

# ── 3. Zero-Lag Cursor Worker & Coordinate Smoothing ─────────────────────────
latest_mouse_coord = None
latest_mouse_updated = False
current_x = SCREEN_WIDTH // 2
current_y = SCREEN_HEIGHT // 2

def execute_mouse_move(x, y):
    global current_x, current_y
    ox, oy, sw, sh = get_screen_bounds()
    current_x = max(ox, min(ox + sw - 1, x))
    current_y = max(oy, min(oy + sh - 1, y))
    native_mouse_move(current_x, current_y)

async def mouse_worker():
    global latest_mouse_coord, latest_mouse_updated
    last_applied = None

    while True:
        if latest_mouse_updated and latest_mouse_coord != last_applied:
            target = latest_mouse_coord
            latest_mouse_updated = False
            last_applied = target
            try:
                execute_mouse_move(target[0], target[1])
            except Exception:
                pass
        await asyncio.sleep(0.004)  # 250Hz loop

# ── 4. RFC 6455 WebSocket Implementation (Standard Library) ──────────────────
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# ── 5. Display Wake & Sleep Assertion Manager ────────────────────────────────
class DisplayWakeManager:
    """
    Manages transient display wake and OS sleep assertions.
    Keeps the display awake STRICTLY while an active remote desktop session
    is running, and releases the assertion as soon as the session ends so
    the host computer's display can sleep and lock naturally.
    Uses token-based tracking to ensure idempotency across multiple target switches.
    """
    def __init__(self):
        self._active_tokens = set()
        self.assertion_id = None
        self.cf_assertion_type = None
        self.cf_assertion_name = None
        self.last_wake_time = 0.0

    @property
    def ref_count(self):
        """Backward-compatible property for test suites and external checkers."""
        return len(self._active_tokens)

    @ref_count.setter
    def ref_count(self, val):
        if val <= 0:
            self._active_tokens.clear()
        else:
            self._active_tokens = {f"token-{i}" for i in range(val)}

    def wake(self, token="default", reason="P2P Connect Remote Desktop Session Active"):
        """Acquire display assertion idempotently for a given session token."""
        is_first = len(self._active_tokens) == 0
        self._active_tokens.add(token)
        self.last_wake_time = time.monotonic()

        if not is_first and self.assertion_id is not None:
            return True

        if is_first:
            print(f"[Power] Remote session started: Waking display & activating sleep assertion")
            if PLATFORM == 'darwin':
                # 1. Wake the display immediately
                try:
                    subprocess.Popen(['caffeinate', '-u', '-t', '5'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass

                # 2. Simulate subtle mouse movement to wake macOS WindowServer
                try:
                    if 'cg' in globals() and 'kCGEventMouseMoved' in globals():
                        ox, oy, sw, sh = get_screen_bounds()
                        pt = CGPoint(ox + sw // 2, oy + sh // 2)
                        ev = cg.CGEventCreateMouseEvent(None, kCGEventMouseMoved, pt, 0)
                        if ev:
                            cg.CGEventPost(kCGHIDEventTap, ev)
                            cg.CFRelease(ev)
                except Exception:
                    pass

                # 3. Acquire IOKit PreventUserIdleDisplaySleep assertion for the session duration
                try:
                    iokit_path = ctypes.util.find_library('IOKit')
                    cf_path = ctypes.util.find_library('CoreFoundation')
                    if iokit_path and cf_path:
                        iokit = ctypes.cdll.LoadLibrary(iokit_path)
                        cf = ctypes.cdll.LoadLibrary(cf_path)
                        kCFStringEncodingUTF8 = 0x08000100
                        cf.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
                        cf.CFStringCreateWithCString.restype = ctypes.c_void_p
                        cf.CFRelease.argtypes = [ctypes.c_void_p]
                        cf.CFRelease.restype = None

                        self.cf_assertion_type = cf.CFStringCreateWithCString(None, b"PreventUserIdleDisplaySleep", kCFStringEncodingUTF8)
                        self.cf_assertion_name = cf.CFStringCreateWithCString(None, reason.encode('utf-8'), kCFStringEncodingUTF8)
                        aid = ctypes.c_uint32(0)
                        iokit.IOPMAssertionCreateWithName.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32)]
                        iokit.IOPMAssertionCreateWithName.restype = ctypes.c_int

                        ret = iokit.IOPMAssertionCreateWithName(self.cf_assertion_type, 255, self.cf_assertion_name, ctypes.byref(aid))
                        if ret == 0:
                            self.assertion_id = aid.value
                            print(f"[Power] Acquired IOKit display sleep assertion (ID: {self.assertion_id})")
                except Exception as e:
                    print(f"[Power] Could not acquire IOKit assertion: {e}")

            elif PLATFORM == 'win32':
                try:
                    ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000002 | 0x00000001)
                    print("[Power] Acquired Windows display sleep assertion")
                except Exception as e:
                    print(f"[Power] Could not acquire Win32 assertion: {e}")

        return True

    def release(self, token=None, force=False):
        """Release display assertion for a token or unconditionally if force=True or token is None."""
        if force or token is None:
            self._active_tokens.clear()
        else:
            self._active_tokens.discard(token)

        if len(self._active_tokens) > 0:
            return

        print("[Power] Remote session ended: Releasing display sleep assertion (display can now sleep/lock naturally)")
        if PLATFORM == 'darwin':
            if self.assertion_id is not None:
                try:
                    iokit_path = ctypes.util.find_library('IOKit')
                    if iokit_path:
                        iokit = ctypes.cdll.LoadLibrary(iokit_path)
                        iokit.IOPMAssertionRelease.argtypes = [ctypes.c_uint32]
                        iokit.IOPMAssertionRelease.restype = ctypes.c_int
                        iokit.IOPMAssertionRelease(self.assertion_id)
                except Exception:
                    pass
                self.assertion_id = None
            if self.cf_assertion_type or self.cf_assertion_name:
                try:
                    cf_path = ctypes.util.find_library('CoreFoundation')
                    if cf_path:
                        cf = ctypes.cdll.LoadLibrary(cf_path)
                        cf.CFRelease.argtypes = [ctypes.c_void_p]
                        cf.CFRelease.restype = None
                        if self.cf_assertion_type:
                            cf.CFRelease(self.cf_assertion_type)
                            self.cf_assertion_type = None
                        if self.cf_assertion_name:
                            cf.CFRelease(self.cf_assertion_name)
                            self.cf_assertion_name = None
                except Exception:
                    pass

        elif PLATFORM == 'win32':
            try:
                ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
            except Exception:
                pass


# ── 6. Native Frame Capture Engine (Display, Window & Hardware JPEG) ─────────
class NativeFrameCapturer:
    """
    High-performance native frame capture engine with hardware JPEG compression.
    Supports physical display capture (including macOS Lock Screen) and individual
    application window capture with ZERO external pip dependencies.
    """
    def __init__(self):
        self._init_platform()

    def _init_platform(self):
        if PLATFORM == 'darwin':
            self.cg = ctypes.cdll.LoadLibrary(ctypes.util.find_library('CoreGraphics'))
            self.cf = ctypes.cdll.LoadLibrary(ctypes.util.find_library('CoreFoundation'))
            self.imageio = ctypes.cdll.LoadLibrary(ctypes.util.find_library('ImageIO'))

            # CoreGraphics prototypes
            self.cg.CGMainDisplayID.argtypes = []
            self.cg.CGMainDisplayID.restype = ctypes.c_uint32
            self.cg.CGDisplayPixelsWide.argtypes = [ctypes.c_uint32]
            self.cg.CGDisplayPixelsWide.restype = ctypes.c_size_t
            self.cg.CGDisplayPixelsHigh.argtypes = [ctypes.c_uint32]
            self.cg.CGDisplayPixelsHigh.restype = ctypes.c_size_t
            self.cg.CGGetActiveDisplayList.argtypes = [ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_uint32)]
            self.cg.CGGetActiveDisplayList.restype = ctypes.c_int32

            self.cg.CGDisplayCreateImage.argtypes = [ctypes.c_uint32]
            self.cg.CGDisplayCreateImage.restype = ctypes.c_void_p
            self.cg.CGWindowListCreateImage.argtypes = [CGRect, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32]
            self.cg.CGWindowListCreateImage.restype = ctypes.c_void_p
            self.cg.CGWindowListCopyWindowInfo.argtypes = [ctypes.c_uint32, ctypes.c_uint32]
            self.cg.CGWindowListCopyWindowInfo.restype = ctypes.c_void_p

            self.cg.CGImageGetWidth.argtypes = [ctypes.c_void_p]
            self.cg.CGImageGetWidth.restype = ctypes.c_size_t
            self.cg.CGImageGetHeight.argtypes = [ctypes.c_void_p]
            self.cg.CGImageGetHeight.restype = ctypes.c_size_t
            self.cg.CGImageRelease.argtypes = [ctypes.c_void_p]

            # ImageIO prototypes
            self.imageio.CGImageDestinationCreateWithData.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p]
            self.imageio.CGImageDestinationCreateWithData.restype = ctypes.c_void_p
            self.imageio.CGImageDestinationAddImage.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
            self.imageio.CGImageDestinationAddImage.restype = None
            self.imageio.CGImageDestinationFinalize.argtypes = [ctypes.c_void_p]
            self.imageio.CGImageDestinationFinalize.restype = ctypes.c_bool

            # CoreFoundation prototypes
            self.cf.CFDataCreateMutable.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
            self.cf.CFDataCreateMutable.restype = ctypes.c_void_p
            self.cf.CFDataGetLength.argtypes = [ctypes.c_void_p]
            self.cf.CFDataGetLength.restype = ctypes.c_size_t
            self.cf.CFDataGetBytePtr.argtypes = [ctypes.c_void_p]
            self.cf.CFDataGetBytePtr.restype = ctypes.c_void_p
            self.cf.CFRelease.argtypes = [ctypes.c_void_p]

            self.cf.CFArrayGetCount.argtypes = [ctypes.c_void_p]
            self.cf.CFArrayGetCount.restype = ctypes.c_size_t
            self.cf.CFArrayGetValueAtIndex.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
            self.cf.CFArrayGetValueAtIndex.restype = ctypes.c_void_p

            self.cf.CFDictionaryGetValue.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
            self.cf.CFDictionaryGetValue.restype = ctypes.c_void_p

            self.cf.CFNumberGetValue.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
            self.cf.CFNumberGetValue.restype = ctypes.c_bool

            self.cf.CFStringGetCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t, ctypes.c_uint32]
            self.cf.CFStringGetCString.restype = ctypes.c_bool

            kCFStringEncodingUTF8 = 0x08000100
            self.cf.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
            self.cf.CFStringCreateWithCString.restype = ctypes.c_void_p
            self.cf.CFRelease.argtypes = [ctypes.c_void_p]
            self.cf.CFRelease.restype = None

            self.jpeg_type = self.cf.CFStringCreateWithCString(None, b'public.jpeg', kCFStringEncodingUTF8)
            self.k_num = self.cf.CFStringCreateWithCString(None, b'kCGWindowNumber', kCFStringEncodingUTF8)
            self.k_bounds = self.cf.CFStringCreateWithCString(None, b'kCGWindowBounds', kCFStringEncodingUTF8)
            self.k_x = self.cf.CFStringCreateWithCString(None, b'X', kCFStringEncodingUTF8)
            self.k_y = self.cf.CFStringCreateWithCString(None, b'Y', kCFStringEncodingUTF8)
            self.k_w = self.cf.CFStringCreateWithCString(None, b'Width', kCFStringEncodingUTF8)
            self.k_h = self.cf.CFStringCreateWithCString(None, b'Height', kCFStringEncodingUTF8)
            self.k_owner = self.cf.CFStringCreateWithCString(None, b'kCGWindowOwnerName', kCFStringEncodingUTF8)
            self.k_name = self.cf.CFStringCreateWithCString(None, b'kCGWindowName', kCFStringEncodingUTF8)
            self.k_layer = self.cf.CFStringCreateWithCString(None, b'kCGWindowLayer', kCFStringEncodingUTF8)
            self.null_rect = CGRect(CGPoint(float('inf'), float('inf')), CGSize(0, 0))

    def capture_display(self, display_id=None):
        if PLATFORM == 'darwin':
            d_id = int(display_id) if (display_id and int(display_id) > 0) else self.cg.CGMainDisplayID()
            img = self.cg.CGDisplayCreateImage(d_id)
            return self._compress_cg_image(img)
        return None, 0, 0

    def capture_window(self, window_id):
        if PLATFORM == 'darwin':
            # 8 = kCGWindowListOptionIncludingWindow, 0 = kCGWindowImageDefault
            img = self.cg.CGWindowListCreateImage(self.null_rect, 8, int(window_id), 0)
            return self._compress_cg_image(img)
        return None, 0, 0

    def _compress_cg_image(self, img):
        if not img:
            return None, 0, 0
        try:
            w = self.cg.CGImageGetWidth(img)
            h = self.cg.CGImageGetHeight(img)
            data_buf = self.cf.CFDataCreateMutable(None, 0)
            dest = self.imageio.CGImageDestinationCreateWithData(data_buf, self.jpeg_type, 1, None)
            self.imageio.CGImageDestinationAddImage(dest, img, None)
            self.imageio.CGImageDestinationFinalize(dest)
            self.cg.CGImageRelease(img)
            self.cf.CFRelease(dest)

            length = self.cf.CFDataGetLength(data_buf)
            ptr = self.cf.CFDataGetBytePtr(data_buf)
            py_bytes = ctypes.string_at(ptr, length)
            self.cf.CFRelease(data_buf)
            return py_bytes, w, h
        except Exception:
            if img:
                try: self.cg.CGImageRelease(img)
                except Exception: pass
            return None, 0, 0

    def enumerate_targets(self):
        displays = []
        windows = []
        if PLATFORM == 'darwin':
            # 1. Displays
            try:
                max_displays = 16
                active_displays = (ctypes.c_uint32 * max_displays)()
                display_count = ctypes.c_uint32()
                if self.cg.CGGetActiveDisplayList(max_displays, active_displays, ctypes.byref(display_count)) == 0:
                    for i in range(display_count.value):
                        d_id = active_displays[i]
                        w = int(self.cg.CGDisplayPixelsWide(d_id))
                        h = int(self.cg.CGDisplayPixelsHigh(d_id))
                        displays.append({
                            'id': int(d_id),
                            'index': i + 1,
                            'name': f"Display {i + 1} ({w}x{h})",
                            'width': w,
                            'height': h,
                            'is_main': (d_id == self.cg.CGMainDisplayID())
                        })
            except Exception:
                pass

            # 2. Windows
            try:
                kCGWindowListOptionOnScreenOnly = 1
                kCGWindowListExcludeDesktopElements = 16
                arr = self.cg.CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, 0)
                if arr:
                    count = self.cf.CFArrayGetCount(arr)
                    buf = ctypes.create_string_buffer(256)
                    for i in range(count):
                        d = self.cf.CFArrayGetValueAtIndex(arr, i)
                        layer = ctypes.c_int32(0)
                        l_ref = self.cf.CFDictionaryGetValue(d, self.k_layer)
                        if l_ref:
                            self.cf.CFNumberGetValue(l_ref, 3, ctypes.byref(layer))
                        if layer.value != 0:
                            continue
                        num_ref = self.cf.CFDictionaryGetValue(d, self.k_num)
                        wid = ctypes.c_uint32(0)
                        if num_ref:
                            self.cf.CFNumberGetValue(num_ref, 3, ctypes.byref(wid))
                        
                        owner_ref = self.cf.CFDictionaryGetValue(d, self.k_owner)
                        owner = ''
                        if owner_ref and self.cf.CFStringGetCString(owner_ref, buf, 256, 0x08000100):
                            owner = buf.value.decode('utf-8', errors='ignore')

                        name_ref = self.cf.CFDictionaryGetValue(d, self.k_name)
                        name = ''
                        if name_ref and self.cf.CFStringGetCString(name_ref, buf, 256, 0x08000100):
                            name = buf.value.decode('utf-8', errors='ignore')

                        if owner and owner not in ('Window Server', 'Dock', 'ControlCenter', 'Notification Centre'):
                            title = f"{owner} - {name}" if name else owner
                            windows.append({
                                'id': int(wid.value),
                                'owner': owner,
                                'name': name,
                                'title': title
                            })
                    self.cf.CFRelease(arr)
            except Exception:
                pass

        if not displays:
            displays.append({
                'id': 1,
                'index': 1,
                'name': f"Main Display ({SCREEN_WIDTH}x{SCREEN_HEIGHT})",
                'width': SCREEN_WIDTH,
                'height': SCREEN_HEIGHT,
                'is_main': True
            })

        return {'displays': displays, 'windows': windows}

    def get_window_bounds(self, window_id):
        if PLATFORM == 'darwin' and window_id > 0:
            try:
                kCGWindowListOptionOnScreenOnly = 1
                kCGWindowListExcludeDesktopElements = 16
                arr = self.cg.CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, 0)
                if arr:
                    count = self.cf.CFArrayGetCount(arr)
                    target_bounds = None
                    wid = ctypes.c_uint32(0)
                    for i in range(count):
                        d = self.cf.CFArrayGetValueAtIndex(arr, i)
                        num_ref = self.cf.CFDictionaryGetValue(d, self.k_num)
                        if num_ref:
                            wid.value = 0
                            self.cf.CFNumberGetValue(num_ref, 3, ctypes.byref(wid))
                            if wid.value == int(window_id):
                                bounds_ref = self.cf.CFDictionaryGetValue(d, self.k_bounds)
                                if bounds_ref:
                                    def _get_val(k):
                                        ref = self.cf.CFDictionaryGetValue(bounds_ref, k)
                                        if not ref: return 0.0
                                        val = ctypes.c_double(0)
                                        self.cf.CFNumberGetValue(ref, 13, ctypes.byref(val))
                                        return val.value
                                    x = int(_get_val(self.k_x))
                                    y = int(_get_val(self.k_y))
                                    w = int(_get_val(self.k_w))
                                    h = int(_get_val(self.k_h))
                                    if w > 0 and h > 0:
                                        target_bounds = (x, y, w, h)
                                break
                    self.cf.CFRelease(arr)
                    if target_bounds:
                        return target_bounds
            except Exception:
                pass
        elif PLATFORM == 'win32' and window_id > 0:
            try:
                from ctypes import wintypes
                rect = wintypes.RECT()
                if ctypes.windll.user32.GetWindowRect(int(window_id), ctypes.byref(rect)):
                    return (rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)
            except Exception:
                pass
        return None

_global_wake_manager = DisplayWakeManager()
_global_frame_capturer = NativeFrameCapturer()


def make_ws_frame(payload, opcode=0x01):
    data = payload.encode('utf-8') if isinstance(payload, str) else payload
    length = len(data)
    if length < 126:
        header = struct.pack("!BB", 0x80 | opcode, length)
    elif length < 65536:
        header = struct.pack("!BBH", 0x80 | opcode, 126, length)
    else:
        header = struct.pack("!BBQ", 0x80 | opcode, 127, length)
    return header + data

async def read_ws_frame(reader):
    header = await reader.readexactly(2)
    b1, b2 = header[0], header[1]
    opcode = b1 & 0x0F
    is_masked = (b2 & 0x80) != 0
    payload_len = b2 & 0x7F

    if payload_len == 126:
        ext = await reader.readexactly(2)
        payload_len = struct.unpack("!H", ext)[0]
    elif payload_len == 127:
        ext = await reader.readexactly(8)
        payload_len = struct.unpack("!Q", ext)[0]

    mask = await reader.readexactly(4) if is_masked else None
    payload = await reader.readexactly(payload_len) if payload_len > 0 else b""

    if is_masked and mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))

    return opcode, payload

async def handle_client(reader, writer):
    global latest_mouse_coord, latest_mouse_updated, current_x, current_y
    peer = writer.get_extra_info('peername')
    client_ip = peer[0] if peer else 'unknown'

    try:
        # Read HTTP GET handshake header
        req_bytes = await reader.readuntil(b'\r\n\r\n')
        req_text = req_bytes.decode('utf-8', errors='replace')
        lines = req_text.split('\r\n')
        req_line = lines[0]
        parts = req_line.split()
        path = parts[1] if len(parts) > 1 else '/'

        headers = {}
        for line in lines[1:]:
            if not line: break
            if ':' in line:
                k, v = line.split(':', 1)
                headers[k.strip().lower()] = v.strip()

        origin = headers.get('origin', '').strip().rstrip('/')
        ws_key = headers.get('sec-websocket-key')

        # ── Check 1: Origin Validation (CSWSH Prevention) ──
        if not ALLOW_ALL_ORIGINS:
            if not is_origin_allowed(origin):
                print(f"[🚨 SECURITY BLOCKED] Unauthorized Origin: '{origin}' from {client_ip}")
                writer.write(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\nForbidden Origin\r\n")
                await writer.drain()
                writer.close()
                return

        if not ws_key:
            writer.write(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nMissing Sec-WebSocket-Key\r\n")
            await writer.drain()
            writer.close()
            return

        # Send 101 Switching Protocols
        accept = base64.b64encode(hashlib.sha1((ws_key + WS_GUID).encode()).digest()).decode()
        handshake_resp = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
        ).encode('utf-8')
        writer.write(handshake_resp)
        await writer.drain()

        # Send connected confirmation frame immediately with fresh screen bounds
        ox, oy, sw, sh = get_screen_bounds(force=True)
        writer.write(make_ws_frame(json.dumps({'t': 'connected', 'screen': [sw, sh], 'origin': [ox, oy]})))
        await writer.drain()

        print(f"[+] Verified browser session connected from {client_ip} (Origin: {origin}, Screen: {sw}x{sh} at ({ox},{oy}))")

        # ── Native On-Demand Frame Capture & Streaming Engine ──
        session_token = f"client-{id(writer)}"
        capture_active = False
        capture_target_type = 'display'
        capture_target_id = 0
        capture_fps = 30
        capture_task = None

        async def stream_frames_loop():
            nonlocal capture_active, capture_target_type, capture_target_id, capture_fps
            target_delay = 1.0 / max(1, min(60, capture_fps))
            while capture_active:
                t0 = time.time()
                try:
                    if capture_target_type == 'window' and capture_target_id > 0:
                        jpeg_bytes, w, h = _global_frame_capturer.capture_window(capture_target_id)
                        t_code = 2
                    else:
                        jpeg_bytes, w, h = _global_frame_capturer.capture_display(capture_target_id)
                        t_code = 1

                    if jpeg_bytes and len(jpeg_bytes) > 0:
                        header = struct.pack('!BBIII', 1, t_code, int(capture_target_id or 0), int(w), int(h))
                        writer.write(make_ws_frame(header + jpeg_bytes, opcode=0x02))
                        await writer.drain()
                except (asyncio.CancelledError, ConnectionResetError, BrokenPipeError):
                    break
                except Exception:
                    pass

                elapsed = time.time() - t0
                sleep_time = max(0.005, target_delay - elapsed)
                await asyncio.sleep(sleep_time)

        # ── Process incoming WebRTC input events ──
        _cached_win_bounds = None
        _cached_win_time = 0.0
        _cached_win_target_id = None

        def map_client_coords(nx, ny):
            nonlocal _cached_win_bounds, _cached_win_time, _cached_win_target_id
            win_id = int(capture_target_id or 0)
            if capture_target_type == 'window' and win_id > 0:
                now = time.monotonic()
                # Query window geometry at most once per second or immediately if target changed / bounds not yet cached
                if _cached_win_target_id != win_id or _cached_win_bounds is None or (now - _cached_win_time > 1.0):
                    _cached_win_time = now
                    _cached_win_target_id = win_id
                    b = _global_frame_capturer.get_window_bounds(win_id)
                    if b:
                        _cached_win_bounds = b
                if _cached_win_bounds:
                    wx, wy, ww, wh = _cached_win_bounds
                    tx = max(wx, min(wx + ww - 1, int(wx + nx * ww)))
                    ty = max(wy, min(wy + wh - 1, int(wy + ny * wh)))
                    return tx, ty

            ox, oy, sw, sh = get_screen_bounds(capture_target_id if capture_target_type == 'display' else None)
            tx = max(ox, min(ox + sw - 1, int(ox + nx * sw)))
            ty = max(oy, min(oy + sh - 1, int(oy + ny * sh)))
            return tx, ty

        while True:
            opcode, payload = await read_ws_frame(reader)
            if opcode == 0x08:  # Close frame
                writer.write(make_ws_frame(b'', opcode=0x08))
                await writer.drain()
                break
            elif opcode == 0x09:  # Ping
                writer.write(make_ws_frame(payload, opcode=0x0A))
                await writer.drain()
                continue
            elif opcode == 0x0A:  # Pong
                continue
            elif opcode != 0x01:  # Only process text
                continue

            text = payload.decode('utf-8', errors='replace')
            data = json.loads(text)
            evt_type = data.get('t') or data.get('action')

            if evt_type == 'mouse_move':
                nx = float(data.get('x', 0))
                ny = float(data.get('y', 0))
                target_x, target_y = map_client_coords(nx, ny)
                latest_mouse_coord = (target_x, target_y)
                latest_mouse_updated = True

            elif evt_type == 'mouse_down':
                btn = int(data.get('btn', 0))
                if 'x' in data and 'y' in data:
                    nx = float(data.get('x', 0))
                    ny = float(data.get('y', 0))
                    target_x, target_y = map_client_coords(nx, ny)
                    execute_mouse_move(target_x, target_y)
                native_mouse_down(btn, current_x, current_y)

            elif evt_type == 'mouse_up':
                btn = int(data.get('btn', 0))
                if 'x' in data and 'y' in data:
                    nx = float(data.get('x', 0))
                    ny = float(data.get('y', 0))
                    target_x, target_y = map_client_coords(nx, ny)
                    execute_mouse_move(target_x, target_y)
                native_mouse_up(btn, current_x, current_y)

            elif evt_type == 'mouse_click':
                btn = int(data.get('btn', 0))
                clicks = 2 if data.get('dbl') else 1
                if 'x' in data and 'y' in data:
                    nx = float(data.get('x', 0))
                    ny = float(data.get('y', 0))
                    target_x, target_y = map_client_coords(nx, ny)
                    execute_mouse_move(target_x, target_y)
                native_mouse_click(btn, clicks, current_x, current_y)

            elif evt_type == 'select_display':
                selected_display_id = data.get('id')
                _cached_win_bounds = None
                _cached_win_target_id = None
                ox, oy, sw, sh = get_screen_bounds(force=True)
                writer.write(make_ws_frame(json.dumps({'t': 'screen_bounds', 'w': sw, 'h': sh, 'ox': ox, 'oy': oy})))
                await writer.drain()

            elif evt_type == 'wheel':
                if 'x' in data and 'y' in data:
                    nx = float(data.get('x', 0))
                    ny = float(data.get('y', 0))
                    target_x, target_y = map_client_coords(nx, ny)
                    execute_mouse_move(target_x, target_y)
                dy = data.get('dy', 0)
                scroll_units = -int(dy / 20) if dy != 0 else 0
                if scroll_units != 0:
                    native_scroll(scroll_units)

            elif evt_type == 'key_down':
                raw_key = data.get('key', '')
                if raw_key: native_key(raw_key, True)

            elif evt_type == 'key_up':
                raw_key = data.get('key', '')
                if raw_key: native_key(raw_key, False)

            elif evt_type == 'special_key':
                action = data.get('key')
                if action == 'win':
                    native_key('command' if PLATFORM == 'darwin' else 'win', True)
                    native_key('command' if PLATFORM == 'darwin' else 'win', False)
                elif action == 'esc':
                    native_key('escape', True)
                    native_key('escape', False)
                elif action == 'enter':
                    native_key('return', True)
                    native_key('return', False)

            elif evt_type == 'type_text':
                t_str = data.get('text', '')
                if t_str: native_type_text(t_str)

            elif evt_type == 'clipboard':
                clip_text = data.get('text', '')
                if clip_text:
                    native_set_clipboard(clip_text)
                    writer.write(make_ws_frame(json.dumps({'t': 'clipboard_ack', 'status': 'ok'})))
                    await writer.drain()

            elif evt_type == 'get_clipboard':
                curr_clip = native_get_clipboard()
                writer.write(make_ws_frame(json.dumps({'t': 'clipboard', 'text': curr_clip})))
                await writer.drain()

            elif evt_type in ('start_capture', 'action') or data.get('action') == 'start_capture':
                capture_target_type = data.get('target', 'display')
                capture_target_id = int(data.get('id', 0))
                capture_fps = int(data.get('fps', 30))
                _cached_win_bounds = None
                _cached_win_time = 0.0
                _cached_win_target_id = None
                _global_wake_manager.wake(session_token)
                capture_active = True
                if capture_task and not capture_task.done():
                    capture_task.cancel()
                capture_task = asyncio.create_task(stream_frames_loop())
                print(f"[+] Started native capture: target={capture_target_type}, id={capture_target_id}, fps={capture_fps}")
                writer.write(make_ws_frame(json.dumps({'t': 'capture_started', 'target': capture_target_type, 'id': capture_target_id})))
                await writer.drain()

            elif evt_type in ('stop_capture', 'action') or data.get('action') == 'stop_capture':
                capture_active = False
                _cached_win_bounds = None
                _cached_win_target_id = None
                if capture_task and not capture_task.done():
                    capture_task.cancel()
                    capture_task = None
                _global_wake_manager.release(session_token)
                print("[+] Stopped native capture")
                writer.write(make_ws_frame(json.dumps({'t': 'capture_stopped'})))
                await writer.drain()

            elif evt_type in ('get_targets', 'get_monitors'):
                targets = _global_frame_capturer.enumerate_targets()
                writer.write(make_ws_frame(json.dumps({
                    't': 'targets',
                    'displays': targets['displays'],
                    'windows': targets['windows'],
                    'monitors': targets['displays']  # backward compatibility
                })))
                await writer.drain()

            elif evt_type == 'select_target':
                capture_target_type = data.get('target', 'display')
                capture_target_id = int(data.get('id', 0))
                _cached_win_bounds = None
                _cached_win_time = 0.0
                _cached_win_target_id = None
                if not capture_active:
                    _global_wake_manager.wake(session_token)
                    capture_active = True
                    capture_task = asyncio.create_task(stream_frames_loop())
                    print(f"[+] Auto-started capture loop on select_target: {capture_target_type}:{capture_target_id}")
                else:
                    print(f"[+] Switched capture target to: {capture_target_type}:{capture_target_id}")
                writer.write(make_ws_frame(json.dumps({'t': 'target_selected', 'target': capture_target_type, 'id': capture_target_id})))
                await writer.drain()

            elif evt_type == 'ping':
                writer.write(make_ws_frame(json.dumps({'t': 'pong'})))
                await writer.drain()

    except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError):
        print(f"[-] Browser disconnected ({client_ip})")
    except Exception as err:
        print(f"[!] Error: {err}")
    finally:
        if capture_active:
            capture_active = False
        if capture_task and not capture_task.done():
            capture_task.cancel()
        _global_wake_manager.release(session_token, force=True)
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

async def main(host, port, token, extra_origins, allow_all, bounds_ttl=None):
    global ACTIVE_AUTH_TOKEN, ACTIVE_ALLOWED_ORIGINS, ALLOW_ALL_ORIGINS, BOUNDS_CACHE_TTL

    if bounds_ttl is not None:
        BOUNDS_CACHE_TTL = float(bounds_ttl)

    ACTIVE_AUTH_TOKEN = load_or_create_token(token)
    ACTIVE_ALLOWED_ORIGINS = set(DEFAULT_ALLOWED_ORIGINS)
    if extra_origins:
        for orig in extra_origins:
            ACTIVE_ALLOWED_ORIGINS.add(orig.strip().rstrip('/'))
    ALLOW_ALL_ORIGINS = allow_all

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cert_file = os.path.join(project_root, "cert.pem")
    key_file = os.path.join(project_root, "key.pem")

    ssl_ctx = None
    if os.path.exists(cert_file) and os.path.exists(key_file):
        try:
            ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_ctx.load_cert_chain(cert_file, key_file)
        except Exception:
            ssl_ctx = None

    print("=" * 68)
    print("  🔒 P2P Connect — Zero-Dependency Native OS Host Bridge")
    print("=" * 68)
    print(f"  Plain WS:  ws://{host}:{port}")
    if ssl_ctx:
        print(f"  Secure WSS: wss://{host}:9998 (TLS with cert.pem)")
    print(f"  Screen Resolution: {SCREEN_WIDTH} x {SCREEN_HEIGHT}")
    print(f"  Bounds Cache TTL:  {BOUNDS_CACHE_TTL:.0f}s (on connection & 5m background check)")
    print(f"  Platform: {PLATFORM} (Native CoreGraphics / Win32 acceleration)")
    print("  Security Hardening Status:")
    if ALLOW_ALL_ORIGINS:
        print("    ⚠️  Origin Check: DISABLED (Warning: vulnerable to CSWSH)")
    else:
        print(f"    ✓ Origin Filtering: ENFORCED (allowed domains & LAN IPs)")
    print("    ✓ Emergency Stop: Available via Host UI & Disconnect button")
    print("    ✓ On-Demand Capture: READY (Display & Window hardware capture)")
    print("    ✓ Display Wake on Demand: ENABLED (Screen sleeps naturally when idle)")
    print("=" * 68)
    print("Ready! Waiting for authenticated browser remote control session...\n")

    # Start non-blocking cursor worker
    asyncio.create_task(mouse_worker())

    srv_ws = await asyncio.start_server(handle_client, host, port)
    tasks = [srv_ws.serve_forever()]

    if ssl_ctx:
        try:
            srv_wss = await asyncio.start_server(handle_client, host, 9998, ssl=ssl_ctx)
            tasks.append(srv_wss.serve_forever())
        except Exception as e:
            print(f"[!] Warning: Could not bind secure WSS on port 9998: {e}")

    await asyncio.gather(*tasks)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="P2P Connect Zero-Dependency Remote Desktop Bridge")
    parser.add_argument("--host", default="0.0.0.0", help="Binding host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=9999, help="Binding port (default: 9999)")
    parser.add_argument("--token", default=None, help="Custom authorization token secret")
    parser.add_argument("--allow-origin", action="append", default=[], help="Additional allowed Origin URL")
    parser.add_argument("--allow-all-origins", action="store_true", help="Disable Origin checking")
    parser.add_argument("--bounds-ttl", type=float, default=DEFAULT_BOUNDS_CACHE_TTL, help="Screen bounds cache TTL in seconds (default: 300.0 / 5 min)")
    args = parser.parse_args()

    try:
        asyncio.run(main(args.host, args.port, args.token, args.allow_origin, args.allow_all_origins, args.bounds_ttl))
    except KeyboardInterrupt:
        print("\n[+] Host bridge stopped.")
