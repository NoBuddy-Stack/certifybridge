---
status: pending
priority: p2
issue_id: "027"
tags: [code-review, performance]
dependencies: []
---

# 027 · Razorpay SDK loaded render-blocking in `<head>`

## Problem Statement

`public/apply.html` loads `https://checkout.razorpay.com/v1/checkout.js` as a synchronous `<script>` in the `<head>`. This blocks HTML parsing and page render until the external Razorpay CDN responds. The Razorpay script is only needed when a user reaches Step 3 (payment), but it delays the initial load for every visitor — including those who never complete the form.

## Findings

- Razorpay script in `<head>` with no `defer` or `async` attribute
- Script is ~150 KB from an external CDN
- First Contentful Paint and Time to Interactive are delayed for all users
- Script is referenced only in `handlePay()` which is called at Step 3

**Location:** `public/apply.html` `<head>` section

## Proposed Solutions

### Option A: Lazy-load Razorpay in `handlePay()` (Recommended)
Remove the `<script>` tag from `<head>` and inject it dynamically when the user is about to pay:

```js
async function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function handlePay() {
  await loadRazorpay();
  // ... existing payment code
}
```

**Pros:** No render block, script only loads when needed, ~150 KB saved on non-paying sessions
**Cons:** Tiny delay at payment step (first load only; can preload on step 2 completion)

### Option B: Add `defer` attribute
Change `<script src="...">` to `<script src="..." defer>`.

**Pros:** One-character fix, non-blocking
**Cons:** Script still downloads on every page load (wasted bandwidth for dropoffs)

**Effort:** Small
**Risk:** Low — performance improvement only

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `public/apply.html` (`<head>` script tag + `handlePay()` function)

## Acceptance Criteria

- [ ] Razorpay script not present in initial HTML `<head>`
- [ ] Script loads without error before payment modal opens
- [ ] Page load with Lighthouse shows no render-blocking resources from Razorpay

## Work Log

- 2026-03-16: Flagged by performance-oracle agent during code review
