# AGENTS.md — Developer & AI Agent Guide for P2P Connect

This document serves as the primary technical specification, architectural reference, and operational rulebook for AI agents and developers working on **P2P Connect**.

---

## 1. Project Overview & Philosophy

**P2P Connect** is a serverless, browser-only peer-to-peer communication web application. It enables two peers to establish direct, encrypted communication for:
- Real-time text messaging with delivery receipts (`_ack`)
- Reliable chunked file & multi-file transfers
- 1:1 audio and video calls with camera switching & resolution control
- Screen sharing with automatic camera track restoration
- Dual signaling modes: automated Nostr relays (NIP-44) and manual compressed tokens (`P2P2-` / QR codes)

### Core Tenets
1. **Zero-Backend Data Path**: After signaling is complete, no server ever touches media, chat messages, or file contents. Communication occurs directly between browsers over WebRTC.
2. **Zero-Build Architecture**: There is no bundler, build step, transpiler, or package manager dependency for runtime code. The app is written in pure vanilla HTML, modern CSS, and browser-native ES Modules.
3. **Instant Static Deployment**: Deployable directly to static web hosts (e.g., GitHub Pages).

---

## 2. Technology Stack & External Dependencies

| Component | Implementation | Notes |
|---|---|---|
| **Runtime** | Vanilla JavaScript (Browser ES Modules) | No Babel, Webpack, Vite, or TypeScript |
| **WebRTC API** | Native browser `RTCPeerConnection` | DataChannels + MediaStreams |
| **Signaling (Auto)** | Nostr relays (`kind: 24133`, NIP-44 encrypted) | Automated peer discovery & handshake |
| **Signaling (Manual)** | Compressed base64 tokens (`P2P2-`) | Shareable via QR code or text messengers |
| **Styling** | Vanilla CSS (`style.css`) | WhatsApp-inspired dark theme, CSS custom properties |
| **Local Persistence** | `localStorage` | Contact list, chat history, cryptographic keys |
| **Local Dev Server** | `python -m http.server 8080` or `npx serve .` | Any static file server |

### External CDN Dependencies (loaded via `index.html`)
- **`nostr-tools@2.10.4`** (via `esm.sh`): secp256k1 key generation, NIP-44 v2 encryption/decryption, Schnorr event signing.
- **`pako@2.1.0`** (via `cdnjs`): zlib deflate/inflate for SDP and ICE candidate compression in manual tokens.
- **`qrcode@1.5.1`** (via `jsdelivr`): QR code generation on `<canvas>`.
- **`jsQR@1.4.0`** & **`html5-qrcode@2.3.8`** (via `jsdelivr`/`cdnjs`): Camera & image-based QR decoding.

---

## 3. Module Map & Dependency Architecture

```text
index.html (Entry point & UI DOM layout)
  └── ui-controller.js (Orchestrator & State Machine)
        ├── webrtc-core.js (PeerSession factory: WebRTC lifecycle, DataChannels, Media)
        ├── nostr-signaling.js (Bridge: Nostr transport ↔ PeerSession signaling)
        │     ├── nostr-transport.js (Multi-relay manager & kind 24133 router)
        │     │     ├── nostr-relay.js (Single relay WebSocket manager & auto-reconnect)
        │     │     └── nostr-crypto.js (secp256k1 keys, NIP-44 encrypt/decrypt, signing)
        │     └── webrtc-core.js
        ├── nostr-transport.js
        ├── nostr-crypto.js
        ├── token-codec.js (Manual P2P2- token compression & decompression)
        └── chat-store.js (Persistent chat storage in localStorage)
```

### Module Roles & Responsibilities

1. **`index.html`**: Defines the single-page layout (sidebar, chat area, media overlays, QR modals, inspector, settings). Loads external CDN libraries and the entry script `ui-controller.js`.
2. **`style.css`**: Complete design system with CSS tokens (`--c-primary`, `--c-surface`, etc.), responsive layouts, custom scrollbars, and micro-animations.
3. **`ui-controller.js`**: Central UI controller. Binds DOM elements, manages chat state, switches active views, handles media call UI, controls file upload/drop handlers, and initializes Nostr.
4. **`webrtc-core.js`**: `PeerSession.create(config)` factory. Manages `RTCPeerConnection`, three DataChannels (`p2p-sig`, `p2p-chat`, `p2p-files`), local/remote media tracks, and renegotiation.
5. **`nostr-signaling.js`**: Stateful bridge singleton. Listens for incoming signals on Nostr, automatically creates/accepts offers, batches ICE candidates, and triggers session callbacks.
6. **`nostr-transport.js`**: Stateful transport singleton. Manages WebSocket connections across multiple relays, handles publish retries, event deduplication, and message routing.
7. **`nostr-relay.js`**: Class representing a single relay connection. Features exponential backoff reconnection (1s → 30s) and automatic re-subscription.
8. **`nostr-crypto.js`**: Singleton for cryptography. Persists keys in `localStorage` (`nostr-privkey`, `nostr-pubkey`) and provides NIP-44 v2 encryption/decryption.
9. **`token-codec.js`**: Serializes manual tokens (`P2P2-`). Strips non-essential candidate metadata and compresses payload via `pako.deflate` to minimize token size.
10. **`chat-store.js`**: Local chat history storage in `localStorage` (`chat-<pubkey>`). Caps history at 500 messages per contact and provides JSON backup/restore.

---

## 4. Dual Connection Modes & Protocols

### Mode A: Nostr Auto-Signaling (`kind: 24133`)
- **Transport**: Encrypted events sent to relays (`wss://relay.primal.net`, `wss://nos.lol`, `wss://offchain.pub`).
- **Encryption**: NIP-44 v2 (XChaCha20-Poly1305 with HKDF key derivation). Relays see only sender/receiver pubkeys.
- **ICE Batching**: Candidates are queued and sent in batches with a 200ms debounce to prevent relay flooding.
- **Staleness Protection**: Events older than 60 seconds are discarded to prevent replay attacks.
- **Offline Messaging**: If peer is not connected via WebRTC, text messages are delivered asynchronously via Nostr relays.

### Mode B: Manual Token Exchange (`P2P2-`)
- **Format**: `P2P2-<base64url(pako.deflate(JSON))>`
- **Workflow**:
  1. Peer A generates an Offer token (SDP + ICE candidates gathered over ~1.5s).
  2. Peer B pastes/scans Offer token, generates Answer token (SDP + ICE).
  3. Peer A accepts Answer token → P2P connection establishes.
- **Important**: In manual mode, `activeContactPubkey` is `null`. All UI message rendering and bubble logic must check for `null` pubkey and still function seamlessly.

### In-Band Renegotiation (Perfect Negotiation Pattern)
- Track additions/removals mid-call trigger `onnegotiationneeded`.
- Auto-renegotiates via the `p2p-sig` DataChannel without needing external signaling:
  - Session Creator is **impolite** (`isPolite = false`).
  - Session Joiner is **polite** (`isPolite = true`, rolls back on collision).

---

## 5. WebRTC DataChannels Specification

Three separate DataChannels are negotiated on every session:

| Label | Variable | Format | Purpose |
|---|---|---|---|
| `p2p-sig` | `dcSig` | JSON strings | In-band signaling for renegotiation & call termination (`call_ended`) |
| `p2p-chat` | `dcChat` | JSON strings | Real-time text messaging & delivery acknowledgments (`{ _ack: id }`) |
| `p2p-files` | `dcFiles` | Binary (`ArrayBuffer`) + JSON | Chunked file and multi-file transfer |

### File Transfer Protocol & Flow Control Rules
- **Chunk Size**: `16 * 1024` (16 KB) for universal browser and SCTP compatibility.
- **Queue Watermarks**:
  - `BUFFER_HIGH = 256 * 1024` (256 KB)
  - `BUFFER_LOW = 64 * 1024` (64 KB)
- **Backpressure**: When `dcFiles.bufferedAmount > BUFFER_HIGH`, sender pauses and awaits `bufferedamountlow` (falling below `BUFFER_LOW`) before sending more chunks.
- **Drain Synchronization**: The sender **MUST wait** for `dcFiles.bufferedAmount === 0` before sending `_fileEnd` and before resolving the promise. This ensures bytes have physically left the network buffer before the next file in a batch begins.
- **Abort Signaling**: If an error occurs, sender transmits `{ _fileAbort: true, name: ... }` so receiver resets state rather than hanging.

```text
Sender                                              Receiver
──────                                              ────────
{ _fileStart: true, name, size, type,               → incomingFileMeta = meta
  fileIndex?, totalFiles? }                           incomingFileChunks = []
ArrayBuffer (16KB chunk) × N                        → push chunk; update progress
[await bufferedAmount === 0]
{ _fileEnd: true }                                  → new Blob(chunks)
                                                      onFileReceived(blob, name, meta)
```

---

## 6. Critical Invariants for AI Agents (MUST FOLLOW)

### 1. ES Module Singleton Integrity (DO NOT BREAK)
> [!CAUTION]
> **NEVER add query parameters or version strings to internal relative imports!**
> E.g., `import { NostrTransport } from './nostr-transport.js?v=6';` is **STRICTLY FORBIDDEN**.

- In browser ES modules, `import from './file.js?v=6'` and `import from './file.js'` are treated as **two completely separate module URLs**.
- `NostrTransport`, `NostrSignaling`, `NostrCrypto`, and `ChatStore` are stateful singletons holding sockets, keys, and subscription maps.
- Importing with query params creates duplicate, split instances in memory (e.g. one connected to relays, one disconnected), silently breaking all signaling and messaging.
- **Rule**: All internal module imports must use clean paths (`import ... from './nostr-transport.js'`).
- **Cache Busting Rule**: Cache busting is permitted **ONLY** on the root entry point in `index.html`:
  ```html
  <script type="module" src="ui-controller.js?v=9"></script>
  ```

### 2. Zero-Build Philosophy
- Do not introduce build tools, bundlers (Webpack, Vite, Rollup), transpilers (Babel, TS), or CSS preprocessors unless explicitly requested by the user.
- All code must run natively in modern evergreen browsers.

### 3. Media Track Replacement vs Renegotiation
- Switching cameras or toggling audio/video should use `RTCRtpSender.replaceTrack()` whenever possible to avoid triggering full SDP renegotiation.
- When stopping media, call `track.stop()` and `removeMedia()` to ensure device hardware indicators (camera lights) shut off immediately.

### 4. Storage Usage & Separation
- Do not store file blobs or base64 file payloads in `localStorage`. `ChatStore` records only metadata (`{ id, text, type: 'file', fileName, fileSize }`). File blobs exist strictly in memory via `URL.createObjectURL(blob)`.

### 5. Mobile Background Suspensions & Auto-Reconnection
- **Mobile OS Suspension**: When mobile users open native file pickers or switch tabs, iOS Safari and Android Chrome aggressively freeze web page execution and stop STUN consent freshness checks (RFC 7675). WebRTC ICE enters `'disconnected'` after ~10–15 seconds.
- **No Native Timeout Adjustment**: WebRTC exposes no JavaScript API to lengthen ICE consent timeouts; the limits are native C++ `libwebrtc` constants.
- **Auto-Reconnection on Send**: Senders MUST NOT drop files if the channel is closed or in transient recovery when returning from the picker. `sendSelectedFiles` calls `ensurePeerConnected(pubkey)` to automatically re-establish or wait for the P2P connection and stream all queued files.
- **Transient Disconnect Debounce**: `'disconnected'` is a transient state. `NostrSignaling` applies a 4-second debounce before reporting disconnected to the UI, allowing temporary blips to self-heal without tearing down call or chat state.
- **Lifecycle Recovery (`visibilitychange`)**: When the app regains visibility, it immediately wakes up relay WebSockets (`NostrTransport.ensureConnected()`) and tests active P2P liveness with in-band pings.

### 6. STUN/TURN Architecture & NAT Traversal
- **Candidate Prioritization (RFC 8445)**: WebRTC ICE assigns `host` (local LAN) the highest priority (`126`), `prflx` (`110`), `srflx` / STUN (`100`), and `relay` / TURN (`0`). `host` ↔ `host` pairs are always tested first. If devices are on the same LAN without client isolation, traffic flows over local Wi-Fi without leaving the local network.
- **Symmetric NAT & ISP Routers**: Restrictive ISP routers (such as Hathway, Jio, or corporate firewalls) randomize external port mappings or enable SIP ALG, preventing STUN hole-punching. In such environments, TURN relay servers (`turn:` or `turns:`) are required.
- **Diagnostic Testing**: `PeerSession.testIceServers(iceServers)` provides on-demand STUN/TURN allocation verification, reporting discovered public IPs and TURN allocation errors (`onicecandidateerror`) directly to the UI.

---

## 7. Local Development & Verification

### Running the Application Locally
Since the project uses browser ES modules and WebRTC APIs, files must be served over an HTTP/HTTPS origin (not `file:///`):

```powershell
# Option 1: Python built-in HTTP server
python -m http.server 8080

# Option 2: Node serve
npx serve -l 8080 .
```

Navigate to `http://localhost:8080/index.html`.

### Verifying Changes
1. **Multi-Peer Testing**: Always test connection features across two separate browser windows (or one regular window and one Incognito window) to verify the two-way handshake.
2. **Console Verification**: Check browser DevTools (`F12`) for the startup log (`[P2P Connect] v7 ...`), verify WebSocket connections to relays (3/3), and check for clean WebRTC state transitions (`gathering` → `connecting` → `connected`).
3. **Flow Control Validation**: When testing file transfers, test with multiple large files (e.g., 5–8 images, 20+ MB total) to ensure backpressure watermarks prevent buffer exhaustion.
