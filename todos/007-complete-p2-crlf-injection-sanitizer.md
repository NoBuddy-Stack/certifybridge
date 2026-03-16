---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, security, injection]
dependencies: []
---

# CRLF Characters Survive the s() Sanitizer

## Problem Statement

The `s()` sanitizer uses `.trim()` which only strips whitespace at the start and end of a string. It does not remove `\r\n` characters embedded in the middle. A submitted value like `"victim@example.com\r\nBcc: attacker@evil.com"` passes through `s()` unchanged.

While Resend's HTTP API handles the `to` field as a JSON array (mitigating SMTP header injection), the raw CRLF strings are stored in MongoDB. If any downstream consumer (CSV export, log viewer, future SMTP-based sender, admin dashboard) processes these fields without proper encoding, CRLF injection becomes exploitable. The `note` field (2000 chars) is particularly at risk for log injection.

## Findings

- `api/verify-payment.js:90` — `s = (v, max) => String(v || '').trim().slice(0, max)` — no CRLF stripping
- Confirmed: `"line1\r\nline2"` passes through `s()` unchanged
- Fields affected: all string fields (firstName, lastName, email, phone, college, domain, mode, city, stipend, startDate, endDate, duration, note)
- `note` field is highest risk (2000 chars, freeform)

## Proposed Solutions

### Option A: Add control character stripping to `s()`
```js
const s = (v, max = 200) => String(v || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
```
- **Pros:** One-line fix; eliminates the entire class of CRLF injection from all stored fields
- **Effort:** Trivial
- **Risk:** None — replacing control chars with a space preserves readability

### Option B: Strip only from specific high-risk fields
Apply a separate CRLF strip only to `email` and `note`.
- **Cons:** Incomplete; any field could be used in a future context that is CRLF-sensitive
- **Effort:** Same as Option A
- **Risk:** Leaves the door open for other fields

## Recommended Action

Option A — extend `s()` in-place.

## Technical Details

- **Affected file:** `api/verify-payment.js:90`
- **OWASP:** A03 Injection

## Acceptance Criteria

- [ ] `firstName = "John\r\nEvil: header"` is stored as `"John  Evil: header"` (or similar normalized form)
- [ ] `note` with embedded newlines is normalized to spaces
- [ ] Regular multiline note values (if any) are still accepted (just with newlines normalized)

## Work Log

- 2026-03-15: Identified by security-sentinel agent during code review
