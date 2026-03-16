---
status: pending
priority: p3
issue_id: "069"
tags: [code-review, performance, vercel, config]
dependencies: []
---

# 069 · maxDuration:10 applied to all functions including near-instant config and health endpoints

## Problem Statement

vercel.json sets maxDuration:10 globally. api/config.js and api/health.js should respond in <10ms (synchronous env read or fast MongoDB ping). Setting maxDuration:10 means a hung config request holds a Vercel invocation slot for 10 full seconds — blocking the Razorpay key from loading during that window. Billing on Vercel Pro is per GB-second; a hung config invocation wastes up to 10x the minimum billing unit.

## Findings

- vercel.json applies maxDuration:10 at the top level, affecting all API functions
- api/config.js performs a synchronous environment variable read with no I/O — should complete in <10ms
- api/health.js performs a lightweight MongoDB ping — should complete in <100ms
- A hung config invocation blocks the frontend Razorpay key fetch for the full 10s timeout
- Vercel Pro billing is per GB-second; overlong timeouts on fast functions increase cost on failures

## Proposed Solutions

Scope maxDuration per function in vercel.json:

```json
"functions": {
  "api/config.js":          { "maxDuration": 3  },
  "api/health.js":          { "maxDuration": 5  },
  "api/create-order.js":    { "maxDuration": 10 },
  "api/verify-payment.js":  { "maxDuration": 10 },
  "api/webhook.js":         { "maxDuration": 10 }
}
```

## Acceptance Criteria

- config.js and health.js have maxDuration:3 and 5 respectively
- Payment functions (create-order, verify-payment, webhook) retain maxDuration:10
