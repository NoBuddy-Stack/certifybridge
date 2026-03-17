---
status: pending
priority: p2
issue_id: "090"
tags: [code-review, security, performance]
dependencies: []
---

# Rate Limiter Has Unbounded Memory Growth

## Problem Statement
The in-memory rate limiter (`lib/rate-limit.js`) stores hit timestamps in a Map keyed by `${key}:${ip}`. Old entries are filtered on read but the Map is never pruned. Under sustained scanning or DDoS, unique IPs inflate the Map until the container is killed.

## Findings
- **Source:** security-sentinel re-review (Finding #2)
- **Location:** `lib/rate-limit.js:14-34`

## Proposed Solutions

### Option A: Periodic eviction (Recommended)
After every Nth call, sweep the Map and delete entries with no recent hits.
- **Effort:** Small
- **Risk:** None

### Option B: Cap Map size
Reject requests when Map exceeds a threshold.
- **Effort:** Small
- **Risk:** Could false-positive under legitimate high traffic

## Acceptance Criteria
- [ ] Rate limiter Map does not grow unbounded
- [ ] Stale entries are evicted

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from re-review | Serverless mitigates via container recycling but not sufficient |
