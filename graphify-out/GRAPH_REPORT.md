# Graph Report - webrtc-p2p  (2026-11-13)

## Corpus Check
- 60 files · ~152,173 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .bat 2, .zip 1)

## Summary
- 1482 nodes · 2852 edges · 99 communities (62 shown, 37 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 121 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7143c050`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ui-controller.js
- weierstrass
- update
- bridge.py
- host-controller.js
- nostr.bundle.js
- MockHostBridge
- decode
- NostrRelay
- package.json
- encode
- remote-desktop-host/package.json
- close
- .analyze
- 5. `nostr-signaling.js` — NostrSignaling
- TestCoordinateMappingAndPreemption
- test_remote_desktop_capture_e2e.py
- TestDiagnosticSystem
- assertNumber
- bytes3
- CdpTab
- decrypt3
- TestOnDemandScreenCapture
- test_two_peer_handshake.py
- AGENTS.md — Developer & AI Agent Guide for P2P Connect
- format_remediation_box
- hide
- 6. Critical Invariants for AI Agents (MUST FOLLOW)
- TestHostSecurity
- check-invariants.py
- Linux (systemd User Service)
- install-linux-service.sh
- install-macos-agent.sh
- install-service.sh script
- start-host.sh
- uninstall-service.sh
- 🤖 AI Support Agent & Developer Triage System
- MockNostrRelay
- toast
- attachRemoteVideoInputListeners
- P2P Connect — Architecture & Production Notes
- NativeFrameCapturer
- ThreadedMockBridge
- P2P Connect — High-Level Design
- TestWebRtcContracts
- pathlib
- DevHandler
- DisplayWakeManager
- 2. Triage Procedure
- TestMobileLifecycle
- P2P Connect — Roadmap
- ai-diagnostic-agent.py
- 5. Future Roadmap & Proposed Improvements
- 🚀 1. Recommended Triage Prompts
- appendChatBubble
- P2P Connect — Native OS Remote Desktop Host Agent
- validateEvent2
- initNostr
- P2P Connect — System Design
- run.sh
- P2P Connect — Architecture
- How to Download & Run the Host Agent
- 4. `nostr-transport.js` — NostrTransport
- test_token_codec.py
- loadRemoteDevices
- get
- 8. AI Agent Guardrails: Graphify & Invariant Verifier
- cdp_client.py
- classifyKind
- 1. `webrtc-core.js` — PeerSession
- 8. `chat-store.js` — ChatStore
- 4. Dual Connection Modes & Protocols
- closeQrScanner
- 🔐 P2P Connect
- ColoredTextTestResult
- QuietHTTPHandler
- TestMockNostrRelay
- Windows (Task Scheduler & pythonw)
- 3. `nostr-relay.js` — NostrRelay
- 7. `ui-controller.js` — UI Controller

## God Nodes (most connected - your core abstractions)
1. `toast()` - 44 edges
2. `hide()` - 36 edges
3. `show()` - 32 edges
4. `TestDiagnosticSystem` - 30 edges
5. `initNostr()` - 29 edges
6. `buildNostrSessionConfig()` - 25 edges
7. `MockNostrRelay` - 24 edges
8. `handle_client()` - 22 edges
9. `weierstrass()` - 21 edges
10. `TestOnDemandScreenCapture` - 19 edges

## Surprising Connections (you probably didn't know these)
- `4. Architectural Invariants Enforced in Code` --references--> `isHostStreamLive()`  [INFERRED]
  docs/remote-desktop-knowledge-base.md → host-controller.js
- `1. Dirty-Frame Detection & Adaptive FPS (Near-Term)` --references--> `stream_frames_loop()`  [INFERRED]
  docs/remote-desktop-knowledge-base.md → remote-desktop-host/bridge.py
- `11. Virtual Trackpad Vertical Movement Skew on Ultrawide Streams` --references--> `getVideoActualDimensions()`  [INFERRED]
  docs/remote-desktop-knowledge-base.md → ui-controller.js
- `13. Singleton & Factory Patterns` --references--> `NostrRelay`  [INFERRED]
  docs/concepts-guide.md → nostr-relay.js
- `2. Where We Stand vs. Initial Plan` --references--> `DisplayWakeManager`  [INFERRED]
  docs/remote-desktop-knowledge-base.md → remote-desktop-host/bridge.py

## Import Cycles
- None detected.

## Communities (99 total, 37 thin omitted)

### Community 0 - "ui-controller.js"
Cohesion: 0.10
Nodes (25): ChatStore, TokenCodec, addContact(), applyRemoteAudioVolume(), applySavedRemoteAudioSettings(), attemptRdReconnect(), closeDiagnosticsModal(), ensureSupportAgentContact() (+17 more)

### Community 1 - "weierstrass"
Cohesion: 0.08
Nodes (47): bytesToHex(), bytesToNumberBE(), bytesToNumberLE(), challenge(), concatBytes2(), createHmacDrbg(), ensureBytes(), Field() (+39 more)

### Community 2 - "update"
Cohesion: 0.11
Nodes (30): computeTag(), computeTag2(), constructor(), digest(), digestInto(), exists(), exists3(), extract() (+22 more)

### Community 3 - "bridge.py"
Cohesion: 0.10
Nodes (24): CGPoint, EncoderParameter, execute_mouse_move(), GUID, handle_client(), is_origin_allowed(), load_host_config(), load_or_create_token() (+16 more)

### Community 4 - "host-controller.js"
Cohesion: 0.07
Nodes (60): DiagnosticLogger, acquireScreenWakeLock(), addAuthorizedClient(), applyHostConfigFromBridge(), broadcastBridgeStatus(), btnToggleServiceCard, clearBridgeReconnectTimer(), compressSignal() (+52 more)

### Community 5 - "nostr.bundle.js"
Cohesion: 0.04
Nodes (43): binarySearch(), bytes2(), chachaCore(), concatBytes(), createCurve(), FpInvertBatch(), FpPow(), FpSqrt() (+35 more)

### Community 7 - "decode"
Cohesion: 0.12
Nodes (22): bytesToHex2(), createRumor(), createSeal(), createWrap(), fastEventHash(), finalizeEvent(), finishReactionEvent(), finishRepostEvent() (+14 more)

### Community 8 - "NostrRelay"
Cohesion: 0.09
Nodes (18): 8. Signaling Idempotency & Re-subscription Shielding (INV-10), 10. Relay Management & Resilience, 11. Session Lifecycle, 12. Media Handling, 13. Singleton & Factory Patterns, 1. WebRTC Fundamentals, 2. DataChannels, 3. Perfect Negotiation Pattern (+10 more)

### Community 9 - "package.json"
Cohesion: 0.09
Nodes (21): author, bugs, url, description, devDependencies, serve, homepage, keywords (+13 more)

### Community 10 - "encode"
Cohesion: 0.15
Nodes (22): concatBytes3(), encode(), encodeBech32(), encodeBytes(), encodeTLV(), encrypt3(), encode(), getToken() (+14 more)

### Community 11 - "remote-desktop-host/package.json"
Cohesion: 0.14
Nodes (13): @nut-tree/nut-js, ws, BUTTON_MAP, wss, dependencies, @nut-tree/nut-js, ws, description (+5 more)

### Community 12 - "close"
Cohesion: 0.18
Nodes (14): auth(), close(), closeAllSubscriptions(), connect(), count(), ensureRelay(), fire(), makeAuthEvent() (+6 more)

### Community 14 - "5. `nostr-signaling.js` — NostrSignaling"
Cohesion: 0.18
Nodes (11): 7. Local Development & Verification, Running the Application Locally, Verifying Changes, 5. `nostr-signaling.js` — NostrSignaling, Compression, Connection State Badge, ICE Candidate Batching, Session Cleanup (+3 more)

### Community 16 - "test_remote_desktop_capture_e2e.py"
Cohesion: 0.09
Nodes (8): make_ws_frame(), read_ws_frame(), event_matches_any_filter(), event_matches_filter(), make_close_frame(), make_pong_frame(), make_ws_frame(), read_ws_frame()

### Community 18 - "assertNumber"
Cohesion: 0.21
Nodes (13): alphabet(), assertNumber(), bech32Polymod(), bechChecksum(), convertRadix(), convertRadix2(), genBech32(), decode2() (+5 more)

### Community 19 - "bytes3"
Cohesion: 0.11
Nodes (27): apply0123(), applySbox(), bool2(), bytes3(), checkOpts(), createCipher(), ctr32(), ctrCounter() (+19 more)

### Community 21 - "decrypt3"
Cohesion: 0.12
Nodes (18): calcPaddedLen(), decode(), decodePayload(), decrypt3(), equalBytes2(), expand(), getMessageKeys(), getZapEndpoint() (+10 more)

### Community 23 - "test_two_peer_handshake.py"
Cohesion: 0.09
Nodes (4): HeadlessChromeSession, TestRemoteDesktopCaptureE2E, ReusableTCPServer, TestTwoPeerHandshakeE2E

### Community 24 - "AGENTS.md — Developer & AI Agent Guide for P2P Connect"
Cohesion: 0.18
Nodes (11): 10. Remote Desktop Knowledge Base & Architectural Learnings, 1. Project Overview & Philosophy, 2. Technology Stack & External Dependencies, 3. Module Map & Dependency Architecture, 5. WebRTC DataChannels Specification, 9. AI Support Agent & Developer Triage System, AGENTS.md — Developer & AI Agent Guide for P2P Connect, Core Tenets (+3 more)

### Community 25 - "format_remediation_box"
Cohesion: 0.06
Nodes (17): 1. `test_no_query_params_on_internal_imports` Failed, 1. When to Use This Skill, 2. Test Architecture & Coverage, 2. `test_host_and_client_storage_keys_isolated` Failed, 3. How to Run Regressions, 3. `test_add_local_stream_passes_stream_to_add_track` Failed, 4. Failure Diagnosis & Resolution Runbook, 4. `test_dc_files_protocol_flow` or `test_datachannel_watermarks` Failed (+9 more)

### Community 26 - "hide"
Cohesion: 0.26
Nodes (22): buildIceServers(), buildNostrSessionConfig(), copyText(), disableChat(), disconnectRemoteDesktop(), enableChat(), endMediaCall(), exitRemoteDesktopMode() (+14 more)

### Community 27 - "6. Critical Invariants for AI Agents (MUST FOLLOW)"
Cohesion: 0.14
Nodes (16): 10. Remote Desktop Aspect Ratio & Stream Quality Encoding (INV-12), 11. Remote Desktop Hosting Modes & macOS TCC Boundaries, 1. ES Module Singleton Integrity (DO NOT BREAK), 2. Zero-Build Philosophy, 3. Media Track Replacement vs Renegotiation, 4. Storage Usage & Separation, 5. Mobile Background Suspensions & Auto-Reconnection, 6. Critical Invariants for AI Agents (MUST FOLLOW) (+8 more)

### Community 28 - "TestHostSecurity"
Cohesion: 0.08
Nodes (3): is_client_authorized(), TestHostSecurity, validate_password_complexity()

### Community 29 - "check-invariants.py"
Cohesion: 0.15
Nodes (15): check_cache_busters(), check_file_transfer_protocol(), check_host_rejects_inactive_capture(), check_js_syntax_balance(), check_no_duplicate_singleton_imports(), check_no_import_query_params(), check_os_ipc_throttling_in_capture_loops(), check_rd_aspect_ratio_and_bitrate() (+7 more)

### Community 30 - "Linux (systemd User Service)"
Cohesion: 0.22
Nodes (9): 1. Install & Start Service, 1. Install & Start Service, 2. Manage the Service, 2. Useful systemd Commands, 3. Uninstall, 3. Uninstall, Linux (systemd User Service), macOS (LaunchAgent — Approach A Experimental) (+1 more)

### Community 34 - "start-host.sh"
Cohesion: 0.40
Nodes (3): cleanup_stale_chrome_lock(), start-host.sh script, switch-to-interactive.sh script

### Community 36 - "🤖 AI Support Agent & Developer Triage System"
Cohesion: 0.12
Nodes (16): 1. Dual-Tier Architecture, 2. Why Does the Support Agent Run When the Python Script Is Not Started?, 3. Developer + Antigravity Triage Workflow, 4. CLI Reference for `ai-diagnostic-agent.py`, 5. Client Authorization Whitelist & Anti-Flooding Shield, 🤖 AI Support Agent & Developer Triage System, CLI Whitelist Commands, Dual-Layer Defense Architecture (+8 more)

### Community 37 - "MockNostrRelay"
Cohesion: 0.07
Nodes (3): ThreadedMockRelay, MockNostrRelay, _run_cli()

### Community 38 - "toast"
Cohesion: 0.21
Nodes (20): acceptIncomingCall(), attachDisplaysMenuListeners(), connectLocalBridge(), disconnectLocalBridge(), getVideoConstraints(), handleIncomingInputEvent(), initMobileTouchAndSoftKeys(), populateDeviceSelectors() (+12 more)

### Community 39 - "attachRemoteVideoInputListeners"
Cohesion: 0.18
Nodes (19): applyRdZoomTransform(), attachRemoteVideoInputListeners(), clampPan(), cycleFitMode(), getNormalizedVideoCoordinates(), getPanLimits(), getVideoActualDimensions(), renderVirtualCursor() (+11 more)

### Community 40 - "P2P Connect — Architecture & Production Notes"
Cohesion: 0.13
Nodes (14): Architecture Overview, Connection Flow, Long-term (production infrastructure), Medium-term (minimal server), Module Responsibilities, P2P Connect — Architecture & Production Notes, Real-World Limitations of No-Signaling-Server Design, Risks of Manual Signaling (+6 more)

### Community 41 - "NativeFrameCapturer"
Cohesion: 0.14
Nodes (5): CGRect, CGSize, EncoderParameters, GdiplusStartupInput, NativeFrameCapturer

### Community 42 - "ThreadedMockBridge"
Cohesion: 0.09
Nodes (7): find_chrome_binary(), QuietHTTPHandler, ReusableTCPServer, ThreadedMockBridge, _run(), ThreadedMockRelay, TestRemoteDesktopLifecycleE2E

### Community 43 - "P2P Connect — High-Level Design"
Cohesion: 0.14
Nodes (13): 1. What It Is, 2. Architecture Overview, 3. Two Connection Modes, 4. Feature Set, 5. Security Model, 6. Technology Stack, 7. File Map, Key Properties (+5 more)

### Community 45 - "pathlib"
Cohesion: 0.11
Nodes (4): get_modified_files(), main(), run_tests(), select_test_modules()

### Community 49 - "2. Triage Procedure"
Cohesion: 0.22
Nodes (8): 1. When to Use This Skill, 2. Triage Procedure, Step 1: List and Inspect Inbox Contents, Step 2: Deep Package Diagnosis, Step 3: Codebase Cross-Referencing, Step 4: Propose Fix for Developer Review, Step 5: Implementation & Verification, Support Triage & Issue Resolution Skill

### Community 51 - "P2P Connect — Roadmap"
Cohesion: 0.18
Nodes (10): 💡 Backlog / Ideas, 📱 Mobile & Desktop Client Applications, P2P Connect — Roadmap, ✅ Phase 0: Foundation (Complete), 🔜 Phase 1: Group Chat, 📞 Phase 2: Group Calling, 📱 Phase 3: Native Applications & Unattended Host Companions, 🔒 Phase 4: Enhanced Security & Privacy (+2 more)

### Community 52 - "ai-diagnostic-agent.py"
Cohesion: 0.13
Nodes (12): add_authorized_client(), DiagnosticServer, find_chrome_binary(), is_client_authorized(), launch_headless_bridge(), cleanup(), load_whitelist(), print_inbox() (+4 more)

### Community 53 - "5. Future Roadmap & Proposed Improvements"
Cohesion: 0.06
Nodes (30): 0. Approach B: Native macOS Menu Bar Companion (`P2P Connect Host.app`) — Target Architecture, 10. Ultrawide Aspect Ratio (32:9) Stream Downscaling Distortion (INV-12), 11. Virtual Trackpad Vertical Movement Skew on Ultrawide Streams, 12. macOS Spaces (Virtual Desktops) WindowServer Limitation, 1. 64-bit Pointer Truncation on ARM64 Apple Silicon (INV-11 / Bridge Stability), 1. Dirty-Frame Detection & Adaptive FPS (Near-Term), 1. Executive Summary & Evolution, 2. In-Band WebRTC ICE Restart (Near-Term) (+22 more)

### Community 54 - "🚀 1. Recommended Triage Prompts"
Cohesion: 0.25
Nodes (7): 🚀 1. Recommended Triage Prompts, 🛠️ 2. How the Triage Loop Operates, 📋 Developer Triage Prompt Guide, Full Autonomous Diagnosis & Fix Proposal, Inspect Screenshots & Visual Errors, Quick Triage & Summary (Everyday Check), Specific Client Investigation

### Community 55 - "appendChatBubble"
Cohesion: 0.13
Nodes (30): analyzeUserSupportComment(), appendChatBubble(), confirmAction(), deliverAiSupportMessage(), ensurePeerConnected(), cleanup(), escapeHtml(), formatDate() (+22 more)

### Community 56 - "P2P Connect — Native OS Remote Desktop Host Agent"
Cohesion: 0.22
Nodes (9): Architecture Overview, Linux, macOS, Operating System Permissions (First Run), P2P Connect — Native OS Remote Desktop Host Agent, Pairing & Unattended Remote Control, Recommended Operational Workflow & Background Hosting Roadmap, Security & Defense-in-Depth (+1 more)

### Community 57 - "validateEvent2"
Cohesion: 0.29
Nodes (7): unpackEventFromToken(), validateEvent2(), validateEventKind(), validateEventMethodTag(), validateEventTimestamp(), validateEventUrlTag(), validateToken()

### Community 58 - "initNostr"
Cohesion: 0.18
Nodes (15): 2. Where We Stand vs. Initial Plan, getHostStatusDisplay(), handleAppResume(), handleStateChange(), initNostr(), pingAllRemoteDevices(), renderRelayList(), setBadge() (+7 more)

### Community 59 - "P2P Connect — System Design"
Cohesion: 0.25
Nodes (7): 2. `nostr-crypto.js` — NostrCrypto, 6. `token-codec.js` — TokenCodec, 9. External Dependencies (CDN), Functions, Module Dependency Graph, P2P Connect — System Design, Token Format (v2)

### Community 61 - "P2P Connect — Architecture"
Cohesion: 0.12
Nodes (16): 10. External Dependencies, 1. Overview, 2. Architecture Diagram, 3. Module Map, 4. Connection Modes, 5. Security Model, 6. NAT Traversal & TURN, 7. Design Decisions & Trade-offs (+8 more)

### Community 62 - "How to Download & Run the Host Agent"
Cohesion: 0.33
Nodes (6): How to Download & Run the Host Agent, macOS & Linux:, Method 1: Download from Web UI (Fastest), Method 2: One-Liner Terminal Command (No Git Clone Needed), Method 3: From Cloned Repository or Unzipped Package (Automated Launcher), Windows (PowerShell):

### Community 63 - "4. `nostr-transport.js` — NostrTransport"
Cohesion: 0.25
Nodes (8): 4. `nostr-transport.js` — NostrTransport, Constants, Encrypted Payload Schema, Inbound Event Processing Pipeline, Nostr Event Format, Public API, Publish Failover Flow, Storage Keys

### Community 64 - "test_token_codec.py"
Cohesion: 0.15
Nodes (4): analyze_file(), python_compress_token(), python_decompress_token(), TestTokenCodec

### Community 65 - "loadRemoteDevices"
Cohesion: 0.26
Nodes (15): addOrUpdateRemoteDevice(), checkUrlRemoteHostParam(), connectToRemoteDevice(), deriveKey(), exportFleet(), exportKey(), importFleet(), importKey() (+7 more)

### Community 66 - "get"
Cohesion: 0.29
Nodes (7): clone(), _cloneInto(), get(), parseConnectionString(), querySync(), subscribeMany(), subscribeManyEose()

### Community 67 - "8. AI Agent Guardrails: Graphify & Invariant Verifier"
Cohesion: 0.33
Nodes (6): 1. Structural Knowledge Graph (Graphify), 2. Mandatory Regression Runner (`run-regressions.py`) & Invariant Verifier, 3. Custom Antigravity Skill & Subagent, 8. AI Agent Guardrails: Graphify & Invariant Verifier, Headless Chrome E2E Suites in `tests/e2e/`, Test Suites in `tests/`

### Community 68 - "cdp_client.py"
Cohesion: 0.22
Nodes (3): ensure_certificate(), get_local_ip_addresses(), main()

### Community 69 - "classifyKind"
Cohesion: 0.40
Nodes (6): classifyKind(), getFilterLimit(), isEphemeralKind(), isParameterizedReplaceableKind(), isRegularKind(), isReplaceableKind()

### Community 70 - "1. `webrtc-core.js` — PeerSession"
Cohesion: 0.40
Nodes (5): 1. `webrtc-core.js` — PeerSession, DataChannels, File Transfer Protocol, Public API, Renegotiation (Perfect Negotiation Pattern)

### Community 71 - "8. `chat-store.js` — ChatStore"
Cohesion: 0.40
Nodes (5): 8. `chat-store.js` — ChatStore, Constants, Message Schema, Public API, Storage Format

### Community 76 - "4. Dual Connection Modes & Protocols"
Cohesion: 0.50
Nodes (4): 4. Dual Connection Modes & Protocols, In-Band Renegotiation (Perfect Negotiation Pattern), Mode A: Nostr Auto-Signaling (`kind: 24133`), Mode B: Manual Token Exchange (`P2P2-`)

### Community 77 - "closeQrScanner"
Cohesion: 0.83
Nodes (4): closeQrScanner(), openQrScanner(), scanFrame(), startCameraStream()

### Community 78 - "🔐 P2P Connect"
Cohesion: 0.18
Nodes (11): 1. On the Computer to Control (Host), 2. On Your Remote Device (Client - Phone, Tablet, or Laptop), 3. Background Hosting & Unattended Access (Roadmap), Features, License, Local Development Quick Start, 🔐 P2P Connect, Project Structure (+3 more)

### Community 85 - "Windows (Task Scheduler & pythonw)"
Cohesion: 0.40
Nodes (5): 1. Install via Batch Script (Recommended), 2. Manual Setup via PowerShell / Command Prompt, 3. Manage & Check Status, 4. Uninstall, Windows (Task Scheduler & pythonw)

### Community 87 - "3. `nostr-relay.js` — NostrRelay"
Cohesion: 0.50
Nodes (4): 3. `nostr-relay.js` — NostrRelay, Key Behaviors, Protocol Messages, States (`RelayState`)

### Community 88 - "7. `ui-controller.js` — UI Controller"
Cohesion: 0.50
Nodes (4): 7. `ui-controller.js` — UI Controller, Chat Message Protocol, localStorage Keys Used, Responsibilities

## Knowledge Gaps
- **1 isolated node(s):** `serve`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 554 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `2. Where We Stand vs. Initial Plan` connect `initNostr` to `DisplayWakeManager`, `NativeFrameCapturer`, `5. Future Roadmap & Proposed Improvements`, `attachRemoteVideoInputListeners`?**
  _High betweenness centrality (0.418) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `initNostr()` (e.g. with `buildIceServers()` and `buildNostrSessionConfig()`) actually correct?**
  _`initNostr()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `serve` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ui-controller.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09803921568627451 - nodes in this community are weakly interconnected._
- **Why does `NativeFrameCapturer` connect `NativeFrameCapturer` to `initNostr`, `bridge.py`, `5. Future Roadmap & Proposed Improvements`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Should `weierstrass` be split into smaller, more focused modules?**
  _Cohesion score 0.08078431372549019 - nodes in this community are weakly interconnected._
- **Why does `DisplayWakeManager` connect `DisplayWakeManager` to `initNostr`, `bridge.py`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._