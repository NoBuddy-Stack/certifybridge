---
status: pending
priority: p2
issue_id: "083"
tags: [code-review, agent-native]
dependencies: []
---

# PATCH Response Does Not Return Updated Document

## Problem Statement
The PATCH `/api/admin/applications/:id` response is `{ success: true, emailSent: boolean }`. An agent cannot confirm the new state without a separate request. The UI works around this by reloading the full list, but an agent needs to see the resulting `adminStatus` and `statusUpdatedAt` to proceed.

## Findings
- **Source:** agent-native-reviewer (Warning #1)
- **Location:** `api/admin/applications/[id].js:159-162`

## Proposed Solutions

### Option A: Return updated fields in response (Recommended)
Add key fields to the 200 response: `{ success, emailSent, application: { _id, adminStatus, statusUpdatedAt } }`.
- **Effort:** Small (use `findOneAndUpdate` with `returnDocument: 'after'`, or just return the known values)
- **Risk:** None

## Acceptance Criteria
- [ ] PATCH 200 response includes at minimum `_id`, `adminStatus`, `statusUpdatedAt`
- [ ] Frontend still works (it ignores extra fields)

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | Agents need state confirmation in mutation responses |

## Resources
- PR branch: `feat/admin-dashboard`
