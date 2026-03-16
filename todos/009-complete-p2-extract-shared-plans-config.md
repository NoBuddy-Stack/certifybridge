---
status: pending
priority: p2
issue_id: "009"
tags: [code-review, architecture, duplication]
dependencies: ["001"]
---

# PLAN_AMOUNTS and PLAN_NAMES Duplicated Across Two Files

## Problem Statement

`PLAN_AMOUNTS` and `PLAN_NAMES` are defined identically in both `api/create-order.js` (lines 16-26) and `api/verify-payment.js` (lines 20-21). There is no shared constants module.

This is a correctness risk: a price change requires editing two files. If one is updated and the other is missed, `verify-payment.js` will accept payments at the old amount while `create-order.js` charges the new amount — an accounting discrepancy. This is also the root cause of the prototype pollution vulnerability in todo 001 (fixing in one place doesn't fix the other).

## Findings

- `api/create-order.js:16-26` — `PLAN_AMOUNTS` + `PLAN_NAMES` defined
- `api/verify-payment.js:20-21` — same constants defined identically
- Adding a 4th plan requires 3 file edits: `create-order.js`, `verify-payment.js`, and `public/apply.html`
- Simplicity reviewer: "highest priority for correctness" finding

## Proposed Solutions

### Option A: Create `lib/plans.js` shared constants
```js
// lib/plans.js
export const PLAN_AMOUNTS = Object.assign(Object.create(null), {
  new: 999, pro: 1999, hacker: 4999,
});
export const PLAN_NAMES = Object.assign(Object.create(null), {
  new: 'New Plan', pro: 'Pro Plan', hacker: 'Hacker Plan',
});
```
Use `Object.create(null)` to fix prototype pollution (todo 001) at the same time.

Both files import:
```js
import { PLAN_AMOUNTS, PLAN_NAMES } from '../lib/plans.js';
```
- **Pros:** Single source of truth; fixes prototype pollution simultaneously; a new plan requires one file edit
- **Effort:** Small (new file + 2 import changes + delete duplicate definitions)
- **Risk:** None

## Recommended Action

Option A. Combine with todo 001 fix for maximum efficiency.

## Technical Details

- **New file:** `lib/plans.js`
- **Modified files:** `api/create-order.js` (remove local definitions, add import), `api/verify-payment.js` (same)

## Acceptance Criteria

- [ ] `lib/plans.js` exists with null-prototype objects
- [ ] `api/create-order.js` imports from `lib/plans.js`, no local `PLAN_AMOUNTS`/`PLAN_NAMES`
- [ ] `api/verify-payment.js` imports from `lib/plans.js`, no local `PLAN_AMOUNTS`/`PLAN_NAMES`
- [ ] All three plans (new, pro, hacker) still work end-to-end
- [ ] Adding a 4th plan requires editing only `lib/plans.js` and `public/apply.html`

## Work Log

- 2026-03-15: Identified by architecture-strategist and code-simplicity-reviewer agents
