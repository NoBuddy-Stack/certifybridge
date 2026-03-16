---
status: pending
priority: p2
issue_id: "058"
tags: [code-review, architecture, maintainability, mongodb]
dependencies: []
---

# 058 · ensureIndexes duplicated verbatim in verify-payment and webhook with independent flags

## Problem Statement

api/verify-payment.js:191-202 and api/webhook.js:130-137 both contain identical ensureIndexes() implementations with their own module-level `let indexesEnsured = false` flags. (1) If a new index is needed, it must be added in two places with no compiler aid. (2) On a cold start of webhook.js (e.g. first Razorpay webhook delivery), createIndex runs again adding latency — Razorpay's webhook has a 5-second timeout; cold-start + MongoDB connect + createIndex can approach this limit.

## Findings

- `api/verify-payment.js:191-202`: `let indexesEnsured = false; async function ensureIndexes(col) { if (indexesEnsured) return; ... indexesEnsured = true; }`
- `api/webhook.js:130-137`: identical pattern with its own independent `indexesEnsured` flag
- The two flags are module-local, so a cold start of webhook.js runs createIndex even if verify-payment.js already ran it in the same Node process (different module scope)
- Razorpay webhook delivery timeout is 5 seconds — cold-start latency (MongoDB DNS + TLS + auth) plus createIndex execution can exceed this on Atlas M0
- A new index (e.g. for `email` or `paymentStatus`) must be added in both files — a developer adding it in one place may not notice the duplicate in the other

## Proposed Solutions

Move `ensureIndexes()` to `lib/mongodb.js` as a named export alongside `clientPromise`:

```js
// lib/mongodb.js addition
let indexesEnsured = false;

export async function ensureIndexes(col) {
  if (indexesEnsured) return;
  await col.createIndex({ razorpayOrderId: 1 }, { unique: true }); // see todo-046: no sparse
  await col.createIndex({ email: 1 });
  // add future indexes here — one place only
  indexesEnsured = true;
}
```

Both consumers updated:
```js
// api/verify-payment.js and api/webhook.js
import { clientPromise, ensureIndexes } from '../lib/mongodb.js';
// ...
await ensureIndexes(col);
```

## Acceptance Criteria

- `ensureIndexes` defined exactly once (in lib/mongodb.js)
- `api/verify-payment.js` and `api/webhook.js` both import and call the shared function
- No local `ensureIndexes` function or `indexesEnsured` flag in either api file
- Adding a new index requires editing only lib/mongodb.js
- grep for `ensureIndexes` in api/ returns only import/call statements, no definitions
