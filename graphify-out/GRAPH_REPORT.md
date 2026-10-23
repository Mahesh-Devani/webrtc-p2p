# Graph Report - webrtc-p2p  (2026-10-23)

## Corpus Check
- 52 files · ~122,225 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .bat 2, .zip 1)

## Summary
- 1202 nodes · 2312 edges · 77 communities (40 shown, 37 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 90 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4e06aa33`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ui-controller.js
- weierstrass
- update
- bridge.py
- host-controller.js
- nostr.bundle.js
- format_remediation_box
- decode
- nostr-transport.js
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
- TestMockNostrRelay
- MockNostrRelay
- AGENTS.md — Developer & AI Agent Guide for P2P Connect
- ai-diagnostic-agent.py
- pathlib
- DiagnosticServer
- HeadlessChromeSession
- TestHostSecurity
- decode
- install-linux-service.sh
- install-macos-agent.sh
- install-service.sh
- start-host.sh
- uninstall-service.sh
- get
- 4. Failure Diagnosis & Resolution Runbook
- cdp_client.py
- ColoredTextTestResult
- P2P Connect — Architecture & Production Notes
- check-invariants.py
- P2P Connect — Concepts Guide
- P2P Connect — High-Level Design
- TestWebRtcContracts
- NostrRelay
- ._process_nostr_message
- P2P Connect — Architecture
- 2. Triage Procedure
- TestMobileLifecycle
- P2P Connect — Roadmap
- P2P Connect — Native OS Remote Desktop Host Agent
- verifyEvent
- 🚀 1. Recommended Triage Prompts
- createCipher
- initSignaling
- classifyKind
- connectBridge
- run.sh
- DevHandler

## God Nodes (most connected - your core abstractions)
1. `toast()` - 37 edges
2. `TestDiagnosticSystem` - 29 edges
3. `hide()` - 29 edges
4. `initNostr()` - 28 edges
5. `show()` - 26 edges
6. `buildNostrSessionConfig()` - 24 edges
7. `weierstrass()` - 21 edges
8. `MockNostrRelay` - 20 edges
9. `update()` - 18 edges
10. `encode()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `13. Singleton & Factory Patterns` --references--> `NostrRelay`  [INFERRED]
  docs/concepts-guide.md → nostr-relay.js
- `Connection State Badge` --references--> `connected()`  [INFERRED]
  docs/system-design.md → nostr.bundle.js
- `Session Cleanup` --references--> `connected()`  [INFERRED]
  docs/system-design.md → nostr.bundle.js
- `5. Mobile Background Suspensions & Auto-Reconnection` --references--> `sendSelectedFiles()`  [INFERRED]
  AGENTS.md → ui-controller.js
- `Verifying Changes` --references--> `connected()`  [INFERRED]
  AGENTS.md → nostr.bundle.js

## Import Cycles
- None detected.

## Communities (77 total, 37 thin omitted)

### Community 0 - "ui-controller.js"
Cohesion: 0.05
Nodes (126): ChatStore, TokenCodec, acceptIncomingCall(), addContact(), addOrUpdateRemoteDevice(), analyzeUserSupportComment(), appendChatBubble(), applyRdZoomTransform() (+118 more)

### Community 1 - "weierstrass"
Cohesion: 0.07
Nodes (51): bytesToHex(), bytesToNumberBE(), bytesToNumberLE(), challenge(), concatBytes2(), createHmacDrbg(), ensureBytes(), Field() (+43 more)

### Community 2 - "update"
Cohesion: 0.13
Nodes (27): computeTag(), computeTag2(), constructor(), digest(), digestInto(), exists(), exists3(), finalize() (+19 more)

### Community 3 - "bridge.py"
Cohesion: 0.13
Nodes (21): CGPoint, CGRect, CGSize, execute_mouse_move(), get_screen_bounds(), handle_client(), is_origin_allowed(), load_or_create_token() (+13 more)

### Community 4 - "host-controller.js"
Cohesion: 0.14
Nodes (19): DiagnosticLogger, broadcastBridgeStatus(), btnToggleServiceCard, compressSignal(), decompressSignal(), dom, ensureDesktopCapture(), generateSecurePassword() (+11 more)

### Community 5 - "nostr.bundle.js"
Cohesion: 0.04
Nodes (41): binarySearch(), bytes2(), chachaCore(), concatBytes(), createCurve(), extract(), FpSqrt(), getConversationKey() (+33 more)

### Community 6 - "format_remediation_box"
Cohesion: 0.12
Nodes (4): 1. `test_no_query_params_on_internal_imports` Failed, format_remediation_box(), read_project_file(), TestArchitecturalInvariants

### Community 7 - "decode"
Cohesion: 0.15
Nodes (19): bytesToHex2(), createRumor(), createSeal(), createWrap(), encrypt2(), fastEventHash(), finalizeEvent(), finishReactionEvent() (+11 more)

### Community 8 - "nostr-transport.js"
Cohesion: 0.19
Nodes (8): destroy(), loadNostrTools(), NostrCrypto, RelayState, NostrSignaling, DEFAULT_RELAYS, init(), PeerSession

### Community 9 - "package.json"
Cohesion: 0.09
Nodes (21): author, bugs, url, description, devDependencies, serve, homepage, keywords (+13 more)

### Community 10 - "encode"
Cohesion: 0.19
Nodes (17): encode(), encodeBech32(), encodeBytes(), encodeTLV(), encode(), getToken(), hashPayload(), hexToBytes2() (+9 more)

### Community 11 - "remote-desktop-host/package.json"
Cohesion: 0.14
Nodes (13): @nut-tree/nut-js, ws, BUTTON_MAP, wss, dependencies, @nut-tree/nut-js, ws, description (+5 more)

### Community 12 - "close"
Cohesion: 0.18
Nodes (14): auth(), close(), closeAllSubscriptions(), connect(), count(), ensureRelay(), fire(), makeAuthEvent() (+6 more)

### Community 14 - "P2P Connect — System Design"
Cohesion: 0.05
Nodes (44): 7. Local Development & Verification, Running the Application Locally, Verifying Changes, 1. `webrtc-core.js` — PeerSession, 2. `nostr-crypto.js` — NostrCrypto, 3. `nostr-relay.js` — NostrRelay, 4. `nostr-transport.js` — NostrTransport, 5. `nostr-signaling.js` — NostrSignaling (+36 more)

### Community 15 - "bytes3"
Cohesion: 0.17
Nodes (18): apply0123(), applySbox(), bytes3(), ctr32(), ctrCounter(), decrypt(), decrypt2(), deriveKeys() (+10 more)

### Community 16 - "serve-https.py"
Cohesion: 0.18
Nodes (6): get_modified_files(), main(), select_test_modules(), ensure_certificate(), get_local_ip_addresses(), main()

### Community 18 - "assertNumber"
Cohesion: 0.21
Nodes (13): alphabet(), assertNumber(), bech32Polymod(), bechChecksum(), convertRadix(), convertRadix2(), genBech32(), decode2() (+5 more)

### Community 19 - "test_token_codec.py"
Cohesion: 0.17
Nodes (3): python_compress_token(), python_decompress_token(), TestTokenCodec

### Community 21 - "mock_relay.py"
Cohesion: 0.13
Nodes (5): make_close_frame(), make_pong_frame(), make_ws_frame(), read_ws_frame(), _run_cli()

### Community 24 - "AGENTS.md — Developer & AI Agent Guide for P2P Connect"
Cohesion: 0.08
Nodes (26): 1. ES Module Singleton Integrity (DO NOT BREAK), 1. Project Overview & Philosophy, 1. Structural Knowledge Graph (Graphify), 2. Mandatory Regression Runner (`run-regressions.py`) & Invariant Verifier, 2. Technology Stack & External Dependencies, 2. Zero-Build Philosophy, 3. Custom Antigravity Skill & Subagent, 3. Media Track Replacement vs Renegotiation (+18 more)

### Community 25 - "ai-diagnostic-agent.py"
Cohesion: 0.16
Nodes (12): add_authorized_client(), analyze_file(), find_chrome_binary(), is_client_authorized(), launch_headless_bridge(), cleanup(), load_whitelist(), print_inbox() (+4 more)

### Community 28 - "HeadlessChromeSession"
Cohesion: 0.10
Nodes (4): HeadlessChromeSession, QuietHTTPHandler, ReusableTCPServer, TestTwoPeerHandshakeE2E

### Community 29 - "TestHostSecurity"
Cohesion: 0.10
Nodes (3): is_client_authorized(), TestHostSecurity, validate_password_complexity()

### Community 30 - "decode"
Cohesion: 0.11
Nodes (23): calcPaddedLen(), concatBytes3(), decode(), decodePayload(), decrypt3(), encrypt3(), equalBytes2(), expand() (+15 more)

### Community 36 - "get"
Cohesion: 0.29
Nodes (7): clone(), _cloneInto(), get(), parseConnectionString(), querySync(), subscribeMany(), subscribeManyEose()

### Community 37 - "4. Failure Diagnosis & Resolution Runbook"
Cohesion: 0.14
Nodes (13): 1. When to Use This Skill, 2. Test Architecture & Coverage, 2. `test_host_and_client_storage_keys_isolated` Failed, 3. How to Run Regressions, 3. `test_add_local_stream_passes_stream_to_add_track` Failed, 4. Failure Diagnosis & Resolution Runbook, 4. `test_dc_files_protocol_flow` or `test_datachannel_watermarks` Failed, 5. Adding New Regression Tests (+5 more)

### Community 40 - "P2P Connect — Architecture & Production Notes"
Cohesion: 0.13
Nodes (14): Architecture Overview, Connection Flow, Long-term (production infrastructure), Medium-term (minimal server), Module Responsibilities, P2P Connect — Architecture & Production Notes, Real-World Limitations of No-Signaling-Server Design, Risks of Manual Signaling (+6 more)

### Community 41 - "check-invariants.py"
Cohesion: 0.19
Nodes (12): check_cache_busters(), check_file_transfer_protocol(), check_host_rejects_inactive_capture(), check_js_syntax_balance(), check_no_duplicate_singleton_imports(), check_no_import_query_params(), check_signal_type_whitelist(), check_storage_key_isolation() (+4 more)

### Community 42 - "P2P Connect — Concepts Guide"
Cohesion: 0.13
Nodes (14): 10. Relay Management & Resilience, 11. Session Lifecycle, 12. Media Handling, 13. Singleton & Factory Patterns, 1. WebRTC Fundamentals, 2. DataChannels, 3. Perfect Negotiation Pattern, 4. Nostr Protocol Primer (+6 more)

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

### Community 53 - "verifyEvent"
Cohesion: 0.14
Nodes (14): getRepostedEvent(), getRepostedEventPointer(), isKind(), serializeEvent(), unpackEventFromToken(), validateEvent(), validateEvent2(), validateEventKind() (+6 more)

### Community 54 - "🚀 1. Recommended Triage Prompts"
Cohesion: 0.25
Nodes (7): 🚀 1. Recommended Triage Prompts, 🛠️ 2. How the Triage Loop Operates, 📋 Developer Triage Prompt Guide, Full Autonomous Diagnosis & Fix Proposal, Inspect Screenshots & Visual Errors, Quick Triage & Summary (Everyday Check), Specific Client Investigation

### Community 55 - "createCipher"
Cohesion: 0.40
Nodes (6): bool2(), checkOpts(), createCipher(), isAligned32(), number3(), runCipher()

### Community 56 - "initSignaling"
Cohesion: 0.41
Nodes (12): addAuthorizedClient(), escapeHtml(), initSignaling(), isClientAuthorized(), isWhitelistEnforced(), loadAuthorizedClients(), removeAuthorizedClient(), renderAuthorizedClients() (+4 more)

### Community 57 - "classifyKind"
Cohesion: 0.40
Nodes (6): classifyKind(), getFilterLimit(), isEphemeralKind(), isParameterizedReplaceableKind(), isRegularKind(), isReplaceableKind()

### Community 58 - "connectBridge"
Cohesion: 0.70
Nodes (5): clearBridgeReconnectTimer(), connectBridge(), tryNext(), getCandidateBridgeUrls(), scheduleBridgeReconnect()

## Knowledge Gaps
- **1 isolated node(s):** `serve`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 438 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AGENTS.md — Developer & AI Agent Guide for P2P Connect` connect `AGENTS.md — Developer & AI Agent Guide for P2P Connect` to `P2P Connect — System Design`, `P2P Connect — Architecture`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `initNostr()` (e.g. with `buildIceServers()` and `buildNostrSessionConfig()`) actually correct?**
  _`initNostr()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `serve` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ui-controller.js` be split into smaller, more focused modules?**
  _Cohesion score 0.051299060254284136 - nodes in this community are weakly interconnected._
- **Why does `connected()` connect `P2P Connect — System Design` to `nostr.bundle.js`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Should `weierstrass` be split into smaller, more focused modules?**
  _Cohesion score 0.07272727272727272 - nodes in this community are weakly interconnected._
- **Why does `NostrCrypto` connect `nostr-transport.js` to `ui-controller.js`, `host-controller.js`, `decode`, `bytes3`, `verifyEvent`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._