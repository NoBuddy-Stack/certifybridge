---
status: pending
priority: p1
issue_id: "024"
tags: [code-review, architecture, security]
dependencies: []
---

# 024 · MongoDB records with `plan: "new"` will not match new plan key "noob"

## Problem Statement

The plan key was renamed from `"new"` to `"noob"` (in `lib/plans.js` and throughout the codebase), but any existing MongoDB `applications` documents that were written with the old key `plan: "new"` now contain a stale value. Any code that queries by plan name, generates reports, or re-derives plan details from stored records will silently fail or return wrong results for these old records.

**Why it matters:** There is no migration script. Existing paid applicants who paid under the `"new"` plan have no matching entry in the current plan config — their records reference a plan key that no longer exists anywhere in the application.

## Findings

- `lib/plans.js` previously had key `new: 499` (see git history: commit `7192e11`)
- Current `lib/plans.js` has `noob: 499` — `"new"` key removed
- `api/verify-payment.js` stores `plan: body.plan` verbatim into MongoDB
- Existing records with `plan: "new"` are orphaned — no plan config, no display name
- Frontend cached by any browser or CDN still has old onclick=`pickPlan('new', 499)` until hard-refreshed

**Location:** `lib/plans.js`, `api/verify-payment.js`, MongoDB `applications` collection

## Proposed Solutions

### Option A: MongoDB one-time migration script (Recommended)
Write and run a migration that updates all existing records:

```js
db.applications.updateMany(
  { plan: "new" },
  { $set: { plan: "noob" } }
)
```

Run against production MongoDB before deploying the new code, or in a transaction with the deployment.

**Pros:** Clean data, no backward compat shims needed
**Cons:** Must be run before or atomically with deployment

### Option B: Backward compat alias in plans.js
Add `new: 499` back as an alias that maps to noob pricing, until migration is run.

```js
export const PLAN_AMOUNTS = Object.assign(Object.create(null), {
  noob: 499, new: 499, // temporary alias
  ...
});
```

**Pros:** Buys time, no urgent DB access needed
**Cons:** Perpetuates the stale key, confuses future developers

**Effort:** Small
**Risk:** HIGH — existing paid customers have broken records

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `lib/plans.js`, `api/verify-payment.js`, MongoDB production collection
- **Records at risk:** All applications created before the rename commit (`7192e11`)

## Acceptance Criteria

- [ ] Migration script written and tested against a copy of production data
- [ ] Zero documents with `plan: "new"` remain in the `applications` collection after migration
- [ ] Deployment sequenced: migration runs before new code serves traffic
- [ ] Old plan key `"new"` removed from any remaining backward-compat aliases

## Work Log

- 2026-03-16: Flagged by architecture-strategist agent during code review
