# P2P Connect — High-Level Design

> **Last updated:** 2026-03-27

## 1. What It Is

P2P Connect is a **serverless WebRTC communication app** that runs entirely in the browser. It enables two peers to establish encrypted peer-to-peer connections for real-time **chat**, **file transfer**, and **audio/video calls** — with no backend server ever touching the data.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Browser (Peer A)                                │
│                                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────────┐ │
│  │ UI Controller │──▶│ Token Codec  │   │     WebRTC Core             │ │
│  │  (DOM, flows, │   │              │   │  ┌──────────────────────┐  │ │
│  │   chat, media)│   │  Encode/     │   │  │ RTCPeerConnection    │  │ │
│  │              │──▶│  Decode      │   │  │  ├─ DataChannels ×3   │  │ │
│  │              │   │  (pako+b64)  │   │  │  │   sig / chat / file│  │ │
│  │              │   └──────────────┘   │  │  ├─ ICE Agent         │  │ │
│  │              │                      │  │  ├─ Media Tracks      │  │ │
│  │              │──▶┌──────────────┐   │  │  └─ DTLS/SRTP/SCTP   │  │ │
│  │              │   │ Nostr Stack  │   │  └──────────────────────┘  │ │
│  │              │   │  ┌─ Crypto   │   │                            │ │
│  │              │   │  ├─ Relay    │   └─────────────────────────────┘ │
│  │              │   │  ├─ Transport│                                   │
│  │              │   │  └─ Signaling│                                   │
│  └──────────────┘   └──────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │                           │
         │ Manual tokens      │ Nostr relays              │ Direct P2P
         │ (copy-paste/QR)    │ (encrypted signaling)     │ (encrypted data)
         ▼                    ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Browser (Peer B)                                │
│                     (identical code, mirror role)                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Two Connection Modes

### Mode 1: Manual Token Exchange

- **Peer A** creates a session → app generates an **offer token** (SDP + ICE candidates, compressed, base64url-encoded)
- Token is shared via **any messenger** (WhatsApp, email, SMS) or **QR code**
- **Peer B** pastes/scans the token → app generates an **answer token**
- Answer is sent back to Peer A → connection established
- **Pros:** Zero infrastructure, works offline (for the token exchange)
- **Cons:** Two manual copy-paste steps, both peers must be online simultaneously

### Mode 2: Nostr Auto-Signaling (Recommended)

- Both peers have an auto-generated **Nostr keypair** (stored in localStorage)
- Peer A enters Peer B's **public key** and clicks Connect
- The app sends an **NIP-44 encrypted offer** through Nostr relay servers
- Peer B's app automatically **detects the offer**, generates an answer, and sends it back
- Connection established with **zero manual steps** (after initial key exchange)
- **Pros:** One-click connect, supports saved contacts, reusable identity
- **Cons:** Requires Nostr relay servers to be reachable

---

## 4. Feature Set

| Feature | Transport | Description |
|---|---|---|
| **Text Chat** | DataChannel (`p2p-chat`) | Real-time messages with delivery acknowledgments |
| **File Transfer** | DataChannel (`p2p-files`) | Any file, 16KB chunks, progress tracking |
| **Audio/Video Call** | MediaStream + SRTP | Camera, microphone, device selection, resolution control |
| **Screen Sharing** | MediaStream + SRTP | Share screen, auto-restores camera on stop |
| **QR Code** | — | Generate, scan (camera), copy, share, paste-image-decode |
| **Token Inspector** | — | Decode and examine any token's contents (SDP, ICE, version) |
| **Contact List** | localStorage | Save peer pubkeys with nicknames for quick reconnect |
| **Relay Management** | UI panel | Add/remove/reset Nostr relay servers |
| **TURN Fallback** | ICE agent | Optional TURN config for restrictive NATs |

---

## 5. Security Model

### What's Encrypted

| Layer | Protects | Protocol |
|---|---|---|
| **DTLS 1.2+** | DataChannel traffic | TLS over UDP |
| **SRTP** | Audio/video media | AES-128-CTR |
| **NIP-44** | Nostr signaling messages | XChaCha20-Poly1305 (with HKDF key derivation) |

### Key Properties

- **No server sees data** — all communication is peer-to-peer after connection setup
- **No data persistence** — refreshing the page destroys all state (keys persist in localStorage)
- **End-to-end encrypted signaling** — even Nostr relay operators cannot read signaling payloads
- **TURN relay is transparent** — if used, TURN sees only encrypted DTLS packets

### Risks & Mitigations

| Risk | Mitigation |
|---|---|
| MITM during token exchange | Use an E2EE messenger for token/key sharing |
| Token replay | Timestamps + ICE candidate expiry make stale tokens fail naturally |
| No peer identity verification | Trust the out-of-band channel; verify pubkeys directly |
| Nostr relay logging | Event content is NIP-44 encrypted; relays see only pubkeys + metadata |

---

## 6. Technology Stack

| Component | Technology |
|---|---|
| **Runtime** | Browser (vanilla JS, ES modules) |
| **WebRTC** | Native `RTCPeerConnection` API |
| **Cryptography** | `nostr-tools` via esm.sh CDN (secp256k1, NIP-44) |
| **Compression** | pako (zlib deflate, loaded via CDN) |
| **QR Codes** | qrcode.js (generation), jsQR + html5-qrcode (scanning) |
| **Styling** | Vanilla CSS, dark theme, fully responsive |
| **Dev Server** | `npx serve` (local HTTPS with certs) |
| **No build step** | Runs directly from source files |

---

## 7. File Map

| File | Lines | Role |
|---|---|---|
| `index.html` | 470 | Page structure, all UI panels and modals |
| `style.css` | ~1400 | Full design system — dark theme, responsive layout |
| `ui-controller.js` | 1854 | **Orchestrator** — DOM wiring, all user flows, Nostr init |
| `webrtc-core.js` | 642 | PeerSession factory — connection lifecycle, media, files |
| `nostr-signaling.js` | 522 | Bridge: Nostr transport ↔ WebRTC PeerSession |
| `nostr-transport.js` | 479 | Multi-relay orchestrator, publish/subscribe, deduplication |
| `nostr-relay.js` | 282 | Single relay WebSocket manager, reconnection |
| `nostr-crypto.js` | 193 | Key management, NIP-44 encrypt/decrypt, event signing |
| `token-codec.js` | 169 | Encode/decode compressed signaling tokens |
