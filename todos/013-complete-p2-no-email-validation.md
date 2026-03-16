---
status: pending
priority: p2
issue_id: "013"
tags: [code-review, architecture, validation]
dependencies: []
---

# No Semantic Input Validation Beyond Truncation

## Problem Statement

`api/verify-payment.js` sanitizes inputs with `s()` (trim + truncate) but performs no semantic validation. The critical consequence: a payment with an invalid `email` field (e.g., empty string, `"notanemail"`, or a truncated email like `"john@examp"`) passes verification, gets saved to MongoDB, and silently fails the confirmation email — with no error surfaced to the user or operator.

Other missing validations:
- `startDate`/`endDate` — stored as raw strings; `"notadate"` is accepted
- `mode` — free-text; `"FlyingMode"` is accepted; no enum validation against frontend options
- `phone` — any 20-char string; not validated as E.164 or Indian mobile format
- `domain` — any 200-char string

The most critical gap is `email` because it directly causes silent confirmation email failure after real payment.

## Findings

- `api/verify-payment.js:96` — `email: s(email, 200).toLowerCase()` — no format validation
- If email is invalid, `resend.emails.send({ to: ['invalid'] })` fails
- Email failure is fire-and-forget — logged but not surfaced to user
- User paid real money, sees success screen, never gets confirmation email

## Proposed Solutions

### Option A: Validate email format + return 400 before insertOne
Add after the plan validation and before the DB save:
```js
const emailVal = s(email, 200).toLowerCase();
if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
  return res.status(400).json({ error: 'Invalid email address.' });
}
```
Note: This should only be possible if someone calls the API directly (bypassing the frontend), since the frontend has email validation. But it is still an important server-side guard.
- **Effort:** Small
- **Risk:** None

### Option B: Validate email + mode enum + date format
More thorough validation — reject if `mode` is not in `['Online', 'Offline', 'Hybrid']`, if dates are not ISO format, etc.
- **Effort:** Small-Medium
- **Risk:** Low — must be consistent with what the frontend sends

## Recommended Action

Option A minimum (email validation). Option B is better for production.

## Technical Details

- **Affected file:** `api/verify-payment.js` — between plan validation and DB save

## Acceptance Criteria

- [ ] `email = "notanemail"` returns 400
- [ ] `email = ""` returns 400
- [ ] Valid email `"john@example.com"` continues to work
- [ ] The 400 response is returned BEFORE MongoDB save (no garbage data stored)

## Work Log

- 2026-03-15: Identified by architecture-strategist agent during code review
