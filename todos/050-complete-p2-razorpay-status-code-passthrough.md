---
status: pending
priority: p2
issue_id: "050"
tags: [code-review, security, api-design]
dependencies: []
---

# 050 · Razorpay upstream statusCode passed through verbatim to client

## Problem Statement

api/create-order.js:70-73: `const statusCode = err.statusCode || 500` then `res.status(statusCode || 500)`. Razorpay errors can return 401 (invalid key) or 403 (account suspended). Passing the upstream status code verbatim leaks information about the payment gateway's internal error classification — attackers can probe to infer Razorpay account health and configuration.

## Findings

- `api/create-order.js:70`: `const statusCode = err.statusCode || 500`
- `api/create-order.js:73`: `res.status(statusCode || 500)` — double-evaluation is redundant since statusCode is already guaranteed non-falsy by line 70
- A 401 response from Razorpay (invalid API key) is forwarded as HTTP 401 to the browser, leaking that the key is invalid
- A 403 response (account suspended/blocked) is forwarded as HTTP 403, leaking account suspension status
- An attacker can probe the endpoint to infer gateway configuration and account health without any authentication
- The redundant `statusCode || 500` on line 73 is dead code since the assignment on line 70 already guarantees a truthy value

## Proposed Solutions

Map upstream Razorpay error codes to safe client-facing status codes:

```js
// Before
const statusCode = err.statusCode || 500;
return res.status(statusCode || 500).json({ error: message });

// After
const clientStatus = (err.statusCode >= 400 && err.statusCode < 500) ? 400 : 503;
return res.status(clientStatus).json({ error: message });
```

This mapping:
- Razorpay 4xx (client-side input errors like invalid amount) → 400 Bad Request
- Razorpay 401, 403, 5xx (gateway/account issues) → 503 Service Unavailable
- Hides whether the failure is a key problem, account suspension, or upstream outage

## Acceptance Criteria

- A Razorpay 401 error returns 503 to the client, not 401
- A Razorpay 403 error returns 503 to the client, not 403
- A Razorpay 400 error returns 400 to the client
- Error message is still surfaced in the response body for debugging
- Redundant `statusCode || 500` double-evaluation is removed
