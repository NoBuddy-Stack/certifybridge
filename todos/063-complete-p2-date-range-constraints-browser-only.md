---
status: pending
priority: p2
issue_id: "063"
tags: [code-review, agent-native, validation, data-integrity]
dependencies: []
---

# 063 · Date range constraints (min 1 month, max 1 year) are browser-only — server accepts any range

## Problem Statement

apply.html enforces date range validation in calcDur() and validateStep(): minimum 1 month, maximum 1 year. The server performs no date range validation. An agent or malformed client submitting startDate:2026-03-01 and endDate:2026-03-05 (4 days) receives a 200 and the record is saved with a sub-minimum duration. Agents cannot discover these constraints via API.

## Findings

- `apply.html`: `calcDur()` and `validateStep()` implement client-side date range validation
- `api/verify-payment.js`: no server-side date range validation — startDate and endDate are stored as-is after basic type checks
- `api/create-order.js`: no date range validation before order creation
- An HTTP client (curl, Postman, agent) can bypass the browser entirely and submit any date range
- Records with 4-day internship durations are stored in MongoDB with `paymentStatus: 'paid'` — certificates generated from these records would show invalid durations
- `/api/config` does not expose dateConstraints — agents have no machine-readable way to discover the valid range
- This is a data integrity issue: the business contract (internship = 1–12 months) is not enforced at the system boundary

## Proposed Solutions

**Step 1 — Server-side validation in api/verify-payment.js:**
```js
const start = new Date(startDate);
const end = new Date(endDate);
const diffDays = (end - start) / (1000 * 60 * 60 * 24);

if (isNaN(start) || isNaN(end)) {
  return res.status(400).json({ error: 'Invalid date format' });
}
if (end <= start) {
  return res.status(400).json({ error: 'End date must be after start date' });
}
if (diffDays < 30) {
  return res.status(400).json({ error: 'Minimum internship duration is 30 days' });
}
if (diffDays > 365) {
  return res.status(400).json({ error: 'Maximum internship duration is 365 days' });
}
```

**Step 2 — Expose constraints in /api/config:**
```js
res.json({
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  dateConstraints: { minDays: 30, maxDays: 365 },
  // ... other fields per todo-064
});
```

## Acceptance Criteria

- Submitting startDate and endDate with a 4-day span returns 400 with descriptive error message
- Submitting a 400-day span returns 400 with descriptive error message
- Valid date ranges (30–365 days) are accepted and stored
- `endDate <= startDate` returns 400
- `/api/config` response includes `dateConstraints: { minDays: 30, maxDays: 365 }`
- Browser validation in apply.html retained (defence in depth), but is no longer the sole enforcement point
