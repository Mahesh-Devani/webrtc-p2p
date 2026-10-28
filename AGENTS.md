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

### 7. Native Host Bridge & OS Subsystem Invariants (`bridge.py`)
- **IOKit Power Assertion Token Idempotency**:
  - Never use a raw integer reference counter for system-wide power assertions (`IOPMAssertionCreateWithName`, `kIOPMAssertionTypePreventUserIdleDisplaySleep`).
  - Target switching or rapid reconnects can leak counter increments. If held indefinitely, external monitor hardware (e.g., Samsung Odyssey DP/HDMI link renegotiation / CEC wake) can attempt display link handshake while assertion is active, causing SkyLight/WindowServer deadlock on ARM64 Apple Silicon and freezing mouse/keyboard HID threads.
  - **Rule**: Use a token-based set (`self._active_tokens = set()`), enforce token idempotency across target switches, and provide unconditional cleanup on `release(force=True)` upon session teardown.
- **64-bit CoreFoundation / CoreGraphics Pointer Integrity (ARM64 / x86_64)**:
  - Python `ctypes` defaults function return types to 32-bit `c_int`. On 64-bit macOS architectures (especially Apple Silicon ARM64), pointers returned by CoreFoundation / CoreGraphics APIs (e.g., `CGWindowListCopyWindowInfo`, `CFArrayGetCount`, `CFStringCreateWithCString`) reside at 64-bit addresses (e.g., `0x10501c1c0`).
  - Without explicit `restype = ctypes.c_void_p`, pointers are truncated to 32 bits (`0x501c1c0`), producing immediate `EXC_BAD_ACCESS (SIGSEGV)` crashes when passed to subsequent CoreFoundation functions.
  - **Rule**: All `ctypes` CoreFoundation and CoreGraphics bindings MUST specify explicit `restype = ctypes.c_void_p` and complete `argtypes`.
- **CoreFoundation String Allocation Pooling & IPC Throttling**:
  - Repeated allocation and release of constant CFString keys (e.g., `kCGWindowNumber`, `kCGWindowBounds`, `kCGWindowOwnerName`) during high-frequency cursor mapping causes memory churn.
  - Pre-allocate constant CFString references once during capturer initialization (`_init_platform()`).
  - **Rule**: Throttle `CGWindowListCopyWindowInfo` queries in cursor coordinate mapping (`map_client_coords()`) to at most 1 per second, caching geometry timestamps even if lookup returns `None` to prevent WindowServer IPC flooding.
- **Headless Chrome E2E Testing & Dialog Safety**:
  - Avoid browser modal dialogs (`prompt()`, `alert()`, `confirm()`) in automated testing environments. In headless Chrome, synchronous modals freeze the JavaScript event loop and block all subsequent Chrome DevTools Protocol (CDP) commands.
  - Use URL hash fragments (`#pin=...`) to supply credentials and bypass interactive prompts during automated headless runs.
  - Ensure URL parameter cleanup routines (`replaceState`) preserve query parameters (such as `?relay=...&relay-only=1`) required by other asynchronous subsystems.

### 8. Signaling Idempotency & Re-subscription Shielding (INV-10)
- **Replay Behavior on Reconnect**: Nostr relays replay matching historical events upon WebSocket reconnection or re-subscription (`_resubscribeAll()`).
- **Shielded Keep-Alives**: Background timers (such as the 15s or 20s keep-alive heartbeats in `host-controller.js`) MUST NEVER trigger transport reconnection while an active P2P session is established (`if (!activeSession)`).
- **Offer Idempotency & Staleness Protection**:
  - The `unattended_offer` handler must check `if (activeSession && activeSessionId === sessionId) return;` to ignore replayed offers for already active sessions.
  - Offers older than 45 seconds (`(Date.now() - signal.ts) / 1000 > 45`) must be dropped immediately.
  - `activeSessionId` must be cleared whenever the active session closes (`onCallEnded`, `onChannelClose`, `session_ended`).

### 9. Zero Unthrottled OS IPC in Capture/Input Loops (INV-11)
- **Mach IPC & WindowServer Saturation**: Native OS status/geometry queries (e.g. `CGSessionCopyCurrentDictionary`, `CGWindowListCopyWindowInfo`, Win32 `EnumWindows`) perform synchronous IPC to WindowServer or the window manager.
- **Rule**: Never invoke unthrottled OS status queries inside high-frequency capture loops (`stream_frames_loop` at 30–60 FPS) or cursor coordinate mappers (`map_client_coords` at 60–120 Hz).
- **Monotonic Caching**: All status queries (such as `is_screen_locked(max_age=1.0)`) must cache results using `time.monotonic()` to query the operating system at most once per second.

### 10. Remote Desktop Aspect Ratio & Stream Quality Encoding (INV-12)
- **Ultrawide Resolution Support (32:9 and 21:9)**: Never assume a 16:9 aspect ratio when setting canvas scaling limits. Setting `MAX_STREAM_WIDTH = 2560` crushes a 5120x1440 (32:9) display into 720p vertical resolution (`2560 * 9 / 32 = 720`).
- **Rule**: Remote Desktop canvas scaling in `host-controller.js` must be at least `MAX_STREAM_WIDTH = 3840` and `MAX_STREAM_HEIGHT = 2160`, allowing 5120x1440 to stream at 3840x1080 (full 1080p vertical clarity).
- **Proactive Bitrate Allocation**: Chrome starts WebRTC video senders at ~1.5 Mbps unless explicitly configured. `host-controller.js` must invoke `peerSession.setVideoQuality(12_000_000, 60)` immediately upon channel connection.
- **Hardware JPEG Compression Quality**: In `bridge.py`, ImageIO JPEG compression on macOS must pre-allocate `kCGImageDestinationLossyCompressionQuality = 0.85` rather than default `None` (~0.55).

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
1. **Automated Invariant Check**: ALWAYS run `python3 check-invariants.py` before concluding any task. All 12 invariants must pass.
2. **Multi-Peer Testing**: Always test connection features across two separate browser windows (or one regular window and one Incognito window) to verify the two-way handshake.
3. **Console Verification**: Check browser DevTools (`F12`) for the startup log (`[P2P Connect] v7 ...`), verify WebSocket connections to relays (3/3), and check for clean WebRTC state transitions (`gathering` → `connecting` → `connected`).
4. **Flow Control Validation**: When testing file transfers, test with multiple large files (e.g., 5–8 images, 20+ MB total) to ensure backpressure watermarks prevent buffer exhaustion.

---

## 8. AI Agent Guardrails: Graphify & Invariant Verifier

### 1. Structural Knowledge Graph (Graphify)
The project includes a local, deterministic AST knowledge graph generated by Graphify:
- `graphify-out/wiki/index.md`: Modular subsystem wiki articles for fast navigation without reading massive source files.
- `graphify-out/graph.html`: Interactive visual graph of all nodes, functions, and call edges. Open directly in a browser.
- `graphify-out/GRAPH_REPORT.md`: God nodes, central hubs, and unexpected connections.
- After modifying code files, keep the graph fresh:
  ```bash
  graphify update .
  ```

### 2. Mandatory Regression Runner (`run-regressions.py`) & Invariant Verifier
> [!IMPORTANT]
> **Every AI agent MUST run `python3 run-regressions.py` (or `python3 run-regressions.py --all`) before finishing a task or committing code.**

The project features a zero-token, change-aware local regression test suite in `tests/`:
- **Change-Aware Execution**: `python3 run-regressions.py` inspects git diffs and runs only the suites mapped to modified files.
- **Full Suite**: `python3 run-regressions.py --all` executes all 93 unit tests across 8 test suites in ~0.2s.
- **E2E Browser Testing**: `python3 run-regressions.py --e2e` executes real headless Chrome browser tests verifying peer handshakes, Nostr signaling, and dynamic remote desktop capture/switching.
- **Pre-Commit Enforcement**: The `.git/hooks/pre-commit` hook automatically runs `python3 run-regressions.py --pre-commit` before every commit.

#### Test Suites in `tests/`
1. **`test_invariants.py`**: Enforces the 12 architectural invariants (ES singletons, storage isolation, `a=msid`, file flow, cache busters, Tree-sitter JS AST syntax, host capture check, Nostr signal type whitelisting, signaling idempotency, OS IPC loop throttling, ultrawide stream quality).
2. **`test_host_security.py`**: Password complexity (10+ chars, upper, lower, digit, symbol), password generator, and client whitelist enforcement.
3. **`test_webrtc_contracts.py`**: All 4 DataChannels (`p2p-sig`, `p2p-chat`, `p2p-files`, `p2p-input`), transceiver directions (`sendonly`/`inactive`), 15 Mbps / 60 FPS bitrate limits, and backpressure drain check (`waitForBufferDrain(dcFiles, 0)`).
4. **`test_token_codec.py`**: `P2P2-` prefix, candidate metadata stripping, zlib roundtrip compression, and null pubkey UI safety.
5. **`test_mobile_lifecycle.py`**: 4-second transient disconnect debounce, `visibilitychange` relay/P2P wakeup, and auto-reconnect on send.
6. **`test_diagnostics.py`**: In-browser client diagnostic rules, AI diagnostic reporting, support agent whitelist and NIP-01 transport.
7. **`test_mock_relay.py`**: Standalone Nostr relay RFC implementation, pubkey filter matching, NIP-11 information document.
8. **`test_on_demand_capture.py`**: Display wake manager token idempotency, NativeFrameCapturer Apple Silicon pointer safety, zero-gesture offscreen canvas stream, and view-only fallback.

#### Headless Chrome E2E Suites in `tests/e2e/`
1. **`test_two_peer_handshake.py`**: Two distinct headless Chrome peers (Alice & Bob), secp256k1 key generation, automated Nostr handshake, WebRTC DataChannel connection, and bidirectional encrypted chat.
2. **`test_remote_desktop_capture_e2e.py`**: Host and Client headless Chrome sessions, OS bridge connectivity, remote desktop unattended session establishment, dynamic display/window target switching, and stop/start capture lifecycle.

### 3. Custom Antigravity Skill & Subagent
- **Custom Skill**: `.agents/skills/regression-testing/SKILL.md` — Teaches agents how to intelligently run regressions, diagnose invariant failures, and add new regression tests. Can also be run via `.agents/skills/regression-testing/scripts/run.sh`.
- **Custom Subagent**: `regression-verifier` — Defined to run zero-token local regressions, inspect diffs, and report actionable root-cause diagnostics.

---

## 9. AI Support Agent & Developer Triage System

The project features a dual-tier diagnostic and issue reporting system:
1. **Tier 1 (Client-Side Engine)**: Embedded in `ui-controller.js`. Evaluates live WebRTC state variables, handles screenshots without WebRTC P2P dialing, and provides instant status explanations with zero backend dependencies. It runs 100% in the user's browser, making the agent always active even without a local Python server.
2. **Tier 2 (Developer Ingestion & Inbox)**: `support-agent/ai-diagnostic-agent.py` listens on `http://127.0.0.1:9998/` and stores log packages, comments, and screenshots in `support-agent/diagnostics-inbox/`.
3. **Developer + Antigravity Workflow**:
   - The developer can prompt: `"Check the support inbox and analyze any reported issues."`
   - Antigravity executes `python3 support-agent/ai-diagnostic-agent.py --inbox`, inspects incoming telemetry, diagnoses the root cause, and proposes a verified code fix for developer review before committing.
   - For complete documentation, see [`support-agent/README.md`](support-agent/README.md).



