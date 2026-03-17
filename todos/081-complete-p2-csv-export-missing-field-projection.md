---
status: pending
priority: p2
issue_id: "081"
tags: [code-review, security]
dependencies: []
---

# CSV Export Missing Sensitive Field Projection

## Problem Statement
The list endpoint (`applications.js`) correctly projects out `ipAddress`, `consentTimestamp`, and `razorpaySignature`. The export endpoint (`export.js`) loads full documents without this projection. While the COLUMNS mapping acts as an implicit filter, sensitive data is unnecessarily loaded into process memory and could be exposed if COLUMNS is expanded carelessly.

## Findings
- **Source:** security-sentinel (Finding #4)
- **Location:** `api/admin/export.js:119-122`
- **Evidence:** `col.find(filter)` with no projection parameter

## Proposed Solutions

### Option A: Add PROJECTION to export query (Recommended)
One-line fix: add `{ projection: PROJECTION }` to the find call.
- **Effort:** Small
- **Risk:** None

## Acceptance Criteria
- [ ] Export query excludes ipAddress, consentTimestamp, razorpaySignature
- [ ] CSV output unchanged (these fields aren't in COLUMNS)

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | Defense in depth — project at query level, not just column mapping |

## Resources
- PR branch: `feat/admin-dashboard`
