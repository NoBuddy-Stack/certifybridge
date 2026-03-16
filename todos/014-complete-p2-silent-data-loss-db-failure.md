---
status: pending
priority: p2
issue_id: "014"
tags: [code-review, architecture, observability, reliability]
dependencies: []
---

# Silent Data Loss on MongoDB Failure — No Alert or Dead-Letter Store

## Problem Statement

When a non-duplicate MongoDB error occurs during `insertOne`, `api/verify-payment.js` logs the error and returns `200 { success: true }`:

```js
} else {
  console.error('[verify-payment] MongoDB save error:', dbErr.message);
}
// ... continues to return 200
```

The user sees the payment success modal, receives a confirmation email, and has no reason to suspect anything went wrong. But there is **no MongoDB record** of their application. The only evidence is a Vercel log line.

On Vercel Hobby plan, log retention is **1 hour**. A DB failure at 2 AM produces a 200 to the user and a log entry that expires before anyone checks. The operator has no way to know the application was lost without cross-referencing Razorpay dashboard payments against MongoDB documents manually.

## Findings

- `api/verify-payment.js:140-143` — non-11000 DB errors are logged and swallowed
- Vercel Hobby: 1-hour log retention — logs are ephemeral
- No alert mechanism (Slack, email, SMS) for DB failures
- No dead-letter store (secondary collection, external store)
- User receives 200 + confirmation email → no reason to follow up
- The operator's only recovery path: manual reconciliation from Razorpay dashboard

## Proposed Solutions

### Option A: Write to a `failed_saves` fallback collection
On non-11000 error, attempt to write to a separate `astra_forge.failed_saves` collection:
```js
} else {
  console.error('[verify-payment] MongoDB save error:', dbErr.message);
  try {
    const fallbackCol = client.db('astra_forge').collection('failed_saves');
    await fallbackCol.insertOne({ ...doc, _saveError: dbErr.message, _savedAt: new Date() });
  } catch (fallbackErr) {
    console.error('[verify-payment] Fallback save also failed:', fallbackErr.message);
  }
}
```
- **Pros:** Data preserved even if primary collection is unavailable (e.g., index lock)
- **Cons:** If the DB is completely down, the fallback also fails
- **Effort:** Small
- **Risk:** None (additive)

### Option B: POST to a Slack/webhook alert URL
On non-11000 error, POST to `process.env.ALERT_WEBHOOK_URL` with the payment ID and error:
```js
if (process.env.ALERT_WEBHOOK_URL) {
  fetch(process.env.ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `[AstraForge] DB save failed for payment ${razorpay_payment_id}: ${dbErr.message}` }),
  }).catch(() => {}); // fire-and-forget
}
```
- **Pros:** Immediate operator notification regardless of log retention
- **Effort:** Small
- **Risk:** None (fire-and-forget, does not affect response)

### Option C: Combine A + B
Write to fallback collection AND send an alert webhook.
- **Effort:** Small-Medium
- **Risk:** None

## Recommended Action

Option B at minimum (alert webhook for immediate notification). Add Option A for data safety.

## Technical Details

- **Affected file:** `api/verify-payment.js:140-143`
- **New env var:** `ALERT_WEBHOOK_URL` (optional, Slack incoming webhook or similar)

## Acceptance Criteria

- [ ] Simulated DB failure triggers an alert to the configured webhook
- [ ] The failed document is recoverable (either in fallback collection or via Razorpay payment ID in the alert)
- [ ] User still receives 200 + email (existing behavior preserved)
- [ ] `ALERT_WEBHOOK_URL` documented in `.env.example`

## Work Log

- 2026-03-15: Identified by architecture-strategist agent during code review
