---
status: pending
priority: p2
issue_id: "028"
tags: [code-review, architecture, quality]
dependencies: []
---

# 028 · Plan metadata (prices, display names) not exposed via API

## Problem Statement

`GET /api/config` only returns `razorpayKeyId`. Plan IDs, display names, and prices exist only in `lib/plans.js` (server-side) and are duplicated as hardcoded values in `public/apply.html` onclick attributes. There is no API endpoint that returns canonical plan data, making the frontend the only consumer-accessible source — but the frontend values may lag behind the server values.

**Why it matters:**
- If prices change in `lib/plans.js`, the `apply.html` onclick prices (`499`, `999`, `1599`) continue showing the old amounts until manually updated
- An agent or integration building a plan selection UI has no authoritative source — it must parse HTML or hardcode values
- The displayed price in Step 2 summary is set from the onclick hardcoded value, then corrected by the `create-order` response — creating a brief flash of the wrong price if they differ

## Findings

- `api/config.js` returns only `{ razorpayKeyId }`
- `lib/plans.js` has authoritative `PLAN_AMOUNTS` and `PLAN_NAMES` — not exposed
- `public/apply.html` lines 422, 434, 449: `onclick="pickPlan('noob', 499)"` etc. — hardcoded amounts
- `public/apply.html` line 540: `var PLAN_NAMES = { noob:'Noob Plan', ... }` — duplicated from server

**Location:** `api/config.js`, `lib/plans.js`, `public/apply.html`

## Proposed Solutions

### Option A: Extend `/api/config` to return plan metadata (Recommended)
```js
import { PLAN_AMOUNTS, PLAN_NAMES } from '../lib/plans.js';

export default function handler(req, res) {
  return res.status(200).json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    plans: Object.keys(PLAN_AMOUNTS).map(id => ({
      id,
      name: PLAN_NAMES[id],
      amountINR: PLAN_AMOUNTS[id],
    })),
  });
}
```

Then remove hardcoded prices from `apply.html` onclick and the duplicated `PLAN_NAMES` variable. Fetch on page load from `/api/config` and render plan cards dynamically.

**Pros:** Single source of truth, no drift, agents can consume full plan info
**Cons:** Minor refactor to HTML plan-card rendering

**Effort:** Small
**Risk:** Low

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `api/config.js`, `public/apply.html` (plan card onclick, PLAN_NAMES variable)

## Acceptance Criteria

- [ ] `GET /api/config` returns `plans` array with id, name, amountINR for each plan
- [ ] `apply.html` no longer has hardcoded prices in onclick attributes
- [ ] `apply.html` no longer declares a local `PLAN_NAMES` variable
- [ ] Plan card rendering uses data from `/api/config` response

## Work Log

- 2026-03-16: Flagged by agent-native-reviewer + architecture-strategist agents during code review
