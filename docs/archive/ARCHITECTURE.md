# P2P Connect — Architecture & Production Notes

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Peer A)                          │
│                                                                  │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│  │ UI Control │──▶│ Token Codec  │   │   WebRTC Core        │   │
│  │  (DOM +    │   │ (encode/     │   │  ┌────────────────┐  │   │
│  │  events)   │──▶│  decode      │   │  │RTCPeerConn     │  │   │
│  │            │──▶│  base64url)  │   │  │  ├─ DataChannel │  │   │
│  └────────────┘   └──────────────┘   │  │  ├─ ICE Agent   │  │   │
│                                      │  │  └─ DTLS/SCTP   │  │   │
│                                      │  └────────────────┘  │   │
│                                      └──────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
        ▲                                           │
        │  Out-of-band token exchange               │ P2P data
        │  (WhatsApp / email / any messenger)       │ (encrypted)
        ▼                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Peer B)                          │
│         (identical code, mirror role)                             │
└──────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| File | Purpose |
|---|---|
| `index.html` | Semantic markup, step-based layout, accessibility attributes |
| `style.css` | Full design system — dark theme, responsive, status badges, chat bubbles |
| `token-codec.js` | Encode/decode signaling payloads as compact base64url tokens with version & prefix |
| `webrtc-core.js` | RTCPeerConnection lifecycle, DataChannel, ICE gathering, state machine |
| `ui-controller.js` | Glue layer — DOM events, flow orchestration, chat message protocol |

### Token Format

Tokens are prefixed with `P2P1-` for human recognition, followed by base64url-encoded JSON:

```json
{
  "v": 1,                          // codec version
  "t": "offer" | "answer" | "ice", // token type
  "ts": 1708300000000,             // timestamp
  "s": { "type": "offer", "sdp": "..." },  // SDP (null for ICE-only tokens)
  "c": [                           // batched ICE candidates
    { "candidate": "...", "sdpMid": "0", "sdpMLineIndex": 0 }
  ]
}
```

Bundling ICE candidates directly into offer/answer tokens minimises the number of
out-of-band exchanges needed (typically just two: offer → answer).

---

## Connection Flow

```
Peer A (Creator)                         Peer B (Joiner)
─────────────────                        ────────────────
1. Click "Create Session"
2. createOffer() → SDP
3. Wait ~3s for ICE candidates
4. Encode offer + ICE → token
5. Copy token ──── (WhatsApp/email) ───▶ 6. Paste token
                                         7. setRemoteDescription(offer)
                                         8. addIceCandidates(bundled)
                                         9. createAnswer() → SDP
                                        10. Wait ~3s for ICE candidates
                                        11. Encode answer + ICE → token
12. Paste token ◀── (WhatsApp/email) ── 13. Copy token
14. setRemoteDescription(answer)
15. addIceCandidates(bundled)

    ────── ICE connectivity checks ──────
    ────── DTLS handshake ───────────────
    ────── SCTP association ─────────────
    ────── DataChannel open ─────────────

16. Chat ready                          16. Chat ready
```

If the connection doesn't establish (complex NAT scenarios), the ICE Exchange
section allows additional candidate batches to be exchanged manually.

---

## Why TURN Fallback Is Necessary

STUN enables peers to discover their public IP:port mappings, but it only works
when at least one side has a permissive NAT type (full-cone or restricted-cone).

**TURN is required when:**

| Scenario | STUN works? | TURN required? |
|---|---|---|
| Both peers on open networks | ✅ | No |
| One peer behind symmetric NAT | ❌ often | Yes |
| Both peers behind symmetric NAT | ❌ | Yes |
| Corporate firewall blocking UDP | ❌ | Yes (TCP/TLS TURN) |
| Carrier-grade NAT (mobile 4G/5G) | ❌ sometimes | Often yes |

TURN relays traffic through an intermediary server. The data is still DTLS-encrypted
end-to-end — the TURN server cannot read message contents.

**In production**, approximately 10-15% of WebRTC connections require TURN relay.
Without it, those users simply cannot connect.

The app provides a UI panel to configure TURN credentials. The ICE agent
automatically prefers direct connections and falls back to relay only when needed.

---

## Security Model

### What's Protected

- **DTLS 1.2+** encrypts the DataChannel transport. Even if traffic traverses a
  TURN server, message contents are encrypted end-to-end between browsers.
- **SCTP** (over DTLS) provides the reliable ordered delivery for DataChannel.
- **No data persistence** — tokens and messages exist only in browser memory.
  Refreshing the page destroys all state.

### Risks of Manual Signaling

| Risk | Mitigation |
|---|---|
| Token intercepted in transit | Tokens contain SDP + ICE — an attacker could MITM if they intercept *and replace* both offer and answer. Use a trusted channel. |
| Token replayed | Tokens include timestamps; ICE candidates expire. Stale tokens fail naturally. |
| No identity verification | WebRTC doesn't authenticate peer identity natively. Users must trust the out-of-band channel to confirm they're talking to the right person. |
| SDP fingerprint exposure | The DTLS fingerprint in SDP is public by design — it's used for key exchange. This is normal WebRTC behavior. |

**Recommendation for high-security use:** exchange tokens over an end-to-end encrypted
messenger (Signal, WhatsApp E2EE) to close the MITM vector.

---

## Real-World Limitations of No-Signaling-Server Design

1. **Two manual exchanges required** — users must copy-paste tokens back and forth.
   This is viable for 1:1 sessions but doesn't scale to group calls or ad-hoc connections.

2. **No presence / discovery** — there's no way to find online peers without
   out-of-band communication first.

3. **ICE candidate timing** — the app waits ~3 seconds to bundle candidates, but
   on slow networks some candidates may arrive later. The ICE Exchange section
   handles this, but adds friction.

4. **Session resumption** — if the connection drops, both peers must repeat the
   full token exchange. There's no session persistence or renegotiation shortcut.

5. **Token size** — offer tokens can be 2-5 KB (base64). This fits in most
   messengers but may be unwieldy for SMS.

6. **NAT traversal without TURN** — roughly 10-15% of real-world connections
   will fail without a TURN server.

7. **No push notifications** — the app must be open in both browsers simultaneously
   during connection setup.

---

## Suggestions for Production Scaling

### Short-term (keep serverless)

- **QR code token exchange** — encode tokens as QR codes for in-person setup
- **Compressed tokens** — use deflate/brotli before base64 to shrink token size by ~60%
- **File transfer over DataChannel** — chunk files and send over the existing channel with progress tracking
- **Audio/video** — add `getUserMedia()` + `addTrack()` for voice/video calls using the same manual signaling
- **IndexedDB chat history** — optionally persist messages locally (user opt-in)

### Medium-term (minimal server)

- **Lightweight relay service** — a simple HTTP endpoint or Firebase Realtime Database for token exchange eliminates copy-paste friction while keeping the P2P data path
- **WebTorrent-style DHT** — use a distributed hash table to publish/discover session tokens without a central server
- **Push notifications via web push** — alert peer B when peer A creates a session

### Long-term (production infrastructure)

- **Dedicated TURN cluster** — deploy coturn servers in multiple regions for global coverage
- **SFU for group calls** — a Selective Forwarding Unit (mediasoup, Janus) for multi-party communication
- **End-to-end encryption layer** — add application-level encryption (e.g., Signal Protocol) on top of DTLS for forward secrecy
- **Identity & authentication** — integrate with OAuth/OIDC for verified peer identity
- **Analytics & monitoring** — track ICE success rates, connection times, TURN usage to optimize infrastructure
