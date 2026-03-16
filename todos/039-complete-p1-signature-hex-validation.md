---
status: pending
priority: p1
issue_id: "039"
tags: [code-review, security, razorpay, hmac]
dependencies: []
---

# 039 · No hex-format validation of razorpay_signature before Buffer.from

## Problem Statement
`api/verify-payment.js:80` calls `Buffer.from(razorpay_signature, 'hex')` with no prior validation that the input is a valid 64-character hex string. Node's `Buffer.from(..., 'hex')` silently ignores non-hex characters, producing a shorter buffer. The subsequent `sigBuf.length === expectedBuf.length` guard catches length mismatches, but does not catch a crafted 64-hex-char string with embedded non-hex bytes that produce a 32-byte buffer of incorrect content.

**Why it matters:** The HMAC check is the only cryptographic gate before payment is accepted. Any weakness in the input to `Buffer.from` weakens the entire verification.

## Findings
- `api/verify-payment.js:80`: `Buffer.from(razorpay_signature, 'hex')` — no format pre-check
- A 64-char string with non-hex pairs silently produces a shorter buffer caught by length check
- But an odd-length hex-like value is silently zero-padded by Node rather than thrown
- The `try/catch` only catches exceptions, not silent truncation

## Proposed Solutions

### Option A: Regex pre-validation (Recommended — 1 line)
```js
if (!/^[0-9a-f]{64}$/i.test(razorpay_signature)) {
  return res.status(400).json({ error: 'Invalid signature format.' });
}
```
Add this immediately after the presence check at line 55, before line 80.

### Option B: Check buffer length after decode
Already partially done at line 82, but does not catch all malformed inputs. Not sufficient alone.

## Acceptance Criteria
- [ ] `razorpay_signature` of 63 chars returns 400
- [ ] `razorpay_signature` with non-hex chars returns 400
- [ ] `razorpay_signature` of 64 valid hex chars proceeds to HMAC check
- [ ] Valid Razorpay signature passes end-to-end
