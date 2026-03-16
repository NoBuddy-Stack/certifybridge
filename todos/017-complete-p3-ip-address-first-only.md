---
status: pending
priority: p3
issue_id: "017"
tags: [code-review, logging]
dependencies: []
---

# x-forwarded-for Stored as Full Multi-IP String

## Problem Statement

`api/verify-payment.js` stores the raw `x-forwarded-for` header value as `ipAddress`. This header can contain a comma-separated list of IPs (`"client, proxy1, proxy2"`). Storing the full string means IP-based analysis and blocking won't work correctly.

## Findings

- `api/verify-payment.js:119` — `ipAddress: s(req.headers['x-forwarded-for'] || '', 100) || null`
- `x-forwarded-for` can be multi-value: `"1.2.3.4, 10.0.0.1"`
- On Vercel, the platform sets this header; first value is the real client IP

## Proposed Solution

```js
const rawForwardedFor = req.headers['x-forwarded-for'] || '';
const clientIp = rawForwardedFor.split(',')[0].trim();
// ...
ipAddress: clientIp ? s(clientIp, 45) : null,
```

- **Effort:** Trivial

## Acceptance Criteria

- [ ] `ipAddress` stored as single IP string (e.g., `"1.2.3.4"`) not multi-IP string
- [ ] Same fix in the signature mismatch log at line 79

## Work Log

- 2026-03-15: Identified by security-sentinel agent during code review
