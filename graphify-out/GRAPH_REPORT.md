# Graph Report - webrtc-p2p  (2026-10-18)

## Corpus Check
- 41 files · ~91,630 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .bat 2, .zip 1)

## Summary
- 928 nodes · 1797 edges · 61 communities (40 shown, 21 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 69 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `de33e53d`
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
- NostrRelay
- package.json
- encode
- remote-desktop-host/package.json
- close
- decrypt3
- P2P Connect — System Design
- bytes3
- handleNext
- test_diagnostics.py
- assertNumber
- classifyKind
- DiagnosticServer
- decode
- getHash
- binarySearch
- AGENTS.md — Developer & AI Agent Guide for P2P Connect
- rotl
- FpSqrt
- lift_x
- createCipher
- bytes2
- getInt
- install-linux-service.sh
- install-macos-agent.sh
- install-service.sh
- start-host.sh
- uninstall-service.sh
- isValid
- unwrapEvent
- validateEvent2
- TestArchitecturalInvariants
- P2P Connect — Architecture & Production Notes
- join
- run-regressions.py
- P2P Connect — High-Level Design
- TestWebRtcContracts
- serve-https.py
- ai-diagnostic-agent.py
- P2P Connect — Architecture
- ColoredTextTestResult
- 🔐 P2P Connect
- TestMobileLifecycle
- P2P Connect — Roadmap
- Linux (systemd User Service)
- P2P Connect — Native OS Remote Desktop Host Agent
- How to Download & Run the Host Agent
- DevHandler
- Windows (Task Scheduler & pythonw)
- test
- 5. Security Model
- run.sh

## God Nodes (most connected - your core abstractions)
1. `toast()` - 34 edges
2. `show()` - 25 edges
3. `hide()` - 24 edges
4. `initNostr()` - 23 edges
5. `weierstrass()` - 21 edges
6. `buildNostrSessionConfig()` - 20 edges
7. `showCreateSession()` - 19 edges
8. `showJoinSession()` - 19 edges
9. `update()` - 18 edges
10. `encode()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Public API` --references--> `close()`  [INFERRED]
  docs/system-design.md → nostr.bundle.js
- `13. Singleton & Factory Patterns` --references--> `NostrRelay`  [INFERRED]
  docs/concepts-guide.md → nostr-relay.js
- `Connection State Badge` --references--> `connected()`  [INFERRED]
  docs/system-design.md → nostr.bundle.js
- `Session Cleanup` --references--> `connected()`  [INFERRED]
  docs/system-design.md → nostr.bundle.js
- `5. Mobile Background Suspensions & Auto-Reconnection` --references--> `sendSelectedFiles()`  [INFERRED]
  AGENTS.md → ui-controller.js

## Import Cycles
- None detected.

## Communities (61 total, 21 thin omitted)

### Community 0 - "ui-controller.js"
Cohesion: 0.06
Nodes (104): ChatStore, TokenCodec, acceptIncomingCall(), addContact(), addOrUpdateRemoteDevice(), appendChatBubble(), applyRdZoomTransform(), attachDisplaysMenuListeners() (+96 more)

### Community 1 - "weierstrass"
Cohesion: 0.07
Nodes (51): bytesToHex(), bytesToNumberBE(), bytesToNumberLE(), challenge(), concatBytes2(), createHmacDrbg(), ensureBytes(), Field() (+43 more)

### Community 2 - "update"
Cohesion: 0.12
Nodes (29): computeTag(), computeTag2(), constructor(), digest(), digestInto(), exists(), exists3(), extract() (+21 more)

### Community 3 - "bridge.py"
Cohesion: 0.07
Nodes (21): CGPoint, execute_mouse_move(), handle_client(), is_origin_allowed(), load_or_create_token(), main(), make_ws_frame(), mouse_worker() (+13 more)

### Community 4 - "host-controller.js"
Cohesion: 0.11
Nodes (32): DiagnosticLogger, addAuthorizedClient(), btnToggleServiceCard, compressSignal(), connectBridge(), tryNext(), decompressSignal(), dom (+24 more)

### Community 6 - "check-invariants.py"
Cohesion: 0.07
Nodes (15): check_cache_busters(), check_file_transfer_protocol(), check_host_rejects_inactive_capture(), check_js_syntax_balance(), check_no_duplicate_singleton_imports(), check_no_import_query_params(), check_signal_type_whitelist(), check_storage_key_isolation() (+7 more)

### Community 7 - "decode"
Cohesion: 0.14
Nodes (20): bytesToHex2(), createRumor(), createSeal(), createWrap(), encrypt2(), fastEventHash(), finalizeEvent(), finishReactionEvent() (+12 more)

### Community 8 - "NostrRelay"
Cohesion: 0.06
Nodes (27): 10. Relay Management & Resilience, 11. Session Lifecycle, 12. Media Handling, 13. Singleton & Factory Patterns, 1. WebRTC Fundamentals, 2. DataChannels, 3. Perfect Negotiation Pattern, 4. Nostr Protocol Primer (+19 more)

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
Cohesion: 0.12
Nodes (18): auth(), clone(), _cloneInto(), count(), ensureRelay(), fire(), get(), makeAuthEvent() (+10 more)

### Community 13 - "decrypt3"
Cohesion: 0.19
Nodes (14): calcPaddedLen(), concatBytes3(), decodePayload(), decrypt3(), encrypt3(), equalBytes2(), expand(), getMessageKeys() (+6 more)

### Community 14 - "P2P Connect — System Design"
Cohesion: 0.05
Nodes (44): 7. Local Development & Verification, Running the Application Locally, Verifying Changes, 1. `webrtc-core.js` — PeerSession, 2. `nostr-crypto.js` — NostrCrypto, 3. `nostr-relay.js` — NostrRelay, 4. `nostr-transport.js` — NostrTransport, 5. `nostr-signaling.js` — NostrSignaling (+36 more)

### Community 15 - "bytes3"
Cohesion: 0.17
Nodes (18): apply0123(), applySbox(), bytes3(), ctr32(), ctrCounter(), decrypt(), decrypt2(), deriveKeys() (+10 more)

### Community 16 - "handleNext"
Cohesion: 0.18
Nodes (11): getHex64(), getSubscriptionId(), handleNext(), matchEventId(), matchEventPubkey(), matchFilter(), matchFilters(), _onmessage() (+3 more)

### Community 18 - "assertNumber"
Cohesion: 0.21
Nodes (13): alphabet(), assertNumber(), bech32Polymod(), bechChecksum(), convertRadix(), convertRadix2(), genBech32(), decode2() (+5 more)

### Community 19 - "classifyKind"
Cohesion: 0.40
Nodes (6): classifyKind(), getFilterLimit(), isEphemeralKind(), isParameterizedReplaceableKind(), isRegularKind(), isReplaceableKind()

### Community 21 - "decode"
Cohesion: 0.25
Nodes (9): decode(), getZapEndpoint(), matchAll(), matchAll2(), parse2(), parseReferences(), parseTLV(), replaceAll() (+1 more)

### Community 22 - "getHash"
Cohesion: 0.50
Nodes (4): concatBytes(), createCurve(), getHash(), randomBytes()

### Community 23 - "binarySearch"
Cohesion: 0.67
Nodes (3): binarySearch(), insertEventIntoAscendingList(), insertEventIntoDescendingList()

### Community 24 - "AGENTS.md — Developer & AI Agent Guide for P2P Connect"
Cohesion: 0.08
Nodes (25): 1. ES Module Singleton Integrity (DO NOT BREAK), 1. Project Overview & Philosophy, 1. Structural Knowledge Graph (Graphify), 2. Mandatory Regression Runner (`run-regressions.py`) & Invariant Verifier, 2. Technology Stack & External Dependencies, 2. Zero-Build Philosophy, 3. Custom Antigravity Skill & Subagent, 3. Media Track Replacement vs Renegotiation (+17 more)

### Community 25 - "rotl"
Cohesion: 0.67
Nodes (3): chachaCore(), hchacha(), rotl()

### Community 26 - "FpSqrt"
Cohesion: 0.67
Nodes (3): FpSqrt(), pow(), tonelliShanks()

### Community 27 - "lift_x"
Cohesion: 0.67
Nodes (3): lift_x(), pow2(), sqrtMod()

### Community 28 - "createCipher"
Cohesion: 0.40
Nodes (6): bool2(), checkOpts(), createCipher(), isAligned32(), number3(), runCipher()

### Community 38 - "validateEvent2"
Cohesion: 0.15
Nodes (13): getRepostedEvent(), getRepostedEventPointer(), isKind(), unpackEventFromToken(), validateEvent(), validateEvent2(), validateEventKind(), validateEventMethodTag() (+5 more)

### Community 39 - "TestArchitecturalInvariants"
Cohesion: 0.07
Nodes (16): 1. `test_no_query_params_on_internal_imports` Failed, 1. When to Use This Skill, 2. Test Architecture & Coverage, 2. `test_host_and_client_storage_keys_isolated` Failed, 3. How to Run Regressions, 3. `test_add_local_stream_passes_stream_to_add_track` Failed, 4. Failure Diagnosis & Resolution Runbook, 4. `test_dc_files_protocol_flow` or `test_datachannel_watermarks` Failed (+8 more)

### Community 40 - "P2P Connect — Architecture & Production Notes"
Cohesion: 0.13
Nodes (14): Architecture Overview, Connection Flow, Long-term (production infrastructure), Medium-term (minimal server), Module Responsibilities, P2P Connect — Architecture & Production Notes, Real-World Limitations of No-Signaling-Server Design, Risks of Manual Signaling (+6 more)

### Community 42 - "run-regressions.py"
Cohesion: 0.27
Nodes (4): get_modified_files(), main(), run_tests(), select_test_modules()

### Community 43 - "P2P Connect — High-Level Design"
Cohesion: 0.14
Nodes (13): 1. What It Is, 2. Architecture Overview, 3. Two Connection Modes, 4. Feature Set, 5. Security Model, 6. Technology Stack, 7. File Map, Key Properties (+5 more)

### Community 45 - "serve-https.py"
Cohesion: 0.29
Nodes (3): ensure_certificate(), get_local_ip_addresses(), main()

### Community 47 - "P2P Connect — Architecture"
Cohesion: 0.17
Nodes (12): 10. External Dependencies, 1. Overview, 2. Architecture Diagram, 3. Module Map, 4. Connection Modes, 6. NAT Traversal & TURN, 7. Design Decisions & Trade-offs, 8. Module Dependency Graph (+4 more)

### Community 49 - "🔐 P2P Connect"
Cohesion: 0.18
Nodes (11): 1. On the Computer to Control (Host), 2. On Your Remote Device (Client - Phone, Tablet, or Laptop), 3. Optional: Run as a Persistent Background Service (24/7 Access), Features, License, Local Development Quick Start, 🔐 P2P Connect, Project Structure (+3 more)

### Community 51 - "P2P Connect — Roadmap"
Cohesion: 0.22
Nodes (8): 💡 Backlog / Ideas, P2P Connect — Roadmap, ✅ Phase 0: Foundation (Complete), 🔜 Phase 1: Group Chat, 📞 Phase 2: Group Calling, 📱 Phase 3: Native Applications, 🔒 Phase 4: Enhanced Security & Privacy, 🌐 Phase 5: Scalability & Infrastructure

### Community 52 - "Linux (systemd User Service)"
Cohesion: 0.22
Nodes (9): 1. Install & Start Service, 1. Install & Start Service, 2. Manage the Service, 2. Useful systemd Commands, 3. Uninstall, 3. Uninstall, Linux (systemd User Service), macOS (LaunchAgent) (+1 more)

### Community 53 - "P2P Connect — Native OS Remote Desktop Host Agent"
Cohesion: 0.25
Nodes (8): Architecture Overview, Linux, macOS, Operating System Permissions (First Run), P2P Connect — Native OS Remote Desktop Host Agent, Pairing & Unattended Remote Control, Security & Defense-in-Depth, Windows

### Community 54 - "How to Download & Run the Host Agent"
Cohesion: 0.33
Nodes (6): How to Download & Run the Host Agent, macOS & Linux:, Method 1: Download from Web UI (Fastest), Method 2: One-Liner Terminal Command (No Git Clone Needed), Method 3: From Cloned Repository or Unzipped Package (Automated Launcher), Windows (PowerShell):

### Community 56 - "Windows (Task Scheduler & pythonw)"
Cohesion: 0.40
Nodes (5): 1. Install via Batch Script (Recommended), 2. Manual Setup via PowerShell / Command Prompt, 3. Manage & Check Status, 4. Uninstall, Windows (Task Scheduler & pythonw)

### Community 59 - "5. Security Model"
Cohesion: 0.50
Nodes (4): 5. Security Model, Key Properties, Risks & Mitigations, What's Encrypted

## Knowledge Gaps
- **1 isolated node(s):** `serve`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 320 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AGENTS.md — Developer & AI Agent Guide for P2P Connect` connect `AGENTS.md — Developer & AI Agent Guide for P2P Connect` to `README.md`, `P2P Connect — System Design`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `initNostr()` (e.g. with `buildIceServers()` and `buildNostrSessionConfig()`) actually correct?**
  _`initNostr()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `serve` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ui-controller.js` be split into smaller, more focused modules?**
  _Cohesion score 0.062407862407862405 - nodes in this community are weakly interconnected._
- **Why does `connected()` connect `P2P Connect — System Design` to `nostr.bundle.js`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `weierstrass()` (e.g. with `getPublicKey2()` and `getSharedSecret()`) actually correct?**
  _`weierstrass()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `weierstrass` be split into smaller, more focused modules?**
  _Cohesion score 0.07272727272727272 - nodes in this community are weakly interconnected._