# 🤖 AI Support Agent & Developer Triage System

The **AI Support Agent** in P2P Connect is a dual-tier diagnostic and issue reporting system designed to provide instant troubleshooting guidance to users and stream actionable technical telemetry to developers.

---

## 1. Dual-Tier Architecture

```
                  ┌────────────────────────────────────────────────────────┐
                  │              Tier 1: Client-Side Engine                │
                  │   (In-Browser via ui-controller.js — Zero Backend)     │
                  └───────────────────────────┬────────────────────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │                                               │
                      ▼                                               ▼
     [ Instant User Guidance in Chat ]               [ Telemetry Ingestion Server ]
     • Status badge explanations                     • Port 9998 HTTP Ingestion
     • "Standby (No Screen)" guidance                • support-agent/ai-diagnostic-agent.py
     • "Never connected" lifecycle                   • diagnostics-inbox/
     • WebRTC & ICE state analysis                                    │
                                                                      ▼
                                                     ┌─────────────────────────────────┐
                                                     │   Tier 2: Developer Triage      │
                                                     │     (Developer + Antigravity)   │
                                                     └─────────────────────────────────┘
```

### Tier 1: Client-Side Browser Engine (Always Online)
- Runs **100% inside the user's browser** via [`ui-controller.js`](../ui-controller.js).
- **Zero Backend Dependency**: Even when no local Python server or daemon is running, the agent in the client chat is permanently active and responsive.
- Evaluates live WebRTC state variables (`session.getState()`, candidate types, relay connectivity, remote desktop fleet status) to answer user questions instantly.
- Handles direct in-memory screenshot previews and generates cryptographically signed diagnostic packages (`Send Diag`).

### Tier 2: Developer Ingestion Server & Inbox (`diagnostics-inbox/`)
- A lightweight, zero-dependency Python service ([`ai-diagnostic-agent.py`](ai-diagnostic-agent.py)) listening on `http://127.0.0.1:9998/`.
- **Autonomous Nostr Bridge**: When started, `ai-diagnostic-agent.py` automatically launches a background headless Chrome instance running `http://127.0.0.1:9998/support.html`. This bridge subscribes to Nostr relays under the developer's dedicated support keypair (`support-identity.json`), decrypts incoming NIP-44 diagnostic signals from remote users anywhere in the world, and posts them to port 9998.
- Ingests incoming technical telemetry:
  - `logpkg_<timestamp>_<pubkey>.json`: Full WebRTC telemetry, ICE candidates, relay states, and redacted system logs (< 2 KB).
  - `comment_<timestamp>_<pubkey>.json`: User questions, reported symptoms, and timestamped dialogue.
  - `screenshot_<timestamp>_<pubkey>.jpg`: Visual captures of errors or connection drops.
- Archived in [`support-agent/diagnostics-inbox/`](diagnostics-inbox/) for engineering review.

---

## 2. Why Does the Support Agent Run When the Python Script Is Not Started?

When you restart your computer (e.g. Mac Studio) and open the web app, you will notice that the `🤖 AI Support Agent` is already active and responding to chat questions even if `ai-diagnostic-agent.py` was never started.

**This is intentional by design:**
1. **Browser-Native Execution**: The chat contact `🤖 AI Support Agent` is an automated virtual contact handled natively by `ui-controller.js`.
2. **Graceful Fallback**: When a user types a message or uploads a screenshot, the browser attempts to forward a copy to `http://127.0.0.1:9998/`. If the Python server is offline, the fetch request silently times out or catches the error, and the browser immediately falls back to its internal diagnostic rule engine.
3. **Zero Interruption**: End users are never blocked or shown connection errors when the developer's ingestion script is offline.

---

## 3. Developer + Antigravity Triage Workflow

Whenever you want to review user-reported issues, you can prompt Antigravity directly:

> *"Check the support inbox and analyze any reported issues."*

### The Resolution Loop
1. **Inbox Inspection**: Antigravity runs `python3 support-agent/ai-diagnostic-agent.py --inbox` to list all unhandled logpkgs, user comments, and screenshots.
2. **Root-Cause Analysis**: Antigravity inspects the telemetry bundle, cross-references recent logs with the codebase AST knowledge graph, and identifies the exact root cause.
3. **Proposed Fix**: Antigravity presents a structured diagnosis and proposed code change for developer review.
4. **Developer Approval**: You review and approve or refine the approach.
5. **Implementation & Verification**: Antigravity applies the code changes, runs the automated regression suite (`python3 run-regressions.py --all`), verifies all 9 architectural invariants (`python3 check-invariants.py`), and requests final confirmation before git commit or push.

---

## 4. CLI Reference for `ai-diagnostic-agent.py`

### Start Ingestion Server (Port 9998)
```bash
# Default: Starts HTTP server and autonomous headless Chrome bridge for Nostr
python3 support-agent/ai-diagnostic-agent.py

# Optional: Run without headless Chrome (open http://127.0.0.1:9998/support.html manually)
python3 support-agent/ai-diagnostic-agent.py --no-headless
```

### Triage Inbox (List All Received Issues)
```bash
python3 support-agent/ai-diagnostic-agent.py --inbox
```
Example output:
```text
══════════════════════════════════════════════════════════════
📥 AI Support Agent — Developer Triage Inbox (diagnostics-inbox)
══════════════════════════════════════════════════════════════
Total: 4 log packages, 1 comments, 0 screenshots

💬 Recent User Comments:
  • [2026-10-21 19:40:00] User (531fab8c…): "Under my remote dektops, for my computer it wrongly shows as never connected"

📋 Recent Diagnostic Log Packages:
  • [2026-10-20 16:17:00] logpkg_1792493220_531fab8c3f88bf13.json (Client: 531fab8c…, WebRTC: connected)
══════════════════════════════════════════════════════════════
```

### Offline Deep Analysis of a Specific Package
```bash
python3 support-agent/ai-diagnostic-agent.py --analyze support-agent/diagnostics-inbox/logpkg_1792493220_531fab8c3f88bf13.json
```
Runs the full 5-point root-cause analysis engine:
1. WebRTC Connection & ICE state machine.
2. Candidate pair distribution (Host vs. STUN srflx vs. TURN relay).
3. Nostr signaling relay reachability and partition detection.
4. Glare, collision, and handshake timeout detection.
5. Mobile OS backgrounding & consent freshness timeouts (RFC 7675).
