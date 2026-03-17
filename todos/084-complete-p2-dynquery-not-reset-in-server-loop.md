---
status: pending
priority: p2
issue_id: "084"
tags: [code-review, architecture]
dependencies: []
---

# dynQuery Not Reset Between Dynamic Route Candidates in server.js

## Problem Statement
In `server.js` line 91, `dynQuery` is declared once outside the handler-matching loop. If a partial match populates a parameter (e.g., `dynQuery.id`), then the loop continues to another handler with a different `[param]` name, both parameters accumulate. This is a latent bug that will manifest when the project adds a second dynamic route with a different parameter name.

## Findings
- **Source:** architecture-strategist (Finding 4D)
- **Location:** `server.js:91-109`
- **Evidence:** `const dynQuery = {}` declared at line 91, never reset inside the `for` loop

## Proposed Solutions

### Option A: Move dynQuery inside the loop (Recommended)
Declare `const dynQuery = {}` inside the loop body, after the `continue` check.
- **Effort:** Small (move one line)
- **Risk:** None

## Acceptance Criteria
- [ ] `dynQuery` is reset for each handler candidate
- [ ] Existing `/api/admin/applications/:id` routing still works

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | Latent bug — only triggers with multiple dynamic routes |

## Resources
- PR branch: `feat/admin-dashboard`
