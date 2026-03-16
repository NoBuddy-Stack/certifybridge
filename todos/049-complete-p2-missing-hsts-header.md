---
status: pending
priority: p2
issue_id: "049"
tags: [code-review, security, hsts]
dependencies: []
---

# 049 · No Strict-Transport-Security header on a payment portal

## Problem Statement

vercel.json sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, but no HSTS. Without HSTS, a user visiting http:// before HTTPS is established is vulnerable to SSL stripping. Razorpay sends the payment ID and signature back to the client over the browser's connection — this is a meaningful risk on a payment portal.

## Findings

- `vercel.json` global headers block includes: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- No `Strict-Transport-Security` header present
- Vercel serves all production deployments over HTTPS, but without HSTS the browser will attempt HTTP first on the initial visit if the user types the URL without the scheme
- SSL stripping attacks intercept the HTTP→HTTPS redirect, allowing a MITM attacker to observe the payment ID and Razorpay signature sent back from checkout
- HSTS is especially important for a payment portal handling real financial transactions

## Proposed Solutions

Add to the global headers array in vercel.json:

```json
{
  "key": "Strict-Transport-Security",
  "value": "max-age=63072000; includeSubDomains; preload"
}
```

- `max-age=63072000` = 2 years (minimum for HSTS preload list submission)
- `includeSubDomains` protects all subdomains
- `preload` enables submission to the browser HSTS preload list for zero-trust-on-first-visit protection

Note: Once submitted to the preload list, removing HSTS requires a lengthy delisting process. Ensure HTTPS is stable before enabling preload.

## Acceptance Criteria

- All responses include `Strict-Transport-Security` header with `max-age` >= 31536000 (1 year)
- Header includes `includeSubDomains`
- Verified in browser DevTools > Network > Response Headers
- No HTTP-accessible endpoints remain (Vercel enforces this by default)
