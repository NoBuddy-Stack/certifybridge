---
status: pending
priority: p3
issue_id: "088"
tags: [code-review, agent-native]
dependencies: []
---

# Expose Admin Schema/Config via API Endpoint

## Problem Statement
Transition rules, valid statuses, plan options, and status labels are hardcoded in both the server (`lib/admin-transitions.js`) and frontend (`admin.html` lines 355-366). Invalid filter values are silently ignored. An agent has no way to discover valid values or allowed transitions without reading source code.

## Findings
- **Source:** agent-native-reviewer (Warnings #4, #5), architecture-strategist (Finding 3B)
- **Multiple agents flagged the frontend/backend constant duplication**

## Proposed Solutions

### Option A: Add GET /api/admin/schema endpoint (Recommended)
Returns `{ plans, statuses, transitions, statusLabels, statusColors, pageSize }`.
Frontend fetches once at login, populates dropdowns dynamically.
- **Pros:** Single source of truth, agent-discoverable, eliminates duplication
- **Cons:** One extra API call on login, one new file
- **Effort:** Small-Medium
- **Risk:** Low

## Acceptance Criteria
- [ ] Endpoint returns all workflow metadata
- [ ] Frontend uses endpoint data instead of hardcoded constants
- [ ] Agent can discover valid filter values and transitions

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | Both agent-native and architecture reviews flagged |

## Resources
- PR branch: `feat/admin-dashboard`
