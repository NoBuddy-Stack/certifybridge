---
status: pending
priority: p2
issue_id: "062"
tags: [code-review, simplicity, maintainability]
dependencies: []
---

# 062 · lib/plans.js exports two parallel null-prototype maps that always travel together

## Problem Statement

PLAN_AMOUNTS and PLAN_NAMES are separate objects that always travel together — every consumer that reads one reads the other. The two-map structure means a future plan added to one map but not the other silently produces undefined in the other. Currently if a new plan is added, two objects and two consumers must be updated.

## Findings

- `lib/plans.js`: exports `PLAN_AMOUNTS` and `PLAN_NAMES` as separate null-prototype objects
- Every consumer imports both: `import { PLAN_AMOUNTS, PLAN_NAMES } from '../lib/plans.js'`
- If a developer adds a new plan to `PLAN_AMOUNTS` but forgets `PLAN_NAMES`, the name silently evaluates to `undefined` — no TypeError, no linter warning
- The inverse is also possible: a plan with a name but no amount — the order creation would attempt `amount: undefined * 100` producing `NaN`, which Razorpay would reject with a confusing error
- The null-prototype pattern (`Object.create(null)`) is correct for prototype-pollution-safe key validation — this should be preserved in the fix
- The two-map approach provides no advantage over a single structured object

## Proposed Solutions

Merge into a single PLANS object with structured plan records:

```js
// lib/plans.js
export const PLANS = Object.assign(Object.create(null), {
  noob:   { amount: 499,  name: 'Noob Plan'   },
  pro:    { amount: 999,  name: 'Pro Plan'    },
  hacker: { amount: 1599, name: 'Hacker Plan' },
});

// Convenience aliases for consumers that need only one field (optional)
// export const PLAN_IDS = Object.keys(PLANS);
```

Update consumers:
```js
// Before
const amount = PLAN_AMOUNTS[plan];
const name = PLAN_NAMES[plan];

// After
const planData = PLANS[plan];
const amount = planData?.amount;
const name = planData?.name;
```

Prototype-pollution-safe validation still works identically:
```js
if (!Object.prototype.hasOwnProperty.call(PLANS, plan)) { /* invalid plan */ }
```

## Acceptance Criteria

- `lib/plans.js` exports a single `PLANS` object with `{ amount, name }` per plan key
- No `PLAN_AMOUNTS` or `PLAN_NAMES` exports remain in lib/plans.js
- All consumers updated to use `PLANS[plan].amount` and `PLANS[plan].name`
- `grep` for `PLAN_AMOUNTS` and `PLAN_NAMES` across the codebase returns zero matches
- Null-prototype preserved: `Object.getPrototypeOf(PLANS) === null`
- Adding a new plan requires editing only the single PLANS object
