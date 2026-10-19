#!/usr/bin/env python3
"""
tests/mock_relay.py — Lightweight, Zero-Dependency Nostr Relay (NIP-01) for P2P Connect
======================================================================================
Implements an RFC 6455 compliant WebSocket server and Nostr protocol engine in pure
Python standard library. Enables 100% offline, deterministic, and isolated signaling
tests without rate limits, public relay latency, or third-party WebSocket dependencies.

Protocol Support:
  - NIP-01: EVENT, REQ, CLOSE, OK, EOSE, NOTICE
  - NIP-11: Relay Information Document (via HTTP GET /)
  - RFC 6455: WebSocket handshake, unmasked server framing, masked client decoding,
              ping/pong frames, and connection teardown.

Usage (CLI):
  python3 tests/mock_relay.py [--port 9997] [--host 127.0.0.1] [--quiet]

Usage (Programmatic in Unit / E2E Tests):
  from tests.mock_relay import MockNostrRelay

  relay = MockNostrRelay(port=0)  # Port 0 selects an available OS ephemeral port
  await relay.start()
  url = relay.get_url()  # e.g., 'ws://127.0.0.1:54321'
  ...
  await relay.stop()
"""

import argparse
import asyncio
import base64
import hashlib
import json
import logging
import struct
import sys
from typing import Any, Dict, List, Optional, Set, Tuple

# RFC 6455 WebSocket Magic GUID
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# WebRTC Signaling Kind (P2P Connect)
WEBRTC_SIGNAL_KIND = 24133

# Max events retained in ephemeral memory buffer
MAX_STORED_EVENTS = 2000

logger = logging.getLogger("mock-relay")


def make_ws_frame(text: str, mask_key: Optional[bytes] = None) -> bytes:
    """
    Encode a UTF-8 text string into an RFC 6455 WebSocket data frame (opcode 0x1).
    Server-to-client frames must NOT be masked.
    Client-to-server frames (in tests) CAN be masked by passing mask_key.
    """
    data = text.encode("utf-8")
    length = len(data)
    masked_bit = 0x80 if mask_key else 0x00

    if length <= 125:
        header = bytes([0x81, masked_bit | length])
    elif length <= 65535:
        header = struct.pack("!BBH", 0x81, masked_bit | 126, length)
    else:
        header = struct.pack("!BBQ", 0x81, masked_bit | 127, length)

    if mask_key:
        masked_data = bytes(b ^ mask_key[i % 4] for i, b in enumerate(data))
        return header + mask_key + masked_data
    return header + data


def make_close_frame(code: int = 1000) -> bytes:
    """Encode an RFC 6455 connection close frame (opcode 0x8)."""
    return struct.pack("!BBH", 0x88, 0x02, code)


def make_pong_frame(payload: bytes = b"") -> bytes:
    """Encode an RFC 6455 pong frame (opcode 0xA)."""
    length = len(payload)
    if length <= 125:
        return bytes([0x8A, length]) + payload
    return struct.pack("!BBH", 0x8A, 126, length) + payload


async def read_ws_frame(reader: asyncio.StreamReader) -> Tuple[int, bytes]:
    """
    Read and decode an RFC 6455 WebSocket frame from the stream reader.
    Returns (opcode, payload_bytes).
    """
    head = await reader.readexactly(2)
    b0, b1 = head[0], head[1]
    opcode = b0 & 0x0F
    is_masked = bool(b1 & 0x80)
    length = b1 & 0x7F

    if length == 126:
        ext = await reader.readexactly(2)
        length = struct.unpack("!H", ext)[0]
    elif length == 127:
        ext = await reader.readexactly(8)
        length = struct.unpack("!Q", ext)[0]

    mask = await reader.readexactly(4) if is_masked else None
    payload = await reader.readexactly(length) if length > 0 else b""

    if mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))

    return opcode, payload


def event_matches_filter(event: Dict[str, Any], flt: Dict[str, Any]) -> bool:
    """
    Evaluate whether a Nostr event matches a NIP-01 filter dictionary.
    Supports: ids, authors, kinds, #<tag>, since, until.
    """
    if not isinstance(event, dict) or not isinstance(flt, dict):
        return False

    # 1. Match IDs (prefix or exact match)
    if "ids" in flt and isinstance(flt["ids"], list):
        ev_id = event.get("id", "")
        if not any(ev_id == fid or ev_id.startswith(fid) for fid in flt["ids"]):
            return False

    # 2. Match authors (pubkey prefix or exact match)
    if "authors" in flt and isinstance(flt["authors"], list):
        ev_author = event.get("pubkey", "")
        if not any(ev_author == a or ev_author.startswith(a) for a in flt["authors"]):
            return False

    # 3. Match kinds
    if "kinds" in flt and isinstance(flt["kinds"], list):
        if event.get("kind") not in flt["kinds"]:
            return False

    # 4. Match single-letter tags (e.g. #p, #t, #e)
    ev_tags = event.get("tags", [])
    for key, values in flt.items():
        if key.startswith("#") and len(key) == 2 and isinstance(values, list):
            tag_name = key[1]
            matching_tags = [t[1] for t in ev_tags if len(t) >= 2 and t[0] == tag_name]
            if not any(v in matching_tags for v in values):
                return False

    # 5. Timestamp bounds
    created_at = event.get("created_at", 0)
    if "since" in flt and isinstance(flt["since"], (int, float)):
        if created_at < flt["since"]:
            return False
    if "until" in flt and isinstance(flt["until"], (int, float)):
        if created_at > flt["until"]:
            return False

    return True


def event_matches_any_filter(event: Dict[str, Any], filters: List[Dict[str, Any]]) -> bool:
    """NIP-01 specifies that multiple filters in a REQ are combined using logical OR."""
    if not filters:
        return True
    return any(event_matches_filter(event, f) for f in filters)


class MockNostrRelay:
    """
    Lightweight, embedded, zero-dependency Nostr Relay implementation.
    Manages active client WebSocket connections, subscription routing, and event storage.
    """

    def __init__(self, host: str = "127.0.0.1", port: int = 9997, quiet: bool = False):
        self.host = host
        self.requested_port = port
        self.port: int = port
        self.quiet = quiet

        # writer -> { sub_id: [filter1, filter2, ...] }
        self._clients: Dict[asyncio.StreamWriter, Dict[str, List[Dict[str, Any]]]] = {}
        # List of stored event dicts
        self._events: List[Dict[str, Any]] = []
        # Set of seen event IDs for O(1) deduplication
        self._event_ids: Set[str] = set()

        self._server: Optional[asyncio.Server] = None
        self._is_running = False

    def get_url(self) -> str:
        """Return the ws:// URL of this relay."""
        return f"ws://{self.host}:{self.port}"

    def get_event_count(self) -> int:
        """Return total number of stored events in memory."""
        return len(self._events)

    def get_client_count(self) -> int:
        """Return number of currently connected WebSocket clients."""
        return len(self._clients)

    def get_events(self) -> List[Dict[str, Any]]:
        """Return a copy of all stored events."""
        return list(self._events)

    def reset(self):
        """Clear all stored events and subscriptions (useful between test cases)."""
        self._events.clear()
        self._event_ids.clear()
        for subs in self._clients.values():
            subs.clear()

    async def start(self):
        """Start listening for incoming WebSocket connections."""
        if self._is_running:
            return

        self._server = await asyncio.start_server(
            self._handle_client,
            self.host,
            self.requested_port
        )
        # In case port 0 was passed, fetch actual assigned ephemeral port
        sockets = self._server.sockets
        if sockets:
            self.port = sockets[0].getsockname()[1]

        self._is_running = True
        if not self.quiet:
            logger.info("Mock Nostr Relay listening at %s", self.get_url())

    async def stop(self):
        """Disconnect all clients and shut down the server."""
        if not self._is_running:
            return

        self._is_running = False

        # Close all active client connections
        for writer in list(self._clients.keys()):
            try:
                writer.write(make_close_frame())
                await writer.drain()
            except Exception:
                pass
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
        self._clients.clear()

        # Stop server
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

        if not self.quiet:
            logger.info("Mock Nostr Relay stopped.")

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """Handle incoming HTTP upgrade request and continuous WebSocket frame processing."""
        # 1. Read HTTP request line and headers
        req_data = b""
        while b"\r\n\r\n" not in req_data:
            try:
                chunk = await reader.read(2048)
                if not chunk:
                    writer.close()
                    return
                req_data += chunk
            except Exception:
                writer.close()
                return

        # Parse request headers
        req_text = req_data.decode("utf-8", errors="ignore")
        lines = req_text.split("\r\n")
        req_line = lines[0] if lines else ""
        headers: Dict[str, str] = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        # Check for standard HTTP GET (NIP-11 Relay Information Document)
        if headers.get("upgrade", "").lower() != "websocket":
            info_doc = {
                "name": "P2P Connect Mock Relay",
                "description": "Zero-dependency local mock Nostr relay for P2P Connect testing",
                "supported_nips": [1, 11, 44],
                "software": "p2p-mock-relay",
                "version": "1.0.0",
            }
            body = json.dumps(info_doc, indent=2).encode("utf-8")
            response = (
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: application/nostr+json\r\n"
                b"Access-Control-Allow-Origin: *\r\n"
                b"Content-Length: " + str(len(body)).encode("utf-8") + b"\r\n\r\n" + body
            )
            writer.write(response)
            await writer.drain()
            writer.close()
            return

        # Perform RFC 6455 handshake
        ws_key = headers.get("sec-websocket-key")
        if not ws_key:
            writer.write(b"HTTP/1.1 400 Bad Request\r\n\r\nMissing Sec-WebSocket-Key")
            await writer.drain()
            writer.close()
            return

        accept_hash = hashlib.sha1((ws_key + WS_GUID).encode("utf-8")).digest()
        accept_token = base64.b64encode(accept_hash).decode("utf-8")

        handshake_resp = (
            f"HTTP/1.1 101 Switching Protocols\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept_token}\r\n\r\n"
        ).encode("utf-8")

        writer.write(handshake_resp)
        await writer.drain()

        # Register client with an empty subscriptions map
        subscriptions: Dict[str, List[Dict[str, Any]]] = {}
        self._clients[writer] = subscriptions

        try:
            while self._is_running:
                opcode, payload = await read_ws_frame(reader)

                if opcode == 0x8:  # Close frame
                    writer.write(make_close_frame())
                    await writer.drain()
                    break
                elif opcode == 0x9:  # Ping frame
                    writer.write(make_pong_frame(payload))
                    await writer.drain()
                elif opcode == 0xA:  # Pong frame
                    continue
                elif opcode == 0x1:  # Text frame (Nostr JSON message)
                    await self._process_nostr_message(writer, subscriptions, payload.decode("utf-8", errors="ignore"))

        except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError):
            pass
        except Exception as e:
            if not self.quiet:
                logger.debug("Client connection error: %s", e)
        finally:
            self._clients.pop(writer, None)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def _process_nostr_message(
        self,
        writer: asyncio.StreamWriter,
        subscriptions: Dict[str, List[Dict[str, Any]]],
        raw_text: str
    ):
        """Process a parsed Nostr JSON array message from a connected client."""
        try:
            msg = json.loads(raw_text)
        except Exception:
            return  # Discard malformed JSON

        if not isinstance(msg, list) or len(msg) < 1:
            return

        msg_type = msg[0]

        # ── 1. ["EVENT", event_dict] ──────────────────────────────────────
        if msg_type == "EVENT" and len(msg) >= 2:
            event = msg[1]
            if not isinstance(event, dict):
                return

            event_id = event.get("id", "")
            if not event_id:
                # Malformed event
                await self._send(writer, ["OK", "", False, "invalid: missing event id"])
                return

            # Store event in buffer if not duplicate
            if event_id not in self._event_ids:
                self._event_ids.add(event_id)
                self._events.append(event)
                if len(self._events) > MAX_STORED_EVENTS:
                    old = self._events.pop(0)
                    self._event_ids.discard(old.get("id", ""))

            # Acknowledge acceptance to publisher
            await self._send(writer, ["OK", event_id, True, ""])

            # Broadcast matching event to all subscribers across all connections
            for c_writer, c_subs in list(self._clients.items()):
                for sub_id, filters in list(c_subs.items()):
                    if event_matches_any_filter(event, filters):
                        await self._send(c_writer, ["EVENT", sub_id, event])

        # ── 2. ["REQ", sub_id, *filters] ──────────────────────────────────
        elif msg_type == "REQ" and len(msg) >= 2:
            sub_id = str(msg[1])
            filters = [f for f in msg[2:] if isinstance(f, dict)]
            subscriptions[sub_id] = filters

            # Send matching stored events
            limit = None
            if filters and "limit" in filters[0] and isinstance(filters[0]["limit"], int):
                limit = filters[0]["limit"]

            matching_events = [ev for ev in self._events if event_matches_any_filter(ev, filters)]
            if limit is not None and limit > 0:
                matching_events = matching_events[-limit:]

            for ev in matching_events:
                await self._send(writer, ["EVENT", sub_id, ev])

            # Send EOSE (End of Stored Events)
            await self._send(writer, ["EOSE", sub_id])

        # ── 3. ["CLOSE", sub_id] ──────────────────────────────────────────
        elif msg_type == "CLOSE" and len(msg) >= 2:
            sub_id = str(msg[1])
            subscriptions.pop(sub_id, None)

        # ── 4. ["PING"] ───────────────────────────────────────────────────
        elif msg_type == "PING":
            await self._send(writer, ["PONG"])

    async def _send(self, writer: asyncio.StreamWriter, msg_array: List[Any]):
        """Send a JSON array message to a client over WebSocket."""
        try:
            payload = json.dumps(msg_array)
            frame = make_ws_frame(payload)
            writer.write(frame)
            await writer.drain()
        except Exception:
            pass


async def _run_cli():
    """Run mock relay from command line with graceful shutdown."""
    parser = argparse.ArgumentParser(description="P2P Connect Mock Nostr Relay")
    parser.add_argument("--host", default="127.0.0.1", help="Bind IP address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=9997, help="Port to listen on (default: 9997)")
    parser.add_argument("--quiet", action="store_true", help="Quiet mode (suppress logs)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.WARNING if args.quiet else logging.INFO,
        format="[Mock Relay] %(asctime)s - %(message)s"
    )

    relay = MockNostrRelay(host=args.host, port=args.port, quiet=args.quiet)
    await relay.start()

    print(f"\n⚡ Mock Nostr Relay running at {relay.get_url()}")
    print("   Press Ctrl+C to terminate cleanly.\n")

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    try:
        import signal
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, stop_event.set)
    except NotImplementedError:
        pass

    try:
        await stop_event.wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        await relay.stop()
        print("\n⚡ Mock Nostr Relay stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(_run_cli())
    except KeyboardInterrupt:
        pass
