# Graph Report - webrtc-p2p  (2026-10-28)

## Corpus Check
- 54 files · ~131,671 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .bat 2, .zip 1)

## Summary
- 1328 nodes · 2539 edges · 84 communities (49 shown, 35 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 97 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `71901bab`
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
- P2P Connect — System Design
- bytes3
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
- DevHandler
- initNostr
- run.sh
- handleNext
- serve-https.py
- loadRemoteDevices
- createCipher
- closeQrScanner
- ensureDesktopCapture
- tryNext
- ColoredTextTestResult
- initHostIdentity
- ai-diagnostic-agent.py
- test_remote_desktop_capture_e2e.py

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
- `7. Native Host Bridge & OS Subsystem Invariants (`bridge.py`)` --references--> `map_client_coords()`  [INFERRED]
  AGENTS.md → remote-desktop-host/bridge.py
- `5. Mobile Background Suspensions & Auto-Reconnection` --references--> `sendSelectedFiles()`  [INFERRED]
  AGENTS.md → ui-controller.js

## Import Cycles
- None detected.

## Communities (84 total, 35 thin omitted)

### Community 0 - "ui-controller.js"
Cohesion: 0.10
Nodes (22): ChatStore, TokenCodec, applyRemoteAudioVolume(), applySavedRemoteAudioSettings(), attemptRdReconnect(), formatConnectionTime(), formatDate(), formatDuration() (+14 more)

### Community 1 - "weierstrass"
Cohesion: 0.07
Nodes (51): bytesToHex(), bytesToNumberBE(), bytesToNumberLE(), challenge(), concatBytes2(), createHmacDrbg(), ensureBytes(), Field() (+43 more)

### Community 2 - "update"
Cohesion: 0.12
Nodes (29): computeTag(), computeTag2(), constructor(), digest(), digestInto(), exists(), exists3(), extract() (+21 more)

### Community 3 - "bridge.py"
Cohesion: 0.07
Nodes (27): 7. Native Host Bridge & OS Subsystem Invariants (`bridge.py`), CGPoint, CGRect, CGSize, DisplayWakeManager, execute_mouse_move(), get_screen_bounds(), handle_client() (+19 more)

### Community 4 - "host-controller.js"
Cohesion: 0.16
Nodes (22): DiagnosticLogger, addAuthorizedClient(), btnToggleServiceCard, compressSignal(), currentCaptureTarget, decompressSignal(), dom, ensureNativeOnDemandCapture() (+14 more)

### Community 5 - "nostr.bundle.js"
Cohesion: 0.04
Nodes (42): binarySearch(), bytes2(), chachaCore(), classifyKind(), concatBytes(), createCurve(), FpSqrt(), getFilterLimit() (+34 more)

### Community 6 - "check-invariants.py"
Cohesion: 0.06
Nodes (17): 1. `test_no_query_params_on_internal_imports` Failed, 1. When to Use This Skill, 2. Test Architecture & Coverage, 2. `test_host_and_client_storage_keys_isolated` Failed, 3. How to Run Regressions, 3. `test_add_local_stream_passes_stream_to_add_track` Failed, 4. Failure Diagnosis & Resolution Runbook, 4. `test_dc_files_protocol_flow` or `test_datachannel_watermarks` Failed (+9 more)

### Community 7 - "decode"
Cohesion: 0.12
Nodes (22): bytesToHex2(), createRumor(), createSeal(), createWrap(), fastEventHash(), finalizeEvent(), finishReactionEvent(), finishRepostEvent() (+14 more)

### Community 8 - "P2P Connect — Concepts Guide"
Cohesion: 0.13
Nodes (14): 10. Relay Management & Resilience, 11. Session Lifecycle, 12. Media Handling, 13. Singleton & Factory Patterns, 1. WebRTC Fundamentals, 2. DataChannels, 3. Perfect Negotiation Pattern, 4. Nostr Protocol Primer (+6 more)

### Community 9 - "package.json"
Cohesion: 0.09
Nodes (21): author, bugs, url, description, devDependencies, serve, homepage, keywords (+13 more)

### Community 10 - "encode"
Cohesion: 0.21
Nodes (16): encode(), encodeBech32(), encodeBytes(), encodeTLV(), encode(), getToken(), hashPayload(), hexToBytes2() (+8 more)

### Community 11 - "remote-desktop-host/package.json"
Cohesion: 0.14
Nodes (13): @nut-tree/nut-js, ws, BUTTON_MAP, wss, dependencies, @nut-tree/nut-js, ws, description (+5 more)

### Community 12 - "close"
Cohesion: 0.16
Nodes (15): auth(), close(), closeAllSubscriptions(), connect(), count(), destroy(), ensureRelay(), fire() (+7 more)

### Community 14 - "P2P Connect — System Design"
Cohesion: 0.05
Nodes (44): 7. Local Development & Verification, Running the Application Locally, Verifying Changes, 1. `webrtc-core.js` — PeerSession, 2. `nostr-crypto.js` — NostrCrypto, 3. `nostr-relay.js` — NostrRelay, 4. `nostr-transport.js` — NostrTransport, 5. `nostr-signaling.js` — NostrSignaling (+36 more)

### Community 15 - "bytes3"
Cohesion: 0.13
Nodes (22): apply0123(), applySbox(), bytes3(), ctr32(), ctrCounter(), decrypt(), decrypt2(), deriveKeys() (+14 more)

### Community 16 - "serve-https.py"
Cohesion: 0.13
Nodes (4): get_modified_files(), main(), run_tests(), select_test_modules()

### Community 18 - "assertNumber"
Cohesion: 0.21
Nodes (13): alphabet(), assertNumber(), bech32Polymod(), bechChecksum(), convertRadix(), convertRadix2(), genBech32(), decode2() (+5 more)

### Community 19 - "test_token_codec.py"
Cohesion: 0.15
Nodes (4): analyze_file(), python_compress_token(), python_decompress_token(), TestTokenCodec

### Community 24 - "AGENTS.md — Developer & AI Agent Guide for P2P Connect"
Cohesion: 0.07
Nodes (27): 1. ES Module Singleton Integrity (DO NOT BREAK), 1. Project Overview & Philosophy, 1. Structural Knowledge Graph (Graphify), 2. Mandatory Regression Runner (`run-regressions.py`) & Invariant Verifier, 2. Technology Stack & External Dependencies, 2. Zero-Build Philosophy, 3. Custom Antigravity Skill & Subagent, 3. Media Track Replacement vs Renegotiation (+19 more)

### Community 25 - "nostr-transport.js"
Cohesion: 0.21
Nodes (7): loadNostrTools(), NostrCrypto, RelayState, NostrSignaling, DEFAULT_RELAYS, init(), PeerSession

### Community 26 - "hide"
Cohesion: 0.21
Nodes (27): buildIceServers(), buildNostrSessionConfig(), closeDiagnosticsModal(), copyText(), disableChat(), disconnectRemoteDesktop(), enableChat(), endMediaCall() (+19 more)

### Community 27 - "test_remote_desktop_capture_e2e.py"
Cohesion: 0.10
Nodes (7): make_ws_frame(), QuietHTTPHandler, read_ws_frame(), make_close_frame(), make_pong_frame(), make_ws_frame(), read_ws_frame()

### Community 28 - "test_two_peer_handshake.py"
Cohesion: 0.09
Nodes (4): find_chrome_binary(), QuietHTTPHandler, ReusableTCPServer, ThreadedMockRelay

### Community 29 - "check-invariants.py"
Cohesion: 0.07
Nodes (15): check_cache_busters(), check_file_transfer_protocol(), check_host_rejects_inactive_capture(), check_js_syntax_balance(), check_no_duplicate_singleton_imports(), check_no_import_query_params(), check_signal_type_whitelist(), check_storage_key_isolation() (+7 more)

### Community 30 - "decode"
Cohesion: 0.11
Nodes (23): calcPaddedLen(), concatBytes3(), decode(), decodePayload(), decrypt3(), encrypt3(), equalBytes2(), expand() (+15 more)

### Community 36 - "get"
Cohesion: 0.29
Nodes (7): clone(), _cloneInto(), get(), parseConnectionString(), querySync(), subscribeMany(), subscribeManyEose()

### Community 37 - "MockNostrRelay"
Cohesion: 0.11
Nodes (3): ThreadedMockRelay, MockNostrRelay, _run_cli()

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
Cohesion: 0.11
Nodes (3): MockHostBridge, ThreadedMockBridge, _run()

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

### Community 61 - "handleNext"
Cohesion: 0.18
Nodes (11): getHex64(), getSubscriptionId(), handleNext(), matchEventId(), matchEventPubkey(), matchFilter(), matchFilters(), _onmessage() (+3 more)

### Community 62 - "serve-https.py"
Cohesion: 0.22
Nodes (3): ensure_certificate(), get_local_ip_addresses(), main()

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

### Community 85 - "ai-diagnostic-agent.py"
Cohesion: 0.13
Nodes (12): add_authorized_client(), DiagnosticServer, find_chrome_binary(), is_client_authorized(), launch_headless_bridge(), cleanup(), load_whitelist(), print_inbox() (+4 more)

### Community 87 - "test_remote_desktop_capture_e2e.py"
Cohesion: 0.13
Nodes (4): HeadlessChromeSession, ReusableTCPServer, TestRemoteDesktopCaptureE2E, TestTwoPeerHandshakeE2E

## Knowledge Gaps
- **1 isolated node(s):** `serve`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 483 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `6. Critical Invariants for AI Agents (MUST FOLLOW)` connect `AGENTS.md — Developer & AI Agent Guide for P2P Connect` to `bridge.py`?**
  _High betweenness centrality (0.462) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `initNostr()` (e.g. with `buildIceServers()` and `buildNostrSessionConfig()`) actually correct?**
  _`initNostr()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `serve` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ui-controller.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1010752688172043 - nodes in this community are weakly interconnected._
- **Why does `7. Native Host Bridge & OS Subsystem Invariants (`bridge.py`)` connect `bridge.py` to `AGENTS.md — Developer & AI Agent Guide for P2P Connect`?**
  _High betweenness centrality (0.431) - this node is a cross-community bridge._
- **Should `weierstrass` be split into smaller, more focused modules?**
  _Cohesion score 0.07272727272727272 - nodes in this community are weakly interconnected._
- **Why does `AGENTS.md — Developer & AI Agent Guide for P2P Connect` connect `AGENTS.md — Developer & AI Agent Guide for P2P Connect` to `P2P Connect — System Design`, `P2P Connect — Architecture`?**
  _High betweenness centrality (0.331) - this node is a cross-community bridge._