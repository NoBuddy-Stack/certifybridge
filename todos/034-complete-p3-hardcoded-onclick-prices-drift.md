---
status: pending
priority: p3
issue_id: "034"
tags: [code-review, architecture, quality]
dependencies: ["028"]
---

# 034 · Hardcoded prices in onclick attributes will drift from lib/plans.js

## Problem Statement

Plan card onclick attributes in `apply.html` hardcode prices: `onclick="pickPlan('noob', 499)"`, `onclick="pickPlan('pro', 999)"`, `onclick="pickPlan('hacker', 1599)"`. If prices change in `lib/plans.js`, the UI will show stale prices until `apply.html` is manually updated — and the user will see a price flash when the server-returned amount overrides the display amount.

## Findings

- `apply.html` lines 422, 434, 449: hardcoded amounts in onclick attributes
- These amounts are cosmetic only (the actual charge is locked server-side), but users see the wrong price briefly
- Resolved only by implementing todo #028 (expose plan metadata via `/api/config`)

**Location:** `public/apply.html` plan card onclick attributes

## Proposed Solutions

Resolved as part of todo #028 — fetch plan prices from `/api/config` and render dynamically.

**Effort:** Small (as part of #028)
**Risk:** Low — cosmetic pricing display only, actual charge is always server-side

## Acceptance Criteria

- [ ] No hardcoded prices in HTML onclick attributes (resolved via #028)

## Work Log

- 2026-03-16: Flagged by agent-native-reviewer agent during code review
