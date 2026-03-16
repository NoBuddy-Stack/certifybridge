---
status: pending
priority: p1
issue_id: "045"
tags: [code-review, architecture, data-consistency, email]
dependencies: []
---

# 045 · Confirmation email fires even when DB write fails

## Problem Statement
`api/verify-payment.js:183` fires `sendConfirmationEmail(doc)` unconditionally after the MongoDB try/catch block. If the DB write fails with a non-11000 error (real failure, not duplicate), the code logs the failure, sends a Slack alert (fire-and-forget), then falls through to send the confirmation email — for an application that was never saved. The user receives a confirmation email for a record that does not exist in the database.

**Why it matters:** (1) The user believes their application is submitted, but the operator has no record. (2) Manual recovery requires cross-referencing the Slack alert (which may also have failed) with the email. (3) On a payment portal, this is a customer support crisis — the student has paid and has a confirmation, but no record exists.

## Findings
- `verify-payment.js:161–178`: DB failure path logs + fires Slack alert — does NOT set any flag
- `verify-payment.js:183`: `sendConfirmationEmail(doc)` called unconditionally — no check for DB success
- `verify-payment.js:186`: `return res.status(200).json({ success: true })` — always 200
- The only recovery path is the Slack alert, which is also fire-and-forget and may fail

## Proposed Solutions

### Option A: Track DB success with a flag (Recommended)
```js
let dbSaved = false;
try {
  await col.insertOne(doc);
  dbSaved = true;
} catch (dbErr) {
  if (dbErr.code === 11000) { dbSaved = true; } // duplicate = already saved
  else { /* existing alert logic */ }
}

if (dbSaved) {
  sendConfirmationEmail(doc).catch(err => console.error('[verify-payment] Email error:', err.message));
} else {
  console.error('[verify-payment] Skipping confirmation email — record not saved for order:', razorpay_order_id);
}
```

### Option B: Return 503 on DB failure
Inform the client that payment was verified but record could not be saved. The Razorpay checkout will show an error, prompting the user to contact support with their payment ID.
Risk: may confuse users who already paid.

### Option C: Retry DB write with exponential backoff
For transient MongoDB errors, retry up to 3 times before failing. More complex but handles Atlas M0 connection spikes.

## Acceptance Criteria
- [ ] Confirmation email NOT sent when insertOne fails with a non-11000 error
- [ ] Confirmation email IS sent when insertOne succeeds
- [ ] Confirmation email IS sent when insertOne throws 11000 (duplicate — already saved)
- [ ] DB failure is logged with the full applicant payload for manual recovery
