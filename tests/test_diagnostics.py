"""
tests/test_diagnostics.py
=========================
Regression tests for Diagnostic Logging, Logpkg generation, privacy redaction,
and AI Diagnostic Support Agent rules engine.
"""

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / 'support-agent'))

import importlib.util

# Dynamically load ai-diagnostic-agent
agent_module_path = PROJECT_ROOT / 'support-agent' / 'ai-diagnostic-agent.py'
spec = importlib.util.spec_from_file_location('ai_diagnostic_agent', str(agent_module_path))
ai_agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ai_agent)
DiagnosticEngine = ai_agent.DiagnosticEngine


class TestDiagnosticSystem(unittest.TestCase):

    def test_diagnostic_files_exist(self):
        """Diagnostic logger and support agent files must exist."""
        self.assertTrue((PROJECT_ROOT / 'diagnostic-logger.js').exists(), "diagnostic-logger.js missing")
        self.assertTrue((PROJECT_ROOT / 'support-agent' / 'ai-diagnostic-agent.py').exists(), "ai-diagnostic-agent.py missing")

    def test_html_contains_diagnostic_ui_elements(self):
        """index.html and host.html must contain diagnostic triggers and modal."""
        index_html = (PROJECT_ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertIn('id="diagnostics-modal"', index_html, "index.html missing #diagnostics-modal")
        self.assertIn('id="btn-download-logpkg"', index_html, "index.html missing #btn-download-logpkg")
        self.assertIn('id="btn-copy-diag-summary"', index_html, "index.html missing #btn-copy-diag-summary")
        self.assertIn('id="btn-send-ai-agent"', index_html, "index.html missing #btn-send-ai-agent")
        self.assertIn('id="btn-test-network-stun"', index_html, "index.html missing #btn-test-network-stun")
        self.assertIn('id="btn-header-diagnostics"', index_html, "index.html missing #btn-header-diagnostics")

        host_html = (PROJECT_ROOT / 'host.html').read_text(encoding='utf-8')
        self.assertIn('id="btn-host-download-logpkg"', host_html, "host.html missing #btn-host-download-logpkg")

    def test_diagnostic_logger_privacy_redaction(self):
        """diagnostic-logger.js must define redaction for private keys and pins."""
        content = (PROJECT_ROOT / 'diagnostic-logger.js').read_text(encoding='utf-8')
        self.assertIn('p2p-host-privkey', content, "Redaction list missing p2p-host-privkey")
        self.assertIn('nostr-privkey', content, "Redaction list missing nostr-privkey")
        self.assertIn('[REDACTED', content, "Redaction replacement string missing")

    def test_ai_agent_symmetric_nat_rule(self):
        """DiagnosticEngine must flag symmetric NAT when only host candidates are gathered."""
        mock_pkg = {
            'generatedAt': '2026-10-18T12:00:00Z',
            'version': 'v7',
            'webrtc': {
                'connectionState': 'failed',
                'iceConnectionState': 'failed',
                'localCandidates': [
                    {'type': 'host', 'protocol': 'udp', 'candidate': 'candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host'}
                ],
            },
            'relays': [
                {'url': 'wss://relay.primal.net', 'state': 'connected'},
                {'url': 'wss://nos.lol', 'state': 'connected'},
            ],
            'recentLogs': [],
            'identity': {'clientPubKey': 'aabbcc112233'}
        }

        analysis = DiagnosticEngine.analyze(mock_pkg)
        self.assertIn(analysis['overallStatus'], ('CRITICAL', 'WARNING'))
        # Should flag LAN-only host candidates
        root_causes_str = ' '.join(analysis['rootCauses']).lower()
        self.assertTrue('host' in root_causes_str or 'failed' in root_causes_str)
        rec_str = ' '.join(analysis['recommendations']).lower()
        self.assertTrue('turn' in rec_str or 'stun' in rec_str)

    def test_ai_agent_relay_failure_rule(self):
        """DiagnosticEngine must flag CRITICAL status when all signaling relays are offline."""
        mock_pkg = {
            'generatedAt': '2026-10-18T12:00:00Z',
            'version': 'v7',
            'webrtc': {'connectionState': 'new'},
            'relays': [
                {'url': 'wss://relay.primal.net', 'state': 'disconnected'},
                {'url': 'wss://nos.lol', 'state': 'disconnected'},
            ],
            'recentLogs': [],
            'identity': {'clientPubKey': 'aabbcc112233'}
        }

        analysis = DiagnosticEngine.analyze(mock_pkg)
        self.assertEqual(analysis['overallStatus'], 'CRITICAL')
        root_causes_str = ' '.join(analysis['rootCauses']).lower()
        self.assertIn('relay', root_causes_str)

    def test_ai_agent_session_fail_rule(self):
        """DiagnosticEngine must detect signaling session initiation failures in logs."""
        mock_pkg = {
            'generatedAt': '2026-10-18T12:00:00Z',
            'version': 'v7',
            'webrtc': {'connectionState': 'new'},
            'relays': [
                {'url': 'wss://relay.primal.net', 'state': 'connected'},
            ],
            'recentLogs': [
                {'level': 'error', 'message': '[ensurePeerConnected] Failed to start session: All relays rejected the signaling event'}
            ],
            'identity': {'clientPubKey': 'aabbcc112233', 'targetPubKey': 'ddeeff445566'}
        }

        analysis = DiagnosticEngine.analyze(mock_pkg)
        self.assertEqual(analysis['overallStatus'], 'CRITICAL')
        root_causes_str = ' '.join(analysis['rootCauses']).lower()
        self.assertIn('failed to start session', root_causes_str)

    def test_diagnostic_logger_error_serialization(self):
        """diagnostic-logger.js must define formatArg to extract Error name, message, and stack."""
        content = (PROJECT_ROOT / 'diagnostic-logger.js').read_text(encoding='utf-8')
        self.assertIn('function formatArg', content, "formatArg helper missing in diagnostic-logger.js")
        self.assertIn('instanceof Error', content, "Error instance check missing in diagnostic-logger.js")
        self.assertIn('a.stack', content, "Error stack preservation missing in diagnostic-logger.js")

    def test_support_identity_private_key_gitignored(self):
        """.gitignore must strictly exclude support-identity.json so private key is never pushed."""
        gitignore = (PROJECT_ROOT / '.gitignore').read_text(encoding='utf-8')
        self.assertIn('support-agent/support-identity.json', gitignore, "support-identity.json not in .gitignore")
        self.assertIn('support-agent/diagnostics-inbox/', gitignore, "diagnostics-inbox/ not in .gitignore")

    def test_support_agent_security_hardening(self):
        """ai-diagnostic-agent.py must enforce CORS origin filtering and 10MB limit."""
        content = (PROJECT_ROOT / 'support-agent' / 'ai-diagnostic-agent.py').read_text(encoding='utf-8')
        self.assertIn('ALLOWED_ORIGINS', content, "ALLOWED_ORIGINS missing in ai-diagnostic-agent.py")
        self.assertIn('mahesh-devani.github.io', content, "github.io missing from ALLOWED_ORIGINS")
        self.assertIn('MAX_PAYLOAD_BYTES', content, "MAX_PAYLOAD_BYTES missing in ai-diagnostic-agent.py")
        self.assertIn('advisory', content.lower(), "Advisory mode notice missing in ai-diagnostic-agent.py")

    def test_ui_controller_has_support_agent_pubkey(self):
        """ui-controller.js must define SUPPORT_AGENT_PUBKEY and ensureSupportAgentContact."""
        content = (PROJECT_ROOT / 'ui-controller.js').read_text(encoding='utf-8')
        self.assertIn('SUPPORT_AGENT_PUBKEY', content, "SUPPORT_AGENT_PUBKEY missing in ui-controller.js")
        self.assertIn('ensureSupportAgentContact', content, "ensureSupportAgentContact helper missing in ui-controller.js")
        self.assertTrue((PROJECT_ROOT / 'support.html').exists(), "support.html missing")
        self.assertTrue((PROJECT_ROOT / 'support-controller.js').exists(), "support-controller.js missing")

    def test_ai_agent_multi_turn_comment_analysis(self):
        """DiagnosticEngine.analyze_comment must generate context-aware clarification questions and developer suggestions."""
        mock_pkg = {
            'generatedAt': '2026-10-18T12:00:00Z',
            'version': 'v7',
            'webrtc': {
                'connectionState': 'failed',
                'iceConnectionState': 'failed',
                'localCandidates': [
                    {'type': 'host', 'protocol': 'udp', 'candidate': 'candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host'}
                ],
            },
            'relays': [
                {'url': 'wss://relay.primal.net', 'state': 'connected'},
            ],
            'recentLogs': [],
            'identity': {'clientPubKey': 'aabbcc112233'}
        }

        # Case 1: User mentions college Wi-Fi
        res1 = DiagnosticEngine.analyze_comment("Calls keep failing on my college wifi", "aabbcc112233", mock_pkg)
        self.assertTrue(res1['success'])
        self.assertIn('Clarification Question', res1['reply'])
        self.assertTrue('turn' in res1['reply'].lower() or 'host' in res1['reply'].lower() or 'nat' in res1['reply'].lower())
        self.assertGreater(len(res1['developerSuggestions']), 0)

        # Case 2: User mentions mobile background
        res2 = DiagnosticEngine.analyze_comment("Connection drops when I switch tabs on my iPhone", "aabbcc112233", mock_pkg)
        self.assertTrue(res2['success'])
        self.assertIn('consent', res2['reply'].lower())

        # Case 3: User mentions screenshots
        res3 = DiagnosticEngine.analyze_comment("Can I send a screenshot of the error?", "aabbcc112233", mock_pkg)
        self.assertTrue(res3['success'])
        self.assertIn('quota', res3['reply'].lower())

        # Case 4: User mentions trackpad / direct mode
        res4 = DiagnosticEngine.analyze_comment("The trackpad & direct mode still work like trackpad mode", "aabbcc112233", mock_pkg)
        self.assertTrue(res4['success'])
        self.assertIn('direct mode', res4['reply'].lower())
        self.assertIn('trackpad mode', res4['reply'].lower())

        # Case 5: User mentions two finger gesture / move zoomed in screen
        res5 = DiagnosticEngine.analyze_comment("In trackpad mode, double finger touch to move zoomed in screen is not working", "aabbcc112233", mock_pkg)
        self.assertTrue(res5['success'])
        self.assertIn('two-finger', res5['reply'].lower())
        self.assertIn('zoom', res5['reply'].lower())

    def test_chat_and_screenshot_endpoints_registered(self):
        """ai-diagnostic-agent.py must define /api/chat and /api/screenshot in do_POST."""
        content = (PROJECT_ROOT / 'support-agent' / 'ai-diagnostic-agent.py').read_text(encoding='utf-8')
        self.assertIn("self.path == '/api/chat'", content, "/api/chat endpoint missing in ai-diagnostic-agent.py")
        self.assertIn("self.path == '/api/screenshot'", content, "/api/screenshot endpoint missing in ai-diagnostic-agent.py")

    def test_screenshot_and_chat_ui_elements(self):
        """index.html must include screenshot attachment and send-diag buttons."""
        index_html = (PROJECT_ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertIn('id="btn-attach-screenshot"', index_html, "btn-attach-screenshot missing in index.html")
        self.assertIn('id="screenshot-input"', index_html, "screenshot-input missing in index.html")
        self.assertIn('id="btn-chat-send-diag"', index_html, "btn-chat-send-diag missing in index.html")

    def test_ui_controller_screenshot_quota_protection(self):
        """ui-controller.js must enforce P2P-only file channel for screenshots to protect Nostr quotas."""
        ui_content = (PROJECT_ROOT / 'ui-controller.js').read_text(encoding='utf-8')
        self.assertIn('processScreenshotFile', ui_content, "processScreenshotFile missing in ui-controller.js")
        self.assertIn('handleChatPaste', ui_content, "handleChatPaste missing in ui-controller.js")
        self.assertIn('formatDiagnosticBubbleHtml', ui_content, "formatDiagnosticBubbleHtml missing in ui-controller.js")
        self.assertIn('chat-msg--diag-card', ui_content, "chat-msg--diag-card missing in ui-controller.js")
        self.assertIn('session.sendFile', ui_content, "session.sendFile missing for screenshot transfer")

    def test_ai_agent_host_bridge_rule(self):
        """DiagnosticEngine must flag Host Bridge disconnection when hostBridgeActive is false."""
        mock_pkg = {
            'generatedAt': '2026-10-18T12:00:00Z',
            'version': 'v7',
            'webrtc': {'connectionState': 'connected'},
            'relays': [{'url': 'wss://relay.primal.net', 'state': 'connected'}],
            'meta': {'hostBridgeActive': False, 'rdMode': 'control'},
            'recentLogs': [],
            'identity': {'clientPubKey': 'aabbcc112233'}
        }
        analysis = DiagnosticEngine.analyze(mock_pkg)
        root_causes_str = ' '.join(analysis['rootCauses']).lower()
        self.assertIn('host os bridge', root_causes_str)
        self.assertIn('view-only', root_causes_str)

    def test_ai_agent_view_only_comment_analysis(self):
        """DiagnosticEngine.analyze_comment must handle view-only and control-not-working queries."""
        mock_pkg = {
            'generatedAt': '2026-10-18T12:00:00Z',
            'version': 'v7',
            'webrtc': {'connectionState': 'connected'},
            'relays': [{'url': 'wss://relay.primal.net', 'state': 'connected'}],
            'meta': {'hostBridgeActive': False, 'rdMode': 'control'},
            'recentLogs': [],
            'identity': {'clientPubKey': 'aabbcc112233'}
        }
        res = DiagnosticEngine.analyze_comment("Control is not working on rd session, it has become view only", "aabbcc112233", mock_pkg)
        self.assertTrue(res['success'])
        self.assertIn('bridge', res['reply'].lower())
        self.assertIn('view-only', res['reply'].lower())

    def test_ui_controller_in_app_diagnostic_reporting(self):
        """ui-controller.js must define runClientDiagnosticRules, formatAiDiagnosticReport, and deliver AI diagnostic messages."""
        ui_content = (PROJECT_ROOT / 'ui-controller.js').read_text(encoding='utf-8')
        self.assertIn('function runClientDiagnosticRules', ui_content)
        self.assertIn('function formatAiDiagnosticReport', ui_content)
        self.assertIn('deliverAiSupportMessage', ui_content)
        self.assertIn('rdHostBridgeActive', ui_content)

    def test_ui_controller_no_undeclared_host_stream_reference(self):
        """ui-controller.js must not reference undeclared isHostStreamLive, preventing ReferenceError."""
        ui_content = (PROJECT_ROOT / 'ui-controller.js').read_text(encoding='utf-8')
        self.assertNotIn('isHostStreamLive', ui_content, "ui-controller.js must not contain isHostStreamLive (host-only function)")


if __name__ == '__main__':
    unittest.main()
