---
status: pending
priority: p2
issue_id: "059"
tags: [code-review, architecture, observability, webhook]
dependencies: []
---

# 059 · Webhook handler silently discards all non-payment.captured events including refunds

## Problem Statement

api/webhook.js:70 checks event === 'payment.captured' and processes it. All other events (payment.failed, refund.processed, order.paid) fall through to return 200 with no log entry. Refund events are silently acknowledged and discarded — the application record paymentStatus is never updated. payment.failed events produce no operator alert. Future Razorpay event types added to the webhook subscription are swallowed silently.

## Findings

- `api/webhook.js:70`: `if (event === 'payment.captured') { ... }` — no else branch
- The handler returns HTTP 200 for all events (Razorpay expects 200 to acknowledge receipt), but performs no logging for unhandled types
- `payment.failed` events: no operator alert, no MongoDB update — an operator cannot distinguish "no one has paid" from "people tried to pay but all failed"
- `refund.processed` events: MongoDB `paymentStatus` is never updated to 'refunded', so the record continues to show 'paid' indefinitely — support staff cannot identify refunded applicants
- `order.paid` event (Razorpay composite event) is also silently discarded — could duplicate processing confusion
- Future event types added to the Razorpay webhook subscription in the dashboard will be silently swallowed, with no indication that the handler doesn't support them

## Proposed Solutions

**Minimum fix — log unhandled events:**
```js
} else {
  console.warn('[webhook] Unhandled event type:', req.body?.event, '— acknowledged but not processed');
}
```

**Full fix — handle known event types:**
```js
switch (event) {
  case 'payment.captured':
    // existing logic
    break;
  case 'payment.failed':
    await col.updateOne(
      { razorpayOrderId: payload?.payment?.entity?.order_id },
      { $set: { paymentStatus: 'failed', updatedAt: new Date() } }
    );
    console.warn('[webhook] payment.failed recorded for order:', payload?.payment?.entity?.order_id);
    break;
  case 'refund.processed':
    await col.updateOne(
      { razorpayPaymentId: payload?.refund?.entity?.payment_id },
      { $set: { paymentStatus: 'refunded', updatedAt: new Date() } }
    );
    break;
  default:
    console.warn('[webhook] Unhandled event type:', event);
}
```

## Acceptance Criteria

- Unhandled event types appear in logs with the event name
- `payment.failed` events trigger an operator-visible log warning and update MongoDB `paymentStatus` to 'failed'
- `refund.processed` events update MongoDB `paymentStatus` to 'refunded'
- All handled and unhandled events still return HTTP 200 (Razorpay acknowledgement requirement)
- Future event types produce a log entry rather than silent discard
