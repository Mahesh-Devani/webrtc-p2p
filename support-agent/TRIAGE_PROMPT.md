# 📋 Developer Triage Prompt Guide

Use these prompt triggers in chat with Antigravity to triage and resolve user issues reported to the Support Agent.

---

## 🚀 1. Recommended Triage Prompts

### Quick Triage & Summary (Everyday Check)
> `"Check the support inbox and analyze any reported issues."`
- **What Antigravity does**: Runs `--inbox`, lists new user submissions, inspects the latest log package, and tells you what users are experiencing.

---

### Full Autonomous Diagnosis & Fix Proposal
> `"Triage the support inbox: analyze the latest user issue, diagnose the root cause in the codebase, and propose a verified fix for my review."`
- **What Antigravity does**:
  1. Inspects the user's `comment_*.json` and `logpkg_*.json`.
  2. Pinpoints the exact bug in the JavaScript/Python files.
  3. Formulates a concrete code diff.
  4. Waits for your review before touching any code.

---

### Specific Client Investigation
> `"Analyze the latest support issue from client <pubkey> and check their telemetry snapshot."`
- **What Antigravity does**: Filters the inbox specifically for that client's public key, runs `--analyze`, and explains their connection failure (e.g. Symmetric NAT, Relay disconnect, or Remote Desktop Standby).

---

### Inspect Screenshots & Visual Errors
> `"Inspect any new screenshots in the support inbox and explain the visual error."`
- **What Antigravity does**: Reads `support-agent/diagnostics-inbox/screenshot_*.jpg` and correlates visual artifacts (such as black screen, warning badges, or touch layout) with client telemetry.

---

## 🛠️ 2. How the Triage Loop Operates

```
[ Developer Prompt ]
       │
       ▼
[ Antigravity reads support-agent/diagnostics-inbox/ ]
       │
       ▼
[ Root-Cause Analysis using AST Codebase Graph ]
       │
       ▼
[ Proposed Fix presented to Developer ]
       │
       ├─► Approved ──► Antigravity applies fix & runs 70+ local regressions
       │                Awaits final confirmation before git commit/push
       │
       └─► Refined ───► Antigravity updates approach based on your feedback
```
