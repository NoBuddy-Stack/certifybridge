---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, security, injection]
dependencies: []
---

# Prototype Pollution Bypass in Plan Validation

## Problem Statement

Both `api/create-order.js` and `api/verify-payment.js` validate the plan name using a plain object key lookup:

```js
if (!plan || !PLAN_AMOUNTS[plan]) { ... }
```

`PLAN_AMOUNTS` is a plain object literal that inherits from `Object.prototype`. Keys like `__proto__`, `toString`, `valueOf`, `constructor`, and `hasOwnProperty` all resolve to truthy values, bypassing the guard entirely. When `plan = "toString"` is submitted, `PLAN_AMOUNTS['toString']` is the native `toString` function (truthy), so validation passes. Downstream, `amountINR = PLAN_AMOUNTS['toString']` is a function, `amountINR * 100` is `NaN`, and MongoDB receives a corrupt document. On older Razorpay SDK versions, NaN as the amount may result in a ₹0 order.

**Why it matters:** The plan validation guard is the trust boundary between client input and financial data. A bypass corrupts database records, generates malformed emails, and could enable ₹0 payments depending on Razorpay SDK behavior.

## Findings

- `api/create-order.js:53` — `if (!plan || !PLAN_AMOUNTS[plan])` — unguarded prototype lookup
- `api/verify-payment.js:52` — same pattern, same vulnerability
- Confirmed bypassing with `plan = "toString"`, `plan = "__proto__"`, `plan = "constructor"`
- Both files must be fixed independently (same root cause — duplicated constants without shared validation)

## Proposed Solutions

### Option A: `hasOwnProperty` guard (minimal change)
```js
if (!plan || !Object.prototype.hasOwnProperty.call(PLAN_AMOUNTS, plan)) {
  return res.status(400).json({ error: 'Invalid plan.' });
}
```
- **Pros:** One-line change per file, zero new dependencies, semantically clear
- **Cons:** Must remember to apply to both files (root cause — duplication — still exists)
- **Effort:** Small
- **Risk:** Low

### Option B: `Object.create(null)` null-prototype objects (cleanest)
```js
const PLAN_AMOUNTS = Object.assign(Object.create(null), { new: 999, pro: 1999, hacker: 4999 });
const PLAN_NAMES   = Object.assign(Object.create(null), { new: 'New Plan', pro: 'Pro Plan', hacker: 'Hacker Plan' });
```
Null-prototype objects have no `__proto__`, `toString`, etc. so `PLAN_AMOUNTS['toString']` returns `undefined`.
- **Pros:** Eliminates the class of bug at the data structure level; original guard logic unchanged
- **Cons:** Slightly unfamiliar pattern; must apply to both files
- **Effort:** Small
- **Risk:** Low

### Option C: Extract to shared `lib/plans.js` with null-prototype (best long-term — combine with todo 009)
Create `lib/plans.js` with null-prototype objects and import in both API files. Fix duplication and prototype pollution in one move.
- **Pros:** Eliminates duplication and the vulnerability simultaneously
- **Cons:** Slightly larger change (new file + two imports)
- **Effort:** Small-Medium
- **Risk:** Low

## Recommended Action

Option C if todo 009 (extract `lib/plans.js`) is done at the same time. Otherwise Option A as immediate patch.

## Technical Details

- **Affected files:** `api/create-order.js:53`, `api/verify-payment.js:52`
- **OWASP:** A03 Injection

## Acceptance Criteria

- [ ] `plan = "toString"` returns 400 from both endpoints
- [ ] `plan = "__proto__"` returns 400 from both endpoints
- [ ] `plan = "constructor"` returns 400 from both endpoints
- [ ] Valid plans (`new`, `pro`, `hacker`) still work correctly
- [ ] Test with `plan = null`, `plan = ""`, `plan = undefined`

## Work Log

- 2026-03-15: Identified by security-sentinel agent during code review
