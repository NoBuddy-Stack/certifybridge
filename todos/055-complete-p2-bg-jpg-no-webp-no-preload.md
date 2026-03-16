---
status: pending
priority: p2
issue_id: "055"
tags: [code-review, performance, images]
dependencies: []
---

# 055 · bg.jpg has no WebP alternative, no preload hint — largest asset blocks first paint

## Problem Statement

public/bg.jpg is served with no format negotiation and no `<link rel="preload">`. CSS background-image is only fetched after CSS is parsed, delaying the first background render. The file is likely 500KB–2MB (large atmospheric photo). No WebP version exists. On mobile networks this adds 1–3 seconds before the background renders.

## Findings

- `public/bg.jpg` is referenced in apply.html body CSS as `background-image: url('/bg.jpg')`
- No `<link rel="preload" as="image">` present in apply.html `<head>`
- CSS background images are discovered late in the render pipeline: HTML parse → CSS parse → style recalculation → resource fetch
- No `bg.webp` file exists in public/
- No `image-set()` CSS function used for format negotiation
- Vercel does not automatically serve WebP for static files — format negotiation must be explicit
- bg.jpg is the largest visual asset and sets the tone of the page — a delayed background render leaves a blank or white screen during the critical first impression window

## Proposed Solutions

**Step 1 — Convert bg.jpg to WebP:**
```bash
cwebp -q 75 public/bg.jpg -o public/bg.webp
# Target output: < 200KB
```
Or use Squoosh CLI / Sharp in a build script.

**Step 2 — Add preload hint to apply.html `<head>`:**
```html
<link rel="preload" as="image" href="/bg.webp" type="image/webp">
```

**Step 3 — Update CSS to use image-set() with fallback:**
```css
background-image: image-set(
  url('/bg.webp') type('image/webp'),
  url('/bg.jpg') type('image/jpeg')
);
```

Note: If todo-054 is implemented (pseudo-element fix), apply the image-set() to the `body::before` rule instead of the body rule.

## Acceptance Criteria

- `public/bg.webp` exists and is < 200KB at acceptable visual quality
- `<link rel="preload" as="image" href="/bg.webp" type="image/webp">` present in apply.html `<head>`
- CSS uses `image-set()` with WebP as primary and JPEG as fallback
- bg.jpg retained as fallback for Safari < 16 and other browsers without WebP/image-set support
- First paint includes background on a throttled Fast 3G connection (verified in Lighthouse or DevTools Network throttling)
