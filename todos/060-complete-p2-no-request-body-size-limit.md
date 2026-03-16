---
status: pending
priority: p2
issue_id: "060"
tags: [code-review, security, architecture]
dependencies: []
---

# 060 · No request body size limit — 4.5MB payloads parsed before field truncation

## Problem Statement

api/verify-payment.js truncates individual fields after parsing (note capped at 2000 chars at line 129), but Vercel's default body parser accepts up to 4.5MB. A 4MB note field is fully parsed into memory before truncation discards most of it. Under burst requests, this inflates memory per invocation and could cause OOM on constrained serverless.

## Findings

- `api/verify-payment.js:129`: note field truncated to 2000 chars — but only after the full body is parsed into memory
- Vercel's default body parser limit is 4.5MB — an attacker can send a 4MB JSON body that is fully allocated in the Node.js heap before any field-level truncation occurs
- A serverless function handling a 4MB body allocates ~4MB heap per request; under 10 concurrent requests this is 40MB of transient allocation
- `api/create-order.js` has no field truncation at all — a 4.5MB body is fully parsed and fields accessed without any size check
- `api/webhook.js` currently uses the body parser (required for raw body HMAC — see todo-022), further complicating the fix
- The Vercel 4.5MB limit prevents the most extreme abuse but does not protect against moderate amplification attacks

## Proposed Solutions

Add Vercel body parser config to both API handlers:

```js
// api/create-order.js and api/verify-payment.js
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10kb', // form submissions are ~1-3kb; 10kb gives generous headroom
    },
  },
};
```

For webhook.js, disable the body parser entirely and capture the raw body for HMAC verification (also required for todo-022):

```js
// api/webhook.js
export const config = {
  api: {
    bodyParser: false, // must read raw body for HMAC
  },
};
```

Then in webhook.js, accumulate the raw body:
```js
const rawBody = await new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});
```

## Acceptance Criteria

- POST with body > 10kb to /api/create-order returns 413 Payload Too Large
- POST with body > 10kb to /api/verify-payment returns 413 Payload Too Large
- Normal form submissions (~1-3kb) are accepted without error
- webhook.js receives the raw body buffer for HMAC verification (prerequisite for todo-022)
- No OOM errors under burst test with large payloads
