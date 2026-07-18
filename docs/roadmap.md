# P2P Connect — Roadmap

> Long-term feature plan and vision for P2P Connect.
> **Last updated:** 2026-07-19

### ✅ Phase 0: Foundation (Complete)
List everything already built:
- Manual token exchange (copy-paste, QR code)
- Nostr auto-signaling (NIP-44 encrypted, multi-relay)
- Real-time text chat with delivery acknowledgments
- File transfer (16KB chunking, progress tracking)
- Audio/video calls (camera, microphone, device selection)
- Screen sharing (auto-restore camera)
- Contact list with saved pubkeys
- Relay management (add/remove/reset)
- TURN fallback configuration
- Token inspector (decode & examine tokens)
- Chat persistence (localStorage, 500 msg limit)
- Chat backup/restore (export/import JSON)
- QR code generation & scanning
- Responsive dark-theme UI

### 🔜 Phase 1: Group Chat
Goal: Multi-party text messaging over Nostr relays.

Key features:
- Group creation (name, select members from contacts)
- Group message sending/receiving via Nostr (NIP-44 pairwise encryption to each member)
- Group chat UI (sender identity per message, group info panel)
- Group metadata storage (localStorage)
- Member management (add/remove, admin role)
- Group chat persistence

Architecture notes:
- Messages encrypted separately for each group member (NIP-44 is pairwise)
- New `group-store.js` module for group metadata
- ChatStore extended with `group-<groupId>` key scheme
- NostrTransport extended with `sendGroupMessage()`
- Works with existing Nostr relay infrastructure

### 📞 Phase 2: Group Calling
Goal: Multi-party audio/video calls for small groups.

Key features:
- Full mesh topology (each peer connects to every other peer)
- Video grid layout (2×2, 3×3)
- Group call controls (mute, camera, leave)
- Participant tracking (join/leave notifications)
- Call orchestration layer

Architecture notes:
- Refactor ui-controller.js singleton `session` to support `Map<pubkey, session>`
- Each participant creates N-1 PeerSession instances
- Reuses existing PeerSession and Nostr signaling
- Practical limit: ~4-5 participants (bandwidth/CPU constraint of mesh)
- New `call-manager.js` module for multi-peer call state

### 📱 Phase 3: Native Applications
Goal: Extend P2P Connect beyond the browser for features not possible on the web.

Key features:
- **Android app** (Kotlin/Java) — background operation, push notifications, screen sharing system-wide
- **iOS app** (Swift) — background calling, CallKit integration, system notifications
- **Linux desktop app** (Electron or Tauri) — system tray, native file dialogs, screen recording
- **Windows desktop app** (Electron or Tauri) — system tray, native notifications, auto-start

Architecture notes:
- Shared WebRTC core logic (consider WebView-based approach for code reuse)
- Native push notification integration (FCM for Android, APNs for iOS)
- Platform-specific features: background audio, system-level screen sharing, file system access
- Consider Tauri over Electron for smaller bundle size and lower memory footprint
- Native apps unlock features browsers restrict (background execution, system integration)

### 🔒 Phase 4: Enhanced Security & Privacy
Goal: Strengthen the security model.

Key features:
- E2EE verification (safety numbers / QR code fingerprint comparison)
- Forward secrecy (Double Ratchet or similar on top of DTLS)
- Message disappearing timer
- Key rotation
- Read receipts (optional)

### 🌐 Phase 5: Scalability & Infrastructure
Goal: Support larger groups and improve reliability.

Key features:
- SFU integration (LiveKit, mediasoup, or Janus) for groups >5
- Self-hosted Nostr relay option
- TURN server cluster (multi-region coturn)
- IndexedDB migration (from localStorage for larger chat histories)
- Analytics & monitoring (ICE success rates, connection times)

### 💡 Backlog / Ideas
Future ideas without a timeline:
- Message reactions (emoji)
- Voice messages
- Typing indicators
- Message search
- Threaded replies
- PWA (Progressive Web App) with offline support
- Plugin/extension system
- Relay self-hosting guide
- Custom emoji / stickers
- Link previews
- End-to-end encrypted file storage
