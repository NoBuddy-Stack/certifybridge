---
status: pending
priority: p3
issue_id: "015"
tags: [code-review, reliability]
dependencies: []
---

# Receipt ID Collision Under Concurrent Load

## Problem Statement

`api/create-order.js` generates receipt IDs as `` `rcpt_${Date.now()}` ``. Two simultaneous requests in the same millisecond produce identical receipt IDs. Razorpay accepts duplicate receipt values (it is an internal reference only), but duplicate receipts make financial reconciliation ambiguous.

## Findings

- `api/create-order.js:68` — `receipt: 'rcpt_${Date.now()}'`
- Stress test: 1000 sequential calls in tight loop → only 1 unique receipt ID
- Razorpay does not reject duplicate receipt values

## Proposed Solutions

### Option A: Add random suffix
```js
import crypto from 'crypto';
const receipt = `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
```
- **Effort:** Trivial (2 lines — add import at top, update receipt line)
- **Risk:** None

## Recommended Action

Option A.

## Acceptance Criteria

- [ ] Two simultaneous requests produce different receipt IDs

## Work Log

- 2026-03-15: Identified by security-sentinel agent during code review
