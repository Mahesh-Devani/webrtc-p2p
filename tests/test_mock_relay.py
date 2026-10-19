#!/usr/bin/env python3
"""
tests/test_mock_relay.py — Unit Tests for Lightweight Local Mock Nostr Relay
===========================================================================
Validates RFC 6455 WebSocket framing, NIP-11 information documents, NIP-01
event publishing, acknowledgment (OK), subscription routing (REQ), filter
matching, and teardown (CLOSE/EOSE).
"""

import asyncio
import base64
import json
import unittest
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from tests.mock_relay import (
    MockNostrRelay,
    make_ws_frame,
    read_ws_frame,
    event_matches_filter,
    event_matches_any_filter,
)


class TestMockNostrRelay(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        # Start mock relay on an ephemeral free OS port
        self.relay = MockNostrRelay(host="127.0.0.1", port=0, quiet=True)
        await self.relay.start()
        self.host = self.relay.host
        self.port = self.relay.port

    async def asyncTearDown(self):
        await self.relay.stop()

    async def _connect_ws_client(self):
        """Helper: Establish raw TCP connection and perform RFC 6455 handshake."""
        reader, writer = await asyncio.open_connection(self.host, self.port)
        key = base64.b64encode(b"test-client-key-1234").decode()
        handshake = (
            f"GET / HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode("utf-8")
        writer.write(handshake)
        await writer.drain()

        resp = await reader.readuntil(b"\r\n\r\n")
        self.assertIn(b"101 Switching Protocols", resp)
        self.assertIn(b"Upgrade: websocket", resp)
        return reader, writer

    async def _send_ws_json(self, writer, msg):
        """Helper: send a JSON array as a masked client WebSocket frame."""
        text = json.dumps(msg)
        frame = make_ws_frame(text, mask_key=b"\x12\x34\x56\x78")
        writer.write(frame)
        await writer.drain()

    async def _recv_ws_json(self, reader):
        """Helper: read an unmasked server WebSocket frame and decode JSON."""
        opcode, payload = await read_ws_frame(reader)
        self.assertEqual(opcode, 0x1)  # Text frame
        return json.loads(payload.decode("utf-8"))

    # ── Test 1: NIP-11 Information Document ────────────────────────────
    async def test_nip11_relay_information_document(self):
        """Standard HTTP GET / without WebSocket upgrade returns NIP-11 JSON doc."""
        reader, writer = await asyncio.open_connection(self.host, self.port)
        http_req = (
            f"GET / HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            f"Accept: application/nostr+json\r\n\r\n"
        ).encode("utf-8")
        writer.write(http_req)
        await writer.drain()

        resp = await reader.readuntil(b"\r\n\r\n")
        self.assertIn(b"HTTP/1.1 200 OK", resp)
        self.assertIn(b"application/nostr+json", resp)

        body = await reader.read(1024)
        info = json.loads(body.decode("utf-8"))
        self.assertEqual(info["software"], "p2p-mock-relay")
        self.assertIn(1, info["supported_nips"])
        self.assertIn(44, info["supported_nips"])
        writer.close()

    # ── Test 2: Missing Key Rejection ──────────────────────────────────
    async def test_websocket_missing_key_rejection(self):
        """WebSocket upgrade without Sec-WebSocket-Key is rejected with HTTP 400."""
        reader, writer = await asyncio.open_connection(self.host, self.port)
        handshake = (
            f"GET / HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n\r\n"
        ).encode("utf-8")
        writer.write(handshake)
        await writer.drain()

        resp = await reader.read(512)
        self.assertIn(b"400 Bad Request", resp)
        writer.close()

    # ── Test 3: Event Publishing and OK Ack ────────────────────────────
    async def test_publish_event_and_ok_ack(self):
        """Client sends EVENT, relay stores event and returns OK acknowledgment."""
        r, w = await self._connect_ws_client()

        ev = {
            "id": "event_abc_1",
            "pubkey": "alice_pubkey",
            "kind": 24133,
            "tags": [["p", "bob_pubkey"], ["t", "webrtc"]],
            "content": "encrypted_sdp_offer",
            "created_at": 1700000000,
            "sig": "sig_abc",
        }

        await self._send_ws_json(w, ["EVENT", ev])
        ack = await self._recv_ws_json(r)

        self.assertEqual(ack[0], "OK")
        self.assertEqual(ack[1], "event_abc_1")
        self.assertTrue(ack[2])
        self.assertEqual(self.relay.get_event_count(), 1)

        w.close()

    # ── Test 4: Subscription and Real-Time Event Routing ───────────────
    async def test_subscription_and_routing(self):
        """Bob subscribes with #p=bob_pubkey; Alice sends EVENT; Bob receives it in real time."""
        r_bob, w_bob = await self._connect_ws_client()
        r_alice, w_alice = await self._connect_ws_client()

        # Bob subscribes
        await self._send_ws_json(w_bob, ["REQ", "sub-bob", {"kinds": [24133], "#p": ["bob_pubkey"]}])
        eose = await self._recv_ws_json(r_bob)
        self.assertEqual(eose, ["EOSE", "sub-bob"])

        # Alice publishes event targeting Bob
        ev_for_bob = {
            "id": "sig_offer_123",
            "pubkey": "alice_pubkey",
            "kind": 24133,
            "tags": [["p", "bob_pubkey"], ["t", "webrtc"]],
            "content": "offer_data",
            "created_at": 1700000100,
            "sig": "valid_sig",
        }
        await self._send_ws_json(w_alice, ["EVENT", ev_for_bob])

        # Alice receives OK
        alice_ack = await self._recv_ws_json(r_alice)
        self.assertEqual(alice_ack[0], "OK")
        self.assertTrue(alice_ack[2])

        # Bob receives the routed EVENT
        bob_event = await self._recv_ws_json(r_bob)
        self.assertEqual(bob_event[0], "EVENT")
        self.assertEqual(bob_event[1], "sub-bob")
        self.assertEqual(bob_event[2]["id"], "sig_offer_123")
        self.assertEqual(bob_event[2]["content"], "offer_data")

        w_bob.close()
        w_alice.close()

    # ── Test 5: Tag Filter Isolation ──────────────────────────────────
    async def test_tag_filter_isolation(self):
        """Events targeting Charlie must NOT be routed to Bob who subscribed only to Bob."""
        r_bob, w_bob = await self._connect_ws_client()
        r_alice, w_alice = await self._connect_ws_client()

        await self._send_ws_json(w_bob, ["REQ", "sub-bob", {"kinds": [24133], "#p": ["bob_pubkey"]}])
        await self._recv_ws_json(r_bob)  # EOSE

        # Alice publishes event targeting Charlie
        ev_for_charlie = {
            "id": "sig_charlie_456",
            "pubkey": "alice_pubkey",
            "kind": 24133,
            "tags": [["p", "charlie_pubkey"], ["t", "webrtc"]],
            "content": "offer_for_charlie",
            "created_at": 1700000200,
            "sig": "sig_charlie",
        }
        await self._send_ws_json(w_alice, ["EVENT", ev_for_charlie])
        await self._recv_ws_json(r_alice)  # OK

        # Bob should NOT receive Charlie's event. Let's verify by sending Bob's event right after.
        ev_for_bob = {
            "id": "sig_bob_789",
            "pubkey": "alice_pubkey",
            "kind": 24133,
            "tags": [["p", "bob_pubkey"], ["t", "webrtc"]],
            "content": "offer_for_bob",
            "created_at": 1700000201,
            "sig": "sig_bob",
        }
        await self._send_ws_json(w_alice, ["EVENT", ev_for_bob])
        await self._recv_ws_json(r_alice)  # OK

        # Bob's next received message should be sig_bob_789, proving Charlie's event was ignored
        bob_event = await self._recv_ws_json(r_bob)
        self.assertEqual(bob_event[2]["id"], "sig_bob_789")

        w_bob.close()
        w_alice.close()

    # ── Test 6: Stored Event Delivery on New Subscription ──────────────
    async def test_stored_event_delivery_before_eose(self):
        """Events stored before a REQ arrives are delivered before EOSE."""
        r_alice, w_alice = await self._connect_ws_client()

        ev = {
            "id": "stored_ev_1",
            "pubkey": "alice_pubkey",
            "kind": 24133,
            "tags": [["p", "bob_pubkey"]],
            "content": "offline_message",
            "created_at": 1700000010,
            "sig": "sig",
        }
        await self._send_ws_json(w_alice, ["EVENT", ev])
        await self._recv_ws_json(r_alice)  # OK
        w_alice.close()

        # Now Bob connects and subscribes
        r_bob, w_bob = await self._connect_ws_client()
        await self._send_ws_json(w_bob, ["REQ", "sub-stored", {"kinds": [24133], "#p": ["bob_pubkey"]}])

        # Bob must get the stored event FIRST, then EOSE
        first_msg = await self._recv_ws_json(r_bob)
        self.assertEqual(first_msg[0], "EVENT")
        self.assertEqual(first_msg[2]["id"], "stored_ev_1")

        second_msg = await self._recv_ws_json(r_bob)
        self.assertEqual(second_msg[0], "EOSE")
        self.assertEqual(second_msg[1], "sub-stored")

        w_bob.close()

    # ── Test 7: Subscription Close ────────────────────────────────────
    async def test_subscription_close(self):
        """After CLOSE, no further events are sent to the client."""
        r, w = await self._connect_ws_client()
        await self._send_ws_json(w, ["REQ", "sub-temp", {"kinds": [24133]}])
        await self._recv_ws_json(r)  # EOSE

        # Send CLOSE
        await self._send_ws_json(w, ["CLOSE", "sub-temp"])

        # Publish new event
        ev = {"id": "ev_post_close", "pubkey": "a", "kind": 24133, "tags": [], "content": "x", "sig": "s"}
        await self._send_ws_json(w, ["EVENT", ev])

        # Should only receive OK for the event, not EVENT delivery
        ack = await self._recv_ws_json(r)
        self.assertEqual(ack[0], "OK")
        self.assertEqual(ack[1], "ev_post_close")

        w.close()

    # ── Test 8: Filter Matching Unit Function ──────────────────────────
    def test_filter_matching_logic(self):
        """Verify NIP-01 filter matching edge cases."""
        ev = {
            "id": "abcdef123456",
            "pubkey": "123456abcdef",
            "kind": 24133,
            "tags": [["p", "recipient_pk"], ["t", "webrtc"]],
            "created_at": 1000,
        }

        # ID prefix match
        self.assertTrue(event_matches_filter(ev, {"ids": ["abc"]}))
        self.assertFalse(event_matches_filter(ev, {"ids": ["xyz"]}))

        # Author prefix match
        self.assertTrue(event_matches_filter(ev, {"authors": ["1234"]}))
        self.assertFalse(event_matches_filter(ev, {"authors": ["9999"]}))

        # Kind match
        self.assertTrue(event_matches_filter(ev, {"kinds": [24133]}))
        self.assertFalse(event_matches_filter(ev, {"kinds": [1, 2]}))

        # Tag match
        self.assertTrue(event_matches_filter(ev, {"#p": ["recipient_pk"]}))
        self.assertTrue(event_matches_filter(ev, {"#t": ["webrtc"]}))
        self.assertFalse(event_matches_filter(ev, {"#p": ["other_pk"]}))

        # Timestamp bounds
        self.assertTrue(event_matches_filter(ev, {"since": 500, "until": 1500}))
        self.assertFalse(event_matches_filter(ev, {"since": 1001}))
        self.assertFalse(event_matches_filter(ev, {"until": 999}))


if __name__ == "__main__":
    unittest.main()
