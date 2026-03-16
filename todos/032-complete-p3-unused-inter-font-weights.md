---
status: pending
priority: p3
issue_id: "032"
tags: [code-review, performance]
dependencies: []
---

# 032 · Unused Inter font weights 400/500/600 loaded unnecessarily

## Problem Statement

`apply.html` loads Inter at weights 400, 500, 600, 700, 800, and 900 from Google Fonts. The design system uses Inter only for headings and CTAs (700–900). Weights 400, 500, and 600 are loaded but not used — body text uses Space Mono. Each unnecessary font weight adds ~15–20 KB to the page load.

## Findings

- Google Fonts URL includes `wght@400;500;600;700;800;900`
- CSS `font-family: 'Inter'` usage is confined to headings and button text (700+)
- Body text uses `font-family: 'Space Mono'`
- 3 unused weights ≈ ~45–60 KB wasted bandwidth

**Location:** `public/apply.html` `<head>` Google Fonts link

## Proposed Solutions

Trim the font URL to `wght@700;800;900`:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

**Effort:** Trivial
**Risk:** None — scan CSS first to confirm no 400/500/600 usage

## Acceptance Criteria

- [ ] Google Fonts URL loads only `700;800;900` for Inter
- [ ] Visual regression check: all text renders correctly

## Work Log

- 2026-03-16: Flagged by performance-oracle agent during code review
