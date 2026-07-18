# 🔐 P2P Connect

**Serverless, encrypted, peer-to-peer communication — right in your browser.**

Chat, call, share files, and screen share with anyone — no servers, no accounts, no data collection. Built on WebRTC and Nostr.

## Features

- 💬 **Real-time Chat** — instant messaging with delivery acknowledgments, offline fallback via Nostr relays
- 📁 **File Transfer** — send any file, 16KB chunking with progress tracking
- 📞 **Audio/Video Calls** — camera, microphone, device selection, resolution control
- 🖥️ **Screen Sharing** — share your screen, auto-restores camera on stop
- 🔗 **Two Connection Modes** — manual token exchange (QR/copy-paste) OR one-click Nostr auto-signaling
- 🔒 **End-to-End Encrypted** — DTLS for data, SRTP for media, NIP-44 for signaling
- 📇 **Contact List** — save peer pubkeys with nicknames for quick reconnect
- 🌐 **Multi-Relay** — connects to 3 Nostr relays for redundancy
- 📱 **Responsive Design** — works on desktop & mobile
- 🎨 **Dark Theme** — beautiful dark UI
- 💾 **Chat Backup** — export/import chat history
- 🔍 **Token Inspector** — decode and examine any token's contents

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Mahesh-Devani/webrtc-p2p.git
cd webrtc-p2p

# Install dev dependencies
npm install

# Start the dev server (HTTPS required for WebRTC)
npx serve --ssl-cert cert.crt --ssl-key cert.key

# Open in browser
# https://localhost:3000
```

Note: HTTPS is required because WebRTC and getUserMedia APIs require a secure context. The included self-signed certificates work for local development.

## How It Works

1. **Connection**: Two modes (manual tokens or Nostr auto-signaling)
2. **Communication**: Once connected, all data flows directly peer-to-peer (WebRTC DataChannels and MediaStreams)
3. **Security**: Three layers of encryption (DTLS, SRTP, NIP-44)

For full details, see the [Architecture](docs/architecture.md) documentation.

## Technology Stack

| Technology | Purpose |
|---|---|
| WebRTC | Peer-to-peer connections, media, data channels |
| Nostr | Decentralized signaling & offline message delivery |
| NIP-44 | End-to-end encrypted signaling (XChaCha20-Poly1305) |
| pako | SDP compression (zlib deflate) |
| Vanilla JS | No framework, no build step, ES modules |

## Project Structure

```
webrtc-p2p/
├── index.html           # Page structure, all UI panels
├── style.css            # Design system — dark theme, responsive
├── ui-controller.js     # Orchestrator — DOM wiring, all user flows
├── webrtc-core.js       # PeerSession — connection lifecycle, media, files
├── nostr-signaling.js   # Bridge: Nostr ↔ WebRTC handshake
├── nostr-transport.js   # Multi-relay orchestrator, pub/sub
├── nostr-relay.js       # Single relay WebSocket manager
├── nostr-crypto.js      # Key management, NIP-44 encrypt/decrypt
├── token-codec.js       # Encode/decode compressed signaling tokens
├── chat-store.js        # Persistent chat storage (localStorage)
└── docs/
    ├── architecture.md  # System architecture & design decisions
    ├── system-design.md # Module internals, APIs, data structures
    ├── concepts-guide.md # Concepts explained with code snippets
    └── roadmap.md       # Long-term feature roadmap
```

## Documentation

- [Architecture](docs/architecture.md) — system overview, connection modes, security model
- [System Design](docs/system-design.md) — module internals, APIs, data structures
- [Concepts Guide](docs/concepts-guide.md) — WebRTC, Nostr, encryption explained with code
- [Roadmap](docs/roadmap.md) — planned features and long-term vision

## Security

- All communication is end-to-end encrypted
- No server ever sees your data
- Nostr relays only see encrypted metadata
- TURN relays (if used) only see encrypted DTLS packets
- Keys are stored locally in your browser

For the full security model, see [Architecture — Security](docs/architecture.md#security-model).

## Contributing

Contributions welcome! Please read the [Concepts Guide](docs/concepts-guide.md) to understand the codebase.

## License

ISC