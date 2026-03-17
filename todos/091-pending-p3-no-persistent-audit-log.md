---
status: pending
priority: p3
issue_id: "091"
tags: [code-review, security, architecture]
dependencies: []
---

# No Persistent Audit Log for Status Changes

## Problem Statement
Status changes are logged to `console.log` which is ephemeral on Vercel. If an admin account is compromised, there's no durable record of modifications.

## Findings
- **Source:** security-sentinel re-review (Finding #7)
- **Location:** `api/admin/applications/[id].js:157`

## Proposed Solutions
Write an audit document to a separate MongoDB collection on each status change, recording previous status, new status, timestamp, and admin IP.

## Acceptance Criteria
- [ ] Status changes recorded in persistent storage
- [ ] Audit records include from/to status, timestamp, IP
