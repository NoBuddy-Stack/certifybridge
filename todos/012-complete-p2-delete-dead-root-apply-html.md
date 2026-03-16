---
status: pending
priority: p2
issue_id: "012"
tags: [code-review, architecture, cleanup]
dependencies: []
---

# Dead apply.html at Repository Root Must Be Deleted

## Problem Statement

`C:/Users/Dell/Desktop/cf/apply.html` (at repo root) is a pre-migration artifact. The production-served file is `public/apply.html`. The root file still contains the old EmailJS `<script>` tag:
```html
<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
```
This CDN-hosted external JS is no longer used (the migration moved to server-side Resend). The file is not referenced in `vercel.json` routing, but:
1. It creates confusion about which file to edit
2. It loads an unused CDN dependency (adds to attack surface and CSP scope)
3. If `vercel.json` routing is ever misconfigured, this file could be served
4. Any developer seeing two `apply.html` files will waste time determining which is authoritative

## Findings

- `apply.html` (root) — old pre-migration version with EmailJS CDN script
- `public/apply.html` — current production version (EmailJS removed)
- `vercel.json` routes only to `/public/apply.html` — root file is dead code
- Architecture review: "This file should be deleted"

## Proposed Solutions

### Option A: Delete the file
```bash
rm apply.html
```
- **Pros:** Eliminates confusion; removes dead CDN dependency from codebase
- **Effort:** Trivial
- **Risk:** None — not referenced by any route

## Recommended Action

Option A — just delete it.

## Technical Details

- **File to delete:** `C:/Users/Dell/Desktop/cf/apply.html`

## Acceptance Criteria

- [ ] `apply.html` at repo root does not exist
- [ ] `public/apply.html` still exists and is served correctly
- [ ] No routes or imports reference the deleted file

## Work Log

- 2026-03-15: Identified by architecture-strategist agent during code review
