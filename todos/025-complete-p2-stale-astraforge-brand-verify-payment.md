---
status: complete
priority: p2
issue_id: "025"
tags: [code-review, quality]
dependencies: []
---

# 025 · Stale `[AstraForge]` brand string in verify-payment.js

## Problem Statement

`api/verify-payment.js` line 174 still contains the old brand name `[AstraForge]` in a `console.error` log statement. The project was rebranded to CertifyBridge (commit `7192e11`). Log entries with the old brand name make production monitoring and log filtering confusing.

## Findings

- `api/verify-payment.js:174` — `console.error('[AstraForge] ...')`
- All other files appear to have been updated during rebrand
- JSDoc in `api/create-order.js:9` also still says `"new" | "pro" | "hacker"` instead of `"noob" | "pro" | "hacker"`

**Location:** `api/verify-payment.js:174`, `api/create-order.js:9`

## Proposed Solutions

### Option A: Direct find-and-replace (Recommended)
```bash
grep -rn "AstraForge" api/ lib/ public/
```
Update all matches to `[CertifyBridge]`. Also fix the JSDoc comment in `create-order.js`.

**Effort:** Trivial
**Risk:** None

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `api/verify-payment.js:174`, `api/create-order.js:9`

## Acceptance Criteria

- [ ] No occurrences of `AstraForge` remain anywhere in the codebase
- [ ] `create-order.js` JSDoc updated: `"new" | "pro" | "hacker"` → `"noob" | "pro" | "hacker"`

## Work Log

- 2026-03-16: Flagged by architecture-strategist agent during code review
