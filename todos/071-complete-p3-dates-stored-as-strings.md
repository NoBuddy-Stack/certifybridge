---
status: pending
priority: p3
issue_id: "071"
tags: [code-review, mongodb, data-integrity]
dependencies: []
---

# 071 · startDate and endDate stored as strings — incompatible with MongoDB date operators

## Problem Statement

verify-payment.js:126-127 stores `startDate: s(startDate, 20)` and `endDate: s(endDate, 20)` as strings. HTML date inputs produce YYYY-MM-DD format which sorts correctly as strings, but MongoDB date operators ($gte, $lt, TTL indexes) cannot be used without migration. Schema is inconsistent with createdAt and consentTimestamp which are proper Date objects.

## Findings

- verify-payment.js:126-127 stores startDate and endDate as sanitized strings
- HTML date inputs produce ISO 8601 YYYY-MM-DD strings which sort correctly lexicographically
- MongoDB date range queries using $gte/$lt/$lte require ISODate objects, not strings
- TTL indexes on string date fields do not work
- createdAt and consentTimestamp in the same document are stored as Date objects — schema is inconsistent

## Proposed Solutions

Convert to Date objects before insertion:

```js
startDate: new Date(s(startDate, 20)),
endDate:   new Date(s(endDate, 20)),
```

Add validation to reject invalid date strings before insertion:

```js
const parsedStart = new Date(s(startDate, 20));
if (isNaN(parsedStart.getTime())) return res.status(400).json({ error: 'Invalid start date.' });
```

## Acceptance Criteria

- startDate and endDate are stored as ISODate objects in MongoDB
- Date range queries using $gte/$lt work correctly on both fields
- Invalid date strings return HTTP 400 with a descriptive error message
