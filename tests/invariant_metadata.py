"""
tests/invariant_metadata.py
===========================
Centralized repository of architectural invariant definitions, AGENTS.md rule references,
root-cause explanations, and actionable remediation guidance for P2P Connect.

Used by:
  - check-invariants.py (CLI and pre-commit verifier)
  - tests/test_invariants.py (regression test suite)
"""

# Color codes
RED = '\033[91m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
BOLD = '\033[1m'
RESET = '\033[0m'

INVARIANT_RULES = {
    'INV-1': {
        'title': 'ES Module Singleton Integrity (No query params on internal imports)',
        'rule_ref': 'AGENTS.md § 6.1 (ES Module Singleton Integrity)',
        'root_cause': (
            "In modern browser ES modules, './file.js?v=2' and './file.js' are treated as two distinct\n"
            "module URLs. Stateful singletons (NostrTransport, NostrSignaling, NostrCrypto, ChatStore)\n"
            "will be instantiated multiple times in memory, splitting WebSocket sockets and state,\n"
            "silently breaking all WebRTC signaling and messaging."
        ),
        'remediation': (
            "Strip all query parameters ('?v=XX') from internal relative imports.\n"
            "Cache busting is permitted ONLY on the root entry point in index.html/host.html."
        ),
        'example_bad': "import { NostrTransport } from './nostr-transport.js?v=6';",
        'example_good': "import { NostrTransport } from './nostr-transport.js';",
    },
    'INV-2': {
        'title': 'No Duplicate Singleton Import Paths',
        'rule_ref': 'AGENTS.md § 3 (Module Map & Dependency Architecture)',
        'root_cause': (
            "Importing singletons via inconsistent relative paths across different files causes the\n"
            "browser module loader to treat them as separate modules, duplicating stateful singletons."
        ),
        'remediation': (
            "Use consistent canonical relative paths (e.g. './nostr-transport.js') across all files."
        ),
        'example_bad': "File A: from './nostr-transport.js'; File B: from '../nostr-transport.js';",
        'example_good': "All files: from './nostr-transport.js';",
    },
    'INV-3': {
        'title': 'Storage Key Isolation (Host vs Client Identity Separation)',
        'rule_ref': 'AGENTS.md § 6.4 (Storage Usage & Separation)',
        'root_cause': (
            "Host Mode and Client Mode share the same origin localStorage in testing and dev.\n"
            "If Host Mode uses 'nostr-privkey' or 'nostr-pubkey', it clobbers the user's personal\n"
            "client identity and contacts."
        ),
        'remediation': (
            "In host-controller.js, strictly use keys with prefix 'p2p-host-*' ('p2p-host-privkey',\n"
            "'p2p-host-pubkey', 'p2p-host-whitelist'). Client must use 'nostr-*'."
        ),
        'example_bad': "localStorage.setItem('nostr-privkey', key)  // in host-controller.js",
        'example_good': "localStorage.setItem('p2p-host-privkey', key)  // in host-controller.js",
    },
    'INV-4': {
        'title': 'WebRTC Stream Association (pc.addTrack with stream parameter)',
        'rule_ref': 'AGENTS.md § 6.3 (Media Track Replacement vs Renegotiation)',
        'root_cause': (
            "Calling pc.addTrack(track) without passing the stream parameter omits the SDP 'a=msid'\n"
            "attribute. The remote peer's browser will not fire 'ontrack' or associate the track with\n"
            "a MediaStream, leaving the remote video element black/unconnected."
        ),
        'remediation': (
            "Always pass both track and stream: pc.addTrack(track, stream)."
        ),
        'example_bad': "pc.addTrack(track);",
        'example_good': "pc.addTrack(track, stream);",
    },
    'INV-5': {
        'title': 'DataChannel File Transfer Protocol Flow Control & Backpressure',
        'rule_ref': 'AGENTS.md § 5 (WebRTC DataChannels Specification - Flow Control Rules)',
        'root_cause': (
            "WebRTC SCTP buffers have limited capacity (typically 256KB to 1MB). Sending chunks without\n"
            "observing bufferedAmount causes packet drops, out-of-memory errors, and channel crashes.\n"
            "Omitting buffer drain synchronization (waitForBufferDrain) before _fileEnd causes file\n"
            "truncation and collision during batch multi-file transfers."
        ),
        'remediation': (
            "1. Enforce chunk size <= 64KB (16KB standard: 16 * 1024).\n"
            "2. Observe BUFFER_HIGH (256KB) and BUFFER_LOW (64KB) with bufferedamountlow backpressure.\n"
            "3. Always await waitForBufferDrain(dcFiles, 0) before sending _fileEnd."
        ),
        'example_bad': "while (offset < size) { dc.send(chunk); } dc.send({ _fileEnd: true });",
        'example_good': (
            "while (offset < size) { await waitForBufferDrain(dc, 64*1024); dc.send(chunk); }\n"
            "await waitForBufferDrain(dc, 0); dc.send(JSON.stringify({ _fileEnd: true }));"
        ),
    },
    'INV-6': {
        'title': 'Cache Buster Consistency (Root Scripts Only)',
        'rule_ref': 'AGENTS.md § 6.1 (Cache Busting Rule)',
        'root_cause': (
            "Query parameters (?v=XX) on script tags are permissible ONLY on root entry scripts in HTML\n"
            "files. Cache busters on internal module imports create duplicate instances in browser memory."
        ),
        'remediation': (
            "Restrict ?v=XX tags strictly to root entry scripts (ui-controller.js, host-controller.js,\n"
            "support-controller.js) inside index.html, host.html, or support.html."
        ),
        'example_bad': "<script type=\"module\" src=\"webrtc-core.js?v=2\"></script>",
        'example_good': "<script type=\"module\" src=\"ui-controller.js?v=41\"></script>",
    },
    'INV-7': {
        'title': 'JavaScript Syntax & Tree-Sitter AST Integrity',
        'rule_ref': 'AGENTS.md § 2 (Zero-Build Philosophy)',
        'root_cause': (
            "Because P2P Connect uses native browser ES modules with no build step, a single unbalanced\n"
            "bracket, unescaped quote, or syntax error causes the browser to reject the entire file\n"
            "at parse time, crashing the entire application on load."
        ),
        'remediation': (
            "Review the file identified by Tree-sitter and balance all parentheses (), brackets [],\n"
            "braces {}, and template literals ``."
        ),
        'example_bad': "function foo() { if (true) { return 1; } // missing closing brace",
        'example_good': "function foo() { if (true) { return 1; } }",
    },
    'INV-8': {
        'title': 'Host Rejects Inactive Desktop Capture',
        'rule_ref': 'AGENTS.md § 6.6 (Host Security & Remote Desktop Invariants)',
        'root_cause': (
            "If the Remote Desktop host accepts WebRTC connection offers when screen capture is inactive,\n"
            "the connecting peer receives a blank black screen and controls a non-existent display."
        ),
        'remediation': (
            "In host-controller.js, verify isHostStreamLive() before accepting 'unattended_offer'.\n"
            "Reject with error: 'capture_inactive' if screen capture has not started."
        ),
        'example_bad': "if (type === 'unattended_offer') { acceptOffer(offer); }",
        'example_good': (
            "if (type === 'unattended_offer') {\n"
            "  if (!isHostStreamLive()) { sendReject('capture_inactive'); return; }\n"
            "  acceptOffer(offer);\n"
            "}"
        ),
    },
    'INV-9': {
        'title': 'Nostr Signal Type Whitelist',
        'rule_ref': 'AGENTS.md § 4 (Mode A: Nostr Auto-Signaling kind 24133)',
        'root_cause': (
            "Nostr relays are open broadcast networks. Anyone can publish arbitrary JSON events.\n"
            "Accepting un-whitelisted signal types allows spoofing, protocol confusion, or unwanted\n"
            "state transitions."
        ),
        'remediation': (
            "Ensure any newly introduced signaling message type is explicitly listed in\n"
            "NostrTransport's accepted signal type whitelist and verified with .includes(payload.type)."
        ),
        'example_bad': "switch (payload.type) { case 'custom': ... } // without whitelist check",
        'example_good': "const VALID_TYPES = ['offer', 'answer', 'ice', ...]; if (!VALID_TYPES.includes(payload.type)) return;",
    },
}


def format_remediation_box(rule_id, violation_details=None, indent="         "):
    """
    Format a beautiful, actionable remediation guidance box for a failed invariant.
    """
    rule = INVARIANT_RULES.get(rule_id)
    if not rule:
        return ""

    lines = []
    lines.append(f"{indent}{CYAN}┌── 💡 REMEDIATION GUIDANCE [{rule['rule_ref']}] ──────────────────────────────{RESET}")
    lines.append(f"{indent}│ {BOLD}Rule ID{RESET}        : {YELLOW}{rule_id} — {rule['title']}{RESET}")
    lines.append(f"{indent}│ {BOLD}Document Ref{RESET}   : {rule['rule_ref']}")
    lines.append(f"{indent}│")

    # Root cause (indented)
    lines.append(f"{indent}│ {BOLD}Root Cause{RESET}     :")
    for line in rule['root_cause'].splitlines():
        lines.append(f"{indent}│   {line}")
    lines.append(f"{indent}│")

    # Remediation (indented)
    lines.append(f"{indent}│ {BOLD}How to Fix{RESET}     :")
    for line in rule['remediation'].splitlines():
        lines.append(f"{indent}│   {GREEN}{line}{RESET}")
    lines.append(f"{indent}│")

    # Example fix
    lines.append(f"{indent}│ {BOLD}Example Diff{RESET}   :")
    lines.append(f"{indent}│   {RED}- {rule['example_bad']}{RESET}")
    lines.append(f"{indent}│   {GREEN}+ {rule['example_good']}{RESET}")
    lines.append(f"{indent}{CYAN}└─────────────────────────────────────────────────────────────────────────────{RESET}")

    return "\n".join(lines)
