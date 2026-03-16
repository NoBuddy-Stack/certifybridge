---
status: pending
priority: p2
issue_id: "053"
tags: [code-review, security, configuration, ux]
dependencies: []
---

# 053 · Placeholder WhatsApp number 919999999999 hardcoded in shipped HTML

## Problem Statement

apply.html:587: `var CFG = { ..., WA:'919999999999' }`. This placeholder number is never overridden from the server (only RAZORPAY_KEY is fetched from /api/config). After a successful payment, the WhatsApp link points to an unknown third-party number — a student who clicks it contacts a stranger. The server already has WHATSAPP_NUMBER in env (used in email at verify-payment.js:228) but the frontend does not consume it.

## Findings

- `apply.html:587`: `WA:'919999999999'` — obvious placeholder, not a real number
- `apply.html` fetches `/api/config` at startup and sets `CFG.RAZORPAY_KEY` from the response, but does not set `CFG.WA`
- `verify-payment.js:228` (approximately): `process.env.WHATSAPP_NUMBER` is used in confirmation emails — the env var exists but is not exposed via the API
- `/api/config` currently returns only `{ razorpayKeyId }` — no whatsappNumber or supportEmail
- The WhatsApp link is shown in the post-payment success modal — the moment a student has just paid, they may click to join the group and reach an unknown number
- Security risk: a student trusts the payment confirmation screen; directing them to a wrong number enables social engineering / scam scenarios

## Proposed Solutions

**Step 1 — Expose via /api/config:**
```js
// api/config.js
res.json({
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  whatsappNumber: process.env.WHATSAPP_NUMBER || null,
  supportEmail: process.env.SUPPORT_EMAIL || null,
});
```

**Step 2 — Consume in apply.html config fetch:**
```js
const cfg = await res.json();
CFG.RAZORPAY_KEY = cfg.razorpayKeyId;
CFG.WA = cfg.whatsappNumber; // null if not configured
```

**Step 3 — Conditional WhatsApp link rendering:**
```js
// Only render WhatsApp link if CFG.WA is truthy
if (CFG.WA) { /* render wa.me link */ }
```

**Step 4 — Remove hardcoded '919999999999' from apply.html.**

## Acceptance Criteria

- `CFG.WA` is populated from `process.env.WHATSAPP_NUMBER` via `/api/config`
- Hardcoded `919999999999` is removed from apply.html
- Missing `WHATSAPP_NUMBER` env var results in no WhatsApp link rendered (not a fake number)
- `/api/config` response includes `whatsappNumber` and `supportEmail` fields
