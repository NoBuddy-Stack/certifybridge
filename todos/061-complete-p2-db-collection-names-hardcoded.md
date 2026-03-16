---
status: pending
priority: p2
issue_id: "061"
tags: [code-review, architecture, maintainability]
dependencies: []
---

# 061 · Database and collection names hardcoded as string literals in 3 separate files

## Problem Statement

'certifybridge' and 'applications' are hardcoded in api/verify-payment.js:150, api/webhook.js:89, and api/health.js:35. A rename, staging environment (certifybridge-staging), or multi-tenant expansion requires editing 3 files with no linter/compiler aid to find all sites.

## Findings

- `api/verify-payment.js:150`: `.db('certifybridge').collection('applications')`
- `api/webhook.js:89`: `.db('certifybridge').collection('applications')`
- `api/health.js:35`: `.db('certifybridge').collection('applications')`
- All three files use identical string literals — no shared constant
- A staging environment using a different database name (e.g. 'certifybridge-staging') would require three separate edits with no compile-time verification that all were found
- If a fourth API handler is added (e.g. admin dashboard), it would introduce a fourth site by convention rather than by import
- `lib/mongodb.js` already centralizes the connection client — it is the natural home for these constants

## Proposed Solutions

Export constants from lib/mongodb.js:

```js
// lib/mongodb.js additions
export const DB_NAME = process.env.MONGODB_DB_NAME || 'certifybridge';
export const COLLECTION_APPLICATIONS = 'applications';
```

Using an env var for DB_NAME enables staging/production separation without code changes.

Update all three consumers:

```js
// api/verify-payment.js, api/webhook.js, api/health.js
import { clientPromise, DB_NAME, COLLECTION_APPLICATIONS } from '../lib/mongodb.js';
// ...
const col = db.db(DB_NAME).collection(COLLECTION_APPLICATIONS);
```

## Acceptance Criteria

- `DB_NAME` and `COLLECTION_APPLICATIONS` defined exactly once in lib/mongodb.js
- All three consumer files import and use the constants
- `grep` for string literal `'certifybridge'` in api/ returns zero matches
- `grep` for string literal `'applications'` in api/ returns zero matches
- MONGODB_DB_NAME env var optionally overrides the database name for staging environments
