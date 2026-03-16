---
status: pending
priority: p2
issue_id: "056"
tags: [code-review, performance, mongodb, serverless]
dependencies: []
---

# 056 · MongoDB maxIdleTimeMS:300000 too long — connections held open past Vercel function freeze

## Problem Statement

lib/mongodb.js maxIdleTimeMS is 300000ms (5 minutes). Vercel freezes inactive serverless functions after ~30 seconds of no requests. The MongoDB connection is held open by the server-side keep-alive for 5 minutes after the function freezes, consuming one of Atlas M0's 500 connection slots unnecessarily. Under burst traffic (multiple cold starts), this accumulates idle connections that block new ones.

## Findings

- `lib/mongodb.js`: `maxIdleTimeMS: 300000` (5 minutes)
- Vercel serverless functions are frozen ~30 seconds after the last request; the Node.js process is suspended but the TCP connection to Atlas remains open from Atlas's perspective
- Atlas M0 free tier: maximum 500 connections
- Each frozen Vercel function instance holds one connection slot for up to 5 minutes after last activity
- Under moderate traffic (e.g. 50 concurrent cold starts during a campaign), 50 × 5-minute idle connections = 250 slots consumed, leaving only 250 for active traffic
- MongoDB Atlas closes connections server-side after the maxIdleTimeMS period, but 5 minutes is far beyond the Vercel function lifecycle
- The cached `clientPromise` pattern in lib/mongodb.js is correct for connection reuse within a function lifetime; the issue is the idle timeout being too long for the serverless lifecycle

## Proposed Solutions

Reduce maxIdleTimeMS to align with the Vercel container lifecycle:

```js
// Before
maxIdleTimeMS: 300000,

// After
maxIdleTimeMS: 60000, // 1 minute — aligns with ~30s Vercel freeze + buffer
```

A value of 60000ms (1 minute) ensures Atlas reclaims the connection slot within 1 minute of the function freezing, rather than 5 minutes.

Optionally also reduce `serverSelectionTimeoutMS` if set, and ensure `connectTimeoutMS` is appropriate for cold-start latency.

## Acceptance Criteria

- `maxIdleTimeMS` set to 60000 (or lower) in lib/mongodb.js
- After 1 minute of no requests, Atlas connection count metric returns to baseline
- No increase in connection errors or cold-start failures after the change
- Verified via Atlas monitoring: connection count drops within 60–90 seconds of traffic stopping
