---
status: pending
priority: p3
issue_id: "072"
tags: [code-review, mongodb, error-handling, observability]
dependencies: []
---

# 072 · MongoDB client.connect() called at module load with no error boundary in production

## Problem Statement

lib/mongodb.js production path calls client.connect() synchronously during module import. If connection fails (Atlas outage, bad URI, DNS error), the rejection is unhandled at ESM top-level evaluation time, crashing the function with a generic 500 rather than a meaningful diagnostic. There is no .catch() to produce a useful log message on cold start failure.

## Findings

- lib/mongodb.js calls client.connect() at module load time on the production code path
- No .catch() handler is attached to the returned promise
- An Atlas outage, malformed MONGODB_URI, or DNS failure produces an unhandled rejection
- The Vercel function crashes with a generic 500 with no log entry indicating the root cause
- Cold start failures are currently invisible in Vercel function logs

## Proposed Solutions

Attach an error handler to the connect promise to surface failures in logs before the crash:

```js
clientPromise = client.connect().catch(err => {
  console.error('[mongodb] Cold-start connection failed:', err.message);
  throw err;
});
```

The function still returns 500, but the root cause is now visible in Vercel logs.

## Acceptance Criteria

- An Atlas outage during cold start produces a clear log entry: '[mongodb] Cold-start connection failed: ...'
- The function still returns HTTP 500 to the caller
- The root cause is visible in Vercel function logs without needing to inspect raw Node error output
