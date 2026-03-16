---
status: pending
priority: p1
issue_id: "004"
tags: [code-review, security, headers]
dependencies: []
---

# Missing HTTP Security Headers — Clickjacking Vulnerability

## Problem Statement

`vercel.json` has no `headers` block. The payment page has no `X-Frame-Options` header, meaning it can be embedded in an `<iframe>` on any attacker-controlled website. A clickjacking attack embeds the Astra Forge payment page in a transparent iframe positioned over a fake "Claim Your Prize" button. The user believes they are clicking on the attacker's button but is actually initiating a real payment.

Additionally, without `Content-Security-Policy`, there is no restriction on which scripts the page can load. Without `X-Content-Type-Options`, browsers may MIME-sniff responses.

## Findings

- `vercel.json` — no `headers` block
- `public/apply.html` — no `<meta http-equiv="X-Frame-Options">`
- Clickjacking requires only that the target page loads in an iframe — this page does
- The Razorpay checkout script (`checkout.razorpay.com`) is loaded from a CDN with full DOM access; CSP would scope this
- Confirmed: no CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy headers served

## Proposed Solutions

### Option A: Add headers block to vercel.json (recommended)
```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
    ]
  },
  {
    "source": "/public/(.*)",
    "headers": [
      {
        "key": "Content-Security-Policy",
        "value": "default-src 'self'; script-src 'self' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://api.razorpay.com; frame-src https://api.razorpay.com; img-src 'self' data:"
      }
    ]
  }
]
```
- **Pros:** Applies to all routes; no code changes needed; Vercel-native
- **Effort:** Small (edit vercel.json)
- **Risk:** Low — test that Razorpay iframe still opens after adding `frame-src https://api.razorpay.com`

### Option B: Meta tags in apply.html
Add `<meta http-equiv="X-Frame-Options" content="DENY">` to the HTML head.
- **Cons:** Meta X-Frame-Options is NOT honored by all browsers (it is a response header concern); less reliable than Option A

## Recommended Action

Option A. The CSP allowlist should be tested with actual Razorpay checkout to ensure no domains are missed.

## Technical Details

- **Affected file:** `vercel.json`
- **OWASP:** A05 Security Misconfiguration

## Acceptance Criteria

- [ ] `X-Frame-Options: DENY` on all responses
- [ ] `Content-Security-Policy` set on `/public/*` — at minimum `frame-ancestors 'none'`
- [ ] `X-Content-Type-Options: nosniff` on all responses
- [ ] Razorpay checkout modal still opens correctly after CSP is applied
- [ ] Verify with browser DevTools Network tab that headers are present

## Work Log

- 2026-03-15: Identified by security-sentinel agent during code review
