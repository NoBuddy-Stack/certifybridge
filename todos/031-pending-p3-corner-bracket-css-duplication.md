---
status: pending
priority: p3
issue_id: "031"
tags: [code-review, quality]
dependencies: []
---

# 031 · Corner bracket CSS pattern duplicated ~4× in apply.html

## Problem Statement

The corner bracket decoration (CSS `::before`/`::after` pseudo-elements for top-left and bottom-right corners) is repeated across multiple selectors in `apply.html` with near-identical code. This makes future style changes to the bracket pattern require updates in 4+ places.

## Findings

- At least 4 selectors each declare identical `::before`/`::after` bracket rules (~20 lines each)
- All share the same `width`, `height`, `border-color`, and `position` values
- Only the element they're applied to differs

**Location:** `public/apply.html` `<style>` block

## Proposed Solutions

### Option A: Extract to a `.bracket-frame` utility class
Create a single `.bracket-frame` class with the `::before`/`::after` rules. Apply it to the relevant elements.

**Effort:** Small
**Risk:** None — pure CSS refactor

## Acceptance Criteria

- [ ] Single `.bracket-frame` (or similar) class defines the corner decoration
- [ ] No duplicated `::before`/`::after` bracket rules across selectors
- [ ] Visual output unchanged

## Work Log

- 2026-03-16: Flagged by code-simplicity-reviewer agent during code review
