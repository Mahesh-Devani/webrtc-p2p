# 🔐 P2P Connect

**Serverless, encrypted, peer-to-peer communication & remote desktop — right in your browser.**

🌐 **Live Demo:** [https://mahesh-devani.github.io/webrtc-p2p/](https://mahesh-devani.github.io/webrtc-p2p/)  
🖥️ **Host Agent:** [https://mahesh-devani.github.io/webrtc-p2p/host.html](https://mahesh-devani.github.io/webrtc-p2p/host.html)

Chat, call, share files, and remotely control your computer from anywhere — no accounts, no centralized servers, and zero data collection. Built entirely on WebRTC and decentralized Nostr signaling.

---

## Features

- 🖥️ **Remote Desktop (Unattended Access)** — High-performance 60 FPS desktop streaming with full mouse, keyboard, and scroll control (Chrome Remote Desktop alternative).
- 📱 **Mobile Remote Control** — Full-screen touch control, trackpad mode, two-finger scroll, and fluid pinch-to-zoom (up to 4x).
- 💬 **Real-time Chat** — Instant messaging with delivery acknowledgments (`_ack`), offline fallback via Nostr relays.
- 📁 **Chunked File Transfer** — Send any file of any size directly peer-to-peer with 16KB chunking and progress tracking.
- 📞 **Audio/Video Calls** — HD camera, microphone, device selection, and dynamic resolution control.
- 🖥️ **Screen Sharing** — Direct browser screen share with automatic camera track restoration.
- 🔗 **Dual Signaling Modes** — Automated decentralized Nostr relays (NIP-44 encrypted) OR offline manual tokens (`P2P2-` / QR code).
- 🔒 **End-to-End Encrypted** — DTLS for DataChannels, SRTP for media streams, NIP-44 (XChaCha20-Poly1305) for signaling.
- 🛡️ **Zero-Trust Host Security** — Unattended PIN protection, client public key whitelist, CSWSH Origin validation, and corner-slam panic failsafe.
- 🎨 **Dark Theme & PWA** — Responsive dark UI optimized for desktop and mobile browsers.

---

## Remote Desktop Quick Start

P2P Connect can turn any computer into an unattended remote desktop host without installing complex software.

### 1. On the Computer to Control (Host)
1. Open the Host Agent in Chrome/Edge: [https://mahesh-devani.github.io/webrtc-p2p/host.html](https://mahesh-devani.github.io/webrtc-p2p/host.html)
2. **Download & Start the Zero-Dependency Input Bridge**:
   - **Option A (One-line terminal command for macOS / Linux):**
     ```bash
     curl -sSL https://raw.githubusercontent.com/mahesh-devani/webrtc-p2p/main/remote-desktop-host/bridge.py -o bridge.py && python3 bridge.py
     ```
   - **Option B (Windows PowerShell):**
     ```powershell
     Invoke-WebRequest -Uri "https://raw.githubusercontent.com/mahesh-devani/webrtc-p2p/main/remote-desktop-host/bridge.py" -OutFile "bridge.py"; python bridge.py
     ```
   - **Option C (Browser Download):** Click **⬇️ Download bridge.py** (or **📦 Download Complete Package (.zip)**) directly on `host.html`, open a terminal in your Downloads folder, and run `python3 bridge.py`.
   > *Note: `bridge.py` requires standard Python 3 only. No `pip install` or external packages are needed!*
3. On `host.html`, click **Start Desktop Capture** and select your screen. *(Keep `host.html` open in Chrome/Edge — minimized is fine).*
4. Click **Copy Host Public Key** (or scan the pairing QR code from your phone). A secure password is generated automatically on first run (or click **🎲 Generate**). Copy the **Client ID** from your client device and add it to the host's **Authorized Clients** list (whitelist is enforced by default).

### 2. On Your Remote Device (Client - Phone, Tablet, or Laptop)
1. Open [https://mahesh-devani.github.io/webrtc-p2p/](https://mahesh-devani.github.io/webrtc-p2p/) on any browser.
2. Under **My Remote Desktops** in the sidebar, click **Add Remote Computer**.
3. Paste the Host Public Key, enter the password, and click **Save Computer**.
4. Click **⚡ Connect** to immediately take full interactive control!

### 3. Optional: Run as a Persistent Background Service (24/7 Access)
If you want your host computer to always be accessible remotely without keeping a terminal open:
- **macOS:** `cd remote-desktop-host && ./install-service.sh` (LaunchAgent)
- **Linux:** `cd remote-desktop-host && ./install-linux-service.sh` (systemd user unit)
- **Windows:** Double-click `remote-desktop-host/install-windows-service.bat` (Task Scheduler with `pythonw.exe`)

See [remote-desktop-host/README.md](remote-desktop-host/README.md#running-as-a-persistent-background-service) for complete management commands (logs, restart, and uninstallation).

---

## Local Development Quick Start

Because P2P Connect uses native browser ES Modules, there is **zero build step**:

```bash
# Clone the repository
git clone https://github.com/Mahesh-Devani/webrtc-p2p.git
cd webrtc-p2p

# Start local server (port 8080 is treated as a Secure Context by modern browsers)
python3 -m http.server 8080

# Open in browser:
# http://localhost:8080/index.html   (Client App)
# http://localhost:8080/host.html    (Remote Desktop Host)
```

To run the automated unattended host daemon with the native bridge:
```bash
./remote-desktop-host/start-host.sh
```

---

## Technology Stack

| Component | Implementation | Notes |
|---|---|---|
| **WebRTC Core** | Native `RTCPeerConnection` | DTLS DataChannels & MediaStreams |
| **Signaling (Auto)** | Nostr Relays (`kind: 24133`) | NIP-44 v2 encrypted handshake |
| **Signaling (Manual)** | Compressed Tokens (`P2P2-`) | `pako` zlib deflate + QR codes |
| **Native Input Bridge** | Standard Library Python 3 (`bridge.py`) | CoreGraphics Quartz (macOS) & Win32 |
| **Frontend Runtime** | Pure Vanilla ES Modules | Zero bundler, zero build step |
| **Styling** | Vanilla CSS (`style.css`) | WhatsApp-inspired dark design system |

---

## Project Structure

```text
webrtc-p2p/
├── index.html                  # Main client interface & messaging UI
├── host.html                   # Unattended Remote Desktop Host Agent
├── host-controller.js          # Host daemon state machine & WebRTC capture
├── ui-controller.js            # Client orchestrator & mobile remote controller
├── webrtc-core.js              # PeerSession connection lifecycle & DataChannels
├── nostr-signaling.js          # Nostr ↔ WebRTC bridge & ICE candidate batching
├── nostr-transport.js          # Multi-relay WebSocket manager & message router
├── nostr-crypto.js             # secp256k1 key management & NIP-44 encryption
├── token-codec.js              # P2P2- token compression & decompression
├── chat-store.js               # Persistent encrypted message store (localStorage)
├── style.css                   # Responsive layout, dark theme, remote desktop HUD
├── remote-desktop-host/        # Native OS Input Injection Companion
│   ├── bridge.py               # Zero-dependency native input injector (Python 3)
│   ├── start-host.sh           # Automated background host launcher
│   ├── install-service.sh      # macOS LaunchAgent background service installer
│   ├── uninstall-service.sh    # Background service uninstaller
│   └── README.md               # Detailed Host Bridge guide
└── support-agent/              # AI Support & Developer Triage System
    ├── ai-diagnostic-agent.py  # Ingestion server & offline analyzer
    ├── diagnostics-inbox/      # Archived logpkgs, user comments, screenshots
    └── README.md               # Support Agent & Antigravity triage guide
```

---

## Security Model

1. **Zero-Backend Data Path**: Once WebRTC signaling is complete, peer-to-peer data and media flow directly between client browsers without passing through any server.
2. **End-to-End Encryption**:
   - Media: SRTP
   - Data: DTLS
   - Signaling: NIP-44 v2 with HKDF-SHA256 and XChaCha20-Poly1305 authenticated encryption
3. **Host Defense-in-Depth**:
   - **PIN Authentication**: Unauthorized clients cannot establish a remote desktop session without the host's secret PIN.
   - **Client Whitelist**: Unlisted Nostr public keys are dropped before decryption.
   - **CSWSH Origin Filtering**: `bridge.py` blocks rogue websites from sending local WebSocket commands.
   - **Emergency Failsafe**: Slamming the physical mouse into any corner immediately cuts the connection.

For complete architectural details, see the [Architecture Guide](docs/architecture.md) and [AGENTS.md](AGENTS.md).

---

## License

MIT License. Free and open source.