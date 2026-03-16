---
status: pending
priority: p2
issue_id: "057"
tags: [code-review, performance, fonts]
dependencies: []
---

# 057 · Google Fonts preconnect missing crossorigin attribute — preconnect hint is wasted

## Problem Statement

apply.html:8: `<link rel="preconnect" href="https://fonts.googleapis.com">` has no crossorigin attribute. The CSS stylesheet request from googleapis.com requires CORS headers, so the browser cannot reuse the non-CORS preconnect and opens a second connection anyway. The preconnect hint is entirely wasted, adding latency rather than saving it.

## Findings

- `apply.html:8`: `<link rel="preconnect" href="https://fonts.googleapis.com">` — no `crossorigin` attribute
- Google Fonts CSS is fetched with a CORS request (`Origin` header sent) because it is a cross-origin resource
- Browser connection pools separate CORS and non-CORS connections to the same origin
- A preconnect without `crossorigin` establishes a non-CORS connection; the actual CORS font CSS request cannot reuse it and opens a new TCP+TLS handshake
- Net effect: two handshakes to fonts.googleapis.com instead of zero (the preconnect hint actively wastes ~100ms of connection setup for the non-CORS connection that is never used)
- The `fonts.gstatic.com` preconnect (if present) similarly needs `crossorigin` since font binary files are also fetched with CORS

## Proposed Solutions

Add the `crossorigin` attribute to the Google Fonts preconnect hints:

```html
<!-- Before -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<!-- After -->
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

Note: `fonts.gstatic.com` likely already has `crossorigin` (it is in the standard Google Fonts copy-paste snippet) — verify in apply.html and add if missing.

## Acceptance Criteria

- `<link rel="preconnect" href="https://fonts.googleapis.com">` has `crossorigin` attribute
- `<link rel="preconnect" href="https://fonts.gstatic.com">` has `crossorigin` attribute
- Browser DevTools > Network > Connection column shows the preconnect connection being reused for the font CSS request
- No regression in font rendering or FOUT behavior
