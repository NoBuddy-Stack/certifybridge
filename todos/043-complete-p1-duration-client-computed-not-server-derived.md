---
status: pending
priority: p1
issue_id: "043"
tags: [code-review, security, data-integrity, agent-native]
dependencies: ["026"]
---

# 043 · duration field is client-computed DOM string — server stores it verbatim

## Problem Statement
`api/verify-payment.js:128` stores `duration: s(duration, 100)` directly from `req.body`. The value is constructed in the browser by reading the text content of a DOM element (`#durTxt`), which is set by `calcDur()` using `Math.floor(days/30)` arithmetic. The server never recomputes or validates this against the submitted `startDate`/`endDate`. An attacker (or malformed client) can submit `duration: "10 years"` with a 1-month date range. The forged string appears verbatim in the confirmation email and in the MongoDB record.

**Why it matters:** (1) Data integrity — the stored duration can be completely fabricated. (2) Email forgery — the confirmation email reflects the submitted duration, potentially claiming a 2-year internship. (3) Agent parity — no agent can construct the correct duration string without reverse-engineering the browser's `calcDur()` format.

## Findings
- `apply.html:738`: `duration = document.getElementById('durTxt').textContent.replace('Duration: ','')`
- `apply.html:658–666`: `calcDur()` writes `"X months Y days"` format into `#durTxt`
- `verify-payment.js:128`: `duration: s(duration, 100)` — stored verbatim from body
- No server-side validation that duration matches the date range

## Proposed Solutions

### Option A: Compute duration server-side, drop from client body (Recommended)
Remove `duration` from `req.body` consumption. In `verify-payment.js`, after validating `startDate`/`endDate`, derive:
```js
const start = new Date(s(startDate, 20));
const end   = new Date(s(endDate, 20));
const days  = Math.floor((end - start) / 86400000);
const months = Math.floor(days / 30);
const remDays = days % 30;
const duration = months > 0
  ? `${months} month${months > 1 ? 's' : ''}${remDays > 0 ? ` ${remDays} day${remDays > 1 ? 's' : ''}` : ''}`
  : `${remDays} day${remDays > 1 ? 's' : ''}`;
```
Return `duration` in the 200 response body so clients can confirm what was stored.

### Option B: Accept client value but cross-validate
Accept the client's `duration` string but also compute the server-side value and log a warning if they differ by more than 1 day. Reject if the difference exceeds 7 days.

## Acceptance Criteria
- [ ] Submitting `duration: "10 years"` with a 30-day date range is rejected or overwritten
- [ ] Server-derived duration matches the browser's `calcDur()` output for valid date pairs
- [ ] `duration` in MongoDB matches `startDate`/`endDate` arithmetic
- [ ] Confirmation email contains the correct duration
- [ ] Agent submitting only `startDate`/`endDate` gets the correct duration stored
