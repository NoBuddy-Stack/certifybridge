---
status: pending
priority: p2
issue_id: "048"
tags: [code-review, security, csp]
dependencies: []
---

# 048 · CSP missing form-action, base-uri, and object-src directives

## Problem Statement

vercel.json CSP header is missing three directives. (1) `form-action 'self'` — without it, default-src does not restrict form POST targets in all browsers; a DOM XSS injecting a `<form>` could exfiltrate data. (2) `base-uri 'self'` — without it, an injected `<base href="https://evil.com">` repoints all relative fetch() calls including /api/create-order to an attacker's server. (3) `object-src 'none'` — allows `<object>`/`<embed>` arbitrary content execution.

## Findings

- `vercel.json` CSP header contains: `default-src`, `script-src`, `style-src`, `font-src`, `img-src`, `connect-src`, `frame-src`
- `form-action` is not inherited from `default-src` in Firefox and some other browsers — it must be explicit
- `base-uri` is never inherited from `default-src` in any browser — an injected `<base>` tag would silently redirect all relative URLs
- `object-src` defaults to `default-src` value but should be explicitly `'none'` since the application uses no plugins
- The apply.html form POSTs to /api/create-order and /api/verify-payment via fetch() — a base-uri injection would redirect these to an attacker-controlled server, intercepting payment data

## Proposed Solutions

Add the three missing directives to the CSP value in vercel.json:

```json
"form-action 'self'; base-uri 'self'; object-src 'none'"
```

Appended to the existing CSP string. Full resulting CSP should include all existing directives plus these three.

## Acceptance Criteria

- CSP header contains `form-action 'self'`
- CSP header contains `base-uri 'self'`
- CSP header contains `object-src 'none'`
- Verified with securityheaders.com or equivalent tool showing no warnings for these directives
- Existing functionality (Razorpay checkout, Google Fonts) unaffected
