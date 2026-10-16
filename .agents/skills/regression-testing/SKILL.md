---
name: regression-testing
description: >-
  Run automated, zero-token local regression testing and invariant verification
  for P2P Connect whenever code changes are made. Intelligently selects test suites
  based on modified files via git status/diff, or runs full suite.
---

# P2P Connect Regression Testing & Invariant Verification

This skill guides running fast, deterministic, zero-token local regression testing for **P2P Connect**.

---

## 1. When to Use This Skill

- **After any code modification**: Verify that your changes did not introduce regressions in existing features (Remote Desktop, Nostr messaging, file transfers, WebRTC calls, manual tokens).
- **Before git commits or pull requests**: Ensure that all 9 architectural invariants and contract tests pass.
- **When diagnosing connection, signaling, or file transfer bugs**: Quickly isolate whether a break is in WebRTC negotiation, transport encryption, or state management.

---

## 2. Test Architecture & Coverage

The regression suite is written in pure Python 3 using `unittest` and standard libraries. It executes in **< 0.1 seconds** and incurs **0 AI token cost**.

| Suite | File | Focus Areas | Historical Context |
|---|---|---|---|
| **Architectural Invariants** | `tests/test_invariants.py` | 9 core invariants: ES imports, storage keys, `a=msid`, file flow, cache busters, Tree-sitter AST, host capture, signal whitelist | Prevents split singleton memory, clobbered host/client keys, and syntax errors. |
| **Host Security** | `tests/test_host_security.py` | 10+ char password complexity (upper, lower, digit, symbol), generator, client whitelist enforcement | Prevents weak PINs and unauthorized remote desktop access. |
| **WebRTC Contracts** | `tests/test_webrtc_contracts.py` | 4 DataChannels (`sig`, `chat`, `files`, `input`), transceiver direction (`sendonly`/`inactive`), 15 Mbps/60 FPS, backpressure drain | Fixes black screen on RD, buffer exhaustion on large files, and video freeze. |
| **Token Codec** | `tests/test_token_codec.py` | `P2P2-` prefix, candidate stripping, zlib deflate/inflate roundtrip, null pubkey safety | Fixes manual QR code size limits and null active contact crashes. |
| **Mobile Lifecycle** | `tests/test_mobile_lifecycle.py` | 4-second transient disconnect debounce, `visibilitychange` recovery, auto-reconnect on send | Fixes iOS/Android tab suspension and file picker disconnections. |

---

## 3. How to Run Regressions

### Option A: Change-Aware Run (Fastest)
Detects modified files via `git status` / `git diff` and executes only the affected test suites:
```bash
python3 run-regressions.py
```
Or using the skill script helper:
```bash
.agents/skills/regression-testing/scripts/run.sh
```

### Option B: Full Test Suite
Runs all 27 unit tests across all 5 test suites:
```bash
python3 run-regressions.py --all
```
Or:
```bash
.agents/skills/regression-testing/scripts/run.sh --all
```

### Option C: Pre-Commit Mode with Graphify Sync
Runs the full suite and immediately refreshes the Graphify AST knowledge graph:
```bash
python3 run-regressions.py --pre-commit
```

---

## 4. Failure Diagnosis & Resolution Runbook

If any test fails, follow this diagnostic runbook:

### 1. `test_no_query_params_on_internal_imports` Failed
- **Root Cause**: An internal ES module import has a query parameter (e.g. `import ... from './nostr-transport.js?v=9'`).
- **Fix**: Remove query parameter from all internal relative imports. Cache busting is only permitted on root `<script>` tags in `index.html` or `host.html`.

### 2. `test_host_and_client_storage_keys_isolated` Failed
- **Root Cause**: `host-controller.js` used a `nostr-*` key or `ui-controller.js` used a `p2p-host-*` key.
- **Fix**: Host identity keys must always use `p2p-host-*` (`p2p-host-privkey`, `p2p-host-pubkey`). Client identity must always use `nostr-*`.

### 3. `test_add_local_stream_passes_stream_to_add_track` Failed
- **Root Cause**: `pc.addTrack(track)` was called without passing the parent `stream` object.
- **Fix**: Change to `pc.addTrack(track, stream)`. Without `stream`, WebRTC SDP omits `a=msid`, causing receiver `ontrack` to fail to group tracks or never fire.

### 4. `test_dc_files_protocol_flow` or `test_datachannel_watermarks` Failed
- **Root Cause**: DataChannel file streaming omitted `_fileStart`, `_fileEnd`, `_fileAbort`, or buffer drain check `waitForBufferDrain(dcFiles, 0)`.
- **Fix**: Ensure chunks are sent with backpressure checks (`BUFFER_HIGH = 256KB`, `BUFFER_LOW = 64KB`) and sender awaits drain before resolving.

### 5. `test_transceiver_direction_and_bitrate` Failed
- **Root Cause**: Remote desktop transceivers were created with `sendrecv` instead of `sendonly`, or screen share video bitrate parameters were modified.
- **Fix**: Maintain `sendonly` for active capture tracks and `inactive` for unused tracks. Preserve `contentHint = 'detail'` and 15 Mbps max bitrate limit.

---

## 5. Adding New Regression Tests

When a new bug or edge case is resolved:
1. Open the corresponding test file in `tests/` (or create a new `test_<domain>.py`).
2. Add a targeted `unittest.TestCase` method testing the invariant or contract.
3. If creating a new test file, register its file mappings in `FILE_TEST_MAP` inside `run-regressions.py`.
4. Run `python3 run-regressions.py --all` to verify that the new test executes cleanly.
