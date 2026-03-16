---
status: pending
priority: p3
issue_id: "077"
tags: [code-review, mongodb, data-integrity, dead-code]
dependencies: []
---

# 077 · amountPaise is a derived redundant field stored in every MongoDB document

## Problem Statement

verify-payment.js:134: `amountPaise: amount * 100`. This field is derived directly from `amount` (also stored in the same document). No part of the system reads amountPaise from MongoDB — not the email, not any API response, not any query. It has no index. Storing it adds a field to every document and creates a second source of truth that can drift if amount is ever corrected manually.

## Findings

- verify-payment.js:134 writes `amountPaise: amount * 100` into every application document
- The `amount` field (in rupees) is also stored in the same document
- No code in the codebase reads amountPaise from MongoDB
- The field has no index and is not used in any aggregation, query, or response payload
- If an admin manually corrects `amount` in MongoDB, amountPaise becomes stale with no automatic reconciliation
- amountPaise is a pure derivation: `doc.amount * 100` computes it on demand with no storage cost

## Proposed Solutions

Remove `amountPaise: amount * 100` from the doc object at verify-payment.js:134.

If paise is ever needed for a query or computation, derive it inline as `doc.amount * 100`.

## Acceptance Criteria

- New application documents do not contain an amountPaise field
- All existing functionality (email, API responses, queries) is unaffected
