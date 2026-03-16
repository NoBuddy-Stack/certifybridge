---
status: pending
priority: p2
issue_id: "036"
tags: [code-review, architecture, quality]
dependencies: ["028"]
---

# 036 · Valid `stipend`, `domain`, and `mode` values not enumerated outside HTML

## Problem Statement

Three fields in `POST /api/verify-payment` have constrained valid values that are defined only in the HTML UI — not in any server-side config or API response. The server accepts any string for all three, so agents and direct API callers must scrape `apply.html` to discover what values are expected.

**Specific issues:**

- **`stipend`**: Valid values are `< ₹10k`, `₹10–20k`, `₹20–30k`, `₹30–40k`, `₹40–50k` — strings with Unicode rupee sign (U+20B9) and en-dash (U+2013). An agent guessing `"10000-20000"` gets a 200 and a malformed record.
- **`domain`**: 14 preset chips in the UI (e.g. `Web Development`, `Data Science`) plus freetext. No server validation. No way for an agent to know the canonical values without HTML parsing.
- **`mode`**: Three values (`Online`, `Offline`, `Hybrid`). Conditional rule: `city` required when mode is `Offline` or `Hybrid`. Only enforced in browser JS (line 583 of `apply.html`), not on server.

## Findings

- `api/verify-payment.js` lines 122–125: accepts any string for domain, mode, city, stipend — only truncated, never validated
- `public/apply.html` lines 341–355: domain chips; lines 370–380: mode cards; lines 396–400: stipend pills
- No shared config module for these values (unlike plans.js for plan IDs)

**Location:** `api/verify-payment.js`, `public/apply.html`, missing `lib/options.js`

## Proposed Solutions

### Option A: Create `lib/options.js` and validate server-side (Recommended)
```js
export const STIPEND_RANGES = ['< ₹10k', '₹10–20k', '₹20–30k', '₹30–40k', '₹40–50k'];
export const WORK_MODES = ['Online', 'Offline', 'Hybrid'];
export const CITIES = ['Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata'];
// domain remains freetext (no constraint needed)
```

Then in `verify-payment.js`:
- Validate `stipend` is one of `STIPEND_RANGES` (400 if not)
- Validate `mode` is one of `WORK_MODES` (400 if not)
- Validate `city` is non-empty when `mode !== 'Online'` (400 if not)

Expose all options via `GET /api/config` alongside plan metadata (todo #028).

**Pros:** Single source of truth, server validates, agents can discover values from API
**Cons:** Minor — breaks any caller sending non-canonical stipend strings

**Effort:** Small
**Risk:** Medium if deferred — silent bad data accumulates

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `api/verify-payment.js`, `api/config.js`, new `lib/options.js`
- **Related:** todo #028 (plan metadata via config), todo #026 (server-side validation)

## Acceptance Criteria

- [ ] `lib/options.js` exports `STIPEND_RANGES`, `WORK_MODES`, `CITIES`
- [ ] `verify-payment` rejects invalid `stipend`, `mode` values with 400
- [ ] `verify-payment` rejects `mode: "Offline"/"Hybrid"` with empty `city`
- [ ] `GET /api/config` includes `options.stipendRanges`, `options.workModes`, `options.cities`
- [ ] `apply.html` renders stipend/mode/city options from `/api/config` response (no hardcoded values)

## Work Log

- 2026-03-16: Flagged by agent-native-reviewer during code review
