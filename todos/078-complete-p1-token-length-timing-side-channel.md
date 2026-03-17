---
status: pending
priority: p1
issue_id: "078"
tags: [code-review, security]
dependencies: []
---

# Token Length Timing Side-Channel in adminAuth.js

## Problem Statement
`lib/adminAuth.js` line 42 checks `a.length !== b.length` before calling `crypto.timingSafeEqual()`. This short-circuits and leaks the exact byte length of `ADMIN_TOKEN` via response timing differences. An attacker can send tokens of varying lengths and measure timing to determine the correct length, reducing brute-force search space.

## Findings
- **Source:** security-sentinel review
- **Location:** `lib/adminAuth.js:40-43`
- **Evidence:** `if (a.length !== b.length || !crypto.timingSafeEqual(a, b))` — the length check is timing-variable

## Proposed Solutions

### Option A: Hash before comparison (Recommended)
Hash both values with SHA-256 before comparing, making length always 32 bytes.
```js
const a = crypto.createHash('sha256').update(auth).digest();
const b = crypto.createHash('sha256').update(token).digest();
if (!crypto.timingSafeEqual(a, b)) {
```
- **Pros:** 3-line fix, OWASP-recommended pattern, constant-time regardless of input length
- **Cons:** None
- **Effort:** Small
- **Risk:** None

## Recommended Action
<!-- Filled during triage -->

## Technical Details
- **Affected files:** `lib/adminAuth.js`

## Acceptance Criteria
- [ ] Token comparison does not leak length information
- [ ] `crypto.timingSafeEqual` always compares fixed-length buffers
- [ ] Existing auth behavior unchanged (valid tokens accepted, invalid rejected)

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | Standard OWASP pattern for timing-safe string comparison |

## Resources
- PR branch: `feat/admin-dashboard`
- OWASP timing attack guidance
