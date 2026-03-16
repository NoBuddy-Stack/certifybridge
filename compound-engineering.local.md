---
review_agents:
  - security-sentinel
  - performance-oracle
  - code-simplicity-reviewer
  - architecture-strategist
  - agent-native-reviewer
---

# CertifyBridge Review Context

Node.js internship application portal. Vanilla HTML/CSS/JS frontend. Vercel serverless API routes.
Payment via Razorpay. MongoDB for persistence. Resend for transactional email.

Key patterns:
- Plans locked server-side in `lib/plans.js` (prototype-pollution-safe Object.create(null))
- 2-step payment: create-order → Razorpay modal → verify-payment (HMAC)
- No framework on frontend — pure vanilla JS with inline event handlers
- `public/apply.html` is the single-page multi-step form
