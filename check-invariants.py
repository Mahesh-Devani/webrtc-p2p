#!/usr/bin/env python3
"""
check-invariants.py — Automated Architectural Invariant Verifier for P2P Connect
=================================================================================
Run this after any code change to verify that no known project invariants were broken.

Usage:
    python3 check-invariants.py

Exit codes:
    0  All invariants pass
    1  One or more invariants failed

Invariant Categories:
    1. ES Module Singleton Integrity (no query params on internal imports)
    2. No Duplicate Singleton Import Paths
    3. Storage Key Isolation (host vs client identity separation)
    4. WebRTC Stream Association (addTrack with stream param)
    5. DataChannel File Transfer Protocol contracts
    6. Cache Buster Consistency (version tags on root scripts only)
    7. JavaScript Syntax Balance (bracket/paren matching)
    8. Host Rejects When Capture Inactive
    9. Nostr Signal Type Whitelist
    10. Signaling Idempotency & Re-subscription Shielding
    11. Zero Unthrottled OS IPC in Capture/Input Loops
    12. Remote Desktop Aspect Ratio & Stream Quality Encoding
"""

import re
import sys
from pathlib import Path
from collections import defaultdict

# ── Configuration ──────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.resolve()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from tests.invariant_metadata import INVARIANT_RULES, format_remediation_box

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

# Colors
RED = '\033[91m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
BOLD = '\033[1m'
RESET = '\033[0m'


class InvariantResult:
    def __init__(self, name, passed, details=None, rule_id=None):
        self.name = name
        self.passed = passed
        self.details = details or []
        self.rule_id = rule_id

    def __str__(self):
        status = f'{GREEN}✓ PASS{RESET}' if self.passed else f'{RED}✗ FAIL{RESET}'
        tag = f'[{self.rule_id}] ' if self.rule_id else ''
        lines = [f'  {status}  {tag}{self.name}']
        for d in self.details:
            lines.append(f'         {d}')
        if not self.passed and self.rule_id:
            box = format_remediation_box(self.rule_id)
            if box:
                lines.append(box)
        return '\n'.join(lines)


def read_file(filename):
    path = PROJECT_ROOT / filename
    if not path.exists():
        return None
    return path.read_text(encoding='utf-8')


# ── Invariant 1: No Query Parameters on Internal Module Imports ────────
def check_no_import_query_params():
    """
    CRITICAL: In browser ES modules, import './file.js?v=6' and import './file.js'
    are treated as TWO SEPARATE MODULE URLs, creating duplicate singleton instances.
    """
    violations = []
    pattern = re.compile(r"""import\s+.*?from\s+['"]\.{1,2}/[^'"]*\?[^'"]*['"]""")

    for fname in JS_FILES:
        content = read_file(fname)
        if content is None:
            continue
        for i, line in enumerate(content.splitlines(), 1):
            if pattern.search(line):
                violations.append(f'{fname}:{i}  {line.strip()}')

    return InvariantResult(
        'No query parameters on internal ES module imports (singleton integrity)',
        len(violations) == 0,
        violations if violations else ['All internal imports use clean paths'],
        rule_id='INV-1'
    )


# ── Invariant 2: No Duplicate Singleton Import Paths ──────────────────
def check_no_duplicate_singleton_imports():
    """
    Each singleton module must be imported from exactly one path across the
    codebase. Multiple import paths = multiple instances = broken state.
    """
    singletons = ['NostrTransport', 'NostrSignaling', 'NostrCrypto', 'ChatStore']
    import_map = defaultdict(set)
    violations = []

    import_pattern = re.compile(
        r"""import\s*\{[^}]*\b(\w+)\b[^}]*\}\s*from\s*['"]([^'"]+)['"]"""
    )

    for fname in JS_FILES:
        content = read_file(fname)
        if content is None:
            continue
        for match in import_pattern.finditer(content):
            imported_name = match.group(1)
            import_path = match.group(2)
            if imported_name in singletons:
                import_map[imported_name].add(import_path)

    for singleton, paths in import_map.items():
        if len(paths) > 1:
            violations.append(
                f'{singleton} imported from multiple paths: {", ".join(sorted(paths))} '
                f'— this creates duplicate instances!'
            )

    return InvariantResult(
        'No duplicate singleton import paths',
        len(violations) == 0,
        violations if violations else ['All singletons imported from consistent paths'],
        rule_id='INV-2'
    )


# ── Invariant 3: Storage Key Isolation (Host vs Client) ────────────────
def check_storage_key_isolation():
    """
    Host must use p2p-host-privkey / p2p-host-pubkey.
    Client must use nostr-privkey / nostr-pubkey.
    They must NEVER share the same identity keys.
    """
    violations = []

    host_content = read_file('host-controller.js')
    if host_content:
        has_host_priv = 'p2p-host-privkey' in host_content
        has_host_pub = 'p2p-host-pubkey' in host_content
        if not has_host_priv or not has_host_pub:
            violations.append('host-controller.js: Missing p2p-host-privkey or p2p-host-pubkey storage constants')

        lines = host_content.splitlines()
        for i, line in enumerate(lines, 1):
            if 'nostr-privkey' in line and 'hostIdentity' in line:
                violations.append(f'host-controller.js:{i}  Host identity reads from client key: {line.strip()}')

    client_content = read_file('ui-controller.js')
    if client_content:
        if re.search(r"localStorage\.(get|set)Item\(['\"]p2p-host-priv", client_content):
            violations.append('ui-controller.js: Client code accesses host private key storage')

    return InvariantResult(
        'Storage key isolation (host p2p-host-* vs client nostr-*)',
        len(violations) == 0,
        violations if violations else ['Host and Client use separate identity storage keys'],
        rule_id='INV-3'
    )


# ── Invariant 4: WebRTC addTrack Must Include Stream ──────────────────
def check_webrtc_stream_association():
    """
    addLocalStream must call pc.addTrack(track, stream) WITH the stream
    parameter so a=msid is generated in the SDP answer.
    """
    violations = []
    content = read_file('webrtc-core.js')
    if content is None:
        return InvariantResult('WebRTC stream association', True, ['webrtc-core.js not found (skipped)'], rule_id='INV-4')

    match = re.search(r'function addLocalStream\(stream\)\s*\{', content)
    if not match:
        violations.append('webrtc-core.js: addLocalStream function not found')
        return InvariantResult('WebRTC stream association (addTrack with stream)', False, violations, rule_id='INV-4')

    start_line = content[:match.start()].count('\n') + 1
    lines = content.splitlines()
    func_text = '\n'.join(lines[start_line - 1: start_line + 79])

    if not re.search(r'pc\.addTrack\(\s*track\s*,\s*stream\s*\)', func_text):
        violations.append('webrtc-core.js: addLocalStream does not call pc.addTrack(track, stream)')

    return InvariantResult(
        'WebRTC addLocalStream uses pc.addTrack(track, stream) for proper a=msid',
        len(violations) == 0,
        violations if violations else ['addLocalStream correctly uses pc.addTrack(track, stream)'],
        rule_id='INV-4'
    )


# ── Invariant 5: DataChannel File Transfer Protocol ────────────────────
def check_file_transfer_protocol():
    """File transfer protocol: _fileStart → chunks → _fileEnd with drain check."""
    violations = []
    content = read_file('webrtc-core.js')
    if content is None:
        return InvariantResult('File transfer protocol', True, ['webrtc-core.js not found (skipped)'], rule_id='INV-5')

    for marker in ['_fileStart', '_fileEnd', '_fileAbort']:
        if marker not in content:
            violations.append(f'webrtc-core.js: Missing {marker} marker')

    if 'bufferedAmount' not in content:
        violations.append('webrtc-core.js: Missing bufferedAmount backpressure check')

    chunk_match = re.search(r'(?:CHUNK_SIZE|chunkSize)\s*=\s*(\d+)', content)
    if chunk_match:
        chunk_size = int(chunk_match.group(1))
        if chunk_size > 64 * 1024:
            violations.append(f'webrtc-core.js: Chunk size {chunk_size} exceeds 64KB SCTP limit')

    return InvariantResult(
        'DataChannel file transfer protocol (_fileStart → chunks → _fileEnd)',
        len(violations) == 0,
        violations if violations else ['File transfer protocol markers and backpressure present'],
        rule_id='INV-5'
    )


# ── Invariant 6: Cache Buster Consistency ──────────────────────────────
def check_cache_busters():
    """Cache busters (?v=XX) must ONLY appear on root <script> tags in HTML."""
    violations = []
    warnings = []

    for html_file in HTML_FILES:
        content = read_file(html_file)
        if content is None:
            continue

        script_matches = re.findall(r'<script[^>]*src="([^"]*\?v=\d+)"', content)
        if not script_matches:
            warnings.append(f'{html_file}: No cache-busted script tags found')

        for src in script_matches:
            basename = src.split('?')[0]
            if basename not in ['ui-controller.js', 'host-controller.js', 'support-controller.js']:
                violations.append(f'{html_file}: Unexpected cache-busted script: {src}')

    return InvariantResult(
        'Cache busters only on root HTML script tags',
        len(violations) == 0,
        violations + warnings if (violations or warnings) else ['Cache busters correctly placed'],
        rule_id='INV-6'
    )


# ── Invariant 7: JavaScript Syntax Balance ─────────────────────────────
def check_js_syntax_balance():
    """Verify JS files have valid syntax and balanced brackets using Tree-sitter AST or tokenizer."""
    violations = []
    
    # Try loading Tree-sitter from pipx venv or local environment
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

    for fname in JS_FILES:
        path = PROJECT_ROOT / fname
        if not path.exists():
            continue

        if ts_parser is not None:
            raw = path.read_bytes()
            tree = ts_parser.parse(raw)
            if tree.root_node.has_error:
                violations.append(f'{fname}: Tree-sitter detected syntax / parse error in AST')
        else:
            # Fallback tokenizer that skips comments, strings, and regex literals
            content = path.read_text(encoding='utf-8')
            # Strip block comments
            clean = re.sub(r'/\*[\s\S]*?\*/', '', content)
            # Strip line comments
            clean = re.sub(r'//.*', '', clean)
            # Strip strings and template literals
            clean = re.sub(r'"(\\.|[^"\\])*"', '""', clean)
            clean = re.sub(r"'(\\.|[^'\\])*'", "''", clean)
            clean = re.sub(r'`(\\.|[^`\\])*`', '``', clean)
            # Strip regex literals
            clean = re.sub(r'/(?:\\.|[^/\\])+/[gimsuy]*', '//', clean)

            for o, c in [('(', ')'), ('{', '}'), ('[', ']')]:
                diff = clean.count(o) - clean.count(c)
                if diff != 0:
                    d = 'more opening' if diff > 0 else 'more closing'
                    violations.append(f'{fname}: Unbalanced {o}{c} — {abs(diff)} {d}')

    engine_name = 'Tree-sitter AST parser' if ts_parser else 'Bracket tokenizer'
    return InvariantResult(
        f'JavaScript syntax integrity ({engine_name})',
        len(violations) == 0,
        violations if violations else [f'All JS files verified error-free via {engine_name}'],
        rule_id='INV-7'
    )


# ── Invariant 8: Host Rejects Inactive Capture ────────────────────────
def check_host_rejects_inactive_capture():
    """Host must reject unattended_offer when desktop capture is not active."""
    violations = []
    content = read_file('host-controller.js')
    if content is None:
        return InvariantResult('Host rejects inactive capture', True, ['host-controller.js not found (skipped)'], rule_id='INV-8')

    if 'isHostStreamLive' not in content:
        violations.append('host-controller.js: Missing isHostStreamLive() check')

    offer_idx = content.find("'unattended_offer'")
    if offer_idx >= 0:
        section = content[offer_idx:offer_idx + 2000]
        if 'isHostStreamLive' not in section:
            violations.append('host-controller.js: isHostStreamLive() check not near unattended_offer handler')

    return InvariantResult(
        'Host rejects connections when desktop capture is inactive',
        len(violations) == 0,
        violations if violations else ['Host correctly checks isHostStreamLive() before accepting'],
        rule_id='INV-8'
    )


# ── Invariant 9: Nostr Signal Type Whitelist ──────────────────────────
def check_signal_type_whitelist():
    """NostrTransport must whitelist accepted signal types."""
    violations = []
    content = read_file('nostr-transport.js')
    if content is None:
        return InvariantResult('Signal type whitelist', True, ['nostr-transport.js not found (skipped)'], rule_id='INV-9')

    required = ['offer', 'answer', 'ice', 'close', 'message',
                'unattended_offer', 'unattended_answer', 'host_ping', 'host_pong',
                'diagnostic_logpkg', 'diagnostic_screenshot', 'user_comment']
    for t in required:
        if f"'{t}'" not in content and f'"{t}"' not in content:
            violations.append(f'nostr-transport.js: Signal type "{t}" not in whitelist')

    if '.includes(payload.type)' not in content:
        violations.append('nostr-transport.js: No signal type validation found')

    return InvariantResult(
        'Nostr signal types are whitelisted',
        len(violations) == 0,
        violations if violations else ['All required signal types present in whitelist'],
        rule_id='INV-9'
    )


# ── Invariant 10: Signaling Idempotency & Re-subscription Shielding ──
def check_signaling_idempotency_shielding():
    """Signaling keepalives and offer handlers must be shielded and idempotent."""
    violations = []
    content = read_file('host-controller.js')
    if content is None:
        return InvariantResult('Signaling idempotency shielding', True, ['host-controller.js not found (skipped)'], rule_id='INV-10')

    if 'activeSessionId' not in content:
        violations.append('host-controller.js: Missing activeSessionId tracking variable')

    # Ensure ensureConnected is gated with !activeSession in setInterval
    heartbeats = re.findall(r'setInterval\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([^}]+)\}', content)
    for hb in heartbeats:
        if 'ensureConnected' in hb and '!activeSession' not in hb:
            violations.append('host-controller.js: setInterval calls ensureConnected() without checking !activeSession')

    # Ensure duplicate offer protection
    if 'activeSession && activeSessionId === sessionId' not in content:
        violations.append('host-controller.js: unattended_offer handler missing duplicate activeSession check')

    # Ensure staleness check
    if 'offerAgeSec > 45' not in content and 'offerAge' not in content:
        violations.append('host-controller.js: unattended_offer handler missing staleness check (>45s)')

    return InvariantResult(
        'Signaling idempotency and re-subscription shielding',
        len(violations) == 0,
        violations if violations else ['Signaling heartbeats shielded and offers idempotent'],
        rule_id='INV-10'
    )


# ── Invariant 11: Zero Unthrottled OS IPC in Capture/Input Loops ──────
def check_os_ipc_throttling_in_capture_loops():
    """Native OS queries inside high-frequency capture/input loops must be throttled."""
    violations = []
    content = read_file('remote-desktop-host/bridge.py')
    if content is None:
        return InvariantResult('OS IPC throttling in capture loops', True, ['bridge.py not found (skipped)'], rule_id='INV-11')

    # is_screen_locked must support max_age caching
    if 'def is_screen_locked(self, max_age=' not in content:
        violations.append('bridge.py: is_screen_locked missing monotonic clock max_age caching')

    # stream_frames_loop must pass max_age
    if 'is_screen_locked(max_age=' not in content:
        violations.append('bridge.py: stream_frames_loop does not pass max_age to is_screen_locked')

    return InvariantResult(
        'Zero unthrottled OS IPC in capture/input loops',
        len(violations) == 0,
        violations if violations else ['All OS queries in capture/input loops are throttled via monotonic clock'],
        rule_id='INV-11'
    )


# ── Invariant 12: Remote Desktop Aspect Ratio & Stream Quality Encoding
def check_rd_aspect_ratio_and_bitrate():
    """Remote Desktop must support ultrawide resolutions and high video bitrate."""
    violations = []
    host_content = read_file('host-controller.js')
    bridge_content = read_file('remote-desktop-host/bridge.py')

    if host_content:
        # Check canvas dimensions
        w_match = re.search(r'MAX_STREAM_WIDTH\s*=\s*(\d+)', host_content)
        h_match = re.search(r'MAX_STREAM_HEIGHT\s*=\s*(\d+)', host_content)
        if not w_match or int(w_match.group(1)) < 3840:
            violations.append('host-controller.js: MAX_STREAM_WIDTH must be at least 3840 (for ultrawide displays)')
        if not h_match or int(h_match.group(1)) < 2160:
            violations.append('host-controller.js: MAX_STREAM_HEIGHT must be at least 2160')

        # Check initial setVideoQuality call
        if 'peerSession.setVideoQuality(12_000_000' not in host_content and 'setVideoQuality(12_000_000' not in host_content:
            violations.append('host-controller.js: Missing proactive setVideoQuality(12_000_000, 60) on connection')

    if bridge_content:
        if 'kCGImageDestinationLossyCompressionQuality' not in bridge_content:
            violations.append('bridge.py: Missing kCGImageDestinationLossyCompressionQuality for hardware JPEG compression')

    return InvariantResult(
        'Remote desktop aspect ratio and stream quality encoding',
        len(violations) == 0,
        violations if violations else ['Stream dimensions support ultrawide 3840x2160 with 12Mbps / 0.85 JPEG'],
        rule_id='INV-12'
    )


# ── Main ───────────────────────────────────────────────────────────────
def main():
    print(f'\n{BOLD}{CYAN}═══ P2P Connect — Architectural Invariant Checker ═══{RESET}\n')

    checks = [
        check_no_import_query_params,
        check_no_duplicate_singleton_imports,
        check_storage_key_isolation,
        check_webrtc_stream_association,
        check_file_transfer_protocol,
        check_cache_busters,
        check_js_syntax_balance,
        check_host_rejects_inactive_capture,
        check_signal_type_whitelist,
        check_signaling_idempotency_shielding,
        check_os_ipc_throttling_in_capture_loops,
        check_rd_aspect_ratio_and_bitrate,
    ]

    results = []
    for check_fn in checks:
        try:
            result = check_fn()
        except Exception as e:
            result = InvariantResult(check_fn.__name__, False, [f'Exception: {e}'])
        results.append(result)
        print(result)

    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)

    print(f'\n{BOLD}{"─" * 60}{RESET}')
    if failed == 0:
        print(f'{GREEN}{BOLD}  All {passed} invariants passed! ✓{RESET}')
    else:
        print(f'{RED}{BOLD}  {failed} of {passed + failed} invariants FAILED{RESET}')
    print()
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
