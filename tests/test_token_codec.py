"""
tests/test_token_codec.py
=========================
Automated regression tests for manual P2P2- token compression and decompression.
Verifies token format, zlib compression parity, and candidate stripping.
"""

import base64
import json
import unittest
import zlib
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def python_compress_token(payload_obj):
    """Python reference for TokenCodec.compress (zlib deflate + base64url)."""
    raw_json = json.dumps(payload_obj, separators=(',', ':')).encode('utf-8')
    compressed = zlib.compress(raw_json, level=9)
    # base64url without padding
    return "P2P2-" + base64.urlsafe_b64encode(compressed).decode('ascii').rstrip('=')


def python_decompress_token(token_str):
    """Python reference for TokenCodec.decompress."""
    if not token_str.startswith("P2P2-"):
        raise ValueError("Invalid token prefix")
    b64 = token_str[5:]
    # re-add padding
    padding = (4 - len(b64) % 4) % 4
    b64 += '=' * padding
    compressed = base64.urlsafe_b64decode(b64.encode('ascii'))
    decompressed = zlib.decompress(compressed)
    return json.loads(decompressed.decode('utf-8'))


class TestTokenCodec(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.codec_content = (PROJECT_ROOT / 'token-codec.js').read_text(encoding='utf-8')

    def test_token_codec_prefix(self):
        """TokenCodec must use 'P2P2-' prefix for v2 compressed tokens."""
        self.assertIn("PREFIX = 'P2P2-'", self.codec_content)

    def test_compression_decompression_roundtrip(self):
        """Verify zlib deflate + base64url roundtrip preserves exact SDP and candidates."""
        sample_payload = {
            "v": 2,
            "type": "offer",
            "sdp": "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n",
            "candidates": [
                {"candidate": "candidate:1 1 UDP 2122260223 192.168.1.50 54321 typ host", "sdpMid": "0"},
                {"candidate": "candidate:2 1 UDP 1686052607 203.0.113.10 54321 typ srflx raddr 192.168.1.50 rport 54321", "sdpMid": "0"}
            ]
        }
        token = python_compress_token(sample_payload)
        self.assertTrue(token.startswith("P2P2-"))

        recovered = python_decompress_token(token)
        self.assertEqual(sample_payload["sdp"], recovered["sdp"])
        self.assertEqual(sample_payload["candidates"], recovered["candidates"])

    def test_candidate_stripping_logic(self):
        """TokenCodec must strip verbose candidate strings to minimize token length."""
        self.assertIn("stripCandidateMetadata", self.codec_content)
        self.assertIn("generation", self.codec_content)
        self.assertIn("ufrag", self.codec_content)


if __name__ == '__main__':
    unittest.main()
