"""
tests/test_invariants.py
========================
Automated regression tests for architectural invariants in P2P Connect.
Prevents common AI agent mistakes: import query params, key clobbering,
missing a=msid, broken file transfer flow, and syntax errors.
"""

import re
import sys
import unittest
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path(__file__).resolve().parent.parent

JS_FILES = [
    'webrtc-core.js',
    'ui-controller.js',
    'nostr-signaling.js',
    'nostr-transport.js',
    'nostr-crypto.js',
    'nostr-relay.js',
    'token-codec.js',
    'chat-store.js',
    'host-controller.js',
    'diagnostic-logger.js',
    'support-controller.js',
]
HTML_FILES = ['index.html', 'host.html', 'support.html']


def read_project_file(filename):
    p = PROJECT_ROOT / filename
    return p.read_text(encoding='utf-8') if p.exists() else None


class TestArchitecturalInvariants(unittest.TestCase):

    def test_no_query_params_on_internal_imports(self):
        """CRITICAL: Internal module imports must never use query params (?v=X) as this splits singletons."""
        pattern = re.compile(r"""import\s+.*?from\s+['"]\.{1,2}/[^'"]*\?[^'"]*['"]""")
        violations = []
        for fname in JS_FILES:
            content = read_project_file(fname)
            if not content:
                continue
            for i, line in enumerate(content.splitlines(), 1):
                if pattern.search(line):
                    violations.append(f'{fname}:{i}  {line.strip()}')
        self.assertEqual(violations, [], f"Found query parameters on internal ES imports:\n" + "\n".join(violations))

    def test_no_duplicate_singleton_import_paths(self):
        """Singletons must be imported from consistent, clean paths across all files."""
        singletons = ['NostrTransport', 'NostrSignaling', 'NostrCrypto', 'ChatStore']
        import_map = defaultdict(set)
        import_pattern = re.compile(r"""import\s*\{[^}]*\b(\w+)\b[^}]*\}\s*from\s*['"]([^'"]+)['"]""")

        for fname in JS_FILES:
            content = read_project_file(fname)
            if not content:
                continue
            for match in import_pattern.finditer(content):
                name, path = match.group(1), match.group(2)
                if name in singletons:
                    import_map[name].add(path)

        for s, paths in import_map.items():
            self.assertLessEqual(len(paths), 1, f"Singleton {s} imported from multiple paths: {paths}")

    def test_storage_key_isolation(self):
        """Host must use p2p-host-* keys; Client must use nostr-*. They must never share identity."""
        host_content = read_project_file('host-controller.js')
        self.assertIsNotNone(host_content, "host-controller.js must exist")

        self.assertIn('p2p-host-privkey', host_content, "Host must define p2p-host-privkey storage key")
        self.assertIn('p2p-host-pubkey', host_content, "Host must define p2p-host-pubkey storage key")

        # Verify host identity does not read from nostr-privkey
        for i, line in enumerate(host_content.splitlines(), 1):
            if 'nostr-privkey' in line and 'hostIdentity' in line:
                self.fail(f"Host identity reads from client key at host-controller.js:{i}: {line.strip()}")

        client_content = read_project_file('ui-controller.js')
        self.assertIsNotNone(client_content, "ui-controller.js must exist")
        self.assertIsNone(
            re.search(r"localStorage\.(get|set)Item\(['\"]p2p-host-priv", client_content),
            "Client must not access host private key storage"
        )

    def test_webrtc_stream_association_a_msid(self):
        """addLocalStream must use pc.addTrack(track, stream) with stream parameter for a=msid."""
        content = read_project_file('webrtc-core.js')
        self.assertIsNotNone(content, "webrtc-core.js must exist")

        match = re.search(r'function addLocalStream\(stream\)\s*\{', content)
        self.assertIsNotNone(match, "addLocalStream function must exist in webrtc-core.js")

        start_line = content[:match.start()].count('\n') + 1
        func_text = '\n'.join(content.splitlines()[start_line - 1: start_line + 79])

        self.assertTrue(
            bool(re.search(r'pc\.addTrack\(\s*track\s*,\s*stream\s*\)', func_text)),
            "addLocalStream must call pc.addTrack(track, stream) to associate MediaStream for SDP a=msid"
        )

    def test_file_transfer_protocol_contracts(self):
        """File transfer protocol must have _fileStart, _fileEnd, _fileAbort, and backpressure drain check."""
        content = read_project_file('webrtc-core.js')
        self.assertIsNotNone(content, "webrtc-core.js must exist")

        for marker in ['_fileStart', '_fileEnd', '_fileAbort']:
            self.assertIn(marker, content, f"webrtc-core.js missing {marker} protocol marker")

        self.assertIn('bufferedAmount', content, "webrtc-core.js missing bufferedAmount backpressure check")

        chunk_match = re.search(r'(?:CHUNK_SIZE|chunkSize)\s*=\s*(\d+)', content)
        if chunk_match:
            chunk_size = int(chunk_match.group(1))
            self.assertLessEqual(chunk_size, 64 * 1024, "Chunk size exceeds 64KB SCTP limit")

    def test_cache_busters_only_on_root_html(self):
        """Cache busters (?v=XX) must only be on root script tags in HTML files, never in JS imports."""
        for html_file in HTML_FILES:
            content = read_project_file(html_file)
            if not content:
                continue
            script_matches = re.findall(r'<script[^>]*src="([^"]*\?v=\d+)"', content)
            for src in script_matches:
                basename = src.split('?')[0]
                self.assertIn(
                    basename,
                    ['ui-controller.js', 'host-controller.js', 'support-controller.js'],
                    f"{html_file} has unexpected cache buster on {src}"
                )

    def test_host_rejects_inactive_capture(self):
        """Host must reject unattended_offer when desktop capture is not active."""
        content = read_project_file('host-controller.js')
        self.assertIsNotNone(content, "host-controller.js must exist")
        self.assertIn('isHostStreamLive', content, "host-controller.js must define isHostStreamLive()")

        offer_idx = content.find("'unattended_offer'")
        self.assertGreaterEqual(offer_idx, 0, "unattended_offer handler must exist in host-controller.js")
        section = content[offer_idx:offer_idx + 2500]
        self.assertIn('isHostStreamLive', section, "Host must verify isHostStreamLive() before accepting unattended offer")

    def test_nostr_signal_type_whitelist(self):
        """NostrTransport must strictly whitelist accepted signal types."""
        content = read_project_file('nostr-transport.js')
        self.assertIsNotNone(content, "nostr-transport.js must exist")

        required = [
            'offer', 'answer', 'ice', 'close', 'message',
            'unattended_offer', 'unattended_answer', 'host_ping', 'host_pong',
            'diagnostic_logpkg'
        ]
        for t in required:
            self.assertTrue(
                f"'{t}'" in content or f'"{t}"' in content,
                f"Signal type '{t}' missing from nostr-transport.js whitelist"
            )
        self.assertIn('.includes(payload.type)', content, "nostr-transport.js missing whitelist validation")

    def test_javascript_syntax_integrity(self):
        """All JavaScript files must parse with zero syntax errors via Tree-sitter or tokenizer."""
        ts_parser = None
        try:
            pipx_site = list(Path.home().glob('Library/Application Support/pipx/venvs/graphifyy/lib/python*/site-packages'))
            if pipx_site and str(pipx_site[0]) not in sys.path:
                sys.path.insert(0, str(pipx_site[0]))
            import tree_sitter_javascript as tsjs
            from tree_sitter import Language, Parser
            js_lang = Language(tsjs.language())
            ts_parser = Parser(js_lang)
        except Exception:
            ts_parser = None

        errors = []
        for fname in JS_FILES:
            path = PROJECT_ROOT / fname
            if not path.exists():
                continue
            if ts_parser is not None:
                tree = ts_parser.parse(path.read_bytes())
                if tree.root_node.has_error:
                    errors.append(f"{fname}: Tree-sitter AST parse error")
            else:
                content = path.read_text(encoding='utf-8')
                clean = re.sub(r'/\*[\s\S]*?\*/', '', content)
                clean = re.sub(r'//.*', '', clean)
                clean = re.sub(r'"(\\.|[^"\\])*"', '""', clean)
                clean = re.sub(r"'(\\.|[^'\\])*'", "''", clean)
                clean = re.sub(r'`(\\.|[^`\\])*`', '``', clean)
                clean = re.sub(r'/(?:\\.|[^/\\])+/[gimsuy]*', '//', clean)
                for o, c in [('(', ')'), ('{', '}'), ('[', ']')]:
                    diff = clean.count(o) - clean.count(c)
                    if diff != 0:
                        errors.append(f"{fname}: Unbalanced {o}{c} (diff: {diff})")

        self.assertEqual(errors, [], f"Syntax errors detected:\n" + "\n".join(errors))

    def test_in_browser_test_runner_integrity(self):
        """In-browser test runner (test-runner.html) must exist, have clean imports, and test all 6 core subsystems."""
        runner_content = read_project_file('test-runner.html')
        self.assertIsNotNone(runner_content, "test-runner.html must exist")

        # 1. No query params on internal imports
        bad_imports = re.findall(r"""import\s+.*?from\s+['"]\.{1,2}/[^'"]*\?[^'"]*['"]""", runner_content)
        self.assertEqual(bad_imports, [], f"test-runner.html has query parameters on internal imports: {bad_imports}")

        # 2. Required ES module imports
        self.assertIn("from './nostr-crypto.js'", runner_content, "test-runner.html must import nostr-crypto.js")
        self.assertIn("from './token-codec.js'", runner_content, "test-runner.html must import token-codec.js")
        self.assertIn("from './webrtc-core.js'", runner_content, "test-runner.html must import webrtc-core.js")

        # 3. All 6 core test suites present
        required_suites = ['crypto', 'codec', 'loopback', 'messaging', 'network', 'media']
        for s in required_suites:
            self.assertIn(f"'{s}'", runner_content, f"test-runner.html missing suite: '{s}'")

        # 4. Autorun support
        self.assertIn("autorun", runner_content, "test-runner.html must support ?autorun=1 parameter")

        # 5. index.html links to test-runner.html
        index_content = read_project_file('index.html')
        self.assertIn('test-runner.html', index_content, "index.html must link to test-runner.html")


if __name__ == '__main__':
    unittest.main()

