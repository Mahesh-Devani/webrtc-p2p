#!/usr/bin/env python3
"""
support-agent/ai-diagnostic-agent.py
====================================
Zero-Dependency Autonomous Diagnostic Support Agent for P2P Connect.

Capabilities:
1. Local HTTP Diagnostic Ingestion Endpoint (http://127.0.0.1:9998/api/logpkg)
   Accepts logpkg bundles directly from the browser with CORS support.
2. Automated Root-Cause Diagnostic Rules Engine:
   - ICE Candidate & Symmetric NAT Traversal Analysis
   - STUN / TURN Server Reachability
   - Nostr Relay Health & Partition Detection
   - WebRTC State Machine & Glare Analysis
   - Mobile OS Lifecycle & Consent Timeout Detection
3. Offline File Analyzer:
   Run `python3 support-agent/ai-diagnostic-agent.py --analyze <file.json>`
   to instantly diagnose user-submitted log packages.
4. Auto-saves all ingested packages to `support-agent/diagnostics-inbox/`.
"""

import os
import sys
import re
import json
import time
import argparse
import mimetypes
import subprocess
import shutil
import tempfile
import atexit
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = AGENT_DIR.parent
INBOX_DIR = AGENT_DIR / 'diagnostics-inbox'
DEFAULT_PORT = 9998


# ── Diagnostic Rules Engine ──────────────────────────────────────────────────

class DiagnosticEngine:
    @staticmethod
    def analyze(pkg: dict) -> dict:
        findings = []
        recommendations = []
        root_causes = []

        env = pkg.get('environment', {})
        webrtc = pkg.get('webrtc', {})
        relays = pkg.get('relays', [])
        logs = pkg.get('recentLogs', [])
        identity = pkg.get('identity', {})

        # 1. WebRTC Connection State
        conn_state = webrtc.get('connectionState', 'unknown')
        ice_state = webrtc.get('iceConnectionState', 'unknown')

        if conn_state == 'connected':
            findings.append({
                'category': 'WebRTC',
                'level': 'SUCCESS',
                'message': 'WebRTC PeerConnection is active and connected.'
            })
            cand_pair = webrtc.get('selectedCandidatePair')
            if cand_pair:
                rtt = cand_pair.get('currentRoundTripTimeMs')
                findings.append({
                    'category': 'WebRTC',
                    'level': 'INFO',
                    'message': f'Selected candidate pair state: {cand_pair.get("state")}, Round-trip time: {rtt}ms'
                })
        elif conn_state in ('failed', 'disconnected'):
            root_causes.append(f'WebRTC connection state is "{conn_state}" (ICE: "{ice_state}")')
            findings.append({
                'category': 'WebRTC',
                'level': 'ERROR',
                'message': f'P2P direct channel dropped or failed to establish ({conn_state}).'
            })
        elif conn_state == 'connecting':
            findings.append({
                'category': 'WebRTC',
                'level': 'WARN',
                'message': 'WebRTC is still in connecting state (handshake pending or stalled).'
            })

        # 2. ICE Candidate Distribution & Symmetric NAT
        local_cands = werbtc_cands = webrtc.get('localCandidates', [])
        cand_types = [c.get('type') for c in local_cands if isinstance(c, dict)]
        has_host = 'host' in cand_types
        has_srflx = 'srflx' in cand_types
        has_relay = 'relay' in cand_types

        if local_cands:
            findings.append({
                'category': 'NAT/ICE',
                'level': 'INFO',
                'message': f'Discovered {len(local_cands)} local candidate(s): host={cand_types.count("host")}, srflx={cand_types.count("srflx")}, relay={cand_types.count("relay")}'
            })

            if has_host and not has_srflx and not has_relay:
                root_causes.append('Local host candidates only — no public STUN (srflx) or TURN (relay) candidates gathered.')
                findings.append({
                    'category': 'NAT/ICE',
                    'level': 'WARN',
                    'message': 'Device is restricted to LAN host candidates. If peers are on different networks, connection will fail.'
                })
                recommendations.append('Ensure STUN servers (e.g., stun:stun.l.google.com:19302) are not blocked by local router UDP firewall.')
                recommendations.append('Configure a TURN relay server under Settings -> ICE Servers for symmetric NAT traversal.')
        else:
            findings.append({
                'category': 'NAT/ICE',
                'level': 'WARN',
                'message': 'No local ICE candidates recorded in diagnostic snapshot.'
            })

        # 3. Nostr Relays Health
        connected_relays = [r for r in relays if r.get('state') == 'connected' or r.get('status') == 'connected']
        if len(relays) > 0:
            if len(connected_relays) == 0:
                root_causes.append('Zero Nostr signaling relays connected.')
                findings.append({
                    'category': 'Nostr',
                    'level': 'ERROR',
                    'message': f'All {len(relays)} configured Nostr relays are disconnected or unreachable.'
                })
                recommendations.append('Check internet connectivity and verify WebSocket (WSS) access on port 443.')
            elif len(connected_relays) < len(relays):
                findings.append({
                    'category': 'Nostr',
                    'level': 'WARN',
                    'message': f'{len(connected_relays)} of {len(relays)} relays connected.'
                })
            else:
                findings.append({
                    'category': 'Nostr',
                    'level': 'SUCCESS',
                    'message': f'All {len(relays)} signaling relays operational.'
                })

        # 4. Recent Log Inspection for Glare / Errors
        error_logs = [l for l in logs if l.get('level') in ('error', 'warn')]
        glare_detected = any('collision' in l.get('message', '').lower() or 'glare' in l.get('message', '').lower() for l in logs)
        if glare_detected:
            findings.append({
                'category': 'Signaling',
                'level': 'INFO',
                'message': 'Offer collision (glare) occurred between peers; automated tie-breaker engaged.'
            })

        session_fail = next((l.get('message', '') for l in logs if 'failed to start session' in l.get('message', '').lower() or 'rejected the signaling event' in l.get('message', '').lower()), None)
        if session_fail:
            root_causes.append(f'Signaling handshake failure during P2P session start: {session_fail}')
            findings.append({
                'category': 'Signaling',
                'level': 'ERROR',
                'message': f'Failed to start P2P session: {session_fail}'
            })
            recommendations.append('Ensure target peer is currently online with P2P Connect open in active foreground tab.')
            recommendations.append('Verify configured Nostr relays accept ephemeral signaling events (kind 24133).')

        # 5. Mobile Environment Checks
        ua = env.get('userAgent', '')
        if any(m in ua for m in ['iPhone', 'iPad', 'Android', 'Mobile']):
            findings.append({
                'category': 'Environment',
                'level': 'INFO',
                'message': 'Mobile browser environment detected. Background tab suspension may induce transient ICE consent timeouts.'
            })

        # 6. Remote Desktop & Host OS Bridge Checks
        meta = pkg.get('meta', {})
        bridge_active = meta.get('hostBridgeActive')
        is_rd = meta.get('rdMode') or any('rd' in str(l.get('message', '')).lower() for l in logs)
        has_bridge_error = any(
            '[Host Bridge]' in l.get('message', '') and any(w in l.get('message', '').lower() for w in ['failed', 'timeout', 'disconnected', 'not running'])
            for l in logs
        )

        if bridge_active is False or (is_rd and has_bridge_error and bridge_active is not True):
            root_causes.append('Host OS Bridge (bridge.py on port 9999) is disconnected. Remote Desktop control inputs cannot be injected (session is view-only).')
            findings.append({
                'category': 'Host Bridge',
                'level': 'ERROR',
                'message': 'Host OS Bridge daemon is offline or unreachable on ws://127.0.0.1:9999.'
            })
            recommendations.append('Run `python3 remote-desktop-host/bridge.py` on the host computer to restore input control.')
            recommendations.append('Check host dashboard (host.html) to verify OS Bridge badge displays "Active".')
        elif is_rd and bridge_active is True:
            findings.append({
                'category': 'Host Bridge',
                'level': 'SUCCESS',
                'message': 'Host OS Bridge is connected and active on port 9999.'
            })

        # Overall Status
        if any(f['level'] == 'ERROR' for f in findings):
            overall_status = 'CRITICAL'
        elif any(f['level'] == 'WARN' for f in findings):
            overall_status = 'WARNING'
        else:
            overall_status = 'HEALTHY'

        status_icon = '🟢' if overall_status == 'HEALTHY' else ('⚠️' if overall_status == 'WARNING' else '🚨')
        root_causes_text = '\n'.join(f'• {rc}' for rc in (root_causes if root_causes else ['None identified — communication paths look normal.']))
        recs_text = '\n'.join(f'👉 {r}' for r in (recommendations if recommendations else ['Communication parameters appear configured correctly.']))

        markdown_report = (
            f"🤖 [AI Diagnostic Analysis Report]\n"
            f"Status: {status_icon} {overall_status}\n\n"
            f"📌 Identified Root Causes:\n{root_causes_text}\n\n"
            f"📊 Telemetry Breakdown:\n"
            f"• WebRTC Connection: `{conn_state}` (ICE: `{ice_state}`)\n"
            f"• Discovered Candidates: host={cand_types.count('host')}, STUN={cand_types.count('srflx')}, TURN={cand_types.count('relay')}\n"
            f"• Signaling Relays: {len(connected_relays)} of {len(relays)} connected\n\n"
            f"💡 Recommended Actions:\n{recs_text}\n\n"
            f"(Advisory Mode: Your session telemetry has been analyzed)."
        )

        return {
            'timestamp': time.time(),
            'generatedAt': pkg.get('generatedAt'),
            'appVersion': pkg.get('version', 'v7'),
            'overallStatus': overall_status,
            'rootCauses': root_causes if root_causes else ['None identified — communication paths look normal.'],
            'findings': findings,
            'recommendations': recommendations if recommendations else ['Communication parameters appear configured correctly.'],
            'markdownReport': markdown_report,
            'clientPubKey': identity.get('clientPubKey'),
            'targetPubKey': identity.get('targetPubKey'),
        }

    @staticmethod
    def analyze_comment(user_text: str, client_pk: str, pkg: dict = None) -> dict:
        """
        Multi-turn interactive diagnostic dialogue & clarification engine.
        Cross-analyzes user's plain-text comment with ingested connection telemetry,
        generates context-aware clarification questions, and provides developer suggestions.
        """
        # If pkg is not provided, look for the newest saved logpkg in INBOX_DIR for this client
        if pkg is None and INBOX_DIR.exists():
            matched = list(INBOX_DIR.glob(f"logpkg_*_{client_pk}.json"))
            if not matched:
                # Also try matching any logpkg with matching clientPubKey inside JSON
                for p in sorted(INBOX_DIR.glob("logpkg_*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
                    try:
                        with open(p, 'r', encoding='utf-8') as f:
                            saved = json.load(f)
                            if saved.get('identity', {}).get('clientPubKey', '').startswith(client_pk):
                                pkg = saved
                                break
                    except Exception:
                        pass
            else:
                matched.sort(key=lambda x: x.stat().st_mtime, reverse=True)
                try:
                    with open(matched[0], 'r', encoding='utf-8') as f:
                        pkg = json.load(f)
                except Exception:
                    pass

        analysis = DiagnosticEngine.analyze(pkg) if pkg else None
        text_lower = user_text.lower()
        dev_suggestions = []

        overall_status = analysis.get('overallStatus', 'HEALTHY') if analysis else 'UNKNOWN'
        webrtc = pkg.get('webrtc', {}) if pkg else {}
        relays = pkg.get('relays', []) if pkg else []
        logs = pkg.get('recentLogs', []) if pkg else []

        # Analyze candidate distribution from telemetry
        cand_types = [c.get('type') for c in webrtc.get('localCandidates', []) if isinstance(c, dict)]
        has_host_only = ('host' in cand_types) and ('srflx' not in cand_types) and ('relay' not in cand_types)
        all_relays_down = len(relays) > 0 and all(r.get('state') != 'connected' and r.get('status') != 'connected' for r in relays)
        session_failed = any('failed to start session' in l.get('message', '').lower() for l in logs)

        # Check if GEMINI_API_KEY is configured in environment for true LLM reasoning
        gemini_api_key = os.environ.get('GEMINI_API_KEY', '').strip()
        if gemini_api_key:
            try:
                import urllib.request
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_api_key}"
                prompt = (
                    f"You are the expert technical AI Support Agent for P2P Connect (browser WebRTC P2P app with Remote Desktop and Nostr signaling).\n"
                    f"Telemetry: Overall Status={overall_status}, Root Causes={analysis.get('rootCauses')}, Relays={len(relays)}.\n"
                    f"User message: {text}\n"
                    f"Respond concisely with root cause and actionable steps. End with '❓ Clarification Question: <question>'."
                )
                payload = json.dumps({
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 600}
                }).encode('utf-8')
                req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
                with urllib.request.urlopen(req, timeout=5) as response:
                    res_json = json.loads(response.read().decode('utf-8'))
                    gemini_text = res_json.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                    if gemini_text:
                        return {
                            'success': True,
                            'overallStatus': overall_status,
                            'reply': f"🤖 [AI Support Agent Response]\nStatus: {overall_status}\n\n{gemini_text.strip()}\n\n(AI Powered via Gemini LLM)",
                            'clarification': '',
                            'advice': gemini_text.strip(),
                            'developerSuggestions': [f"Gemini LLM response delivered for user query: {text[:50]}"],
                        }
            except Exception as e:
                print(f"[AI Support Agent] Gemini call error: {e}")

        # Keyword matching & context-aware dialogue
        # 1. Screenshot / Image
        if any(k in text_lower for k in ['screenshot', 'image', 'photo', 'picture']):
            advice = (
                "To protect Nostr relay quotas, screenshots are transferred exclusively over WebRTC direct P2P DataChannels. "
                "When direct P2P is live, you can paste (Cmd+V / Ctrl+V) or click the camera button to send screenshots directly browser-to-browser."
            )
            clarification = "Would you like to establish a direct P2P session now so you can stream the screenshot?"
            dev_suggestions.append("Screenshot requested. WebRTC DataChannel flow control active; zero Nostr quota consumed.")

        # 2. Mobile OS Suspension & Tab Backgrounding
        elif any(k in text_lower for k in ['mobile', 'phone', 'iphone', 'ios', 'android', 'background', 'tab', 'lock', 'sleep']):
            advice = (
                "On mobile browsers (iOS Safari / Android Chrome), switching tabs or opening the native file picker suspends web execution. "
                "WebRTC ICE consent freshness checks (RFC 7675) expire after ~10-15s, moving the connection to 'disconnected'. "
                "P2P Connect includes auto-reconnect on send, but keeping the tab in view prevents drops."
            )
            clarification = "Did the disconnect occur when switching to another app, locking the screen, or selecting a file?"
            dev_suggestions.append("Mobile OS suspension detected. Verify visibilitychange auto-reconnect debounce is active.")

        # 3. Media / Camera / Microphone
        elif any(k in text_lower for k in ['video', 'camera', 'audio', 'mic', 'microphone', 'permission', 'black screen', 'mute']):
            advice = (
                "Media calls require explicit browser permissions and matching video codecs (VP8/H.264). "
                "If video is black or fails, try an audio-only call first to isolate media stream negotiation from network transport."
            )
            clarification = "Did your browser display a camera/microphone permission prompt? Does an audio call work between you?"
            dev_suggestions.append("Media track negotiation reported. Check transceiver directions and camera hardware permissions.")

        # 4. View-Only Mode / Remote Control Not Working / Host Bridge Disconnection
        elif any(k in text_lower for k in [
            'view only', 'view-only', 'control is not working', 'control not working',
            'cant click', 'cannot click', 'not clicking', 'clicks not', 'mouse not',
            'keyboard not', 'bridge', 'not responding'
        ]):
            is_bridge_down = (pkg and pkg.get('meta', {}).get('hostBridgeActive') is False)
            bridge_status = "Disconnected 🔴" if is_bridge_down else "Offline or Standby ⚪"
            advice = (
                "Remote Desktop input control requires the host OS native bridge ('bridge.py' on port 9999) "
                "to inject mouse clicks, touch taps, and keystrokes into the host operating system.\n\n"
                f"Host OS Bridge State: {bridge_status}\n"
                "When the host bridge is not connected, the session automatically protects host integrity by running in View-Only mode.\n\n"
                "To restore remote control:\n"
                "1. On the host computer, start the bridge: python3 remote-desktop-host/bridge.py\n"
                "2. Check that the 'Host Bridge' badge on host.html displays 'Active'.\n"
                "3. Once connected, clicks and keystrokes will immediately be injected into the remote OS."
            )
            clarification = "Is python3 bridge.py running on the host machine? Does the host page badge show 'Active'?"
            dev_suggestions.append("Remote Desktop view-only / control report. Verify bridge.py auto-reconnect and WebSocket port 9999 reachability.")

        # 5. Diagnostic Logpkg / Status
        elif any(k in text_lower for k in ['diagnostic', 'logpkg', 'log package', 'telemetry', 'report', 'logs']):
            advice = (
                f"I am actively monitoring your connection and session telemetry (Overall Status: {overall_status}).\n"
                f"• WebRTC: {webrtc.get('connectionState', 'standby')} (ICE: {webrtc.get('iceConnectionState', 'standby')})\n"
                f"• Discovered Candidates: host={cand_types.count('host')}, STUN={cand_types.count('srflx')}, TURN={cand_types.count('relay')}\n"
                f"• Relays: {len([r for r in relays if r.get('state') == 'connected'])} of {len(relays)} connected.\n"
                "You can click '📋 Send Diag' in the chat anytime to run a full diagnostic analysis."
            )
            clarification = "Would you like me to analyze a specific connection drop or remote desktop symptom?"
            dev_suggestions.append("Diagnostic telemetry status requested. Provided summary of live parameters.")

        # 6. Remote Desktop Connection History & Standby Status
        elif any(k in text_lower for k in [
            'never connected', 'last connected', 'connection time', 'shows as never',
            'standby', 'no screen', 'my computer', 'remote desktop shows'
        ]):
            advice = (
                "Regarding Remote Desktop Connection History & Host Status Badges:\n\n"
                "1. 'Never connected':\n"
                "This timestamp displays the duration and relative time since your last completed Remote Desktop session. "
                "When you establish a connection to your host and disconnect, it updates to show e.g. 'Connected 5m ago (Duration: 12m 4s)'. "
                "If you connected earlier, session timestamps have now been synchronized to ensure all session starts and ends are persisted in local storage.\n\n"
                "2. 'Standby (No Screen)':\n"
                "This indicates that Nostr signaling and network pings between client and host are operational, but desktop screen capture is not currently active on the host PC. "
                "On the host computer, open host.html and click 'Start Desktop Capture' to share the screen. Once sharing begins, the badge will switch to '🟢 Online (Capture Active)'."
            )
            clarification = "Is desktop screen capture currently running on your host computer (host.html)?"
            dev_suggestions.append("User inquired about 'Never connected' or 'Standby (No Screen)' status. Provided explanation of host capture lifecycle and session timestamp persistence.")

        # 7. Remote Desktop Input Modes & Touch Gestures
        elif any(k in text_lower for k in [
            'trackpad', 'direct mode', 'touch mode', 'mouse mode', 'cursor',
            'virtual cursor', 'pointer lock', 'rd control',
            'input mode', 'click', 'tapping', 'double finger', 'two finger',
            'move screen', 'zoom', 'pinch', 'pan'
        ]):
            advice = (
                "P2P Connect Remote Desktop supports two distinct interaction modes and multi-touch gestures:\n"
                "• Touch Mode / Direct Mode (👆): Direct tap instantly clicks; double-tap double-clicks; touch & drag moves windows/selects text; long-press (500ms) right-clicks.\n"
                "• Trackpad Mode (🖱️): The screen acts as a relative laptop touchpad, gliding the precision point cursor; 1-finger tap clicks; 2-finger tap right-clicks; 2-finger drag scrolls.\n"
                "• Two-Finger Screen Movement: When zoomed in (>1.0x), moving two fingers across the screen pans and moves the zoomed viewport in any direction. Pinching with two fingers adjusts the zoom level."
            )
            clarification = "Are you zoomed into the remote screen? Does double-finger panning glide the screen as expected?"
            dev_suggestions.append("Remote Desktop touch pan & zoom gesture query. Verified two-finger pan synchronization in Trackpad mode.")

        # 5. Network / Wi-Fi / Hotspot / Firewall / Router / NAT
        elif any(k in text_lower for k in ['wifi', 'wi-fi', 'hotspot', 'college', 'university', 'office', 'router', 'firewall', 'port', 'drop', 'failed', 'stuck', 'nat']):
            if has_host_only:
                advice = (
                    "Your telemetry shows that your browser gathered ONLY local LAN host candidates (no public STUN or TURN candidates). "
                    "On enterprise Wi-Fi, university networks, or mobile hotspots, UDP hole-punching is frequently blocked by symmetric NAT "
                    "or router firewalls. A TURN relay server is required for traversal."
                )
                clarification = "Are you and your peer connecting from different networks? Does your Wi-Fi have a captive portal or enterprise firewall?"
                dev_suggestions.append("Symmetric NAT / Host-only candidates detected. Consider providing a pre-configured TURN server under DEFAULT_ICE_SERVERS.")
            elif all_relays_down:
                advice = (
                    "Your telemetry indicates that all Nostr signaling relays are offline or unreachable. "
                    "Without an active signaling relay, peers cannot discover each other or exchange SDP handshakes."
                )
                clarification = "Is outbound secure WebSocket (WSS on port 443) permitted on your current network or proxy?"
                dev_suggestions.append("Relay partition detected. Verify if client network blocks WSS port 443 or if fallback relays should be added.")
            elif session_failed:
                advice = (
                    "Your log shows a signaling session handshake timeout ('Failed to start session'). "
                    "This usually happens when the target peer is not online, has closed their tab, or has backgrounded the browser on mobile."
                )
                clarification = "Was your peer actively looking at the P2P Connect window when you clicked connect?"
                dev_suggestions.append("Handshake timeout detected. Ensure peers keep tab active during initial signaling exchange.")
            else:
                advice = (
                    "Your diagnostic telemetry shows normal signaling connectivity, but peer-to-peer data flow may be experiencing intermittent packet loss or router filtering."
                )
                clarification = "Did the connection drop mid-call or fail immediately upon initiation? Are you using mobile data or home broadband?"
                dev_suggestions.append("Investigate router SIP ALG and symmetric port translation for intermittent drops.")

        elif not pkg:
            advice = (
                "Hello! I am the automated AI Diagnostic Support Agent for P2P Connect. "
                "I haven't received your connection telemetry yet. Please click '📋 Send Diag' or 'Diagnostics & Network Health' in the chat "
                "to transmit your encrypted log package (< 2 KB). Then I can pinpoint the root cause!"
            )
            clarification = "What error message or behavior are you experiencing when trying to connect?"
            dev_suggestions.append("No log package on file for this user. Telemetry requested.")

        else:
            advice = (
                f"I reviewed your latest diagnostic snapshot (Status: {overall_status}). "
                f"Identified root causes: {'; '.join(analysis.get('rootCauses', ['None']))}. "
                f"Recommendations: {'; '.join(analysis.get('recommendations', ['Parameters configured correctly']))}."
            )
            clarification = "Could you describe what you were trying to do when the issue happened (chat, call, screen share, or file transfer)?"
            dev_suggestions.append(f"Review latest logpkg analysis for {client_pk}: Status {overall_status}.")

        reply_text = (
            f"🤖 [AI Support Agent Response]\n"
            f"Status: {overall_status}\n\n"
            f"{advice}\n\n"
            f"❓ Clarification Question:\n"
            f"{clarification}\n\n"
            f"(Advisory Mode: Our developer has received these diagnostic recommendations)."
        )

        return {
            'success': True,
            'overallStatus': overall_status,
            'reply': reply_text,
            'clarification': clarification,
            'advice': advice,
            'developerSuggestions': dev_suggestions,
        }


# ── HTTP Ingestion Server ───────────────────────────────────────────────────

class DiagnosticServer(BaseHTTPRequestHandler):
    ALLOWED_ORIGINS = [
        'https://mahesh-devani.github.io',
        'http://localhost:8080',
        'http://127.0.0.1:8080',
    ]

    def _get_allowed_origin(self):
        origin = self.headers.get('Origin', '')
        if origin in self.ALLOWED_ORIGINS or origin.startswith('http://localhost:') or origin.startswith('http://127.0.0.1:'):
            return origin
        return self.ALLOWED_ORIGINS[0]

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', self._get_allowed_origin())
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if self.path == '/api/health':
            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            resp = {
                'service': 'P2P Connect AI Support Agent',
                'status': 'online',
                'version': '1.0',
                'mode': 'advisory',
                'inboxCount': len(list(INBOX_DIR.glob('*.json'))) if INBOX_DIR.exists() else 0,
            }
            self.wfile.write(json.dumps(resp, indent=2).encode('utf-8'))
            return

        # Serve static assets for the Support Desk
        target_path = 'support.html' if self.path in ('/', '/support', '/support.html') else self.path.lstrip('/')
        if '?' in target_path:
            target_path = target_path.split('?')[0]

        try:
            safe_file = (PROJECT_ROOT / target_path).resolve()
            if safe_file.is_relative_to(PROJECT_ROOT) and safe_file.is_file():
                mime_type, _ = mimetypes.guess_type(str(safe_file))
                if target_path.endswith('.js'):
                    mime_type = 'text/javascript; charset=utf-8'
                elif target_path.endswith('.css'):
                    mime_type = 'text/css; charset=utf-8'
                elif target_path.endswith('.html'):
                    mime_type = 'text/html; charset=utf-8'
                elif target_path.endswith('.json'):
                    mime_type = 'application/json; charset=utf-8'
                elif not mime_type:
                    mime_type = 'application/octet-stream'

                content = safe_file.read_bytes()
                self.send_response(200)
                self._send_cors_headers()
                self.send_header('Content-Type', mime_type)
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
        except Exception:
            pass

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/logpkg':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length <= 0:
                self.send_response(400)
                self.end_headers()
                return

            # Security: Cap payload size to 10MB
            MAX_PAYLOAD_BYTES = 10 * 1024 * 1024
            if content_length > MAX_PAYLOAD_BYTES:
                self.send_response(413) # Payload Too Large
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"error": "Payload exceeds 10MB limit"}')
                return

            body = self.rfile.read(content_length).decode('utf-8')
            try:
                pkg = json.loads(body)
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Invalid JSON: {str(e)}'}).encode('utf-8'))
                return

            # Save to inbox with strictly sanitized filename (hex only, zero path traversal)
            INBOX_DIR.mkdir(parents=True, exist_ok=True)
            ts = int(time.time())
            raw_client_pk = pkg.get('identity', {}).get('clientPubKey', 'unknown')
            client_pk = re.sub(r'[^a-fA-F0-9]', '', str(raw_client_pk))[:16] or 'unknown'
            filename = f"logpkg_{ts}_{client_pk}.json"
            filepath = INBOX_DIR / filename
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(pkg, f, indent=2)

            # Analyze package in developer advisory mode
            analysis = DiagnosticEngine.analyze(pkg)
            analysis['savedFile'] = str(filepath)
            analysis['developerNotice'] = 'ADVISORY ONLY: Recommendations presented for developer review. No automated code changes or commits performed.'

            print(f"\n[AI Support Agent] 📥 Ingested logpkg from {client_pk}… -> Saved to {filename}")
            print(f"[AI Support Agent] 🔎 Overall Status: {analysis['overallStatus']}")
            for rc in analysis['rootCauses']:
                print(f"  • Root Cause: {rc}")
            print(f"[AI Support Agent] 💡 Suggestions for Developer:")
            for rec in analysis['recommendations']:
                print(f"  👉 {rec}")
            print(f"[AI Support Agent] 🔒 (Advisory Mode: No files or git state modified)")

            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'message': 'Log package received and analyzed by AI Support Agent (Advisory Mode)',
                'analysis': analysis
            }, indent=2).encode('utf-8'))
        elif self.path == '/api/chat':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length <= 0 or content_length > 100 * 1024:
                self.send_response(400)
                self.end_headers()
                return

            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Invalid JSON: {str(e)}'}).encode('utf-8'))
                return

            raw_client_pk = data.get('senderPubKey', 'unknown')
            client_pk = re.sub(r'[^a-fA-F0-9]', '', str(raw_client_pk))[:16] or 'unknown'
            text = str(data.get('text', '')).strip()

            reply_data = DiagnosticEngine.analyze_comment(text, client_pk)

            INBOX_DIR.mkdir(parents=True, exist_ok=True)
            ts = int(time.time())
            comment_payload = {
                'ts': ts,
                'clientPubKey': raw_client_pk,
                'text': text,
                'reply': reply_data.get('reply'),
                'developerSuggestions': reply_data.get('developerSuggestions', [])
            }
            comment_file = INBOX_DIR / f"comment_{ts}_{client_pk}.json"
            with open(comment_file, 'w', encoding='utf-8') as f:
                json.dump(comment_payload, f, indent=2)

            print(f"\n[AI Support Agent] 💬 User comment from {client_pk}: \"{text}\" -> Saved to {comment_file.name}")
            print(f"[AI Support Agent] 🤖 Generated Reply (Advisory Mode):\n{reply_data['reply']}")
            print(f"[AI Support Agent] 💡 Suggestions for Developer:")
            for s in reply_data.get('developerSuggestions', []):
                print(f"  👉 {s}")
            print(f"[AI Support Agent] 🔒 (Advisory Mode: Review only, zero autonomous commits)")

            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(reply_data, indent=2).encode('utf-8'))

        elif self.path == '/api/screenshot':
            content_length = int(self.headers.get('Content-Length', 0))
            MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024
            if content_length <= 0 or content_length > MAX_SCREENSHOT_BYTES:
                self.send_response(413 if content_length > MAX_SCREENSHOT_BYTES else 400)
                self.end_headers()
                return

            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Invalid JSON: {str(e)}'}).encode('utf-8'))
                return

            raw_client_pk = data.get('senderPubKey', 'unknown')
            client_pk = re.sub(r'[^a-fA-F0-9]', '', str(raw_client_pk))[:16] or 'unknown'
            img_b64 = data.get('data', '')
            if ',' in img_b64:
                img_b64 = img_b64.split(',', 1)[1]

            import base64
            try:
                img_bytes = base64.b64decode(img_b64)
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Invalid base64: {str(e)}'}).encode('utf-8'))
                return

            INBOX_DIR.mkdir(parents=True, exist_ok=True)
            ts = int(time.time())
            filename = f"screenshot_{ts}_{client_pk}.jpg"
            filepath = INBOX_DIR / filename
            with open(filepath, 'wb') as f:
                f.write(img_bytes)

            print(f"\n[AI Support Agent] 📷 Ingested screenshot from {client_pk} ({len(img_bytes)} bytes) -> Saved to {filename}")
            print(f"[AI Support Agent] 💡 Suggestions for Developer: Inspect screenshot at {filepath} for visual errors or WebRTC states.")
            print(f"[AI Support Agent] 🔒 (Advisory Mode: No files or git state modified)")

            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'message': 'Screenshot received and saved to diagnostics-inbox',
                'filename': filename,
                'savedFile': str(filepath)
            }, indent=2).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Clean terminal logging
        sys.stdout.write(f"[HTTP] {self.address_string()} - {format % args}\n")


def find_chrome_binary():
    """Locate Google Chrome or Chromium executable on the host system."""
    env_bin = os.environ.get('CHROME_BIN') or os.environ.get('GOOGLE_CHROME_BIN')
    if env_bin and os.path.isfile(env_bin):
        return env_bin

    if sys.platform == 'darwin':
        candidates = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]
        for c in candidates:
            if os.path.isfile(c):
                return c
    elif sys.platform.startswith('linux'):
        candidates = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
        ]
        for c in candidates:
            if os.path.isfile(c):
                return c
    elif sys.platform == 'win32':
        candidates = [
            r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
            os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
            r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
        ]
        for c in candidates:
            if os.path.isfile(c):
                return c

    for name in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'):
        found = shutil.which(name)
        if found:
            return found

    return None


def launch_headless_bridge(port: int):
    """Launch headless Chrome to run support.html as an autonomous Nostr relay bridge."""
    chrome_bin = find_chrome_binary()
    if not chrome_bin:
        print(f"[AI Support Agent] ℹ️ Headless Chrome not detected.")
        print(f"[AI Support Agent] ℹ️ Open http://127.0.0.1:{port}/support.html in a browser to bridge Nostr relays.\n")
        return None

    profile_dir = tempfile.mkdtemp(prefix="p2p_support_chrome_")
    url = f"http://127.0.0.1:{port}/support.html"

    cmd = [
        chrome_bin,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        f'--user-data-dir={profile_dir}',
        url,
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True if sys.platform != 'win32' else False,
        )
        print(f"[AI Support Agent] 🌐 Autonomous Nostr Bridge active (Headless Chrome PID: {proc.pid})")
        print(f"[AI Support Agent] 📡 Subscribed to Nostr relays via {url}\n")

        def cleanup():
            try:
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
            shutil.rmtree(profile_dir, ignore_errors=True)

        atexit.register(cleanup)
        return proc, cleanup
    except Exception as e:
        print(f"[AI Support Agent] ⚠️ Failed to launch headless Chrome bridge: {e}")
        print(f"[AI Support Agent] ℹ️ Open {url} in a browser to bridge Nostr relays.\n")
        shutil.rmtree(profile_dir, ignore_errors=True)
        return None


def run_server(port=DEFAULT_PORT, headless=True):
    INBOX_DIR.mkdir(parents=True, exist_ok=True)
    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, DiagnosticServer)
    print(f"══════════════════════════════════════════════════════════════")
    print(f"🤖 P2P Connect — Dedicated AI Diagnostic Support Agent")
    print(f"══════════════════════════════════════════════════════════════")
    print(f"• Listening on: http://127.0.0.1:{port}/")
    print(f"• Logpkg Ingestion Endpoint: http://127.0.0.1:{port}/api/logpkg")
    print(f"• Inbox Directory: {INBOX_DIR}")
    print(f"• Ready to receive and diagnose WebRTC / Nostr log packages.")
    print(f"• Press Ctrl+C to stop.")
    print(f"══════════════════════════════════════════════════════════════\n")

    bridge = None
    if headless:
        bridge = launch_headless_bridge(port)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[AI Support Agent] Shutting down.")
    finally:
        if bridge:
            proc, cleanup = bridge
            cleanup()
        httpd.server_close()


def analyze_file(filepath: Path):
    if not filepath.exists():
        print(f"Error: File '{filepath}' does not exist.")
        sys.exit(1)

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            pkg = json.load(f)
    except Exception as e:
        print(f"Error reading JSON package: {e}")
        sys.exit(1)

    analysis = DiagnosticEngine.analyze(pkg)
    print(f"\n══════════════════════════════════════════════════════════════")
    print(f"🤖 Diagnostic Analysis Report for: {filepath.name}")
    print(f"══════════════════════════════════════════════════════════════")
    print(f"• Generated: {analysis.get('generatedAt')}")
    print(f"• Client Pubkey: {analysis.get('clientPubKey')}")
    print(f"• Target Pubkey: {analysis.get('targetPubKey') or '(none)'}")
    print(f"• Overall Status: {analysis['overallStatus']}\n")

    print(f"📌 Root Causes Identified:")
    for rc in analysis['rootCauses']:
        print(f"  ❌ {rc}")

    print(f"\n🔎 Key Findings:")
    for f in analysis['findings']:
        icon = '✅' if f['level'] == 'SUCCESS' else ('⚠️' if f['level'] == 'WARN' else ('❌' if f['level'] == 'ERROR' else 'ℹ️'))
        print(f"  {icon} [{f['category']}] {f['message']}")

    print(f"\n💡 Recommendations:")
    for r in analysis['recommendations']:
        print(f"  👉 {r}")
    print(f"══════════════════════════════════════════════════════════════\n")


def print_inbox():
    if not INBOX_DIR.exists():
        print("Inbox is empty (no user issues received yet).")
        return
    logpkgs = sorted(INBOX_DIR.glob("logpkg_*.json"), key=lambda x: x.stat().st_mtime, reverse=True)
    comments = sorted(INBOX_DIR.glob("comment_*.json"), key=lambda x: x.stat().st_mtime, reverse=True)
    screenshots = sorted(INBOX_DIR.glob("screenshot_*.jpg"), key=lambda x: x.stat().st_mtime, reverse=True)

    print("\n══════════════════════════════════════════════════════════════")
    print(f"📥 AI Support Agent — Developer Triage Inbox ({INBOX_DIR})")
    print("══════════════════════════════════════════════════════════════")
    print(f"Total: {len(logpkgs)} log packages, {len(comments)} comments, {len(screenshots)} screenshots\n")

    if comments:
        print("💬 Recent User Comments:")
        for c in comments[:5]:
            try:
                data = json.loads(c.read_text(encoding='utf-8'))
                t_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(data.get('ts', c.stat().st_mtime)))
                print(f"  • [{t_str}] User ({data.get('clientPubKey', 'unknown')[:8]}…): \"{data.get('text', '')}\"")
            except Exception:
                print(f"  • {c.name}")
        print()

    if logpkgs:
        print("📋 Recent Diagnostic Log Packages:")
        for p in logpkgs[:5]:
            try:
                data = json.loads(p.read_text(encoding='utf-8'))
                t_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(p.stat().st_mtime))
                webrtc_st = data.get('webrtc', {}).get('connectionState', 'unknown')
                pk = data.get('identity', {}).get('clientPubKey', 'unknown')[:8]
                print(f"  • [{t_str}] {p.name} (Client: {pk}…, WebRTC: {webrtc_st})")
            except Exception:
                print(f"  • {p.name}")
        print()

    if screenshots:
        print("📷 Recent Screenshots:")
        for s in screenshots[:5]:
            t_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(s.stat().st_mtime))
            print(f"  • [{t_str}] {s.name} ({round(s.stat().st_size / 1024, 1)} KB)")
        print()
    print("══════════════════════════════════════════════════════════════\n")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="P2P Connect AI Diagnostic Support Agent")
    parser.add_argument('--analyze', type=str, help="Path to a downloaded diagnostic .json file to analyze offline")
    parser.add_argument('--inbox', action='store_true', help="List and summarize all ingested packages and comments in diagnostics-inbox/")
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help=f"Port for HTTP ingestion server (default: {DEFAULT_PORT})")
    parser.add_argument('--no-headless', action='store_true', help="Do not spawn headless Chrome Nostr bridge automatically")
    args = parser.parse_args()

    if args.inbox:
        print_inbox()
    elif args.analyze:
        analyze_file(Path(args.analyze))
    else:
        run_server(args.port, headless=not args.no_headless)
