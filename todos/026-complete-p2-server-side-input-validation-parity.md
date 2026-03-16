---
status: pending
priority: p2
issue_id: "026"
tags: [code-review, security, quality]
dependencies: []
---

# 026 · Server-side input validation missing for required fields

## Problem Statement

`api/verify-payment.js` performs no presence or format checks on `firstName`, `lastName`, `college`, `phone`, `startDate`, or `endDate`. The UI enforces these validations client-side, but since the API is directly callable, malformed or empty records can be written to MongoDB. This results in incomplete application records with no way to contact the applicant.

**Why it matters:** Any direct API caller (agent, script, curl) can write records missing critical identity fields. There is no rejection path — the server writes whatever arrives.

## Findings

- `firstName`, `lastName`, `college`: no presence check on server (UI requires non-empty)
- `phone`: UI enforces Indian 10-digit format; server only truncates to 20 chars
- `startDate`, `endDate`: UI validates date format; server doesn't validate format or logical ordering (start < end)
- `duration`: computed client-side using non-standard 30-day month arithmetic; never validated for consistency with start/end dates on server
- `mode`, `city`: conditional UI validation (city required when mode=offline); no server enforcement

**Location:** `api/verify-payment.js` lines 116–130 (field extraction), `public/apply.html` lines 564–602 (client validation)

## Proposed Solutions

### Option A: Add server-side validation block before DB write (Recommended)
Add an explicit validation section to `verify-payment.js` before the `db.collection` insert:

```js
const required = { firstName, lastName, college, phone, startDate, endDate };
for (const [key, val] of Object.entries(required)) {
  if (!val || !val.trim()) {
    return res.status(400).json({ error: `Missing required field: ${key}` });
  }
}
if (!/^[6-9]\d{9}$/.test(phone.replace(/[\s\-\+]/g, '').replace(/^91/, ''))) {
  return res.status(400).json({ error: 'Invalid phone number.' });
}
if (mode === 'offline' && !city?.trim()) {
  return res.status(400).json({ error: 'City is required for offline internship.' });
}
// Derive duration server-side instead of trusting client
```

**Pros:** Closes silent bad-data gap, makes API contract self-documenting through error messages
**Cons:** Adds a few lines of code

### Option B: Drop `duration` field from API input; compute server-side
The `duration` field is computed from `startDate` and `endDate` on the client using idiosyncratic 30-day-month arithmetic. The server already has both dates — compute it there.

**Pros:** Removes a client-trustable field, ensures consistency
**Cons:** Slightly changes stored format (acceptable since it's more correct)

**Effort:** Small
**Risk:** Medium if deferred — silent data quality degradation

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `api/verify-payment.js` (main fix), `public/apply.html` (remove duration from payload)

## Acceptance Criteria

- [ ] `verify-payment` rejects requests with missing firstName/lastName/college/phone/startDate/endDate
- [ ] Phone format validated server-side (Indian 10-digit)
- [ ] `mode === 'offline'` requires non-empty `city`
- [ ] `duration` either computed server-side or verified for consistency with start/end dates
- [ ] Test: POST with missing `firstName` → 400 response

## Work Log

- 2026-03-16: Flagged by security-sentinel + agent-native-reviewer agents during code review
