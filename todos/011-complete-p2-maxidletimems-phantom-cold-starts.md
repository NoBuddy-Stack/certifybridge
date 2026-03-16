---
status: pending
priority: p2
issue_id: "011"
tags: [code-review, performance, mongodb]
dependencies: []
---

# maxIdleTimeMS:10000 Causes Phantom Cold Starts on Low-Traffic Portal

## Problem Statement

`lib/mongodb.js` sets `maxIdleTimeMS: 10000` (10 seconds). With `minPoolSize: 0`, the MongoDB driver closes the single connection after 10 seconds of no activity.

An internship application portal receives sparse traffic — one application every few minutes to hours. Almost every invocation will find a dead connection in the pool, causing a MongoDB reconnect at the protocol level even on a "warm" Vercel container. This is a phantom cold start: the Vercel function itself is warm (no Node.js bootstrap cost), but the DB socket is dead and must reconnect (~150-350ms).

The correct `maxIdleTimeMS` should align with Vercel's container keep-alive window (~5-15 minutes for Hobby, up to 45 minutes for Pro), not with a 10-second assumption more suited to high-frequency serverless traffic.

## Findings

- `lib/mongodb.js:28` — `maxIdleTimeMS: 10000` (10 seconds)
- With low-traffic portal: nearly every warm request → DB reconnect overhead
- Performance oracle: "raise to 300000 (5 minutes)"
- This does not waste connection slots — the connection is released and reacquired, staying within the M0 500-connection budget

## Proposed Solutions

### Option A: Raise to 300000 (5 minutes)
```js
maxIdleTimeMS: 300000,  // 5 minutes — aligns with Vercel container keep-alive
```
- **Pros:** Single-line fix; keeps connection alive through typical inter-request gaps
- **Effort:** Trivial
- **Risk:** None — M0 connection budget is not affected (still 1 connection per instance)

## Recommended Action

Option A.

## Technical Details

- **Affected file:** `lib/mongodb.js:28`

## Acceptance Criteria

- [ ] `maxIdleTimeMS` is 300000 in `lib/mongodb.js`
- [ ] Verify that warm requests within 5 minutes do NOT trigger a MongoDB reconnect log

## Work Log

- 2026-03-15: Identified by performance-oracle agent during code review
