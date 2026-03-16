---
status: pending
priority: p3
issue_id: "066"
tags: [code-review, security, xss, validation]
dependencies: []
---

# 066 · x-forwarded-for IP not validated before DB storage — potential stored XSS in admin UI

## Problem Statement

verify-payment.js:89: `(req.headers['x-forwarded-for'] || '').split(',')[0].trim()` extracts the first IP value and passes it through s() which strips \r\n\t but does not validate it as a valid IP address. A forged `X-Forwarded-For: <script>alert(1)</script>, 1.2.3.4` would be stored in MongoDB as `<script>alert(1)</script>`. If ipAddress is ever rendered in an admin dashboard without HTML escaping, this becomes a stored XSS.

## Findings

- verify-payment.js:89 reads the raw X-Forwarded-For header and takes the first comma-separated segment
- The s() sanitizer strips control characters (\r\n\t) but does not validate IP address format
- Arbitrary strings including HTML/script content can be stored as ipAddress in MongoDB
- Any admin UI rendering ipAddress without escaping is vulnerable to stored XSS

## Proposed Solutions

Add IP format validation after extraction:

```js
const ipRaw = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
const clientIp = /^[\d.:a-fA-F]{1,45}$/.test(ipRaw) ? ipRaw : null;
```

This accepts valid IPv4 and IPv6 addresses and stores null for anything else.

## Acceptance Criteria

- Non-IP values in X-Forwarded-For are stored as null
- Valid IPv4 and IPv6 addresses are stored correctly
