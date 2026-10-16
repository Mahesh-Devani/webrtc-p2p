# Graph Report - webrtc-p2p  (2026-10-17)

## Corpus Check
- 30 files · ~80,529 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .bat 2, .zip 1)

## Summary
- 601 nodes · 1365 edges · 39 communities (26 shown, 13 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 61 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `efe9f55f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ui-controller.js
- weierstrass
- update
- bridge.py
- host-controller.js
- check-invariants.py
- decode
- NostrRelay
- package.json
- encode
- remote-desktop-host/package.json
- subscribe
- decrypt3
- verifyEvent
- assertNumber
- handleNext
- get
- createCipher
- classifyKind
- getHash
- binarySearch
- rotl
- FpSqrt
- AGENTS.md — Developer & AI Agent Guide for P2P Connect
- lift_x
- bytes2
- getInt
- hash2
- isValid
- unwrapEvent
- install-linux-service.sh
- install-macos-agent.sh
- install-service.sh
- start-host.sh
- uninstall-service.sh
- join
- test
- decode

## God Nodes (most connected - your core abstractions)
1. `toast()` - 29 edges
2. `show()` - 23 edges
3. `initNostr()` - 22 edges
4. `hide()` - 21 edges
5. `weierstrass()` - 21 edges
6. `buildNostrSessionConfig()` - 20 edges
7. `showCreateSession()` - 19 edges
8. `showJoinSession()` - 19 edges
9. `encode()` - 18 edges
10. `update()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `5. Mobile Background Suspensions & Auto-Reconnection` --references--> `sendSelectedFiles()`  [INFERRED]
  AGENTS.md → ui-controller.js
- `2. Mandatory Invariant Verifier (`check-invariants.py`)` --references--> `isHostStreamLive()`  [INFERRED]
  AGENTS.md → host-controller.js
- `Verifying Changes` --references--> `connected()`  [INFERRED]
  AGENTS.md → nostr.bundle.js
- `NostrCrypto` --indirect_call--> `verifyEvent()`  [INFERRED]
  nostr-crypto.js → nostr.bundle.js
- `NostrCrypto` --indirect_call--> `decrypt()`  [INFERRED]
  nostr-crypto.js → nostr.bundle.js

## Import Cycles
- None detected.

## Communities (39 total, 13 thin omitted)

### Community 0 - "ui-controller.js"
Cohesion: 0.07
Nodes (88): ChatStore, TokenCodec, acceptIncomingCall(), addContact(), addOrUpdateRemoteDevice(), appendChatBubble(), applyRdZoomTransform(), attachRemoteVideoInputListeners() (+80 more)

### Community 1 - "weierstrass"
Cohesion: 0.07
Nodes (51): bytesToHex(), bytesToNumberBE(), bytesToNumberLE(), challenge(), concatBytes2(), createHmacDrbg(), ensureBytes(), Field() (+43 more)

### Community 2 - "update"
Cohesion: 0.09
Nodes (41): applySbox(), bytes3(), computeTag(), computeTag2(), constructor(), ctr32(), ctrCounter(), deriveKeys() (+33 more)

### Community 3 - "bridge.py"
Cohesion: 0.07
Nodes (20): CGPoint, execute_mouse_move(), handle_client(), is_origin_allowed(), load_or_create_token(), main(), make_ws_frame(), mouse_worker() (+12 more)

### Community 4 - "host-controller.js"
Cohesion: 0.12
Nodes (30): addAuthorizedClient(), btnToggleServiceCard, compressSignal(), connectBridge(), tryNext(), decompressSignal(), dom, ensureDesktopCapture() (+22 more)

### Community 6 - "check-invariants.py"
Cohesion: 0.15
Nodes (12): check_cache_busters(), check_file_transfer_protocol(), check_host_rejects_inactive_capture(), check_js_syntax_balance(), check_no_duplicate_singleton_imports(), check_no_import_query_params(), check_signal_type_whitelist(), check_storage_key_isolation() (+4 more)

### Community 7 - "decode"
Cohesion: 0.13
Nodes (22): apply0123(), bytesToHex2(), createRumor(), createSeal(), createWrap(), decrypt(), decrypt2(), encrypt2() (+14 more)

### Community 8 - "NostrRelay"
Cohesion: 0.08
Nodes (21): auth(), close(), closeAllSubscriptions(), connect(), count(), destroy(), ensureRelay(), makeAuthEvent() (+13 more)

### Community 9 - "package.json"
Cohesion: 0.09
Nodes (21): author, bugs, url, description, devDependencies, serve, homepage, keywords (+13 more)

### Community 10 - "encode"
Cohesion: 0.15
Nodes (20): encode(), encodeBech32(), encodeBytes(), encodeTLV(), encode(), getToken(), hashPayload(), hexToBytes2() (+12 more)

### Community 11 - "remote-desktop-host/package.json"
Cohesion: 0.14
Nodes (13): @nut-tree/nut-js, ws, BUTTON_MAP, wss, dependencies, @nut-tree/nut-js, ws, description (+5 more)

### Community 12 - "subscribe"
Cohesion: 0.67
Nodes (3): fire(), prepareSubscription(), subscribe()

### Community 13 - "decrypt3"
Cohesion: 0.19
Nodes (14): calcPaddedLen(), concatBytes3(), decodePayload(), decrypt3(), encrypt3(), equalBytes2(), expand(), getMessageKeys() (+6 more)

### Community 14 - "verifyEvent"
Cohesion: 0.14
Nodes (14): getRepostedEvent(), getRepostedEventPointer(), isKind(), serializeEvent(), unpackEventFromToken(), validateEvent(), validateEvent2(), validateEventKind() (+6 more)

### Community 15 - "assertNumber"
Cohesion: 0.21
Nodes (13): alphabet(), assertNumber(), bech32Polymod(), bechChecksum(), convertRadix(), convertRadix2(), genBech32(), decode2() (+5 more)

### Community 16 - "handleNext"
Cohesion: 0.18
Nodes (11): getHex64(), getSubscriptionId(), handleNext(), matchEventId(), matchEventPubkey(), matchFilter(), matchFilters(), _onmessage() (+3 more)

### Community 17 - "get"
Cohesion: 0.29
Nodes (7): clone(), _cloneInto(), get(), parseConnectionString(), querySync(), subscribeMany(), subscribeManyEose()

### Community 18 - "createCipher"
Cohesion: 0.40
Nodes (6): bool2(), checkOpts(), createCipher(), isAligned32(), number3(), runCipher()

### Community 19 - "classifyKind"
Cohesion: 0.40
Nodes (6): classifyKind(), getFilterLimit(), isEphemeralKind(), isParameterizedReplaceableKind(), isRegularKind(), isReplaceableKind()

### Community 20 - "getHash"
Cohesion: 0.50
Nodes (4): concatBytes(), createCurve(), getHash(), randomBytes()

### Community 21 - "binarySearch"
Cohesion: 0.67
Nodes (3): binarySearch(), insertEventIntoAscendingList(), insertEventIntoDescendingList()

### Community 22 - "rotl"
Cohesion: 0.67
Nodes (3): chachaCore(), hchacha(), rotl()

### Community 23 - "FpSqrt"
Cohesion: 0.67
Nodes (3): FpSqrt(), pow(), tonelliShanks()

### Community 24 - "AGENTS.md — Developer & AI Agent Guide for P2P Connect"
Cohesion: 0.07
Nodes (27): 1. ES Module Singleton Integrity (DO NOT BREAK), 1. Project Overview & Philosophy, 1. Structural Knowledge Graph (Graphify), 2. Mandatory Invariant Verifier (`check-invariants.py`), 2. Technology Stack & External Dependencies, 2. Zero-Build Philosophy, 3. Media Track Replacement vs Renegotiation, 3. Module Map & Dependency Architecture (+19 more)

### Community 25 - "lift_x"
Cohesion: 0.67
Nodes (3): lift_x(), pow2(), sqrtMod()

### Community 38 - "decode"
Cohesion: 0.25
Nodes (9): decode(), getZapEndpoint(), matchAll(), matchAll2(), parse2(), parseReferences(), parseTLV(), replaceAll() (+1 more)

## Knowledge Gaps
- **1 isolated node(s):** `serve`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 134 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `NostrCrypto` connect `NostrRelay` to `ui-controller.js`, `update`, `host-controller.js`, `decode`, `verifyEvent`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `initNostr()` (e.g. with `buildIceServers()` and `buildNostrSessionConfig()`) actually correct?**
  _`initNostr()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `serve` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ui-controller.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07278835386338185 - nodes in this community are weakly interconnected._
- **Why does `getPublicKey()` connect `decode` to `NostrRelay`, `nostr.bundle.js`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `weierstrass()` (e.g. with `getPublicKey2()` and `getSharedSecret()`) actually correct?**
  _`weierstrass()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `weierstrass` be split into smaller, more focused modules?**
  _Cohesion score 0.07272727272727272 - nodes in this community are weakly interconnected._