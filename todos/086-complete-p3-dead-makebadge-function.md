---
status: pending
priority: p3
issue_id: "086"
tags: [code-review, quality]
dependencies: []
---

# Dead makeBadge() Function in admin.html

## Problem Statement
`public/admin.html` lines 392-401 define a `makeBadge()` function that is never called. Actual badge rendering in `renderList` and `openDetail` creates DOM elements directly. This is dead code.

## Findings
- **Source:** code-simplicity-reviewer (Finding #9)
- **Location:** `public/admin.html:392-401`

## Proposed Solutions
Delete the function. ~10 lines removed.

## Acceptance Criteria
- [ ] `makeBadge` function removed
- [ ] All badges still render correctly

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | Dead code from earlier refactor |

## Resources
- PR branch: `feat/admin-dashboard`
