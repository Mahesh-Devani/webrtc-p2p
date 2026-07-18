# P2P Connect — Concepts Guide

> A developer-friendly guide to the key technologies and patterns used in this app.
> Each section explains **what** the concept is, **why** we use it, and **how** it's implemented — with real code from the source.

### 1. WebRTC Fundamentals
- **What RTCPeerConnection is**: The core WebRTC API that represents a local to remote peer connection.
- **What SDP (Session Description Protocol) is**: The offer/answer model used to negotiate session parameters like media codecs and network info.
- **What ICE (Interactive Connectivity Establishment) does**: Handles NAT traversal to find the best path to connect peers (using STUN/TURN servers).
- **How these 3 work together**: RTCPeerConnection uses SDP to negotiate the connection and ICE to establish the actual network path.

```javascript
// PeerSession.create() from webrtc-core.js (lines 52-55)
const pc = new RTCPeerConnection({
  iceServers,
  // Pre-allocates ICE candidate objects to speed up gathering
  iceCandidatePoolSize: 2,
});
```

### 2. DataChannels
- **What they are**: Peer-to-peer data channels that work similarly to WebSockets but operate directly between peers.
- **Why we use 3 separate channels**: For separation of concerns and to allow different reliability modes.

```javascript
// createOffer() in webrtc-core.js (lines 488-495)
const sigChannel = pc.createDataChannel('p2p-sig', { negotiated: false });
const chatChannel = pc.createDataChannel('p2p-chat', { negotiated: false, ordered: true });
const fileChannel = pc.createDataChannel('p2p-files', { negotiated: false, ordered: true });
```

| Channel | Label | Purpose | Options |
|---|---|---|---|
| dcSig | p2p-sig | In-band renegotiation signaling | JSON messages |
| dcChat | p2p-chat | Text chat | Ordered, reliable |
| dcFiles | p2p-files | File transfer | Binary (arraybuffer), ordered |

### 3. Perfect Negotiation Pattern
- **What it is**: A W3C-recommended pattern for handling WebRTC renegotiation without glare (collisions).
- **Why it matters**: Prevents connection failures when both peers try to renegotiate at the same time (e.g., both add a video track).
- **The roles**: The "polite" peer (usually the joiner) yields on collision, while the "impolite" peer (the creator) wins.

```javascript
// State variables from webrtc-core.js (lines 73-77)
let isPolite = false;  // set in createOffer / acceptOffer
let makingOffer = false;
let ignoreOffer = false;
let initialSignalingDone = false;
```

```javascript
// Collision handling from handleDcSignaling() (lines 144-150)
const offerCollision = makingOffer || pc.signalingState !== 'stable';
ignoreOffer = !isPolite && offerCollision;
if (ignoreOffer) {
  log('Ignoring colliding offer (impolite peer)');
  return;
}
```
*Note: `onnegotiationneeded` (lines 185-216) handles sending offers via the `dcSig` DataChannel.*

### 4. Nostr Protocol Primer
- **What Nostr is**: A simple, open protocol for censorship-resistant messaging.
- **Why it's used here**: Provides decentralized signaling infrastructure without needing to run our own custom server.
- **Key concepts**: Uses events, relays to distribute them, kinds to identify event types, pubkeys for identities, and tags for metadata.
- **Event kind 24133**: Our custom kind used specifically for WebRTC signaling.

```javascript
// Event format from nostr-transport.js (lines 7-13)
// Event format:
//   kind: 24133
//   tags: [["p", receiverPubKey], ["t", "webrtc"], ["v", "1"]] // p: routes to receiver, t: app identifier, v: protocol version
//   content: NIP-44 encrypted JSON payload
```

### 5. NIP-44 Encryption
- **What NIP-44 is**: A Nostr Improvement Proposal for encrypted direct messages.
- **Crypto details**: Uses XChaCha20-Poly1305 with HKDF key derivation.
- **How conversation keys work**: Derived from the sender's private key and the receiver's public key (ECDH).
- **Why pairwise**: The same conversation key is generated whether Alice sends to Bob or Bob sends to Alice.

```javascript
// nostr-crypto.js encrypt() (lines 94-101)
async function encrypt(plaintext, senderPrivHex, receiverPubHex) {
  const { nip44 } = await loadNostrTools();
  const convKey = nip44.v2.utils.getConversationKey(
    hexToBytes(senderPrivHex),
    receiverPubHex
  );
  return nip44.v2.encrypt(plaintext, convKey);
}
```

### 6. SDP Compression & Token Format
- **Why compression**: SDP offers can be 2-5 KB, and ICE candidates add even more data.
- **Compression pipeline**: JSON → TextEncoder → `pako.deflate` (level 9) → base64url.
- **Token format v2**: `P2P2-<base64url(pako.deflate(JSON.stringify(payload)))>`
- **ICE metadata stripping**: Removes `generation`, `ufrag`, `network-id`, and `network-cost`, saving ~40-50 chars per candidate.

```javascript
// token-codec.js (lines 27-33)
function stripCandidateMetadata(candidateStr) {
  return candidateStr
    .replace(/\s+generation\s+\d+/gi, '')
    .replace(/\s+ufrag\s+\S+/gi, '')
    .replace(/\s+network-id\s+\d+/gi, '')
    .replace(/\s+network-cost\s+\d+/gi, '')
    .trim();
}
```
*Note: The v1 decoder handles both `P2P1-` and `P2P2-` prefixes for backward compatibility.*

### 7. ICE Candidate Batching
- **Problem**: ICE candidates trickle in one at a time. Sending each as a separate Nostr event wastes relay resources.
- **Solution**: A 200ms debounce — candidates are queued and sent as a batch when gathering pauses.

```javascript
// nostr-signaling.js (lines 365-397)
function _sendIceCandidate(sessionId, remotePubKey, candidate) {
  _iceBatchQueues.get(sessionId).push({ candidate: candidate.candidate, ... });
  
  // Debounce: send batch after 200ms of no new candidates
  if (_iceBatchTimers.has(sessionId)) {
    clearTimeout(_iceBatchTimers.get(sessionId));
  }
  _iceBatchTimers.set(sessionId, setTimeout(async () => {
    const candidates = _iceBatchQueues.get(sessionId) || [];
    // ... compress and send all at once
  }, 200));
}
```

### 8. Chat Message Protocol
- **Dual transport**: Uses DataChannel for live messages and Nostr relays as an offline fallback.
- **Message format**: `{ id: 42, text: "Hello!" }`
- **Delivery ack format**: `{ _ack: 42 }`
- **Smart fallback**: If a DataChannel ack doesn't arrive within 3 seconds, the message is resent via Nostr.
- **Persistence**: `ChatStore` saves messages to `localStorage` keyed by `chat-<pubkey>` (max 500 messages).
- **Message schema**: `{ id, text, sender, ts, status, type, fileName? }`

```javascript
// chat-store.js addMessage() (lines 58-64)
function addMessage(pubkey, message) {
  const messages = getMessages(pubkey);
  if (message.id && messages.some(m => m.id === message.id)) return; // dedup
  messages.push(message);
  _saveMessages(pubkey, messages);
}
```

### 9. File Transfer Protocol
- **Chunking**: Files are sent in 16KB chunks over the `p2p-files` DataChannel.
- **Flow**: `{ _fileStart: true, name, size, type }` → N × ArrayBuffer chunks → `{ _fileEnd: true }`
- **Backpressure**: Pauses sending when the DataChannel buffer exceeds 16MB to prevent memory issues.

```javascript
// webrtc-core.js sendFile() (lines 596-624)
// Implements backpressure by yielding to the event loop
if (dcFiles.bufferedAmount > 16 * 1024 * 1024) {
  setTimeout(sendBlock, 50);
  return;
}
```

### 10. Relay Management & Resilience
- **Multi-relay architecture**: Messages are published to ALL connected relays for redundancy.
- **Publish failover**: Attempts twice with a 2s delay, using `Promise.any` (succeeds if ANY relay accepts it).
- **Auto-reconnect**: Exponential backoff starting at 1s, capped at 30s.
- **Event deduplication**: Maintains a `Set` of processed event IDs (capped at 500, prunes the oldest 100).
- **ICE flood protection**: Maximum of 20 ICE events per session.

```javascript
// nostr-relay.js _scheduleReconnect() (lines 261-273)
_scheduleReconnect() {
  const delay = this._reconnectDelay;
  // Exponential backoff capped at 30s
  this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 30000);
  this._reconnectTimer = setTimeout(() => {
    this._doConnect().catch(() => {});
  }, delay);
}
```

### 11. Session Lifecycle
- **States**: pending → connecting → connected → closed
- **Cleanup**: A timer runs every 30s to remove non-connected sessions older than 2 minutes.
- **Session ID**: 16 random bytes represented as a 32-character hex string.

```javascript
// nostr-signaling.js _cleanupStaleSessions() (lines 464-474)
function _cleanupStaleSessions() {
  const now = Date.now();
  for (const [sessionId, entry] of _sessions) {
    if (entry.state !== 'connected' && (now - entry.createdAt) > SESSION_TIMEOUT_MS) {
      entry.session.close();
      _sessions.delete(sessionId);
    }
  }
}
```

### 12. Media Handling
- Uses `getUserMedia` for camera/microphone access.
- Uses `replaceTrack()` to swap tracks without requiring renegotiation (e.g., camera switch, screen share).
- **Screen sharing**: Replaces the video track and auto-restores the camera when the user stops sharing.

```javascript
// webrtc-core.js addLocalStream() (lines 342-355)
function addLocalStream(stream) {
  localStream = stream;
  for (const track of stream.getTracks()) {
    const existingSender = senders.get(track.kind);
    if (existingSender) {
      // Fast track swapping without renegotiation
      existingSender.replaceTrack(track);
    } else {
      const sender = pc.addTrack(track, stream);
      senders.set(track.kind, sender);
    }
  }
}
```

### 13. Singleton & Factory Patterns
- **IIFE Singletons**: Most modules use the Singleton IIFE pattern (`NostrCrypto`, `NostrTransport`, `NostrSignaling`, `ChatStore`, `TokenCodec`). This ensures a single instance, encapsulates private state in closures, and avoids `this` binding issues.
- **Factory Pattern**: `webrtc-core.js` uses a Factory pattern (`PeerSession.create()`), where each call creates a new independent session.
- **Class Pattern**: `NostrRelay` uses a Class pattern since each instance manages one individual relay connection.
