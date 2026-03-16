---
status: pending
priority: p1
issue_id: "005"
tags: [code-review, architecture, deployment]
dependencies: []
---

# Razorpay Public Key is Hardcoded Placeholder in apply.html

## Problem Statement

`public/apply.html` contains the Razorpay public key ID as a hardcoded placeholder:
```js
RAZORPAY_KEY: 'YOUR_RAZORPAY_KEY_ID',
```

There is no build step, no environment variable injection, and no CI check to enforce this is updated before deployment. If the deployment checklist is missed, the Razorpay checkout modal will fail to open in production with no helpful error message to the user (Razorpay silently rejects an invalid key ID).

The private key (`RAZORPAY_KEY_SECRET`) is correctly kept server-side. The public key ID (`RAZORPAY_KEY_ID`) is safe to expose — the issue is that the deployment process depends on human memory rather than automation.

## Findings

- `public/apply.html` — `RAZORPAY_KEY: 'YOUR_RAZORPAY_KEY_ID'` (placeholder value)
- No build script in `package.json` to perform substitution
- The plan document notes this as a manual step: "Update `RAZORPAY_KEY_ID` in `public/apply.html`"
- `RAZORPAY_KEY_ID` is already in `.env.example` and Vercel environment variables

## Proposed Solutions

### Option A: Fetch from a `/api/config` endpoint (zero build-step)
Add a lightweight serverless function:
```js
// api/config.js
export default function handler(req, res) {
  return res.status(200).json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  });
}
```
In `apply.html`, fetch this on page load before showing the pay button:
```js
const { razorpayKeyId } = await fetch('/api/config').then(r => r.json());
CFG.RAZORPAY_KEY = razorpayKeyId;
```
- **Pros:** Key is always correct in all environments (test, staging, production); no manual step; no build tooling needed
- **Cons:** Extra HTTP request on page load (negligible; can be parallelized with form render)
- **Effort:** Small
- **Risk:** Low

### Option B: Manual replacement with pre-deploy check reminder
Keep the current approach but add a comment check and document it explicitly.
- **Cons:** Still relies on human memory; fragile for multi-environment deployments
- **Effort:** Minimal
- **Risk:** Medium (deployment mistake = broken payments)

### Option C: Build script with `envsubst` or `sed` replacement
Add an npm `build` script that substitutes `YOUR_RAZORPAY_KEY_ID` with `$RAZORPAY_KEY_ID`.
- **Pros:** Works well in CI/CD pipelines
- **Cons:** Requires Vercel to run a build command; adds complexity for a currently static site
- **Effort:** Small-Medium
- **Risk:** Low

## Recommended Action

Option A — simplest, no build tooling, works immediately in all environments.

## Technical Details

- **Affected file:** `public/apply.html` (CFG object, Razorpay init line)
- **New file:** `api/config.js`

## Acceptance Criteria

- [ ] Deploying to Vercel test environment automatically uses `rzp_test_*` key
- [ ] Deploying to Vercel production automatically uses `rzp_live_*` key
- [ ] No manual HTML edit required as part of the deployment checklist
- [ ] Razorpay modal opens correctly in both environments without touching apply.html

## Work Log

- 2026-03-15: Identified by architecture-strategist agent during code review
