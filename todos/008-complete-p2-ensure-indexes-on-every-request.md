---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, performance, mongodb]
dependencies: []
---

# ensureIndexes() Called on Every Request (Not Just Cold Start)

## Problem Statement

`api/verify-payment.js` calls `ensureIndexes(col)` unconditionally on every payment verification request (line 127). The comment says "idempotent — safe to call on every cold start" but there is no cold-start guard. The function issues two sequential `createIndex` wire commands to Atlas on every request, warm or cold.

MongoDB's `createIndex` is idempotent (no-op if index exists), but it is not free: the driver must send two requests and await two responses. In the Mumbai bom1 → Atlas Mumbai path, each round-trip is ~5–15 ms, so two sequential calls add **10–30 ms of unnecessary latency to every warm payment verification**. For a payment confirmation screen where the user is watching a spinner, this is perceptible.

## Findings

- `api/verify-payment.js:127` — `await ensureIndexes(col)` — unconditional call
- `api/verify-payment.js:168-177` — two sequential `await col.createIndex(...)` calls (not parallelized)
- Comment at line 126: "safe to call on every cold start" — the intent was cold-start-only, the implementation is every-request
- Performance analysis: +10–30 ms per warm request, +2 MongoDB ops per verification

## Proposed Solutions

### Option A: Module-level boolean flag (minimal fix)
```js
let indexesEnsured = false;

async function ensureIndexes(col) {
  if (indexesEnsured) return;
  await Promise.all([
    col.createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true, name: 'razorpayOrderId_unique' }),
    col.createIndex({ email: 1 }, { name: 'email_lookup' }),
  ]);
  indexesEnsured = true;
}
```
Combine with parallelizing the two `createIndex` calls using `Promise.all` — reduces cold-start setup time by ~50%.
- **Pros:** Minimal change; correct behavior (once per container lifetime); also parallelizes the cold-start path
- **Effort:** Small
- **Risk:** None

### Option B: Move to `lib/mongodb.js` connection init
Call `ensureIndexes` inside the MongoDB connection setup, after `client.connect()`.
- **Pros:** Index creation co-located with connection management (separation of concerns)
- **Cons:** `lib/mongodb.js` becomes collection-aware (knows about `astra_forge.applications`); slightly less cohesive
- **Effort:** Small-Medium
- **Risk:** Low

## Recommended Action

Option A — smallest correct fix. Combine with `Promise.all` for the parallel benefit.

## Technical Details

- **Affected file:** `api/verify-payment.js:127`, `api/verify-payment.js:168-177`

## Acceptance Criteria

- [ ] Cold start: `ensureIndexes` runs exactly once (two `createIndex` calls)
- [ ] Warm request: `ensureIndexes` is skipped (zero `createIndex` calls)
- [ ] The two `createIndex` calls run in parallel (not sequential)
- [ ] Indexes still exist in Atlas after the fix (verify via Atlas UI)

## Work Log

- 2026-03-15: Identified by performance-oracle and architecture-strategist agents
