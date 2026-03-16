---
status: complete
priority: p3
issue_id: "030"
tags: [code-review, quality]
dependencies: []
---

# 030 · Stale JSDoc in create-order.js references old plan key "new"

## Problem Statement

`api/create-order.js` line 9 still documents `{ plan: "new" | "pro" | "hacker" }` in the JSDoc comment. The valid values are now `"noob" | "pro" | "hacker"`.

## Findings

- `api/create-order.js:9`: `* Request body:  { plan: "new" | "pro" | "hacker" }`
- Should read: `* Request body:  { plan: "noob" | "pro" | "hacker" }`

**Location:** `api/create-order.js:9`

## Proposed Solutions

One-line edit. **Effort:** Trivial.

## Acceptance Criteria

- [ ] JSDoc comment updated to reference `"noob"` instead of `"new"`

## Work Log

- 2026-03-16: Flagged by architecture-strategist agent during code review
