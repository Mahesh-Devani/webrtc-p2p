# NostrRelay

> 25 nodes · cohesion 0.15

## Key Concepts

- **NostrRelay** (16 connections) — `nostr-relay.js`
- **NostrTransport** (12 connections) — `nostr-transport.js`
- **nostr-transport.js** (10 connections) — `nostr-transport.js`
- **._doConnect()** (6 connections) — `nostr-relay.js`
- **nostr-signaling.js** (6 connections) — `nostr-signaling.js`
- **PeerSession** (6 connections) — `webrtc-core.js`
- **destroy()** (5 connections) — `nostr.bundle.js`
- **._wireSocket()** (5 connections) — `nostr-relay.js`
- **._setState()** (4 connections) — `nostr-relay.js`
- **NostrSignaling** (4 connections) — `nostr-signaling.js`
- **webrtc-core.js** (4 connections) — `webrtc-core.js`
- **nostr-relay.js** (3 connections) — `nostr-relay.js`
- **.connect()** (3 connections) — `nostr-relay.js`
- **.disconnect()** (3 connections) — `nostr-relay.js`
- **._resubscribeAll()** (3 connections) — `nostr-relay.js`
- **._scheduleReconnect()** (3 connections) — `nostr-relay.js`
- **._sendSubscription()** (3 connections) — `nostr-relay.js`
- **.subscribe()** (3 connections) — `nostr-relay.js`
- **init()** (3 connections) — `ui-controller.js`
- **._handleMessage()** (2 connections) — `nostr-relay.js`
- **.publish()** (2 connections) — `nostr-relay.js`
- **.unsubscribe()** (2 connections) — `nostr-relay.js`
- **RelayState** (2 connections) — `nostr-relay.js`
- **.constructor()** (1 connections) — `nostr-relay.js`
- **DEFAULT_RELAYS** (1 connections) — `nostr-transport.js`

## Relationships

- [ui-controller.js](ui-controller.js.md) (7 shared connections)
- [update](update.md) (4 shared connections)
- [host-controller.js](host-controller.js.md) (4 shared connections)
- [close](close.md) (3 shared connections)
- [nostr.bundle.js](nostr.bundle.js.md) (1 shared connections)
- [decode](decode.md) (1 shared connections)

## Source Files

- `nostr-relay.js`
- `nostr-signaling.js`
- `nostr-transport.js`
- `nostr.bundle.js`
- `ui-controller.js`
- `webrtc-core.js`

## Audit Trail

- EXTRACTED: 55 (83%)
- INFERRED: 11 (17%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*