---
status: pending
priority: p2
issue_id: "052"
tags: [code-review, security, email, reliability]
dependencies: []
---

# 052 · FROM_EMAIL fallback is onboarding@resend.dev — shared sandbox domain in production

## Problem Statement

verify-payment.js:231: `process.env.FROM_EMAIL || 'onboarding@resend.dev'`. If FROM_EMAIL is not set, all confirmation emails are sent from Resend's public sandbox domain. (1) Emails land in spam — students miss confirmations. (2) The reply_to is contact@certifybridge.com creating a mismatch that worsens spam scoring. (3) Resend may reject or throttle sandbox sends in production.

## Findings

- `verify-payment.js:231`: `from: process.env.FROM_EMAIL || 'onboarding@resend.dev'`
- `verify-payment.js:228` (approximately): `reply_to: 'contact@certifybridge.com'` — domain mismatch with sandbox from address
- `onboarding@resend.dev` is a shared Resend sandbox address used by all developers during testing; it has no relationship to certifybridge.com
- Major spam filters (Gmail, Outlook) score mismatched From/Reply-To domains negatively
- Resend's production sending requires a verified custom domain; sandbox sends from resend.dev may be blocked or rate-limited for non-sandbox accounts
- A misconfigured deployment silently sends from a stranger's-looking address with no operator alert (compounded by todo-047 — no RESEND_API_KEY guard either)

## Proposed Solutions

Remove the fallback entirely and require FROM_EMAIL to be set:

```js
// Before
from: process.env.FROM_EMAIL || 'onboarding@resend.dev',

// After
const fromEmail = process.env.FROM_EMAIL;
if (!fromEmail) throw new Error('[verify-payment] FROM_EMAIL is not configured.');
// ...
from: fromEmail,
```

Alternatively, validate at module load time alongside the RESEND_API_KEY guard (todo-047) for a single consolidated credential check.

## Acceptance Criteria

- Deploying without FROM_EMAIL causes a clear startup or runtime error visible in logs
- No fallback to onboarding@resend.dev or any other shared sandbox address
- Confirmation emails are sent from the configured domain only
- reply_to and from domains are consistent (both certifybridge.com)
