---
status: complete
priority: p2
issue_id: "082"
tags: [code-review, performance]
dependencies: []
---

# $regex Search Causes Full Collection Scans

## Problem Statement
Search queries use `$regex` with `$options: 'i'` across 5 fields via `$or`. Case-insensitive regex cannot use any index, causing a full COLLSCAN on every search. On M0 free tier with a single connection, this blocks that connection for the duration. At 10K+ documents, queries will approach the 10-second Vercel timeout.

## Findings
- **Source:** performance-oracle (Finding #1)
- **Location:** `api/admin/applications.js:62-74`, `api/admin/export.js:82-94`
- **Projected impact:** 1K docs ~100ms, 10K docs ~500ms-1s, 50K docs ~3-5s (timeout risk)

## Proposed Solutions

### Option A: MongoDB text index (Recommended)
Create a text index on searched fields and use `$text` operator.
- **Pros:** Works on M0, significant performance gain, word-boundary matching
- **Cons:** Text search is word-based not substring; changes search behavior slightly
- **Effort:** Small
- **Risk:** Low (search behavior change may be acceptable for admin use)

### Option B: Anchored prefix regex
Change `$regex: escaped` to `$regex: '^' + escaped` which CAN use indexes.
- **Pros:** Keeps current regex approach, uses indexes
- **Cons:** Only matches from start of field, not substring
- **Effort:** Small
- **Risk:** Low

## Acceptance Criteria
- [ ] Search queries use indexes (verify with `.explain()`)
- [ ] Search still works for common admin use cases (name, email lookup)

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | $regex with $options:'i' always does COLLSCAN |

## Resources
- PR branch: `feat/admin-dashboard`
