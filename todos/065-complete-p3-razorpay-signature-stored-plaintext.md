---
status: pending
priority: p3
issue_id: "065"
tags: [code-review, security, mongodb]
dependencies: []
---

# 065 · razorpaySignature stored in plaintext in MongoDB — unnecessary sensitive data

## Problem Statement

verify-payment.js:137 stores `razorpaySignature: razorpay_signature` in every application document. The raw HMAC signature has no operational value post-verification (re-verification should query Razorpay directly, not compare stored signatures). Storing it increases the sensitivity of a DB breach — anyone with DB access obtains the signature corpus.

## Findings

- verify-payment.js:137 writes `razorpaySignature: razorpay_signature` into every application document
- The stored signature is never read back by any part of the system
- Retaining raw HMAC signatures unnecessarily elevates the impact of a MongoDB breach
- Re-verification of a payment should use the Razorpay API directly, not a stored signature

## Proposed Solutions

Either drop the field entirely: remove `razorpaySignature: razorpay_signature` from the doc object.

Or replace with a boolean flag: `signatureVerified: true` to record that verification passed without storing the raw value.

## Acceptance Criteria

- New application documents do not contain a `razorpaySignature` field
- `signatureVerified: true` is present instead to record that HMAC verification passed
