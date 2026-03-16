---
status: pending
priority: p1
issue_id: "041"
tags: [code-review, performance, razorpay, ux]
dependencies: []
---

# 041 · /api/config fetch races with user clicking Pay — Razorpay key may be empty string

## Problem Statement
`public/apply.html:587–591` fires `fetch('/api/config')` as a fire-and-forget IIFE at script evaluation. `CFG.RAZORPAY_KEY` starts as `''`. If the user reaches Step 3 and clicks "Pay Now" before the config fetch resolves (common on slow connections or cold-start serverless), `new Razorpay({ key: '' })` is called with an empty key. The Razorpay SDK will silently fail or throw a cryptic error, blocking payment with no user-facing explanation.

**Why it matters:** This is a revenue-blocking bug on cold starts and slow connections. The /api/config endpoint itself may cold-start at 800ms–1.5s.

## Findings
- `apply.html:588`: `fetch('/api/config').then(r=>r.json()).then(d=>{CFG.RAZORPAY_KEY=d.razorpayKeyId||'';})` — fire-and-forget, no await
- `apply.html:587`: `CFG.RAZORPAY_KEY` initializes as `''`
- `apply.html` line ~720: `handlePay()` calls `new Razorpay({key:CFG.RAZORPAY_KEY,...})` — if still `''`, payment fails
- No guard in `handlePay()` checks that the key is loaded before opening the modal

## Proposed Solutions

### Option A: Inline key via meta tag at deploy time (Recommended — eliminates the serverless hop)
In `vercel.json` build step or a simple HTML template, inject the public key:
```html
<meta name="rzp-key" content="rzp_live_XXXXXXXXXX">
```
```js
CFG.RAZORPAY_KEY = document.querySelector('meta[name="rzp-key"]').content || '';
```
Removes the `/api/config` round-trip entirely. The Razorpay Key ID is public (it goes to the browser anyway).

### Option B: Disable the Pay button until config loads
```js
document.getElementById('payBtn').disabled = true;
fetch('/api/config').then(r=>r.json()).then(d=>{
  CFG.RAZORPAY_KEY = d.razorpayKeyId || '';
  document.getElementById('payBtn').disabled = false;
});
```
Safe but adds UI friction.

### Option C: Guard in handlePay()
```js
if (!CFG.RAZORPAY_KEY) {
  showPayErr('Payment configuration is loading. Please try again in a moment.');
  return;
}
```
Bandaid — user must retry manually.

## Acceptance Criteria
- [ ] Clicking Pay immediately after page load opens Razorpay with a valid key
- [ ] No scenario produces `new Razorpay({ key: '' })`
- [ ] Cold start latency does not block payment initiation
