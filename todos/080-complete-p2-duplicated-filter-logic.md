---
status: pending
priority: p2
issue_id: "080"
tags: [code-review, architecture, quality]
dependencies: []
---

# Duplicated Filter-Building Logic Between applications.js and export.js

## Problem Statement
~45 lines of identical filter-building code (plan validation, status mapping, regex search, date range) are copy-pasted between `api/admin/applications.js` (lines 44-95) and `api/admin/export.js` (lines 67-111). A bug fix or new filter in one file but not the other will create subtle inconsistencies.

## Findings
- **Source:** architecture-strategist, code-simplicity-reviewer (both flagged independently)
- **Location:** `api/admin/applications.js:44-95`, `api/admin/export.js:67-111`

## Proposed Solutions

### Option A: Extract shared buildAdminFilter function (Recommended)
Create `lib/admin-filters.js` with a `buildAdminFilter(query)` function. Both handlers import and call it.
- **Pros:** Single source of truth, ~40 lines saved, eliminates drift risk
- **Cons:** One new file
- **Effort:** Small
- **Risk:** None

## Acceptance Criteria
- [ ] Filter logic exists in exactly one place
- [ ] Both endpoints produce identical filters for identical query params
- [ ] All existing filter behaviors preserved

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | Two agents flagged independently — high-confidence finding |

## Resources
- PR branch: `feat/admin-dashboard`
