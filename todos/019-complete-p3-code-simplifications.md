---
status: pending
priority: p3
issue_id: "019"
tags: [code-review, quality, simplicity]
dependencies: ["009"]
---

# Code Simplification Opportunities

## Problem Statement

Several low-impact simplifications were identified that reduce noise and improve maintainability. None are bugs, but they accumulate to make the codebase slightly harder to read than it needs to be.

## Findings and Fixes

### 1. Dead `fullName` variable in `sendConfirmationEmail`
**File:** `api/verify-payment.js` inside `sendConfirmationEmail()`
```js
const fullName = `${firstName} ${lastName}`.trim();  // computed, never used
```
**Fix:** Delete the line.

### 2. `payment_capture: 1` is the Razorpay default for INR
**File:** `api/create-order.js:69`
```js
payment_capture: 1,  // default — remove
```
**Fix:** Remove the line.

### 3. Status code range clamp is overly defensive
**File:** `api/create-order.js` in catch block
```js
res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500)
// simpler:
res.status(statusCode || 500)
```
Razorpay SDK only surfaces 4xx codes. The range check implies out-of-range codes are possible from Razorpay, which they are not.

### 4. Double sanitization of fields before email
**File:** `api/verify-payment.js:147-161`
`s()` is called again on raw `req.body` values when building the email payload, even though sanitized values already exist in `doc`. Pass `doc.firstName`, `doc.email`, etc. to `sendConfirmationEmail` instead.

### 5. `getRazorpay()` lazy wrapper (combine with todo 009)
**File:** `api/create-order.js:29-41`
The lazy init pattern (`let razorpay; function getRazorpay()`) can be replaced with direct module-level instantiation. If credentials are missing, a module-level throw is clearer and fails at cold start rather than at first request.

### 6. `maxPoolSize` in `.env.example` URI string
**File:** `.env.example:19`
`maxPoolSize=1` appears both in the URI string and in `lib/mongodb.js` options object. Remove it from the URI string — the options object is the authoritative source.

### 7. Extract `sendConfirmationEmail` to `lib/email.js`
The function is 170+ lines buried inside `verify-payment.js`. Moving it to its own module makes both files independently testable and readable.

## Acceptance Criteria

- [ ] `fullName` variable removed from `sendConfirmationEmail`
- [ ] `payment_capture: 1` removed from order creation payload
- [ ] Status code clamp simplified
- [ ] `sendConfirmationEmail` receives `doc` values (not re-sanitized raw values)
- [ ] `maxPoolSize` removed from `.env.example` URI string
- [ ] (Optional) `sendConfirmationEmail` extracted to `lib/email.js`

## Work Log

- 2026-03-15: Identified by code-simplicity-reviewer agent during code review
