---
status: pending
priority: p2
issue_id: "029"
tags: [code-review, security]
dependencies: []
---

# 029 · CSP would block all inline scripts in apply.html

## Problem Statement

`apply.html` contains all its JavaScript inline in a `<script>` block. If a Content Security Policy (CSP) header is added to the Vercel deployment with `script-src 'self'` (the correct secure default), all inline scripts will be blocked and the entire form will break silently. The current absence of a CSP is itself a security gap; adding one correctly requires extracting all inline JS first.

**Why it matters:** CSP is a primary XSS mitigation. The project cannot adopt it without a large refactor of `apply.html`. This creates a chicken-and-egg situation that defers a critical security control.

## Findings

- All JavaScript in `public/apply.html` is inline (single large `<script>` block, ~400 lines)
- No `Content-Security-Policy` header currently configured in `vercel.json`
- Inline event handlers (`onclick`, `onchange`) present in HTML attributes — also blocked by strict CSP
- Razorpay checkout modal requires `frame-src` and `connect-src` additions to any CSP

**Location:** `public/apply.html` (entire script section), `vercel.json` (missing CSP headers)

## Proposed Solutions

### Option A: Extract inline JS to `public/apply.js` (Recommended)
Move all `<script>` content to a separate file. Replace inline event handlers with `addEventListener` calls. Then add CSP header in `vercel.json`:

```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [{
      "key": "Content-Security-Policy",
      "value": "default-src 'self'; script-src 'self' https://checkout.razorpay.com; frame-src https://api.razorpay.com; connect-src 'self' https://api.razorpay.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;"
    }]
  }]
}
```

**Pros:** Enables CSP adoption, cleaner separation, removes inline event handlers
**Cons:** Medium refactor effort — inline handlers must become addEventListener calls

### Option B: Use CSP nonce (stopgap)
Generate a per-request nonce in a server-rendered page. Not applicable here since apply.html is a static file served by Vercel CDN.

**Effort:** Medium (Option A)
**Risk:** Medium if deferred — XSS protection remains absent

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `public/apply.html`, `vercel.json`

## Acceptance Criteria

- [ ] All JavaScript extracted to `public/apply.js`
- [ ] No inline `onclick`/`onchange` handlers remain in HTML
- [ ] CSP header added to `vercel.json` covering scripts, frames, and connect
- [ ] Form works correctly with CSP active (test in browser with CSP violation reporting)

## Work Log

- 2026-03-16: Flagged by security-sentinel agent during code review
