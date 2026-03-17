---
status: pending
priority: p3
issue_id: "087"
tags: [code-review, quality]
dependencies: []
---

# Modernize var to let/const and Remove IIFE in admin.html

## Problem Statement
`public/admin.html` uses ES5-style `var` throughout and wraps the table row loop in an IIFE `(function(idx){...})(i)` to capture the loop variable. Since this is an internal admin tool (no IE11), `let` in the `for` loop eliminates the IIFE entirely. Also, `exportCSV()` duplicates filter param building that `buildQueryString()` already does.

## Findings
- **Source:** code-simplicity-reviewer (Findings #6, #7), performance-oracle (Finding #8)
- **Location:** `public/admin.html:533-577` (IIFE), `public/admin.html:797-828` (duplicate params)

## Proposed Solutions
- Replace `var i` with `let i` in the for loop, remove IIFE wrapper (~4 lines)
- Extract shared filter params function, reuse in both `buildQueryString` and `exportCSV` (~10 lines)
- Replace comma-operator returns in `adminAuth.js` with explicit two-line returns (readability)

## Acceptance Criteria
- [ ] No IIFE in renderList loop
- [ ] exportCSV reuses filter param logic
- [ ] All functionality unchanged

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-17 | Created from code review | ES5 patterns unnecessary for internal admin tool |

## Resources
- PR branch: `feat/admin-dashboard`
