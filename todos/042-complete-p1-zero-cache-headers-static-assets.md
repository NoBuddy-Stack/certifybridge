---
status: pending
priority: p1
issue_id: "042"
tags: [code-review, performance, caching, vercel]
dependencies: []
---

# 042 · Zero cache headers on all static assets — every visit re-downloads bg.jpg and logo

## Problem Statement
`vercel.json` sets only security headers. No `Cache-Control` header is configured for static files (`/bg.jpg`, `/logo.png`, `/favicon.jpg`, `/apply.html`). Vercel's default is `public, max-age=0, must-revalidate` — every page view, including return visits after a failed payment, re-downloads all assets from origin. The background image alone is likely 500KB–2MB; re-downloading it on every visit adds 200ms–1s+ to repeat loads.

**Why it matters:** Students returning to retry a payment re-download the full asset payload. On mobile networks (3G/4G common in target demographic), this meaningfully degrades experience.

## Findings
- `vercel.json`: no `Cache-Control` rule for any `/public/` asset
- Vercel default for static assets in `/public`: `max-age=0, must-revalidate`
- `bg.jpg` is a large atmospheric background — likely largest single asset
- `logo.png`, `favicon.jpg` are static brand assets that never change between deploys

## Proposed Solutions

### Option A: Add Cache-Control rules to vercel.json (Recommended)
```json
{ "source": "/bg.jpg",    "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
{ "source": "/logo.png",  "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
{ "source": "/favicon.jpg","headers": [{ "key": "Cache-Control", "value": "public, max-age=86400" }] },
{ "source": "/apply.html","headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] }
```
Images are `immutable` (they only change when filenames change). HTML is `must-revalidate` since it contains inline JS referencing API behavior.

### Option B: Content-hash filenames + short-lived HTML cache
Rename assets to `bg.abc123.jpg` (content hash) and set long TTL on all. More robust but requires a build step.

## Acceptance Criteria
- [ ] Second visit to /apply does not re-download bg.jpg (304 or from cache)
- [ ] logo.png cached with 1-year TTL
- [ ] apply.html always fetches fresh (no stale JS)
- [ ] Verified via browser DevTools Network tab
