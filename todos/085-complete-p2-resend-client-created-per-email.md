---
status: pending
priority: p2
issue_id: "085"
tags: [code-review, performance]
dependencies: []
---

# Resend Client Instantiated on Every Email Send

## Problem Statement
`lib/admin-emails.js` line 135 creates `new Resend(process.env.RESEND_API_KEY)` on every call to `send()`. The SDK constructor initializes HTTP clients each time. Should be a module-level lazy singleton.

## Findings
- **Source:** performance-oracle (Finding #5), architecture-strategist
- **Location:** `lib/admin-emails.js:135`

## Proposed Solutions

### Option A: Lazy singleton (Recommended)
```js
let _resend;
function getResend() {
  if (!_resend && process.env.RESEND_API_KEY) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
```
- **Effort:** Small
- **Risk:** None

## Acceptance Criteria
- [ ] Resend client created once per cold start, reused on warm starts

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | Match getRazorpay() pattern in verify-payment.js |

## Resources
- PR branch: `feat/admin-dashboard`
