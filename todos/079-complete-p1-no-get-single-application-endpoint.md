---
status: pending
priority: p1
issue_id: "079"
tags: [code-review, architecture, agent-native]
dependencies: []
---

# No GET Single Application Endpoint

## Problem Statement
The PATCH handler at `api/admin/applications/[id].js` rejects GET requests with 405. The UI's detail panel reads from cached list data (`currentApps[idx]`), but an agent that knows an application ID has no way to fetch its full record without paginating through the list. This is a **context parity violation** — the human clicks a row and sees everything; the agent must scan pages.

## Findings
- **Source:** agent-native-reviewer
- **Location:** `api/admin/applications/[id].js:24-27`
- **Evidence:** `if (req.method !== 'PATCH')` returns 405 with `Allow: PATCH`

## Proposed Solutions

### Option A: Add GET branch to [id].js (Recommended)
Add a `req.method === 'GET'` branch that returns the document (minus sensitive projections). The `findOne` call already exists in the PATCH handler.
- **Pros:** Single-file change, reuses existing code pattern
- **Cons:** Makes the handler dual-purpose (GET + PATCH)
- **Effort:** Small
- **Risk:** Low

### Option B: Separate GET handler file
Create `api/admin/applications/[id]/index.js` for GET.
- **Pros:** Single-responsibility
- **Cons:** More files, Vercel routing may not support nested dynamic routes cleanly
- **Effort:** Medium
- **Risk:** Medium (routing complexity)

## Recommended Action
<!-- Filled during triage -->

## Technical Details
- **Affected files:** `api/admin/applications/[id].js`
- Include `allowedTransitions` array in GET response so agents know valid next statuses
- Apply same PROJECTION as applications.js (exclude ipAddress, consentTimestamp, razorpaySignature)
- Update Allow header to `GET, PATCH`

## Acceptance Criteria
- [ ] `GET /api/admin/applications/:id` returns single application with auth
- [ ] Response includes `allowedTransitions` array
- [ ] Sensitive fields projected out
- [ ] 404 returned for non-existent IDs

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | Agent-native parity requires dedicated fetch endpoints |

## Resources
- PR branch: `feat/admin-dashboard`
