---
status: pending
priority: p2
issue_id: "064"
tags: [code-review, agent-native, api-design]
dependencies: []
---

# 064 · GET /api/config does not document call flow, domain presets, or date constraints

## Problem Statement

GET /api/config returns only `{ razorpayKeyId }`. An agent has no machine-readable description of: (1) the required call sequence (config → create-order → razorpay-checkout → verify-payment), (2) valid domain preset values, (3) date range constraints. Agents must read HTML source to understand the integration surface. (Related to 028 for plans, 036 for stipend/mode/city — this covers flow docs and domain presets specifically.)

## Findings

- `/api/config` currently returns: `{ razorpayKeyId: process.env.RAZORPAY_KEY_ID }`
- The apply.html JavaScript embeds domain presets as a hardcoded array in the HTML — not accessible via API
- Date constraints are hardcoded in apply.html client-side validation logic — not accessible via API (see also todo-063)
- Call sequence is documented only implicitly in apply.html's event handlers — no API-level description
- Plans and their amounts are available in lib/plans.js but not exposed via any endpoint (see todo-028)
- An agent attempting to integrate must: read apply.html source, reverse-engineer the fetch() calls, identify the Razorpay checkout modal initialization, and discover that verify-payment must be called after checkout completes
- WhatsApp number and support email are in env vars but not exposed (see todo-053)

## Proposed Solutions

Extend /api/config to be a self-describing integration manifest:

```js
// api/config.js
import { PLANS } from '../lib/plans.js';

const DOMAIN_PRESETS = [
  'Web Development',
  'Data Science & AI',
  'UI/UX Design',
  'Cybersecurity',
  'Cloud Computing',
  'Mobile Development',
  'DevOps',
  'Blockchain',
];

export default function handler(req, res) {
  res.json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    flow: [
      'GET /api/config',
      'POST /api/create-order',
      'razorpay-checkout (client-side, requires razorpayKeyId)',
      'POST /api/verify-payment',
    ],
    options: {
      domainPresets: DOMAIN_PRESETS,
      plans: Object.fromEntries(
        Object.entries(PLANS).map(([k, v]) => [k, { amount: v.amount, name: v.name }])
      ),
      stipendModes: ['remote', 'hybrid', 'on-site'],
      internshipModes: ['part-time', 'full-time'],
    },
    dateConstraints: { minDays: 30, maxDays: 365 },
    supportEmail: process.env.SUPPORT_EMAIL || null,
    whatsappNumber: process.env.WHATSAPP_NUMBER || null,
  });
}
```

## Acceptance Criteria

- GET /api/config returns a `flow` array describing the complete call sequence
- GET /api/config returns `options.domainPresets` as a machine-readable array
- GET /api/config returns `dateConstraints` with minDays and maxDays (see also todo-063)
- GET /api/config returns `supportEmail` and `whatsappNumber` from env vars (see also todo-053)
- An agent can build the full integration by reading only the /api/config response — no HTML parsing required
- apply.html updated to derive domain presets from the config response rather than a hardcoded array
