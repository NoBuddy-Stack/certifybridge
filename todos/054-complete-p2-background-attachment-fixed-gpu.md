---
status: pending
priority: p2
issue_id: "054"
tags: [code-review, performance, css, mobile]
dependencies: []
---

# 054 · background-attachment:fixed forces continuous GPU compositor invalidation on scroll

## Problem Statement

apply.html:35: `background-attachment: fixed` on body. On iOS Safari and older Android, this disables hardware acceleration for the background, causing CPU repainting on every scroll frame. The form has 3 steps that users scroll through — continuous paint invalidation causes janky scroll on low-end devices common in the target demographic (Indian college students on budget smartphones).

## Findings

- `apply.html:35`: `background-attachment: fixed` on the `body` element
- iOS Safari does not support `background-attachment: fixed` on scrollable elements — it falls back to `scroll`, causing the background to move with content (losing the parallax effect entirely) or triggers expensive repaints
- Chrome on Android paints the background on the CPU rather than GPU when `background-attachment: fixed` is used, causing dropped frames on scroll
- The apply form has 3 multi-field steps — users scroll significantly through the form
- Budget Android devices (Redmi, Realme) running Chrome are the primary device class for Indian college students
- Lighthouse performance score penalizes paint storms on scroll

## Proposed Solutions

Replace `background-attachment: fixed` on body with a `position: fixed` pseudo-element that promotes to its own GPU compositor layer:

```css
/* Remove from body */
body {
  background-image: none;
  background-attachment: scroll;
  /* keep all other body styles */
}

/* Add fixed pseudo-element */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url('/bg.jpg'); /* or bg.webp per todo-055 */
  background-size: cover;
  background-position: center top;
  z-index: -1;
}
```

The `position: fixed` pseudo-element is promoted to its own compositor layer, painted once, and composited on every scroll frame without CPU repaint. Visual result is identical to `background-attachment: fixed`.

## Acceptance Criteria

- `background-attachment: fixed` removed from body
- Background visually remains fixed/parallax during scroll
- Scroll performance on low-end mobile is smooth (no dropped frames in Chrome DevTools Performance panel)
- Works correctly on iOS Safari (background does not scroll with content)
- No regressions on desktop Chrome/Firefox/Safari
