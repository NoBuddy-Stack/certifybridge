---
status: pending
priority: p2
issue_id: "051"
tags: [code-review, security, rate-limiting]
dependencies: []
---

# 051 · No rate limiting on unauthenticated POST endpoints

## Problem Statement

Both /api/create-order and /api/verify-payment accept unlimited unauthenticated POST requests. /api/create-order: an attacker can create thousands of Razorpay orders per minute, exhausting the account's order quota or triggering Razorpay's fraud flags. /api/verify-payment: attacker can flood MongoDB with junk (all fail HMAC but add overhead) or attempt brute-force on signature length/format.

## Findings

- Neither `api/create-order.js` nor `api/verify-payment.js` implement any rate limiting
- No Vercel Edge Middleware exists in the project
- `api/create-order.js` calls `razorpay.orders.create()` on every request — each call consumes Razorpay API quota and creates a real order object in the dashboard
- `api/verify-payment.js` calls `ensureIndexes()` and performs a MongoDB upsert on every request, regardless of HMAC validity
- Razorpay's free/starter tier has undocumented rate limits — bulk order creation could trigger fraud detection or temporary account suspension
- Atlas M0 free tier has 100 operations/second limit — a flood of verify-payment requests can exhaust this even when all fail HMAC

## Proposed Solutions

Add Vercel Edge Middleware with IP-based rate limiting using @upstash/ratelimit + Redis:

```js
// middleware.js (project root)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
});

export async function middleware(request) {
  const ip = request.ip ?? '127.0.0.1';
  const { success, limit, remaining, reset } = await ratelimit.limit(ip);
  if (!success) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(remaining),
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/create-order', '/api/verify-payment'],
};
```

Suggested limits:
- `/api/create-order`: 10 requests/minute per IP
- `/api/verify-payment`: 5 requests/minute per IP

Requires: Upstash Redis instance (free tier available), UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.

## Acceptance Criteria

- Exceeding rate limit returns 429 with `Retry-After` header
- Normal single-user usage (1–3 requests) is unaffected
- Rate limit applies per IP address
- `/api/create-order` allows ~10 req/min per IP
- `/api/verify-payment` allows ~5 req/min per IP
