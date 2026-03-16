---
status: pending
priority: p3
issue_id: "016"
tags: [code-review, security, rate-limiting]
dependencies: []
---

# No Rate Limiting on API Endpoints

## Problem Statement

No IP-based rate limiting exists on `/api/create-order` or `/api/verify-payment`. A script can create unlimited Razorpay orders (quota abuse, dashboard pollution) or hammer the verify endpoint (MongoDB load, log noise). Low urgency for an internship portal but important before any public exposure.

## Findings

- No rate limiting code in either handler
- No Vercel Edge Middleware
- HMAC verification protects against forged verifications, but not volumetric abuse

## Proposed Solutions

### Option A: Vercel Edge Middleware with @upstash/ratelimit
```js
// middleware.js
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
});
```
- Requires Upstash account (free tier: 10k requests/day)
- **Effort:** Medium

### Option B: Simple in-memory rate limiter (no external service)
Use a Map keyed on IP with a sliding window counter. Works per-container-instance only (not distributed), but sufficient for low-traffic portals.
- **Effort:** Medium
- **Risk:** Does not work across multiple Vercel instances

## Recommended Action

Option A for production. Option B as a quick interim measure.

## Acceptance Criteria

- [ ] IP sending >10 requests/minute to `/api/create-order` receives 429
- [ ] IP sending >5 requests/minute to `/api/verify-payment` receives 429
- [ ] Normal single-submission flow is not affected

## Work Log

- 2026-03-15: Identified by security-sentinel agent during code review
