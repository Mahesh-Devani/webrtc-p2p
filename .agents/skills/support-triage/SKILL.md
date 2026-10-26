---
name: support-triage
description: >-
  Triage user-submitted diagnostic log packages, chat comments, and screenshots
  from support-agent/diagnostics-inbox/. Diagnoses root causes using AST code
  intelligence and proposes verified fixes for developer review.
---

# Support Triage & Issue Resolution Skill

This skill guides Antigravity through inspecting, diagnosing, and resolving user-reported issues from `support-agent/diagnostics-inbox/`.

---

## 1. When to Use This Skill

- When the developer prompts:
  - `"Check the support inbox and analyze any reported issues."`
  - `"Triage the latest user report."`
  - `"Analyze user issue from client <pubkey>."`

---

## 2. Triage Procedure

### Step 1: List and Inspect Inbox Contents
Run the triage command to view all unhandled user submissions:
```bash
python3 support-agent/ai-diagnostic-agent.py --inbox
```
Inspect recent files in `support-agent/diagnostics-inbox/`:
- `comment_<timestamp>_<pubkey>.json`: User's text complaint or question.
- `logpkg_<timestamp>_<pubkey>.json`: Technical telemetry (WebRTC state, candidate pairs, relay status, logs).
- `screenshot_<timestamp>_<pubkey>.jpg`: Visual evidence of errors or connection drops.

> [!CAUTION]
> **Image Safety**: Inspect the `--inbox` output before attempting to read screenshot files. If an image is flagged as `[CORRUPTED/INVALID]` or quarantined (`.corrupt`), **do not** attempt to inspect it with image/file tools. Rely on the technical telemetry in `logpkg_*.json` instead.

### Step 2: Deep Package Diagnosis
Run offline analysis on the target package:
```bash
python3 support-agent/ai-diagnostic-agent.py --analyze support-agent/diagnostics-inbox/<filename>.json
```

### Step 3: Codebase Cross-Referencing
Correlate symptoms with the codebase:
- If `graphify-out/` exists, run `graphify query "<component or error>"` to navigate affected functions.
- Check relevant state machines in `ui-controller.js`, `webrtc-core.js`, or `host-controller.js`.

### Step 4: Propose Fix for Developer Review
Present a structured triage summary to the developer:
1. **User Symptom**: What the user reported and what the telemetry shows.
2. **Root Cause**: The exact code line, race condition, or logic bug.
3. **Proposed Fix**: Code diff explaining how the issue will be resolved without breaking invariants.

### Step 5: Implementation & Verification
After developer approval:
1. Apply the code edits.
2. Run invariant check: `python3 check-invariants.py` (all 9 must pass).
3. Run regressions: `python3 run-regressions.py --all` (all tests must pass).
4. Update AST knowledge graph: `graphify update .`.
5. Present final diff and await confirmation before git commit or push.
