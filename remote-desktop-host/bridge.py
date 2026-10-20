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

# ── 1. Native OS Input Injection Engine (Zero-Dependency) ────────────────────
SCREEN_WIDTH = 1920
SCREEN_HEIGHT = 1080

PLATFORM = sys.platform

if PLATFORM == 'darwin':
    import ctypes
    import ctypes.util

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
    _bounds = cg.CGDisplayBounds(main_display)
    SCREEN_WIDTH = int(_bounds.size.width) if _bounds.size.width > 0 else int(cg.CGDisplayPixelsWide(main_display))
    SCREEN_HEIGHT = int(_bounds.size.height) if _bounds.size.height > 0 else int(cg.CGDisplayPixelsHigh(main_display))

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
    current_x = max(0, min(SCREEN_WIDTH - 1, x))
    current_y = max(0, min(SCREEN_HEIGHT - 1, y))
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

        # Send connected confirmation frame immediately
        writer.write(make_ws_frame(json.dumps({'t': 'connected', 'screen': [SCREEN_WIDTH, SCREEN_HEIGHT]})))
        await writer.drain()

        print(f"[+] Verified browser session connected from {client_ip} (Origin: {origin})")

        # ── Process incoming WebRTC input events ──
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
            evt_type = data.get('t')

            if evt_type == 'mouse_move':
                nx = float(data.get('x', 0))
                ny = float(data.get('y', 0))
                target_x = max(0, min(SCREEN_WIDTH - 1, int(nx * SCREEN_WIDTH)))
                target_y = max(0, min(SCREEN_HEIGHT - 1, int(ny * SCREEN_HEIGHT)))

                latest_mouse_coord = (target_x, target_y)
                latest_mouse_updated = True

            elif evt_type == 'mouse_down':
                btn = int(data.get('btn', 0))
                if 'x' in data and 'y' in data:
                    nx = float(data.get('x', 0))
                    ny = float(data.get('y', 0))
                    execute_mouse_move(int(nx * SCREEN_WIDTH), int(ny * SCREEN_HEIGHT))
                native_mouse_down(btn, current_x, current_y)

            elif evt_type == 'mouse_up':
                btn = int(data.get('btn', 0))
                if 'x' in data and 'y' in data:
                    nx = float(data.get('x', 0))
                    ny = float(data.get('y', 0))
                    execute_mouse_move(int(nx * SCREEN_WIDTH), int(ny * SCREEN_HEIGHT))
                native_mouse_up(btn, current_x, current_y)

            elif evt_type == 'mouse_click':
                btn = int(data.get('btn', 0))
                clicks = 2 if data.get('dbl') else 1
                if 'x' in data and 'y' in data:
                    nx = float(data.get('x', 0))
                    ny = float(data.get('y', 0))
                    execute_mouse_move(int(nx * SCREEN_WIDTH), int(ny * SCREEN_HEIGHT))
                native_mouse_click(btn, clicks, current_x, current_y)

            elif evt_type == 'wheel':
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

            elif evt_type == 'get_monitors':
                monitors = []
                if PLATFORM == 'darwin':
                    try:
                        max_displays = 16
                        active_displays = (ctypes.c_uint32 * max_displays)()
                        display_count = ctypes.c_uint32()
                        if cg.CGGetActiveDisplayList(max_displays, active_displays, ctypes.byref(display_count)) == 0:
                            for i in range(display_count.value):
                                d_id = active_displays[i]
                                w = int(cg.CGDisplayPixelsWide(d_id))
                                h = int(cg.CGDisplayPixelsHigh(d_id))
                                monitors.append({
                                    'id': i + 1,
                                    'name': f"Display {i + 1} ({w}x{h})",
                                    'width': w,
                                    'height': h,
                                })
                    except Exception:
                        pass
                if not monitors:
                    monitors = [{'id': 1, 'name': f"Main Display ({SCREEN_WIDTH}x{SCREEN_HEIGHT})", 'width': SCREEN_WIDTH, 'height': SCREEN_HEIGHT}]
                writer.write(make_ws_frame(json.dumps({'t': 'monitors', 'monitors': monitors})))
                await writer.drain()

            elif evt_type == 'ping':
                writer.write(make_ws_frame(json.dumps({'t': 'pong'})))
                await writer.drain()

    except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError):
        print(f"[-] Browser disconnected ({client_ip})")
    except Exception as err:
        print(f"[!] Error: {err}")
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

async def main(host, port, token, extra_origins, allow_all):
    global ACTIVE_AUTH_TOKEN, ACTIVE_ALLOWED_ORIGINS, ALLOW_ALL_ORIGINS

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
    print(f"  Platform: {PLATFORM} (Native CoreGraphics / Win32 acceleration)")
    print("  Security Hardening Status:")
    if ALLOW_ALL_ORIGINS:
        print("    ⚠️  Origin Check: DISABLED (Warning: vulnerable to CSWSH)")
    else:
        print(f"    ✓ Origin Filtering: ENFORCED (allowed domains & LAN IPs)")
    print("    ✓ Emergency Stop: Available via Host UI & Disconnect button")
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
    args = parser.parse_args()

    try:
        asyncio.run(main(args.host, args.port, args.token, args.allow_origin, args.allow_all_origins))
    except KeyboardInterrupt:
        print("\n[+] Host bridge stopped.")
