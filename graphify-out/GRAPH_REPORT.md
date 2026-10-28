# Graph Report - webrtc-p2p  (2026-10-28)

## Corpus Check
- 54 files · ~132,971 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .bat 2, .zip 1)

## Summary
- 1343 nodes · 2574 edges · 91 communities (56 shown, 35 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 103 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2f1856f2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ui-controller.js
- weierstrass
- update
- bridge.py
- host-controller.js
- nostr.bundle.js
- check-invariants.py
- decode
- P2P Connect — Concepts Guide
- package.json
- encode
- remote-desktop-host/package.json
- close
- .analyze
- 7. `ui-controller.js` — UI Controller
- decode
- serve-https.py
- TestDiagnosticSystem
- assertNumber
- test_token_codec.py
- HeadlessChromeSession
- mock_relay.py
- TestOnDemandScreenCapture
- TestMockNostrRelay
- AGENTS.md — Developer & AI Agent Guide for P2P Connect
- nostr-transport.js
- hide
- test_remote_desktop_capture_e2e.py
- test_two_peer_handshake.py
- check-invariants.py
- decode
- install-linux-service.sh
- install-macos-agent.sh
- install-service.sh
- start-host.sh
- uninstall-service.sh
- get
- MockNostrRelay
- toast
- attachRemoteVideoInputListeners
- P2P Connect — Architecture & Production Notes
- ThreadedMockBridge
- P2P Connect — High-Level Design
- TestWebRtcContracts
- NostrRelay
- P2P Connect — Architecture
- 2. Triage Procedure
- TestMobileLifecycle
- P2P Connect — Roadmap
- P2P Connect — Native OS Remote Desktop Host Agent
- 🚀 1. Recommended Triage Prompts
- appendChatBubble
- DiagnosticServer
- initNostr
- run.sh
- P2P Connect — System Design
- serve-https.py
- loadRemoteDevices
- createCipher
- closeQrScanner
- ensureDesktopCapture
- tryNext
- ColoredTextTestResult
- initHostIdentity
- 4. `nostr-transport.js` — NostrTransport
- 8. AI Agent Guardrails: Graphify & Invariant Verifier
- classifyKind
- ai-diagnostic-agent.py
- 1. `webrtc-core.js` — PeerSession
- test_remote_desktop_capture_e2e.py
- 5. `nostr-signaling.js` — NostrSignaling
- 8. `chat-store.js` — ChatStore
- 3. `nostr-relay.js` — NostrRelay

## God Nodes (most connected - your core abstractions)
1. `toast()` - 40 edges
2. `hide()` - 32 edges
3. `TestDiagnosticSystem` - 30 edges
4. `initNostr()` - 29 edges
5. `show()` - 28 edges
6. `buildNostrSessionConfig()` - 24 edges
7. `MockNostrRelay` - 23 edges
8. `weierstrass()` - 21 edges
9. `update()` - 18 edges
10. `encode()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `13. Singleton & Factory Patterns` --references--> `NostrRelay`  [INFERRED]
  docs/concepts-guide.md → nostr-relay.js
- `Connection State Badge` --references--> `connected()`  [INFERRED]
  docs/system-design.md → nostr.bundle.js
- `Session Cleanup` --references--> `connected()`  [INFERRED]
  docs/system-design.md → nostr.bundle.js
- `9. Zero Unthrottled OS IPC in Capture/Input Loops (INV-11)` --references--> `stream_frames_loop()`  [INFERRED]
  AGENTS.md → remote-desktop-host/bridge.py
- `7. Native Host Bridge & OS Subsystem Invariants (`bridge.py`)` --references--> `map_client_coords()`  [INFERRED]
  AGENTS.md → remote-desktop-host/bridge.py

## Import Cycles
- None detected.

## Communities (91 total, 35 thin omitted)

### Community 0 - "ui-controller.js"
Cohesion: 0.10
Nodes (22): ChatStore, TokenCodec, applyRemoteAudioVolume(), applySavedRemoteAudioSettings(), attemptRdReconnect(), formatConnectionTime(), formatDate(), formatDuration() (+14 more)

### Community 1 - "weierstrass"
Cohesion: 0.07
Nodes (50): bytesToHex(), bytesToNumberBE(), bytesToNumberLE(), challenge(), concatBytes2(), createHmacDrbg(), ensureBytes(), Field() (+42 more)

### Community 2 - "update"
Cohesion: 0.10
Nodes (39): applySbox(), bytes3(), computeTag(), computeTag2(), constructor(), ctr32(), ctrCounter(), deriveKeys() (+31 more)

### Community 3 - "bridge.py"
Cohesion: 0.05
Nodes (37): 10. Remote Desktop Aspect Ratio & Stream Quality Encoding (INV-12), 1. ES Module Singleton Integrity (DO NOT BREAK), 2. Zero-Build Philosophy, 3. Media Track Replacement vs Renegotiation, 4. Storage Usage & Separation, 5. Mobile Background Suspensions & Auto-Reconnection, 6. Critical Invariants for AI Agents (MUST FOLLOW), 6. STUN/TURN Architecture & NAT Traversal (+29 more)

### Community 4 - "host-controller.js"
Cohesion: 0.16
Nodes (22): DiagnosticLogger, addAuthorizedClient(), btnToggleServiceCard, compressSignal(), currentCaptureTarget, decompressSignal(), dom, ensureNativeOnDemandCapture() (+14 more)

### Community 5 - "nostr.bundle.js"
Cohesion: 0.04
Nodes (41): binarySearch(), bytes2(), chachaCore(), concatBytes(), createCurve(), extract(), FpSqrt(), getConversationKey() (+33 more)

### Community 6 - "check-invariants.py"
Cohesion: 0.06
Nodes (17): 1. `test_no_query_params_on_internal_imports` Failed, 1. When to Use This Skill, 2. Test Architecture & Coverage, 2. `test_host_and_client_storage_keys_isolated` Failed, 3. How to Run Regressions, 3. `test_add_local_stream_passes_stream_to_add_track` Failed, 4. Failure Diagnosis & Resolution Runbook, 4. `test_dc_files_protocol_flow` or `test_datachannel_watermarks` Failed (+9 more)

### Community 7 - "decode"
Cohesion: 0.09
Nodes (30): apply0123(), bytesToHex2(), createRumor(), createSeal(), createWrap(), decrypt(), decrypt2(), encrypt2() (+22 more)

### Community 8 - "P2P Connect — Concepts Guide"
Cohesion: 0.13
Nodes (14): 10. Relay Management & Resilience, 11. Session Lifecycle, 12. Media Handling, 13. Singleton & Factory Patterns, 1. WebRTC Fundamentals, 2. DataChannels, 3. Perfect Negotiation Pattern, 4. Nostr Protocol Primer (+6 more)

### Community 9 - "package.json"
Cohesion: 0.09
Nodes (21): author, bugs, url, description, devDependencies, serve, homepage, keywords (+13 more)

### Community 10 - "encode"
Cohesion: 0.15
Nodes (20): encode(), encodeBech32(), encodeBytes(), encodeTLV(), encode(), getToken(), hashPayload(), hexToBytes2() (+12 more)

### Community 11 - "remote-desktop-host/package.json"
Cohesion: 0.14
Nodes (13): @nut-tree/nut-js, ws, BUTTON_MAP, wss, dependencies, @nut-tree/nut-js, ws, description (+5 more)

### Community 12 - "close"
Cohesion: 0.16
Nodes (15): auth(), close(), closeAllSubscriptions(), connect(), count(), destroy(), ensureRelay(), fire() (+7 more)

### Community 14 - "7. `ui-controller.js` — UI Controller"
Cohesion: 0.20
Nodes (10): 7. Local Development & Verification, Running the Application Locally, Verifying Changes, 7. `ui-controller.js` — UI Controller, Chat Message Protocol, Connection State Badge, localStorage Keys Used, Responsibilities (+2 more)

### Community 15 - "decode"
Cohesion: 0.13
Nodes (16): decode(), getZapEndpoint(), matchAll(), matchAll2(), parse2(), parseReferences(), parseTLV(), replaceAll() (+8 more)

### Community 16 - "serve-https.py"
Cohesion: 0.12
Nodes (5): get_modified_files(), main(), run_tests(), select_test_modules(), analyze_file()

### Community 18 - "assertNumber"
Cohesion: 0.21
Nodes (13): alphabet(), assertNumber(), bech32Polymod(), bechChecksum(), convertRadix(), convertRadix2(), genBech32(), decode2() (+5 more)

### Community 19 - "test_token_codec.py"
Cohesion: 0.17
Nodes (3): python_compress_token(), python_decompress_token(), TestTokenCodec

### Community 24 - "AGENTS.md — Developer & AI Agent Guide for P2P Connect"
Cohesion: 0.14
Nodes (14): 1. Project Overview & Philosophy, 2. Technology Stack & External Dependencies, 3. Module Map & Dependency Architecture, 4. Dual Connection Modes & Protocols, 5. WebRTC DataChannels Specification, 9. AI Support Agent & Developer Triage System, AGENTS.md — Developer & AI Agent Guide for P2P Connect, Core Tenets (+6 more)

### Community 25 - "nostr-transport.js"
Cohesion: 0.21
Nodes (7): loadNostrTools(), NostrCrypto, RelayState, NostrSignaling, DEFAULT_RELAYS, init(), PeerSession

### Community 26 - "hide"
Cohesion: 0.21
Nodes (27): buildIceServers(), buildNostrSessionConfig(), closeDiagnosticsModal(), copyText(), disableChat(), disconnectRemoteDesktop(), enableChat(), endMediaCall() (+19 more)

### Community 27 - "test_remote_desktop_capture_e2e.py"
Cohesion: 0.13
Nodes (5): make_close_frame(), make_pong_frame(), make_ws_frame(), read_ws_frame(), _run_cli()

### Community 28 - "test_two_peer_handshake.py"
Cohesion: 0.11
Nodes (5): find_chrome_binary(), QuietHTTPHandler, ReusableTCPServer, QuietHTTPHandler, ReusableTCPServer

### Community 29 - "check-invariants.py"
Cohesion: 0.07
Nodes (18): check_cache_busters(), check_file_transfer_protocol(), check_host_rejects_inactive_capture(), check_js_syntax_balance(), check_no_duplicate_singleton_imports(), check_no_import_query_params(), check_os_ipc_throttling_in_capture_loops(), check_rd_aspect_ratio_and_bitrate() (+10 more)

### Community 30 - "decode"
Cohesion: 0.19
Nodes (14): calcPaddedLen(), concatBytes3(), decodePayload(), decrypt3(), encrypt3(), equalBytes2(), expand(), getMessageKeys() (+6 more)

### Community 36 - "get"
Cohesion: 0.29
Nodes (7): clone(), _cloneInto(), get(), parseConnectionString(), querySync(), subscribeMany(), subscribeManyEose()

### Community 37 - "MockNostrRelay"
Cohesion: 0.08
Nodes (3): ThreadedMockRelay, ThreadedMockRelay, MockNostrRelay

### Community 38 - "toast"
Cohesion: 0.22
Nodes (19): acceptIncomingCall(), attachDisplaysMenuListeners(), connectLocalBridge(), disconnectLocalBridge(), getVideoConstraints(), handleIncomingInputEvent(), initMobileTouchAndSoftKeys(), populateDeviceSelectors() (+11 more)

### Community 39 - "attachRemoteVideoInputListeners"
Cohesion: 0.16
Nodes (19): applyRdZoomTransform(), attachRemoteVideoInputListeners(), clampPan(), cycleFitMode(), getNormalizedVideoCoordinates(), getPanLimits(), renderVirtualCursor(), resetRdZoom() (+11 more)

### Community 40 - "P2P Connect — Architecture & Production Notes"
Cohesion: 0.13
Nodes (14): Architecture Overview, Connection Flow, Long-term (production infrastructure), Medium-term (minimal server), Module Responsibilities, P2P Connect — Architecture & Production Notes, Real-World Limitations of No-Signaling-Server Design, Risks of Manual Signaling (+6 more)

### Community 42 - "ThreadedMockBridge"
Cohesion: 0.08
Nodes (5): make_ws_frame(), MockHostBridge, read_ws_frame(), ThreadedMockBridge, _run()

### Community 43 - "P2P Connect — High-Level Design"
Cohesion: 0.14
Nodes (13): 1. What It Is, 2. Architecture Overview, 3. Two Connection Modes, 4. Feature Set, 5. Security Model, 6. Technology Stack, 7. File Map, Key Properties (+5 more)

### Community 47 - "P2P Connect — Architecture"
Cohesion: 0.04
Nodes (43): 10. External Dependencies, 1. Overview, 2. Architecture Diagram, 3. Module Map, 4. Connection Modes, 5. Security Model, 6. NAT Traversal & TURN, 7. Design Decisions & Trade-offs (+35 more)

### Community 49 - "2. Triage Procedure"
Cohesion: 0.22
Nodes (8): 1. When to Use This Skill, 2. Triage Procedure, Step 1: List and Inspect Inbox Contents, Step 2: Deep Package Diagnosis, Step 3: Codebase Cross-Referencing, Step 4: Propose Fix for Developer Review, Step 5: Implementation & Verification, Support Triage & Issue Resolution Skill

### Community 51 - "P2P Connect — Roadmap"
Cohesion: 0.22
Nodes (8): 💡 Backlog / Ideas, P2P Connect — Roadmap, ✅ Phase 0: Foundation (Complete), 🔜 Phase 1: Group Chat, 📞 Phase 2: Group Calling, 📱 Phase 3: Native Applications, 🔒 Phase 4: Enhanced Security & Privacy, 🌐 Phase 5: Scalability & Infrastructure

### Community 52 - "P2P Connect — Native OS Remote Desktop Host Agent"
Cohesion: 0.07
Nodes (28): 1. Install & Start Service, 1. Install & Start Service, 1. Install via Batch Script (Recommended), 2. Manage the Service, 2. Manual Setup via PowerShell / Command Prompt, 2. Useful systemd Commands, 3. Manage & Check Status, 3. Uninstall (+20 more)

### Community 54 - "🚀 1. Recommended Triage Prompts"
Cohesion: 0.25
Nodes (7): 🚀 1. Recommended Triage Prompts, 🛠️ 2. How the Triage Loop Operates, 📋 Developer Triage Prompt Guide, Full Autonomous Diagnosis & Fix Proposal, Inspect Screenshots & Visual Errors, Quick Triage & Summary (Everyday Check), Specific Client Investigation

### Community 55 - "appendChatBubble"
Cohesion: 0.20
Nodes (18): analyzeUserSupportComment(), appendChatBubble(), deliverAiSupportMessage(), ensurePeerConnected(), cleanup(), escapeHtml(), formatDiagnosticBubbleHtml(), formatFileSize() (+10 more)

### Community 58 - "initNostr"
Cohesion: 0.19
Nodes (16): addContact(), ensureSupportAgentContact(), getHostStatusDisplay(), handleAppResume(), initNostr(), loadContacts(), pingAllRemoteDevices(), removeContact() (+8 more)

### Community 61 - "P2P Connect — System Design"
Cohesion: 0.25
Nodes (7): 2. `nostr-crypto.js` — NostrCrypto, 6. `token-codec.js` — TokenCodec, 9. External Dependencies (CDN), Functions, Module Dependency Graph, P2P Connect — System Design, Token Format (v2)

### Community 62 - "serve-https.py"
Cohesion: 0.17
Nodes (4): DevHandler, ensure_certificate(), get_local_ip_addresses(), main()

### Community 65 - "loadRemoteDevices"
Cohesion: 0.26
Nodes (15): addOrUpdateRemoteDevice(), checkUrlRemoteHostParam(), connectToRemoteDevice(), deriveKey(), exportFleet(), exportKey(), importFleet(), importKey() (+7 more)

### Community 75 - "createCipher"
Cohesion: 0.40
Nodes (6): bool2(), checkOpts(), createCipher(), isAligned32(), number3(), runCipher()

### Community 77 - "closeQrScanner"
Cohesion: 0.83
Nodes (4): closeQrScanner(), openQrScanner(), scanFrame(), startCameraStream()

### Community 78 - "ensureDesktopCapture"
Cohesion: 0.28
Nodes (9): acquireScreenWakeLock(), ensureDesktopCapture(), hideStartCaptureModal(), isUserCancellation(), releaseScreenWakeLock(), renderNativeFrameToCanvas(), stopDesktopCapture(), stopNativeOnDemandCapture() (+1 more)

### Community 79 - "tryNext"
Cohesion: 0.48
Nodes (7): broadcastBridgeStatus(), clearBridgeReconnectTimer(), connectBridge(), tryNext(), getCandidateBridgeUrls(), isHostStreamLive(), scheduleBridgeReconnect()

### Community 81 - "initHostIdentity"
Cohesion: 0.40
Nodes (5): generateSecurePassword(), initHostIdentity(), updatePinValidationUI(), renderPairingQR(), validatePasswordComplexity()

### Community 82 - "4. `nostr-transport.js` — NostrTransport"
Cohesion: 0.25
Nodes (8): 4. `nostr-transport.js` — NostrTransport, Constants, Encrypted Payload Schema, Inbound Event Processing Pipeline, Nostr Event Format, Public API, Publish Failover Flow, Storage Keys

### Community 83 - "8. AI Agent Guardrails: Graphify & Invariant Verifier"
Cohesion: 0.33
Nodes (6): 1. Structural Knowledge Graph (Graphify), 2. Mandatory Regression Runner (`run-regressions.py`) & Invariant Verifier, 3. Custom Antigravity Skill & Subagent, 8. AI Agent Guardrails: Graphify & Invariant Verifier, Headless Chrome E2E Suites in `tests/e2e/`, Test Suites in `tests/`

### Community 84 - "classifyKind"
Cohesion: 0.40
Nodes (6): classifyKind(), getFilterLimit(), isEphemeralKind(), isParameterizedReplaceableKind(), isRegularKind(), isReplaceableKind()

### Community 85 - "ai-diagnostic-agent.py"
Cohesion: 0.18
Nodes (11): add_authorized_client(), find_chrome_binary(), is_client_authorized(), launch_headless_bridge(), cleanup(), load_whitelist(), print_inbox(), print_whitelist() (+3 more)

### Community 86 - "1. `webrtc-core.js` — PeerSession"
Cohesion: 0.40
Nodes (5): 1. `webrtc-core.js` — PeerSession, DataChannels, File Transfer Protocol, Public API, Renegotiation (Perfect Negotiation Pattern)

### Community 87 - "test_remote_desktop_capture_e2e.py"
Cohesion: 0.15
Nodes (3): HeadlessChromeSession, TestRemoteDesktopCaptureE2E, TestTwoPeerHandshakeE2E

### Community 88 - "5. `nostr-signaling.js` — NostrSignaling"
Cohesion: 0.40
Nodes (5): 5. `nostr-signaling.js` — NostrSignaling, Compression, ICE Candidate Batching, Session State, Signal Flow

### Community 89 - "8. `chat-store.js` — ChatStore"
Cohesion: 0.40
Nodes (5): 8. `chat-store.js` — ChatStore, Constants, Message Schema, Public API, Storage Format

### Community 90 - "3. `nostr-relay.js` — NostrRelay"
Cohesion: 0.50
Nodes (4): 3. `nostr-relay.js` — NostrRelay, Key Behaviors, Protocol Messages, States (`RelayState`)

## Knowledge Gaps
- **1 isolated node(s):** `serve`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 490 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `6. Critical Invariants for AI Agents (MUST FOLLOW)` connect `bridge.py` to `AGENTS.md — Developer & AI Agent Guide for P2P Connect`?**
  _High betweenness centrality (0.450) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `initNostr()` (e.g. with `buildIceServers()` and `buildNostrSessionConfig()`) actually correct?**
  _`initNostr()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `serve` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ui-controller.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1010752688172043 - nodes in this community are weakly interconnected._
- **Why does `AGENTS.md — Developer & AI Agent Guide for P2P Connect` connect `AGENTS.md — Developer & AI Agent Guide for P2P Connect` to `8. AI Agent Guardrails: Graphify & Invariant Verifier`, `bridge.py`, `7. `ui-controller.js` — UI Controller`, `P2P Connect — Architecture`?**
  _High betweenness centrality (0.311) - this node is a cross-community bridge._
- **Should `weierstrass` be split into smaller, more focused modules?**
  _Cohesion score 0.0726764500349406 - nodes in this community are weakly interconnected._
- **Should `update` be split into smaller, more focused modules?**
  _Cohesion score 0.09581646423751687 - nodes in this community are weakly interconnected._