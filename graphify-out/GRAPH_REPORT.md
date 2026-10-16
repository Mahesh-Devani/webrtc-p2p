# Graph Report - webrtc-p2p  (2026-10-17)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 574 nodes · 1336 edges · 38 communities (25 shown, 13 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c0b176e1`
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
- close
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
- hexToBytes
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
- `PeerSession` --indirect_call--> `close()`  [INFERRED]
  webrtc-core.js → nostr.bundle.js
- `PeerSession` --indirect_call--> `send()`  [INFERRED]
  webrtc-core.js → nostr.bundle.js
- `NostrCrypto` --indirect_call--> `verifyEvent()`  [INFERRED]
  nostr-crypto.js → nostr.bundle.js
- `NostrCrypto` --indirect_call--> `getPublicKey()`  [INFERRED]
  nostr-crypto.js → nostr.bundle.js
- `NostrTransport` --indirect_call--> `getPublicKey()`  [INFERRED]
  nostr-transport.js → nostr.bundle.js

## Import Cycles
- None detected.

## Communities (38 total, 13 thin omitted)

### Community 0 - "ui-controller.js"
Cohesion: 0.08
Nodes (87): ChatStore, acceptIncomingCall(), addContact(), addOrUpdateRemoteDevice(), appendChatBubble(), applyRdZoomTransform(), attachRemoteVideoInputListeners(), buildIceServers() (+79 more)

### Community 1 - "weierstrass"
Cohesion: 0.07
Nodes (50): bytesToHex(), bytesToNumberBE(), bytesToNumberLE(), challenge(), concatBytes2(), createHmacDrbg(), ensureBytes(), extract() (+42 more)

### Community 2 - "update"
Cohesion: 0.07
Nodes (46): apply0123(), applySbox(), bytes3(), computeTag(), computeTag2(), constructor(), ctr32(), ctrCounter() (+38 more)

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
Cohesion: 0.10
Nodes (27): bytesToHex2(), createRumor(), createSeal(), createWrap(), decode(), decrypt2(), encrypt2(), finalizeEvent() (+19 more)

### Community 8 - "NostrRelay"
Cohesion: 0.15
Nodes (8): destroy(), NostrRelay, RelayState, NostrSignaling, DEFAULT_RELAYS, NostrTransport, init(), PeerSession

### Community 9 - "package.json"
Cohesion: 0.09
Nodes (21): author, bugs, url, description, devDependencies, serve, homepage, keywords (+13 more)

### Community 10 - "encode"
Cohesion: 0.15
Nodes (20): encode(), encodeBech32(), encodeBytes(), encodeTLV(), fastEventHash(), encode(), getPow(), getToken() (+12 more)

### Community 11 - "remote-desktop-host/package.json"
Cohesion: 0.14
Nodes (13): @nut-tree/nut-js, ws, BUTTON_MAP, wss, dependencies, @nut-tree/nut-js, ws, description (+5 more)

### Community 12 - "close"
Cohesion: 0.18
Nodes (14): auth(), close(), closeAllSubscriptions(), connect(), count(), ensureRelay(), fire(), makeAuthEvent() (+6 more)

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

### Community 24 - "hexToBytes"
Cohesion: 0.67
Nodes (3): hexToBytes(), numberToHexUnpadded(), numberToVarBytesBE()

### Community 25 - "lift_x"
Cohesion: 0.67
Nodes (3): lift_x(), pow2(), sqrtMod()

## Knowledge Gaps
- **1 isolated node(s):** `serve`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 120 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `NostrCrypto` connect `update` to `ui-controller.js`, `host-controller.js`, `decode`, `NostrRelay`, `verifyEvent`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `initNostr()` (e.g. with `buildIceServers()` and `buildNostrSessionConfig()`) actually correct?**
  _`initNostr()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `serve` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ui-controller.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07526881720430108 - nodes in this community are weakly interconnected._
- **Why does `getPublicKey()` connect `decode` to `NostrRelay`, `update`, `nostr.bundle.js`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `weierstrass()` (e.g. with `getPublicKey2()` and `getSharedSecret()`) actually correct?**
  _`weierstrass()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `weierstrass` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._