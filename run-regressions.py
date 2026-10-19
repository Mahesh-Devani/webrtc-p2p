#!/usr/bin/env python3
"""
run-regressions.py — Intelligent Local Regression Test Runner for P2P Connect
=============================================================================
Runs regression test suites locally using standard Python (zero AI token cost).
Intelligently targets tests based on modified files or runs the full test suite.

Usage:
    python3 run-regressions.py             # Intelligently runs tests for changed files
    python3 run-regressions.py --all       # Runs ALL unit test suites
    python3 run-regressions.py --e2e       # Runs headless two-peer browser E2E integration test
    python3 run-regressions.py --pre-commit # Pre-commit hook mode (fast check)
    python3 run-regressions.py --sync-graph # Runs tests and updates Graphify AST

Exit codes:
    0  All tests passed
    1  One or more tests failed
"""

import os
import sys
import time
import unittest
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent

# Ensure project root is in sys.path
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Color codes
RED = '\033[91m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
BOLD = '\033[1m'
RESET = '\033[0m'

# Mapping from source file patterns to test modules
FILE_TO_TESTS_MAP = {
    'webrtc-core.js': [
        'tests.test_webrtc_contracts',
        'tests.test_invariants',
        'tests.test_token_codec',
    ],
    'host-controller.js': [
        'tests.test_host_security',
        'tests.test_invariants',
    ],
    'host.html': [
        'tests.test_host_security',
        'tests.test_invariants',
    ],
    'remote-desktop-host': [
        'tests.test_host_security',
    ],
    'ui-controller.js': [
        'tests.test_invariants',
        'tests.test_mobile_lifecycle',
        'tests.test_webrtc_contracts',
    ],
    'index.html': [
        'tests.test_invariants',
        'tests.test_mobile_lifecycle',
    ],
    'nostr-signaling.js': [
        'tests.test_invariants',
        'tests.test_mobile_lifecycle',
        'tests.test_mock_relay',
    ],
    'nostr-transport.js': [
        'tests.test_invariants',
        'tests.test_mobile_lifecycle',
        'tests.test_mock_relay',
    ],
    'nostr-crypto.js': [
        'tests.test_invariants',
    ],
    'nostr-relay.js': [
        'tests.test_invariants',
        'tests.test_mock_relay',
    ],
    'mock_relay.py': [
        'tests.test_mock_relay',
        'tests.test_invariants',
    ],
    'token-codec.js': [
        'tests.test_token_codec',
        'tests.test_invariants',
    ],
    'chat-store.js': [
        'tests.test_invariants',
    ],
    'diagnostic-logger.js': [
        'tests.test_diagnostics',
        'tests.test_invariants',
    ],
    'support-agent': [
        'tests.test_diagnostics',
    ],
    'tests/e2e': [
        'tests.e2e.test_two_peer_handshake',
    ],
}

ALL_TEST_MODULES = [
    'tests.test_invariants',
    'tests.test_host_security',
    'tests.test_webrtc_contracts',
    'tests.test_token_codec',
    'tests.test_mobile_lifecycle',
    'tests.test_diagnostics',
    'tests.test_mock_relay',
]


def get_modified_files():
    """Detect modified and untracked files via Git."""
    try:
        # Get unstaged + staged changes
        res = subprocess.run(
            ['git', 'status', '--porcelain'],
            cwd=str(PROJECT_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False
        )
        if res.returncode != 0:
            return []

        modified = []
        for line in res.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            # Format: 'M path', '?? path', etc.
            parts = line.split(maxsplit=1)
            if len(parts) == 2:
                modified.append(parts[1])

        # Also check diff against HEAD for latest commit if working tree is clean
        if not modified:
            diff_res = subprocess.run(
                ['git', 'diff', '--name-only', 'HEAD~1', 'HEAD'],
                cwd=str(PROJECT_ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False
            )
            if diff_res.returncode == 0:
                modified = [f for f in diff_res.stdout.splitlines() if f.strip()]

        return modified
    except Exception:
        return []


def select_test_modules(modified_files, force_all=False):
    """Determine which test modules need to be run based on changed files."""
    if force_all or not modified_files:
        return ALL_TEST_MODULES

    selected = set()
    for f in modified_files:
        matched = False
        for pattern, modules in FILE_TO_TESTS_MAP.items():
            if pattern in f:
                selected.update(modules)
                matched = True
        # If test files themselves changed, run them
        if f.startswith('tests/test_') and f.endswith('.py'):
            mod_name = 'tests.' + Path(f).stem
            selected.add(mod_name)
            matched = True

    # If no specific mapping matched but files changed, run all tests for safety
    if not selected:
        return ALL_TEST_MODULES

    # Always ensure test_invariants runs on any JS/HTML change
    selected.add('tests.test_invariants')

    # Return in deterministic order
    return [m for m in ALL_TEST_MODULES if m in selected]


class ColoredTextTestResult(unittest.TextTestResult):
    """Custom test result formatter with clean status pills."""
    def startTest(self, test):
        super().startTest(test)
        self.stream.write(f"  {CYAN}RUN{RESET}   {test.shortDescription() or test.id().split('.')[-1]}...")
        self.stream.flush()

    def addSuccess(self, test):
        super().addSuccess(test)
        self.stream.write(f"\r  {GREEN}PASS{RESET}  {test.shortDescription() or test.id().split('.')[-1]}\n")
        self.stream.flush()

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.stream.write(f"\r  {RED}FAIL{RESET}  {test.shortDescription() or test.id().split('.')[-1]}\n")
        self.stream.flush()

    def addError(self, test, err):
        super().addError(test, err)
        self.stream.write(f"\r  {RED}ERR {RESET}  {test.shortDescription() or test.id().split('.')[-1]}\n")
        self.stream.flush()


def run_tests(modules):
    """Run specified unittest modules and report results."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    for mod_name in modules:
        try:
            mod_suite = loader.loadTestsFromName(mod_name)
            suite.addTests(mod_suite)
        except Exception as e:
            print(f"{RED}Error loading {mod_name}: {e}{RESET}")
            return False

    runner = unittest.TextTestRunner(resultclass=ColoredTextTestResult, verbosity=1)
    result = runner.run(suite)
    return result.wasSuccessful()


def main():
    args = sys.argv[1:]
    run_e2e = '--e2e' in args
    force_all = '--all' in args or '--pre-commit' in args
    pre_commit = '--pre-commit' in args
    sync_graph = '--sync-graph' in args

    print(f"\n{BOLD}{CYAN}════════ P2P Connect — Local Regression Runner ════════{RESET}\n")

    modified = get_modified_files()
    if run_e2e and not force_all:
        mode_str = "Headless browser E2E test (--e2e requested)"
    elif pre_commit:
        mode_str = "Pre-commit verification (all test suites)"
    elif force_all:
        mode_str = "Full suite (--all requested)" + (" + E2E" if run_e2e else "")
    elif modified:
        mode_str = f"Targeted suite ({len(modified)} changed file(s) detected)"
    else:
        mode_str = "Full suite (no active working tree changes)"

    print(f"  {BOLD}Mode:{RESET} {mode_str}")
    if modified and not force_all and not run_e2e:
        print(f"  {BOLD}Changed files:{RESET} {', '.join(modified[:4])}" + ("..." if len(modified) > 4 else ""))

    if run_e2e and not force_all:
        modules_to_run = ['tests.e2e.test_two_peer_handshake']
    else:
        modules_to_run = select_test_modules(modified, force_all=force_all)
        if run_e2e and 'tests.e2e.test_two_peer_handshake' not in modules_to_run:
            modules_to_run.append('tests.e2e.test_two_peer_handshake')

    print(f"  {BOLD}Running modules:{RESET} {len(modules_to_run)} test suites\n")

    start_time = time.time()
    success = run_tests(modules_to_run)
    elapsed = time.time() - start_time

    print(f"\n{BOLD}{'─' * 55}{RESET}")
    if success:
        print(f"{GREEN}{BOLD}  All regression tests passed successfully! ({elapsed:.2f}s) ✓{RESET}\n")

        # Optional: Sync Graphify graph automatically
        if sync_graph:
            print(f"  {CYAN}Updating Graphify knowledge graph...{RESET}")
            try:
                env = os.environ.copy()
                local_bin = str(Path.home() / '.local' / 'bin')
                env['PATH'] = f"{local_bin}:{env.get('PATH', '')}"
                graphify_bin = 'graphify' if subprocess.run(['which', 'graphify'], env=env, capture_output=True).returncode == 0 else str(Path.home() / '.local' / 'bin' / 'graphify')
                subprocess.run([graphify_bin, 'update', '.'], cwd=str(PROJECT_ROOT), env=env, check=False)
                print(f"  {GREEN}Graphify knowledge graph updated! ✓{RESET}\n")
            except Exception as e:
                print(f"  {YELLOW}Note: graphify update skipped: {e}{RESET}\n")

        return 0
    else:
        print(f"{RED}{BOLD}  Regression tests FAILED! ({elapsed:.2f}s) ✗{RESET}")
        print(f"  {YELLOW}Fix the failures above before committing to prevent regressions.{RESET}\n")
        return 1


if __name__ == '__main__':
    sys.exit(main())
