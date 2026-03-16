---
status: pending
priority: p3
issue_id: "035"
tags: [code-review, quality]
dependencies: []
---

# 035 · `source` field missing on browser-submitted records

## Problem Statement

`api/webhook.js` writes `source: 'webhook'` on fallback records but `api/verify-payment.js` writes no `source` field on normal browser submissions. MongoDB records have no consistent way to distinguish submission paths.

## Findings

- `api/webhook.js:107`: `source: 'webhook'` present
- `api/verify-payment.js`: no `source` field in the insert document
- Downstream queries filtering by `source` field will miss all browser-submitted records

**Location:** `api/verify-payment.js` (insert document)

## Proposed Solutions

Add `source: 'browser'` to the insert document in `verify-payment.js`.

**Effort:** Trivial

## Acceptance Criteria

- [ ] All records in `applications` collection have a `source` field (`'browser'` or `'webhook'`)

## Work Log

- 2026-03-16: Flagged by agent-native-reviewer agent during code review
