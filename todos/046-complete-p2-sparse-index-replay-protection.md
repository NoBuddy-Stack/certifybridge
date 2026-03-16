---
status: pending
priority: p2
issue_id: "046"
tags: [code-review, security, mongodb]
dependencies: []
---

# 046 · Sparse unique index on razorpayOrderId undermines replay protection

## Problem Statement

verify-payment.js:195 creates the unique index with `sparse: true`. A sparse unique index only enforces uniqueness where the field exists. If a document ever has razorpayOrderId absent or null, multiple such docs can coexist — bypassing replay protection. While current code always sets the field, the index definition provides false safety assurance.

## Findings

- `verify-payment.js:195`: `createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true })`
- A sparse index silently skips null/missing documents, meaning two documents without razorpayOrderId can be inserted without triggering the duplicate key constraint
- The replay protection guarantee relies entirely on the index — the sparse flag creates a silent exception that current code happens not to trigger, but the contract is not enforced at the schema level
- Razorpay order IDs are always present after successful HMAC verification, so the sparse flag serves no legitimate purpose

## Proposed Solutions

Remove `sparse: true` from the createIndex call at line 195. Razorpay order IDs are always present after successful HMAC verification, so the sparse exception is unnecessary and misleading.

```js
// Before
await col.createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true });

// After
await col.createIndex({ razorpayOrderId: 1 }, { unique: true });
```

If the index already exists in Atlas with the sparse flag, it must be dropped and recreated (MongoDB does not allow modifying index options in place).

## Acceptance Criteria

- Unique index on razorpayOrderId exists without `sparse: true`
- Two insertions with the same order ID produce an 11000 duplicate key error
- Two insertions with null/missing razorpayOrderId also produce a duplicate key error
- Existing Atlas index is confirmed to match the new definition
