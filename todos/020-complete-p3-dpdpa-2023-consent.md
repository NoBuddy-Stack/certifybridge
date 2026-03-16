---
status: pending
priority: p3
issue_id: "020"
tags: [code-review, legal, compliance, india]
dependencies: []
---

# Missing DPDPA 2023 Consent Checkbox (Indian Data Law)

## Problem Statement

Under India's Digital Personal Data Protection Act 2023 (DPDPA), collecting personal data (name, email, phone) from Indian users requires explicit, informed, affirmative consent. The current form collects name, email, phone, and college without a consent checkbox.

This is a legal requirement for operating in India, not optional. The project already chose MongoDB Atlas Mumbai (over Supabase) for DPDPA compliance reasons — the consent mechanism is the complementary requirement.

## Findings

- `public/apply.html` — no consent checkbox on the form
- Data collected: firstName, lastName, email, phone, college (personal data under DPDPA)
- No `consentGiven` or `consentTimestamp` field in the MongoDB document schema

## Proposed Solution

### Frontend (apply.html Step 1 or Step 3)
Add before the submit/pay button:
```html
<label class="consent-label">
  <input type="checkbox" id="consentCheckbox" required>
  <span>I consent to Astra Forge collecting and processing my personal data for internship application purposes, as per our
  <a href="/privacy" target="_blank">Privacy Policy</a>.</span>
</label>
```
Disable the pay button until checked.

### Backend (verify-payment.js)
Add `consent` field to the request body and document:
```js
const { ..., consent } = req.body || {};
// Validate
if (!consent) return res.status(400).json({ error: 'Consent is required.' });
// Store
const doc = {
  ...
  consentGiven: true,
  consentTimestamp: new Date(),
};
```

- **Effort:** Small
- **Risk:** None (additive)

## Acceptance Criteria

- [ ] Consent checkbox present on the form
- [ ] Pay button disabled until consent is checked
- [ ] `consentGiven: true` and `consentTimestamp` stored in MongoDB for every application
- [ ] API returns 400 if `consent` is falsy (server-side enforcement)
- [ ] Privacy Policy page or URL exists (even a basic one)

## Work Log

- 2026-03-15: Identified by architecture-strategist agent during code review
