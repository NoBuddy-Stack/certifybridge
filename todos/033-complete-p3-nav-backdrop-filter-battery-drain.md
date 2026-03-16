---
status: pending
priority: p3
issue_id: "033"
tags: [code-review, performance]
dependencies: []
---

# 033 · Continuous `backdrop-filter: blur(20px)` on nav causes mobile battery drain

## Problem Statement

The nav element has `backdrop-filter: blur(20px)` applied unconditionally. This triggers GPU compositing on every scroll event, causing continuous battery and CPU drain on mobile devices — even when the nav content isn't changing.

## Findings

- `backdrop-filter: blur()` forces the browser to re-composite the area behind the element on every frame during scroll
- Particularly impactful on mobile Safari and lower-end Android devices
- The nav is always visible (fixed/sticky positioning), so compositing never stops

**Location:** `public/apply.html` nav CSS styles

## Proposed Solutions

### Option A: Add `will-change: transform` to limit compositing scope
This hints the browser to promote the layer but may not fully solve continuous repaints.

### Option B: Reduce blur amount or use a solid/semi-transparent background instead
Replace `backdrop-filter: blur(20px)` with `background: rgba(8, 8, 8, 0.9)` — visually similar on dark background, no GPU cost.

### Option C: Apply backdrop-filter only on scroll (JS toggle)
Add blur class only when `window.scrollY > 0`.

**Effort:** Small
**Risk:** Low — minor visual change

## Acceptance Criteria

- [ ] Nav does not trigger continuous GPU compositing during scroll
- [ ] Visual appearance maintained (dark semi-transparent nav)

## Work Log

- 2026-03-16: Flagged by performance-oracle agent during code review
