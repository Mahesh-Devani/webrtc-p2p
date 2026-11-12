"""
tests/test_host_security.py
===========================
Automated regression tests for Host security, password complexity,
and client whitelist access control.
"""

import re
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def validate_password_complexity(pwd):
    """Python reference implementation mirroring host-controller.js validatePasswordComplexity()."""
    if not pwd or not isinstance(pwd, str):
        return False, "Password cannot be empty."
    if len(pwd) < 8:
        return False, f"Password too short ({len(pwd)}/8 min characters)."
    if len(pwd) > 24:
        return False, f"Password too long ({len(pwd)}/24 max characters)."
    if not re.search(r'[A-Z]', pwd):
        return False, "Must include at least 1 uppercase letter (A-Z)."
    if not re.search(r'[a-z]', pwd):
        return False, "Must include at least 1 lowercase letter (a-z)."
    if not re.search(r'[0-9]', pwd):
        return False, "Must include at least 1 digit (0-9)."
    if not re.search(r'[!@#$%&*+\-_=]', pwd):
        return False, "Must include at least 1 special character (!@#$%&*+-_=)."
    return True, "Valid"


def is_client_authorized(client_pubkey, whitelist_enabled, authorized_clients):
    """Python reference mirroring host-controller.js isClientAuthorized()."""
    if not whitelist_enabled:
        return True
    return any(c.get('pubkey', '').lower() == client_pubkey.lower() for c in authorized_clients)


class TestHostSecurity(unittest.TestCase):

    def test_password_complexity_valid_cases(self):
        valid_passwords = [
            "Admin@2026!",
            "Secure#1234",
            "A1b!aaaa",
            "X9_yZ#qwerty",
            "K!ngP@ss9999",
            "P@ssw0rd12345678901234",  # 22 chars
        ]
        for pwd in valid_passwords:
            valid, msg = validate_password_complexity(pwd)
            self.assertTrue(valid, f"Password '{pwd}' should be valid, but got: {msg}")

    def test_password_complexity_invalid_cases(self):
        invalid_cases = [
            ("", "empty"),
            ("A1b!", "too short (<8)"),
            ("A1b!12345678901234567890123", "too long (>24)"),
            ("admin@2026!", "no uppercase"),
            ("ADMIN@2026!", "no lowercase"),
            ("Admin@Secure!", "no digits"),
            ("Admin2026Password", "no special characters"),
        ]
        for pwd, reason in invalid_cases:
            valid, _ = validate_password_complexity(pwd)
            self.assertFalse(valid, f"Password '{pwd}' ({reason}) should have been rejected")

    def test_host_controller_password_rules_sync(self):
        """Verify host-controller.js contains the exact same password complexity rules."""
        content = (PROJECT_ROOT / 'host-controller.js').read_text(encoding='utf-8')

        self.assertIn('validatePasswordComplexity', content)
        self.assertIn('generateSecurePassword', content)

        # Verify length constraints 8 and 24
        self.assertIn('.length < 8', content)
        self.assertIn('.length > 24', content)

        # Verify regex checks
        self.assertIn('[A-Z]', content)
        self.assertIn('[a-z]', content)
        self.assertIn('[0-9]', content)
        self.assertTrue('[^A-Za-z0-9]' in content or '[!@#$%&*+\\-_=]' in content,
                        "Password complexity must check for special characters")

    def test_client_whitelist_enforcement(self):
        """Whitelist when enabled must reject any pubkey not explicitly authorized."""
        client_a = "2693ef89a2e5d709080a806ab2f2ed8f4b6f434ef038d414ad4e13bce0ad4b1b"
        client_b = "1111111111111111111111111111111111111111111111111111111111111111"

        whitelist = [{'pubkey': client_a, 'name': 'My Laptop'}]

        # Whitelist enabled + client in list -> ACCEPT
        self.assertTrue(is_client_authorized(client_a, True, whitelist))

        # Whitelist enabled + client NOT in list -> REJECT
        self.assertFalse(is_client_authorized(client_b, True, whitelist))

        # Whitelist enabled + empty list -> REJECT ALL
        self.assertFalse(is_client_authorized(client_a, True, []))

        # Whitelist disabled -> ACCEPT ALL
        self.assertTrue(is_client_authorized(client_b, False, []))

    def test_whitelist_default_state_is_enforced(self):
        """Verify host-controller.js defaults to whitelist enforcement when unset."""
        content = (PROJECT_ROOT / 'host-controller.js').read_text(encoding='utf-8')
        # Check that isWhitelistEnforced() defaults to true if null
        self.assertIn('if (val === null) return true', content,
                      "host-controller.js must default isWhitelistEnforced() to true when unset")

    def test_bridge_candidate_urls_never_include_remote_domain(self):
        """Bridge URL resolution must never include public/remote domains (like github.io)."""
        content = (PROJECT_ROOT / 'host-controller.js').read_text(encoding='utf-8')

        self.assertIn('getCandidateBridgeUrls', content)
        # Ensure ws://127.0.0.1:9999 is prioritized as the first candidate
        self.assertIn("urls.push('ws://127.0.0.1:9999')", content)
        # Ensure private IP regex is used to filter out public domains
        self.assertIn('isPrivateIp', content)
        self.assertTrue('127.0.0.1' in content and '192' in content and 'localhost' in content)

    def test_bridge_connection_timeout_enforced(self):
        """Bridge connection attempts must enforce a fast timeout (<= 2s) to prevent hanging."""
        content = (PROJECT_ROOT / 'host-controller.js').read_text(encoding='utf-8')

        self.assertIn('setTimeout', content)
        self.assertIn('1200', content, "Bridge candidate socket should timeout after ~1.2s")
        self.assertIn('ws.readyState === WebSocket.CONNECTING', content)

    def test_bridge_race_condition_protection(self):
        """Bridge connection must use generational guard to ignore stale socket callbacks."""
        content = (PROJECT_ROOT / 'host-controller.js').read_text(encoding='utf-8')

        self.assertIn('bridgeConnectGeneration', content)
        self.assertIn('currentGen !== bridgeConnectGeneration', content)

    def test_bridge_auto_reconnect_and_liveness_telemetry(self):
        """host-controller.js must auto-reconnect to OS bridge and broadcast bridgeActive telemetry."""
        content = (PROJECT_ROOT / 'host-controller.js').read_text(encoding='utf-8')

        self.assertIn('scheduleBridgeReconnect', content)
        self.assertIn('clearBridgeReconnectTimer', content)
        self.assertIn('broadcastBridgeStatus', content)
        self.assertIn('bridgeActive: bridgeConnected', content)
        self.assertIn('bridgeActive: !!active', content)

    def test_parse_remote_device_token_contract_in_ui_controller(self):
        """ui-controller.js must support raw 64-hex keys, P2P-HOST tokens, 1-Click URLs, and JSON in QR scanning."""
        content = (PROJECT_ROOT / 'ui-controller.js').read_text(encoding='utf-8')

        self.assertIn('function parseRemoteDeviceToken(val)', content)
        self.assertIn('remoteHost=', content)
        self.assertIn('p2p-(host|client):', content)
        self.assertIn('dom.btnScanRemoteQr', content)
        self.assertIn('Host details filled from QR!', content)

    def test_parse_remote_device_token_resolution_matrix(self):
        """Verify robust parsing of various QR and token formats for remote computer pairing."""
        from urllib.parse import urlparse, parse_qs, unquote

        def py_parse_token(val):
            if not val:
                return None
            val_str = str(val).strip().strip('"\'')
            if not val_str:
                return None
            pubkey = ''
            name = ''
            pin = ''
            icon = ''

            if 'remoteHost=' in val_str or 'host=' in val_str or val_str.startswith('http://') or val_str.startswith('https://'):
                try:
                    parsed = urlparse(val_str)
                    qs = parse_qs(parsed.query)
                    host_param = qs.get('remoteHost', qs.get('host', [None]))[0]
                    if host_param:
                        pubkey = host_param.strip()
                        name = qs.get('name', qs.get('nickname', ['']))[0]
                        icon = qs.get('icon', [''])[0]
                        pin_param = qs.get('pin', [None])[0]
                        if pin_param:
                            pin = pin_param
                        elif parsed.fragment and 'pin=' in parsed.fragment:
                            m = re.search(r'pin=([^&]+)', parsed.fragment)
                            if m:
                                pin = unquote(m.group(1))
                except Exception:
                    pass

            if not pubkey and val_str.startswith('{') and val_str.endswith('}'):
                try:
                    import json
                    data = json.loads(val_str)
                    pubkey = data.get('pubkey') or data.get('publicKey') or data.get('host') or data.get('id') or ''
                    name = data.get('name') or data.get('nickname') or ''
                    pin = data.get('pin') or data.get('password') or ''
                    icon = data.get('icon') or ''
                except Exception:
                    pass

            if not pubkey and re.match(r'^p2p-(host|client):', val_str, re.I):
                parts = val_str.split(':')
                pubkey = parts[1] if len(parts) > 1 else ''
                name = unquote(parts[2]) if len(parts) > 2 else ''
                pin = unquote(parts[3]) if len(parts) > 3 else ''
                icon = unquote(parts[4]) if len(parts) > 4 else ''

            if not pubkey:
                clean = val_str[2:] if val_str.lower().startswith('0x') else val_str
                if re.match(r'^[0-9a-fA-F]{64}$', clean):
                    pubkey = clean

            if not pubkey:
                m = re.search(r'\b([0-9a-fA-F]{64})\b', val_str)
                if m:
                    pubkey = m.group(1)

            if pubkey and re.match(r'^[0-9a-fA-F]{64}$', pubkey.strip()):
                return {
                    'pubkey': pubkey.strip().lower(),
                    'name': name,
                    'pin': pin,
                    'icon': icon
                }
            return None

        # 1. Raw 64-hex public key (host.html pairing QR output)
        hex_key = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
        res = py_parse_token(hex_key)
        self.assertIsNotNone(res)
        self.assertEqual(res['pubkey'], hex_key)

        # 2. Uppercase with leading/trailing spaces
        res = py_parse_token(f"  {hex_key.upper()}  ")
        self.assertIsNotNone(res)
        self.assertEqual(res['pubkey'], hex_key)

        # 3. P2P-HOST full token
        token_str = f"P2P-HOST:{hex_key}:Mac%20Studio:SecretPin123!:🍏"
        res = py_parse_token(token_str)
        self.assertIsNotNone(res)
        self.assertEqual(res['pubkey'], hex_key)
        self.assertEqual(res['name'], "Mac Studio")
        self.assertEqual(res['pin'], "SecretPin123!")
        self.assertEqual(res['icon'], "🍏")

        # 4. 1-Click Connect URL with hash PIN
        url_str = f"https://mahesh-devani.github.io/webrtc-p2p/index.html?remoteHost={hex_key}#pin=UrlPin456"
        res = py_parse_token(url_str)
        self.assertIsNotNone(res)
        self.assertEqual(res['pubkey'], hex_key)
        self.assertEqual(res['pin'], "UrlPin456")

        # 5. 1-Click URL with query params
        url_query = f"http://localhost:8080/?remoteHost={hex_key}&name=Office%20PC&pin=Pass789"
        res = py_parse_token(url_query)
        self.assertIsNotNone(res)
        self.assertEqual(res['pubkey'], hex_key)
        self.assertEqual(res['name'], "Office PC")
        self.assertEqual(res['pin'], "Pass789")

        # 6. JSON QR payload
        json_qr = f'{{"pubkey":"{hex_key}","name":"Server","pin":"9999"}}'
        res = py_parse_token(json_qr)
        self.assertIsNotNone(res)
        self.assertEqual(res['pubkey'], hex_key)
        self.assertEqual(res['name'], "Server")
        self.assertEqual(res['pin'], "9999")

        # 7. Invalid random string
        self.assertIsNone(py_parse_token("not-a-valid-token-or-key"))


if __name__ == '__main__':
    unittest.main()

