---
status: pending
priority: p1
issue_id: "038"
tags: [code-review, security, dpdpa]
dependencies: []
---

# 038 · Consent bypass via truthy non-boolean value

## Problem Statement
`api/verify-payment.js:65` checks `if (!consent)`. A client sending `consent: "false"` (string) or `consent: 1` passes this guard because both are truthy in JavaScript. An attacker can create a DPDPA-unconsented record that appears consented (`consentGiven: true`) in MongoDB. Direct regulatory exposure under India's DPDPA 2023.

**Why it matters:** Every application record with a forged consent bypasses the legal requirement. If audited, the stored `consentGiven: true` does not reflect actual user intent.

## Findings
- `api/verify-payment.js:65`: `if (!consent)` — does not enforce `=== true`
- `doc.consentGiven = true` is hardcoded (line 140) regardless of what value `consent` held
- The frontend sends `consent: true` (boolean) correctly, but the server does not enforce the type
- Affected: every `POST /api/verify-payment` request

## Proposed Solutions

### Option A: Strict boolean check (Recommended — 1 line)
```js
if (consent !== true) {
  return res.status(400).json({ error: 'Consent is required to process your application.' });
}
```

### Option B: Coerce then check
```js
if (consent !== true && consent !== 'true') { ... }
```
Avoid — accepting the string `'true'` still allows programmatic bypass without real user intent.

## Acceptance Criteria
- [ ] `consent: "false"` returns HTTP 400
- [ ] `consent: 1` returns HTTP 400
- [ ] `consent: true` (boolean) returns normal flow
- [ ] `consent: null` / missing returns HTTP 400
