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
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent
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

        # Overall Status
        if any(f['level'] == 'ERROR' for f in findings):
            overall_status = 'CRITICAL'
        elif any(f['level'] == 'WARN' for f in findings):
            overall_status = 'WARNING'
        else:
            overall_status = 'HEALTHY'

        return {
            'timestamp': time.time(),
            'generatedAt': pkg.get('generatedAt'),
            'appVersion': pkg.get('version', 'v7'),
            'overallStatus': overall_status,
            'rootCauses': root_causes if root_causes else ['None identified — communication paths look normal.'],
            'findings': findings,
            'recommendations': recommendations if recommendations else ['Communication parameters appear configured correctly.'],
            'clientPubKey': identity.get('clientPubKey'),
            'targetPubKey': identity.get('targetPubKey'),
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

    def do_GET(self):
        if self.path in ('/', '/api/health'):
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
        else:
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
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Clean terminal logging
        sys.stdout.write(f"[HTTP] {self.address_string()} - {format % args}\n")


def run_server(port=DEFAULT_PORT):
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
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[AI Support Agent] Shutting down.")
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


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="P2P Connect AI Diagnostic Support Agent")
    parser.add_argument('--analyze', type=str, help="Path to a downloaded diagnostic .json file to analyze offline")
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help=f"Port for HTTP ingestion server (default: {DEFAULT_PORT})")
    args = parser.parse_args()

    if args.analyze:
        analyze_file(Path(args.analyze))
    else:
        run_server(args.port)
